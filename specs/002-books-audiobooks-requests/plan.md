# Implementation Plan: Books and Audiobooks Requests

**Branch**: `002-books-audiobooks-requests` | **Date**: 2026-04-16 | **Spec**: spec.md

## Summary

Add book and audiobook search, request, approval, and availability tracking to Allseerr. Users search via OpenLibrary through the existing unified search bar (with new media type tabs), submit requests with one click, and admins approve/decline through the same dashboard used for movies and TV. Approved requests are forwarded to Bindery (primary) or Readarr (fallback). Availability is detected by periodic scans of configured library servers (Grimmory, Audiobookshelf, Calibre-Web, Kavita). The entire implementation is strictly additive -- no existing movie/TV code is modified.

## Technical Context

### Codebase Anchor Points

| Concern | Existing Location | Extension Strategy |
|---|---|---|
| Media types | `server/constants/media.ts` -- `MediaType` enum | Add `BOOK = 'book'`, `AUDIOBOOK = 'audiobook'` values |
| Media entity | `server/entity/Media.ts` -- tracks tmdbId/tvdbId | New `BookMedia` and `AudiobookMedia` entities (separate tables, not modifying Media) |
| Request entity | `server/entity/MediaRequest.ts` -- status lifecycle | MediaRequest.type column already uses `MediaType` varchar; new enum values flow through |
| Search | `server/routes/search.ts` + `server/lib/search.ts` -- SearchProvider pattern | New `/api/v1/book/search` route; add `isbn:` SearchProvider for ISBN prefix |
| External API base | `server/api/externalapi.ts` -- ExternalAPI class with axios, caching, rate limiting | Bindery, Readarr, OpenLibrary, and library server adapters extend ExternalAPI |
| Servarr pattern | `server/api/servarr/base.ts` -- ServarrBase with profiles, root folders, queue | ReadarrAdapter wraps a Readarr-specific ServarrBase subclass |
| Settings | `server/lib/settings/index.ts` -- AllSettings singleton, DVRSettings interface | Add `downloadManagers: DownloadManagerSettings[]` and `libraryServers: LibraryServerSettings[]` |
| Permissions | `server/lib/permissions.ts` -- bitwise Permission enum | Add `REQUEST_BOOK`, `REQUEST_AUDIOBOOK`, `AUTO_APPROVE_BOOK`, `AUTO_APPROVE_AUDIOBOOK` flags |
| Notifications | `server/lib/notifications/index.ts` -- Notification enum + agent dispatch | Existing notification types (MEDIA_PENDING, APPROVED, etc.) work for all MediaTypes |
| Request interfaces | `server/interfaces/api/requestInterfaces.ts` -- MediaRequestBody | Extend with optional `openLibraryId`, `isbn`, `foreignBookId` fields |
| Frontend settings | `src/components/Settings/` -- per-service config panels | New `src/components/Settings/BooksAudiobooks/` |
| Adapter convention | Constitution: `server/lib/adapters/<mediaType>/<ServiceName>Adapter.ts` | New directories: `server/lib/adapters/book/`, `server/lib/adapters/audiobook/` |

### Key Design Decisions

1. **Separate entities, shared request table.** `BookMedia` and `AudiobookMedia` get their own TypeORM entities and database tables (with OpenLibrary IDs, ISBNs, foreign IDs), while `MediaRequest` is reused by adding new `MediaType` enum values. This avoids modifying the existing `Media` entity.

2. **OpenLibrary as sole search source.** Following the Libreseerr pattern. No Google Books integration in Phase 1. The `OpenLibraryAPI` class handles search and edition lookup.

3. **Cascading match strategy.** ISBN-first, then title+author fallback. The matching logic lives in a shared `BookMatchingService` used by both book and audiobook availability scanners.

4. **Adapter interfaces from constitution.** `MediaLibraryAdapter` and `DownloadManagerAdapter` interfaces are implemented by all service integrations. No direct API calls outside adapters.

5. **Bindery-primary, Readarr-fallback.** The `BookDownloadService` tries Bindery first. On connection failure, it falls through to Readarr if configured. Readarr adapter reuses the ServarrBase pattern.

6. **BookMedia links to MediaRequest via a new foreignId pattern.** Since the existing `Media` entity is keyed on `tmdbId` (integer), and books use string-based OpenLibrary IDs, `BookMedia` and `AudiobookMedia` use their own primary keys and are linked to `MediaRequest` through a new nullable `bookMediaId` / `audiobookMediaId` column on MediaRequest (or through a polymorphic relationship).

## Constitution Check

