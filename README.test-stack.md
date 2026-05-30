# Allseerr — full integration test stack

`docker-compose.test.yml` boots every downstream service
allseerr knows how to talk to (skipping radarr/sonarr), so you
can exercise end-to-end request workflows against real
backends without provisioning anything by hand.

## What ships

| Role | Service | Host port | Container image |
|---|---|---|---|
| Download client | qBittorrent | 8088 | `lscr.io/linuxserver/qbittorrent:latest` |
| Game library | ROMM + MariaDB | 8181 / internal | `rommapp/romm:latest` + `mariadb:latest` |
| Game acquisition | Romarr | 8585 | built from `../romarr/romarr` |
| Book/audiobook library | Audiobookshelf | 13378 | `ghcr.io/advplyr/audiobookshelf:latest` |
| Book/audiobook acquisition | Bindery | 8787 | `ghcr.io/vavallee/bindery:latest` |
| Book/audiobook acquisition (alt) | Livrarr | 8789 | `ghcr.io/kkodecs/livrarr:latest` |
| Ebook + comic reader | Grimmory + MariaDB | 6060 / internal | `grimmory/grimmory:latest` + `lscr.io/linuxserver/mariadb` |
| Manga acquisition + reader | Suwayomi (Tachidesk) | 4567 | `ghcr.io/suwayomi/tachidesk:latest` |
| Comic acquisition | Mylar3 | 8090 | `lscr.io/linuxserver/mylar3:latest` |
| Magazine grabber | Grabarr + FlareSolverr | 8086 / 8191 | built from `../grabarr` |
| Magazine manager | Pressarr | 8084 | built from `../pressarr/pressarr` |

Allseerr itself runs **on the host** (`pnpm dev` from this
repo). It reaches each service via `localhost:<host_port>`. The
docker network is internal so cross-service calls (Bindery →
qBittorrent, Pressarr → Grabarr, …) stay container-to-container.

## Shared library layout

The point of this stack is to let any service write to a
library folder that every other interested service reads from
the **same** absolute path. No remote-path mappings between
containers.

```
./data/
├── downloads/                 ← qBit drops here, every *arr reads
└── library/
    ├── books/                 ← Bindery + Livrarr + Audiobookshelf + Grimmory
    ├── audiobooks/            ← Bindery + Livrarr + Audiobookshelf
    ├── comics/                ← Mylar + Grimmory + Audiobookshelf
    ├── magazines/             ← Pressarr
    ├── manga/                 ← Suwayomi
    └── games/                 ← Romarr writes, ROMM reads (alias of ./data/romm/library)
```

Every container mounts the same host directory at the same
in-container path (`./data/library/books:/books`, etc.) so an
imported file landing in one service surfaces in every other
service that scans the matching library type.

## First-run sequence

### 1. Boot the stack

```bash
docker compose -f docker-compose.test.yml up -d
```

First boot creates the volume directories under `./data/`,
pulls the images, and starts everything. Give it ~60 seconds
for all healthchecks to settle (ROMM + Grimmory wait for their
MariaDBs).

### 2. Relax qBit auth

By default qBittorrent generates a random temporary admin
password on first boot and rejects everything that isn't
literally `localhost` (Host header check). For a LAN-only
test stack we want any RFC1918 caller to skip auth entirely so
the *arr services can post torrents straight in.

```bash
./scripts/qbit-relax-auth.sh
docker compose -f docker-compose.test.yml restart qbittorrent
```

(The script is idempotent — re-running after a `docker
compose down --volumes` and back up just reapplies the same
four lines.)

### 3. Capture first-run admin credentials

Each service needs a one-time admin account creation; some
emit a token through the logs.

```bash
# Romarr — setup token
docker compose -f docker-compose.test.yml logs romarr   | grep setup_token

# Bindery — initial admin password (printed on first boot)
docker compose -f docker-compose.test.yml logs bindery  | grep -i "initial admin"

# Livrarr — same kind of "open WebUI, create admin" wizard
# Pressarr / Grabarr — same: open the WebUI, create admin
# ROMM / Audiobookshelf / Grimmory / Suwayomi / Mylar — open WebUI, create admin
```

Open each WebUI from the table above, complete the setup
wizard, then go to that service's Profile / Settings page and
generate / copy its **API key**.

### 4. Wire allseerr → the stack

```bash
./scripts/bootstrap-test-stack.sh
```

This patches `config/settings.json` so allseerr's Settings
page already shows each service pre-filled with the right
URL + port. **API keys are not auto-populated** — you paste
each one manually via:

* Settings → Services → Books → Bindery (or Livrarr)
* Settings → Services → Audiobooks → Bindery (or Livrarr)
* Settings → Services → Magazines → Pressarr
* Settings → Services → Games → Romarr
* Settings → Services → Books → Library servers → Audiobookshelf
* Settings → Services → Books → Library servers → Grimmory (uses the standard Library Server form, type = Grimmory)
* Settings → Services → Comics → Mylar
* Settings → Services → Manga → Suwayomi

