# Release backlog

Working list of features still to design / build before the next
public release. Order is rough — top entries are the ones with the
clearest scope, lower entries need product / API decisions first.

---

## 1. Manga & comics — new media types

Add **manga** and **comics** as first-class media types alongside
`book` / `audiobook` / `game`. Don't try to extend the book section:
the UX (series-first browsing, chapter granularity, mangaka roles,
right-to-left reading, vertical Japanese covers vs western single
issues) diverges enough that branching `book.metadataProviders`
on a `format` field would muddy every flow.

### Architecture (mirror the audiobook integration we shipped)

For each new type:

- New `MediaType.MANGA` / `MediaType.COMIC` constants.
- New entity `MangaMedia` / `ComicMedia` (parallel to `BookMedia`).
- New settings block `manga.metadataProviders` /
  `comic.metadataProviders` with `primarySource`, providers, language
  policy, etc. Same shape as `audiobook.metadataProviders`.
- New permissions: `REQUEST_MANGA`, `AUTO_APPROVE_MANGA`, idem for
  comics. Plug into the existing per-type quota system.
- Search tabs alongside Books / Audiobooks / Games.
- Detail pages dedicated, mirror the book detail layout.
- Series / volume pages.
- Author / mangaka detail page.

### APIs

**Manga**

- **AniList** (https://anilist.co/graphiql) — GraphQL, free, no key
  needed for read-only. Best-in-class metadata: covers, scoring,
  related works, mangaka, statuses. Primary source candidate.
- **Jikan** (https://jikan.moe) — free REST proxy on MyAnimeList.
  Backup / enrichment.
- **MangaDex** (https://api.mangadex.org) — chapter-level + scanlation
  metadata. Optional, useful for "request specific chapter X" flows.

**Comics**

- **ComicVine** (https://comicvine.gamespot.com/api/) — Marvel / DC
  / indie, very rich, free with an API key.
- **GCD (Grand Comics Database)** — free alternative.

**Library servers**

- **Komga** is already integrated for books and natively supports
  manga + comics via its `mediaTypes` field. Just expose the right
  filter on the new types.
- **Audiobookshelf** doesn't apply.

**Download managers**

- Manga: no de-facto standard. Either keep a manual workflow (game-
  style) or integrate **Suwayomi / Tachidesk** REST API for queue-add.
- Comics: **Mylar3** (active fork of Mylar) — Sonarr-equivalent for
  comics, REST API.

### Recommended phasing

Mirror the audiobook integration pattern (~30 commits):

1. AniList client + cache + tests, then ComicVine.
2. Settings schema + migration + UI tab.
3. Search route per type with primarySource routing.
4. Detail route + series / chapter route.
5. Frontend pages (search, detail, series, author).
6. Request flow (manual workflow first; download manager later).
7. Permissions + quotas + admin "Request As" picker.
8. OpenAPI spec entries for every new route.

Start with **manga + AniList + Komga + manual workflow** to get the
foundation right. Comics + ComicVine + Mylar can land in a second
pass.

---

## 2. Trending sections on the home page

Today the home page shows movies + TV trending only. With every new
media type we ship, the home page becomes less representative.

Add per-type horizontal sliders, ordered by what surfaces best on
each provider:

- **Movies** — already there
- **TV** — already there
- **Books** — Hardcover top-read / users_count desc, or "Recently
  added" from the user's Komga / Bookshelf
- **Audiobooks** — Audible bestsellers per region, or Hardcover
  filtered to audio editions
- **Games** — IGDB top-rated, or "Recently added" from ROMM
- **Manga** — AniList trending (popularity desc, current season)
- **Comics** — ComicVine recently-published / popular issues

Sliders should be **toggleable per user** in Settings → General
("Show {Type} trending on home"). Default ON when the corresponding
provider is configured + enabled.

Backend: extend `/api/v1/discover/trending` (or add per-type routes)
to return a unified `{ media, page, totalResults }` shape so the
existing `<Slider>` component can render them.

Watch out: more sliders = more API calls on cold home loads. Cache
each provider's trending list 30–60 minutes server-side.

---

## 3. Smart unified search

Replace the current per-tab search with a "Smart" tab that
aggregates **everything matching the query** and groups results by
type (with collection cards on top — same treatment as book series).

Example: typing "harry potter" returns:

- **Author / Creator card** — J.K. Rowling (top of grid)
- **Universe / collection card** — Harry Potter (groups every match
  across types)
- **Movies** — Sorcerer's Stone, Chamber of Secrets, …
- **TV** — eventual "HBO Reboot" if it lands
- **Books** — the 7 novels + companion books
- **Audiobooks** — Audible / Hardcover audio editions
- **Games** — Hogwarts Legacy, LEGO Harry Potter, …
- **Book series** — Harry Potter (link to series page)
- **ROMM collection** — if the user has a "Harry Potter" collection
- **Author page** — link
- **Manga** / **Comics** — when those types ship

UX shape:

- New "All" tab as default, alongside the existing per-type tabs.
- Group results into sections within the "All" view (one per type),
  collapsible, with a "View all → " link that switches to the
  dedicated tab pre-filtered.
- A "Universe" / cross-type collection card appears at the very top
  when the query strongly matches a known multi-type IP. Source: a
  new local index built from `book_series.name`, `franchise.name`
  (IGDB), `collection.name` (TMDB), `franchise` (AniList) — basically
  every "this is a recurring IP across types" we can find. Heavy
  feature; ship the per-type aggregation first, the universe card
  second.

Backend: a single `/api/v1/search` that fans out to every enabled
provider in parallel and returns a tagged union. Each branch already
exists today (book / audiobook / game / movie / tv) — wire them under
one entry point.

Make it possible to toggle per-section in user settings (similar to
home trending).

---

## 4. Navigation bar redesign

Current sidebar / top-nav has dedicated Movies + TV icons. With
books / audiobooks / games already shipped and manga / comics on
the roadmap, the bar overflows.

Options to evaluate:

- **Single "Discover" entry** that opens a media-type picker grid
  (cleaner, fewer icons, but one more click).
- **Grouped entries**: Movies+TV → "Watch", Books+Audiobooks → "Read
  & Listen", Games+Manga+Comics → "Play & Read". Compromise.
- **Dynamic visibility**: only show entries for media types the
  user has providers configured for + has the right permission.
  Best UX, more code.

Whichever route, also revisit:

- Active-state highlighting for nested routes (`/book/series/...`
  should highlight the Books entry).
- Mobile bottom-nav: today it's hardcoded for movies / tv / discover;
  needs to scale.
- Settings → User preferences → a "Pinned media types" list so power
  users can reorder / hide entries.

This is a UX-heavy refactor — write a small spec / mockup before
touching the code.

---

## Cross-cutting

A few things that are not features but block the above:

- **Permissions audit** — the `Permission` enum is already past int32
  on book / audiobook / game (BigInt-safe handler shipped). Manga +
  comics will push past 64 bits too if we're not careful — confirm
  the BigInt path scales.
- **Settings JobId enum** is hard-coded; manga / comics scans need
  new entries + i18n labels in `SettingsJobsCache`.
- **Default permissions / quota defaults** in `Settings.constructor`
  need new entries each time we add a media type — consider a
  helper that derives them from `MediaType` enum so we stop forgetting.