| Principle | Compliance |
|---|---|
| I. Never Break Existing Functionality | No modifications to existing entities, routes, or auth flows. New enum values are additive. All existing tests must pass. |
| II. Provider/Adapter Pattern | All external services (OpenLibrary, Bindery, Readarr, Grimmory, Audiobookshelf, Calibre-Web, Kavita) implemented as adapters behind `MediaLibraryAdapter` / `DownloadManagerAdapter`. |
| III. MediaType Enum Authority | `BOOK` and `AUDIOBOOK` added to the enum. All conditional logic uses enum values, never raw strings. |
| IV. Explicit Over Implicit | No `any` types. All adapter interfaces, API responses, and service methods fully typed. |
| V. Incremental Delivery | Phased within this feature: foundation first, then search, then download managers, then library servers, then frontend. Each sub-phase independently deployable. |
| File conventions | Adapters in `server/lib/adapters/book/`, `server/lib/adapters/audiobook/`. Entities in `server/entity/`. Settings UI in `src/components/Settings/BooksAudiobooks/`. |
| Prohibitions | No modification of existing movie/TV code, no `any`, no npm/yarn, no hardcoded credentials, no direct API calls outside adapters. |

## Project Structure

### Documentation (this feature)

```text
specs/002-books-audiobooks-requests/
  plan.md              # This file
  research.md          # Phase 0 -- API research and matching strategy
  data-model.md        # Entity definitions
  contracts/
    book-api.md        # API endpoint contracts
  quickstart.md        # Developer setup guide
  tasks.md             # Generated by /speckit.tasks (not part of /speckit.plan)
```

### Source Code (repository root)

```text
server/
  constants/
    media.ts                                # MODIFY: add BOOK, AUDIOBOOK to MediaType enum
  entity/
    BookMedia.ts                            # NEW: book entity
    AudiobookMedia.ts                       # NEW: audiobook entity
    DownloadManagerInstance.ts               # NEW: download manager config entity
    LibraryServerInstance.ts                 # NEW: library server config entity
  interfaces/
    api/
      requestInterfaces.ts                  # MODIFY: extend MediaRequestBody
      bookInterfaces.ts                     # NEW: book/audiobook API response types
  api/
    openlibrary/
      index.ts                              # NEW: OpenLibraryAPI client
      interfaces.ts                         # NEW: OpenLibrary response types
  lib/
    adapters/
      interfaces.ts                         # NEW: MediaLibraryAdapter, DownloadManagerAdapter
      book/
        BinderyAdapter.ts                   # NEW: Bindery download manager adapter
        ReadarrAdapter.ts                   # NEW: Readarr fallback adapter
        GrimmoryAdapter.ts                  # NEW: Grimmory library adapter
        CalibreWebAdapter.ts                # NEW: Calibre-Web library adapter
        KavitaAdapter.ts                    # NEW: Kavita library adapter
      audiobook/
        BinderyAudiobookAdapter.ts          # NEW: Bindery for audiobooks
        AudiobookshelfAdapter.ts            # NEW: Audiobookshelf library adapter
    services/
      BookSearchService.ts                  # NEW: OpenLibrary search + availability merge
      BookDownloadService.ts                # NEW: Bindery/Readarr dispatch
      BookAvailabilityScanner.ts            # NEW: periodic library scan
      BookMatchingService.ts                # NEW: ISBN cascade matching
    permissions.ts                          # MODIFY: add book/audiobook permission flags
    settings/
      index.ts                              # MODIFY: add downloadManagers[], libraryServers[]
  routes/
    book.ts                                 # NEW: /api/v1/book/* routes
    settings/
      bookSettings.ts                       # NEW: /api/v1/settings/book/* routes

src/
  components/
    Settings/
      BooksAudiobooks/
        index.tsx                           # NEW: settings page entry
        DownloadManagerSettings.tsx          # NEW: Bindery/Readarr config UI
        LibraryServerSettings.tsx            # NEW: library server config UI
    BookCard/
      index.tsx                             # NEW: book search result card
    AudiobookCard/
      index.tsx                             # NEW: audiobook search result card
    BookDetail/
      index.tsx                             # NEW: book detail page with request button
  pages/
    book/
      [bookId].tsx                          # NEW: book detail page route
```

## Complexity Tracking

### Sub-Phase 1A: Foundation (3-4 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Add BOOK/AUDIOBOOK to MediaType enum | `server/constants/media.ts` | Low | 2 lines, additive |
| Add permission flags | `server/lib/permissions.ts` | Low | 4 new bitwise flags: REQUEST_BOOK, REQUEST_AUDIOBOOK, AUTO_APPROVE_BOOK, AUTO_APPROVE_AUDIOBOOK |
| Create adapter interfaces | `server/lib/adapters/interfaces.ts` | Medium | MediaLibraryAdapter + DownloadManagerAdapter per constitution |
| Create BookMedia entity | `server/entity/BookMedia.ts` | Medium | See data-model.md |
| Create AudiobookMedia entity | `server/entity/AudiobookMedia.ts` | Medium | See data-model.md |
| Create DownloadManagerInstance entity | `server/entity/DownloadManagerInstance.ts` | Medium | Encrypted API key column |
| Create LibraryServerInstance entity | `server/entity/LibraryServerInstance.ts` | Medium | Scan interval, media type assignment |
| Extend AllSettings | `server/lib/settings/index.ts` | Low | Add DownloadManagerSettings[], LibraryServerSettings[] interfaces and defaults |
| Extend MediaRequestBody | `server/interfaces/api/requestInterfaces.ts` | Low | Optional openLibraryId, isbn, foreignBookId |