For ROMM specifically: the URL is set, but the API key + admin
login lives in **Settings → Games → ROMM**.

### 5. Reset and start over

```bash
docker compose -f docker-compose.test.yml down --volumes
rm -rf data/
```

The `--volumes` flag wipes the named volumes (MariaDB data,
Redis caches). Removing `./data/` wipes everything else (qBit
config, libraries, downloads).

## Known gotchas

- **First boot of ROMM** takes ~30s while MariaDB initialises
  its data dir. The `depends_on: condition: service_healthy`
  in the compose file already gates this — `docker compose
  ps` will show ROMM as `starting` until the DB is ready.
- **Bindery's setup wizard** generates the admin API key on
  first save. Paste it into allseerr's Settings → Services
  → Books → Bindery → API Key field; the Test button
  exercises `/api/v1/qualityprofile` so a wrong key fails
  fast.
- **Audiobookshelf libraries** need to be configured inside
  ABS (Settings → Libraries → Add Library) pointing at
  `/books`, `/audiobooks`, `/podcasts`, `/comics` respectively.
  Allseerr's `Settings → Services → Books → Library Servers →
  Audiobookshelf` enumerates the libraries it sees and lets
  you map each one to a media type.
- **Romarr's library structure** mirrors ROMM's expectations:
  one folder per platform under `/library` (e.g.
  `./data/romm/library/gba/`). Add a Library row in Romarr
  for each platform pointing at the matching subdirectory;
  ROMM's same mount catches the imported ROMs without any
  separate scan trigger.
- **Grimmory needs USER_ID=1000 / GROUP_ID=1000** to match
  the host owner of `./data/library/books`. Override via
  the `APP_USER_ID` env if you run as a different uid.

## Next planned work — magazines redesign

The current magazine pipeline uses **Google Books
`printType=magazines`** as the primary discovery source. It
works but has limits:

- Google Books's magazine catalogue is biased toward English
  consumer titles + indexed editions; French press
  (Que Choisir, 60 Millions de Consommateurs, Mediapart …)
  is patchy.
- ISSN is not always surfaced even when registered.
- Covers + frequency + publisher are inconsistent.

The plan is to switch to an **ISSN-first cascade** in both
allseerr and pressarr:

1. **Operator types a magazine title** (free text, or pasted
   ISSN if known).
2. **Cascade** through:
   - **ZDB** (Zeitschriftendatenbank — Deutsche
     Nationalbibliothek) — most authoritative for European
     periodicals + serials. Free, JSON API, ISSN-indexed.
   - **ISSN Portal** (issn.org) — authoritative for the ISSN
     itself but limited free tier.
   - **Wikipedia / Wikidata** SPARQL — enriches the
     ISSN-resolved record with the publication's wiki entry
     (cover, country, sister titles, editor, language…). Free.
   - **Google Books** — kept as a final fallback for cover
     images when nothing else has one.
3. **Manual entry** stays available for everything else, with
   the operator typing the title + ISSN themselves.

This means a real magazine identity ladder:
`ZDB → ISSN Portal → Wikidata enrichment → fallback`. Same
shape pressarr should adopt internally so the two stay in
sync; the allseerr `MagazineMedia` entity already carries
`externalKey` (`issn:NNNN-NNNN` or `slug:title`) so the
data-model side is ready.

That's a multi-PR redesign — tracked separately. The current
Google Books integration stays as the fallback in the new
cascade.

## Compose service reference

The full service list with cross-references to allseerr's
integration code:

| Service | Allseerr settings path | Dispatcher code |
|---|---|---|
| Romarr | `Settings → Services → Games` | `server/lib/services/romarrDispatcher.ts` |
| Bindery (book) | `Settings → Services → Books` | `server/lib/services/binderyDispatcher.ts` |
| Bindery (audiobook) | `Settings → Services → Audiobooks` | (same) |
| Livrarr (book) | `Settings → Services → Books` | `server/lib/services/livrarrDispatcher.ts` |
| Livrarr (audiobook) | `Settings → Services → Audiobooks` | (same) |
| Pressarr | `Settings → Services → Magazines` | `server/lib/services/pressarrDispatcher.ts` |
| Suwayomi | `Settings → Services → Manga` | `server/lib/services/suwayomiDispatcher.ts` |
| Mylar3 | `Settings → Services → Comics` | `server/lib/services/mylarDispatcher.ts` |
| Audiobookshelf | `Settings → Services → Books → Library` | `server/lib/services/BookAvailabilityScanner.ts` |
| Grimmory | `Settings → Services → Books → Library` | (uses the generic LibraryServer scanner) |
| ROMM | `Settings → Games → ROMM` | (own scanner: `server/lib/scanners/romm`) |
