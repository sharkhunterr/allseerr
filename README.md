<p align="center">
<img src="./public/banner.svg" alt="Allseerr — Unified media request manager">
</p>

<p align="center">
<a href="https://hub.docker.com/r/allseerr/allseerr"><img src="https://img.shields.io/docker/pulls/allseerr/allseerr?label=docker%20pulls" alt="Docker pulls"></a>
<a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/allseerr/allseerr"></a>
</p>

> **Allseerr** is a unified media request manager for movies, TV, **books, audiobooks, video games, manga & comics** — all behind a single Plex / Jellyfin / Emby login. Built as a friendly fork of [Seerr](https://github.com/seerr-team/seerr) (itself a fork of [Jellyseerr](https://github.com/Fallenbagel/jellyseerr) / [Overseerr](https://github.com/sct/overseerr)) extending the model beyond movies + TV to every kind of media a self-hosted library cares about.

## What's different from Seerr / Jellyseerr / Overseerr?

Everything Overseerr does, plus:

| Domain | Source(s) | Library / Download targets |
|---|---|---|
| **Books** | OpenLibrary, Hardcover (multi-edition + per-language) | Bookshelf (Readarr-fork), Bindery, Audiobookshelf, Komga, Grimmory |
| **Audiobooks** | Audible (multi-region), Hardcover audio editions | Bookshelf (audiobook profile), Audiobookshelf |
| **Video games** | IGDB, ROMM | ROMM (with collection groupings + virtual collections like franchises) |
| **Manga & comics** | _planned_ — AniList / ComicVine / Komga | Komga, Mylar, Suwayomi |
| **Per-type quotas + auto-approve** | — | First-class permissions per media type |

The classic flow (Plex/Jellyfin login, Sonarr / Radarr request approval, watchlist, blocklist, notifications) is unchanged — it's just had four more media types bolted on.

## Quick start

```bash
docker run -d \
  --name allseerr \
  -e LOG_LEVEL=info \
  -e TZ=Europe/Paris \
  -p 5055:5055 \
  -v ${PWD}/config:/app/config \
  --restart unless-stopped \
  allseerr/allseerr:latest
```

Then open <http://localhost:5055> and follow the setup wizard (Plex / Jellyfin / Emby pick → libraries → Sonarr / Radarr → optional book / audiobook / game providers).

For Docker Compose / Kubernetes / source builds, see [`docs/`](./docs/).

## Origins & relationship to Seerr

Allseerr is a **fork of [Seerr](https://github.com/seerr-team/seerr)**. Seerr itself forks the well-known Overseerr → Jellyseerr lineage. The whole stack (Next.js custom server, TypeORM, the metadata-provider abstraction) is unchanged at its core; Allseerr's contribution is everything below the Movies/TV line.

We track upstream Seerr releases and pull bug fixes / feature work back when relevant. Anything not specifically about non-video media (books, audiobooks, games, manga, comics) belongs upstream — please open issues there first.

## Releases & deployment

Allseerr's release tooling is adapted from [sharkhunterr/ghostarr](https://github.com/sharkhunterr/ghostarr):

- [`scripts/release.js`](./scripts/release.js) — `npm run release[:patch|:minor|:major|:github|:deploy|:full]`
- [`scripts/push.js`](./scripts/push.js) — push current branch / tags to GitLab + GitHub mirrors
- [`scripts/docker-deploy.js`](./scripts/docker-deploy.js) — local Docker builds (CI handles production publishes)
- [`.gitlab-ci.yml`](./.gitlab-ci.yml) — pipeline that builds, tests, mirrors to GitHub, publishes to Docker Hub, and creates GitLab + GitHub release pages on tag push

See [`scripts/README.md`](./scripts/README.md) for required CI variables (`DOCKER_HUB_USER`, `DOCKER_HUB_TOKEN`, `GITHUB_TOKEN`, `GITHUB_REPO`) and the full release workflow.

## Configuration

Most options are set in the **Settings** UI after first launch. Notable allseerr-specific tabs:

- **Settings → Metadata Providers** — Books / Audiobooks tabs let you pick a primary source (OpenLibrary or Hardcover; Audible or Hardcover for audiobooks), enable/test secondary providers, and pin a preferred language.
- **Settings → Services** — separate sub-tabs for Movies & TV (Sonarr/Radarr), Books, Audiobooks (Bookshelf instances per `mediaType`), Games (ROMM + IGDB).
- **Settings → Jobs & Cache** — schedules per integration (e.g. ROMM Library Scan every 15 min, ROMM Collections Scan weekly).
- **Settings → Users → Quotas / Permissions** — per-type quotas and auto-approve flags (book / audiobook / game) on top of the existing movie / TV ones.

Config + SQLite live under `./config` (mounted volume). PostgreSQL is supported.

## Roadmap

See [`todo_release.md`](./todo_release.md) for the working list:

1. **Manga + comics** as new media types (AniList, ComicVine, Komga shared)
2. **Per-type trending sliders** on the home page
3. **Smart "All" search** that aggregates every enabled provider into a single grid
4. **Nav bar redesign** to scale past the Movies / TV pair
5. **Allseerr-branded visual identity** (logo, banner, screenshots — currently inherited from Seerr)

## Migrating from Seerr / Jellyseerr / Overseerr

The database schema is a strict superset — Allseerr will read an existing Seerr / Jellyseerr / Overseerr config + DB and migrate it on first launch. Always back up `config/db/db.sqlite3` (or your Postgres dump) before upgrading.

## Support

This is a small fork. Before asking here:

1. Check if it's an upstream issue → ask on [Seerr](https://github.com/seerr-team/seerr) or [Jellyseerr](https://github.com/Fallenbagel/jellyseerr).
2. Otherwise file [an Allseerr issue](/../../issues) with logs (`./config/logs/`) and your media-provider config.

## API docs

Available at <http://localhost:5055/api-docs> on a running instance (Swagger UI backed by [`seerr-api.yml`](./seerr-api.yml)).

## Contributing

The contribution guide and code of conduct from upstream still apply: [`CONTRIBUTING.md`](./CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md). When opening a PR specifically against allseerr extensions (books / audiobooks / games / manga / comics), label it accordingly so it doesn't get bounced upstream.

## License

MIT, same as Overseerr / Jellyseerr / Seerr. See [`LICENSE`](./LICENSE).

## Acknowledgments

- [**Overseerr**](https://github.com/sct/overseerr) — original
- [**Jellyseerr**](https://github.com/Fallenbagel/jellyseerr) — Jellyfin/Emby fork
- [**Seerr**](https://github.com/seerr-team/seerr) — direct upstream
- [**ghostarr**](https://github.com/sharkhunterr/ghostarr) — release tooling pattern (`scripts/` + `.gitlab-ci.yml`)