### Sub-Phase 1B: OpenLibrary Integration (2-3 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| OpenLibrary API client | `server/api/openlibrary/index.ts`, `interfaces.ts` | Medium | Extends ExternalAPI, rate-limited (100 req/5min) |
| Book search service | `server/lib/services/BookSearchService.ts` | Medium | Merge OL results with local BookMedia availability |
| Book search route | `server/routes/book.ts` | Medium | GET /api/v1/book/search, GET /api/v1/book/:id |
| ISBN search provider | `server/lib/search.ts` | Low | Add `isbn:` prefix pattern to searchProviders array |

### Sub-Phase 1C: Download Manager Adapters (3-4 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Bindery adapter | `server/lib/adapters/book/BinderyAdapter.ts` | High | New API, see research.md |
| Readarr adapter | `server/lib/adapters/book/ReadarrAdapter.ts` | Medium | Follows ServarrBase pattern |
| Bindery audiobook adapter | `server/lib/adapters/audiobook/BinderyAudiobookAdapter.ts` | Medium | Same Bindery API, audiobook config |
| Book download service | `server/lib/services/BookDownloadService.ts` | Medium | Bindery-first, Readarr-fallback |
| Book request flow | `server/routes/book.ts` | High | POST /api/v1/book/request with permission checks, duplicate detection |

### Sub-Phase 1D: Library Server Adapters (4-5 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Grimmory adapter | `server/lib/adapters/book/GrimmoryAdapter.ts` | High | API documentation sparse |
| Audiobookshelf adapter | `server/lib/adapters/audiobook/AudiobookshelfAdapter.ts` | Medium | Well-documented REST API |
| Calibre-Web adapter | `server/lib/adapters/book/CalibreWebAdapter.ts` | Medium | OPDS or REST |
| Kavita adapter | `server/lib/adapters/book/KavitaAdapter.ts` | Medium | REST API with JWT auth |
| Book matching service | `server/lib/services/BookMatchingService.ts` | High | ISBN cascade + title+author fallback |
| Availability scanner | `server/lib/services/BookAvailabilityScanner.ts` | Medium | Cron job, scans all library servers |

### Sub-Phase 1E: Settings UI (3-4 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Download manager settings page | `src/components/Settings/BooksAudiobooks/DownloadManagerSettings.tsx` | Medium | Instance CRUD, test connection |
| Library server settings page | `src/components/Settings/BooksAudiobooks/LibraryServerSettings.tsx` | Medium | 4 server types, instance management |
| Settings API routes | `server/routes/settings/bookSettings.ts` | Medium | CRUD + test connection endpoints |

### Sub-Phase 1F: Frontend Search and Request (3-4 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Book card component | `src/components/BookCard/index.tsx` | Medium | Cover, title, author, availability badge |
| Audiobook card component | `src/components/AudiobookCard/index.tsx` | Medium | Narrator, duration |
| Book detail page | `src/components/BookDetail/index.tsx` + `src/pages/book/[bookId].tsx` | Medium | Request button, status, library link |
| Search bar media type tabs | Extend existing search UI | Medium | Add book/audiobook filter tabs |
| Request dashboard badges | Extend existing request list | Low | Type badges for book/audiobook |

### Sub-Phase 1G: Notifications and Permissions (1-2 days)

| Task | Files | Complexity | Notes |
|---|---|---|---|
| Book/audiobook notification payloads | Extend notification dispatch | Medium | Cover from OpenLibrary, book metadata fields |
| Permission checks | Extend request route | Low | Use new REQUEST_BOOK/AUDIOBOOK flags |
| Quota support | Extend quota logic | Low | Separate book/audiobook counters |

### Total Estimated Effort: 19-26 days

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Bindery API undocumented or unstable | Medium | High | Readarr fallback always available; research.md captures findings |
| OpenLibrary rate limits (100 req/5min) | Medium | Medium | Client-side debounce, 5-min server cache TTL |
| Grimmory API not publicly documented | High | Medium | Prioritize ABS/CalibreWeb/Kavita; Grimmory can slip to 1.5 |
| ISBN matching has low coverage for audiobooks | Medium | Medium | Title+author fallback always attempted |
| TypeORM migration on existing databases | Low | High | Explicit migration scripts, no `synchronize: true` in prod |

### Dependency Graph

```
Sub-Phase 1A (Foundation)
    |
    +---> Sub-Phase 1B (OpenLibrary) ----------> Sub-Phase 1F (Frontend)
    |
    +---> Sub-Phase 1C (Download Managers) ----> Sub-Phase 1D (Library Servers)
    |
    +---> Sub-Phase 1E (Settings UI)
    |
    +---> Sub-Phase 1G (Notifications & Permissions)
```

1A is the prerequisite for everything. 1B and 1C can run in parallel. 1D depends on 1C. 1E can start after 1A. 1F depends on 1B. 1G can start after 1A.
