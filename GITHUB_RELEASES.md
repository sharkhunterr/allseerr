# GitHub Releases — Allseerr

> Release notes for each tagged release. The first `# vX.Y.Z` block
> is consumed by the GitLab CI `release:gitlab` / `release:github`
> jobs as the description posted to the GitLab and GitHub release
> pages. CHANGELOG.md is the commit-by-commit machine-generated
> record; this file is the **human-curated highlight reel**.

> **Workflow** : edit this file BEFORE running `npm run release:full`.
> Add a new `# vX.Y.Z` block at the top describing the user-visible
> changes. The release script bumps the version, regenerates
> CHANGELOG.md from conventional commits, then tags + pushes; CI picks
> up the tag and posts THIS file's first block as the release body.

---

# v0.3.0

## 📚 New MAGAZINE media type + Livrarr audiobook DM + Pressarr cascade

This release adds **Magazines** as a first-class media type across
Allseerr — discover, search, request, availability — powered by a
new **Pressarr integration** that owns the ISSN-first metadata
cascade and the scene grab flow. It also lands **Livrarr** as a
dedicated book / audiobook download manager, and ships a
**full test-stack docker-compose** so contributors can spin up the
whole downstream cluster locally.

> [!IMPORTANT]
> This release introduces a new `MAGAZINE` media type with its own
> migrations. Existing books, audiobooks, comics, manga, games and
> movies/TV are untouched. Existing users don't need to reconfigure
> anything, but **new Pressarr and Livrarr settings tabs** appear in
> Services once you upgrade — configure them if you want the new
> flows.

---

### 📰 MAGAZINE — new media type

Magazines join Books, Audiobooks, Comics, Manga, and Games as a
first-class media type in Allseerr, with the same request /
availability / notification plumbing you already know :

- **Entity + migrations** — `MagazineMedia` table, permissions
  (`REQUEST_MAGAZINE`, `AUTO_APPROVE_MAGAZINE`), per-type quotas,
  MediaRequest wiring.
- **Discover** — new `discover/magazines` page with genre / status
  / frequency filters and multi-ISSN default filter, backed by the
  Google Books `printType=magazines` feed as fallback.
- **Search** — new **Magazines** tab in global search wired to the
  Pressarr cascade first, Google Books as fallback, verified-only
  toggle, ongoing-only filter.
- **Detail page** — rebuilt around the book-style layout with
  publication status chip, frequency badge, related-publications
  section, full ISSN-L sibling list, logo-aware poster treatment.
- **Request flow** — dedicated `MagazineRequestModal` with
  subscription vs one-shot request type, manual entry when the
  cascade can't find a match.
- **Notices** — new Notices settings page that lets a user
  configure how they want to hear about their magazine issues
  (per-issue, per-year, on-completion).
- **Sidebar / navbar** — links + icons refreshed to fit the new
  media types (custom `GameControllerIcon` for Games, magazines
  slot next to Books).

### 🔗 Pressarr integration — cascade-first

Allseerr no longer runs an inline ISSN cascade — that logic moved
to **Pressarr**, and Allseerr consumes it :

- New **Pressarr settings tab** (`PressarrModal`) to point Allseerr
  at a Pressarr instance.
- `POST /magazine/request` propagates the cascade id so Pressarr
  can re-hydrate the exact match on its side without a second
  lookup.
- The `createMagazine` flow forwards cascade enrichment so Pressarr
  starts with a fully-enriched row.
- Release management (grab / auto-grab / import) is now
  **owned by Pressarr** — Allseerr no longer ships a releases UI
  for magazines. The Magazine detail page shows a "scene releases"
  panel that reads from Pressarr : list / scan / grab.

### 🎧 Livrarr — book / audiobook download manager

New download-manager integration alongside Grimmory :

- Dedicated **`LivrarrModal`** in Settings → Services.
- `feat(livrarr):` client + dispatcher payloads use camelCase
  (matches Livrarr API).
- **Bindery** now bridges non-OpenLibrary IDs via ISBN for both
  books AND audiobooks (previously books only), so an item tagged
  as audiobook on Allseerr is correctly delivered by Bindery as an
  audiobook.
- Audiobook discovery now plumbs **ISBN13/10** through so downstream
  dispatchers have the identifier they need to bridge.
- **Grimmory** (audiobook auth) : correct endpoint, `email` →
  `username` rename to match upstream API.

### 🐳 Test-stack docker-compose

Contributors and self-hosters get a full downstream cluster in
one `docker compose up` :

- Adds **Pressarr**, **FlareSolverr**, **JDownloader 2**, and
  Livrarr sidecars to the compose file.
- JD2 folderwatch mounted at its **default** path
  (`/config/folderwatch`) so no extra config needed.
- Pressarr's `/config` bind-mounted so credentials survive image
  rebuilds.
- Pressarr's downloads mount points at Romarr's real qBit
  downloads dir so a full end-to-end flow (request → Pressarr
  scene grab → JD2 → Allseerr availability flip) works out of
  the box.
- Bundled qBittorrent removed (redundant with the shared cluster).
- First-boot JD2 setup documented in a compose comment.

### 🐛 Notable fixes

- `discover/magazines` handles `isNonTmdbType` correctly so the
  dashboard cards no longer read a null `tmdbId`.
- `/magazine/search` OpenAPI yaml now declares the `status` query
  param so generated clients don't strip it.
- Bindery correctly tags an added book as **audiobook** when the
  request came via an audio instance.

---

### 📦 Upgrade notes

- **New settings** appear under Services : **Pressarr**, **Livrarr**.
  Configure them if you want magazines / audiobooks routed to those
  services.
- **Migrations** run automatically on first boot. Magazines start
  with an empty table ; existing books / audiobooks are untouched.
- **No breaking changes** for the movie / TV / book / audiobook /
  game / comic / manga flows.

---

*This is the first release of Allseerr with human-curated notes at
this level of detail — earlier tags (v0.1.x → v0.2.6) are covered
by CHANGELOG.md only.*
