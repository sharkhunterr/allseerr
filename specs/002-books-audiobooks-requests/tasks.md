# Tasks: Books and Audiobooks Requests (Phase 1)

**Feature Branch**: `002-books-audiobooks-requests`
**Generated**: 2026-04-16
**Spec**: spec.md | **Plan**: plan.md | **Data Model**: data-model.md

Legend:
- `[P]` = Parallelizable (no dependency on other tasks in the same phase)
- `[USX]` = Implements acceptance criteria for User Story X
- `[FRXXX]` = Implements Functional Requirement XXX

---

## Phase 1 — Setup and Configuration

- [x] T001 [P] Create feature branch `002-books-audiobooks-requests` from `develop`
- [x] T002 [P] Add `BOOK = 'book'` and `AUDIOBOOK = 'audiobook'` to `MediaType` enum in `server/constants/media.ts` (2 additive lines, no existing values modified)

---

## Phase 2 — Foundation (Entities, Interfaces, Permissions)

### Adapter Interfaces

- [x] T010 [P] Create `MediaLibraryAdapter` and `DownloadManagerAdapter` interfaces in `server/lib/adapters/interfaces.ts` — define `testConnection()`, `searchByISBN()`, `searchByTitleAuthor()`, `searchByASIN()`, `addBook()`, `getStatus()`, `getProfiles()`, `getRootFolders()` method signatures with full TypeScript typing (no `any`)
- [x] T011 [P] Create `BookLibraryAdapter` extending `MediaLibraryAdapter` with `searchByISBN()`, `searchByTitleAuthor()`, `searchByASIN()` in `server/lib/adapters/interfaces.ts`

### Entities

- [x] T020 [P] Create `BookMedia` entity in `server/entity/BookMedia.ts` — all columns per data-model.md including `foreignBookId` (unique index), `isbn13`, `isbn10`, `authorName`, `status`, `libraryServerId`, `libraryServerUrl`, `downloadManagerExternalId`, `createdAt`, `updatedAt`
- [x] T021 [P] Create `AudiobookMedia` entity in `server/entity/AudiobookMedia.ts` — all columns per data-model.md including `foreignBookId`, `narratorName`, `durationSeconds`, `asin`, `abridgement`, `status`
- [x] T022 [P] Create `DownloadManagerInstance` entity in `server/entity/DownloadManagerInstance.ts` — columns: `name`, `type` (DownloadManagerType enum: bindery/readarr), `hostname`, `port`, `apiKey`, `useSsl`, `baseUrl`, `externalUrl`, `mediaTypes` (transformer), `activeProfileId`, `activeProfileName`, `activeDirectory`, `isDefault`, `isFallback`, `tags` (transformer), `syncEnabled`, `preventSearch`
- [x] T023 [P] Create `LibraryServerInstance` entity in `server/entity/LibraryServerInstance.ts` — columns: `name`, `type` (LibraryServerType enum: grimmory/audiobookshelf/calibre-web/kavita), `hostname`, `port`, `apiKey`, `useSsl`, `baseUrl`, `externalUrl`, `mediaTypes` (transformer), `scanIntervalSeconds` (default 300), `lastScan`, `libraryIds`, `enabled`

### Database Migration

- [x] T030 Create SQLite migration in `server/migration/sqlite/{timestamp}-AddBookAudiobookEntities.ts` — create `book_media`, `audiobook_media`, `download_manager_instance`, `library_server_instance` tables; add nullable `bookMediaId` and `audiobookMediaId` FK columns to `media_request` table; migration must be idempotent
- [x] T031 Create PostgreSQL migration in `server/migration/postgres/{timestamp}-AddBookAudiobookEntities.ts` — same schema as T030 for PostgreSQL dialect

### MediaRequest Extension

- [x] T040 Add nullable `bookMedia` ManyToOne relation (`BookMedia`, eager, CASCADE) and nullable `audiobookMedia` ManyToOne relation (`AudiobookMedia`, eager, CASCADE) to `server/entity/MediaRequest.ts` — additive columns only, no modification to existing `media` relation

### Interfaces

- [x] T050 [P] Create `server/interfaces/api/bookInterfaces.ts` — define `BookSearchResult`, `BookDetailResult`, `AudiobookSearchResult`, `BookRequestBody`, `BookAvailabilityResult`, `LibraryBookResult` interfaces with full typing per contracts/book-api.md
- [x] T051 Extend `MediaRequestBody` in `server/interfaces/api/requestInterfaces.ts` — add optional fields: `openLibraryId?: string`, `isbn?: string`, `foreignBookId?: string`, `foreignAuthorId?: string`, `note?: string`, `preferredFormat?: string`

### Settings

- [x] T060 Add `DownloadManagerSettings` and `LibraryServerSettings` interfaces and `downloadManagers: DownloadManagerSettings[]`, `libraryServers: LibraryServerSettings[]` defaults to `AllSettings` in `server/lib/settings/index.ts` — defaults are empty arrays, no modification to existing settings fields

### Permissions

- [x] T070 Audit existing permission flag values in `server/lib/permissions.ts` for available bit slots (current max is `VIEW_BLOCKLIST = 1073741824` at 2^30); add `REQUEST_BOOK = 536870912` (2^29 — available slot) and `REQUEST_AUDIOBOOK` (requires slot investigation — may need 2^31 or separate column); add `AUTO_APPROVE_BOOK` and `AUTO_APPROVE_AUDIOBOOK` flags using remaining available slots

---

## Phase 3 — OpenLibrary Integration [US3]

### OpenLibrary API Client

- [x] T100 [P] [US3] Create OpenLibrary response type interfaces in `server/api/openlibrary/interfaces.ts` — `OpenLibrarySearchResponse`, `OpenLibraryWork`, `OpenLibraryEdition`, `OpenLibraryAuthor`, `OpenLibrarySearchDoc` per research.md response formats
- [x] T101 [US3] Create `OpenLibraryAPI` class in `server/api/openlibrary/index.ts` — extends `ExternalAPI` from `server/api/externalapi.ts`; implements `searchBooks(query, page, limit)`, `getWork(olid)`, `getEdition(olid)`, `getByISBN(isbn)`, `searchAuthors(query)`; rate limit at 1 req/3s; 5-min cache TTL; User-Agent header `Allseerr/{version}`; recommended fields filter per research.md

### Book Search Service

- [x] T110 [US3] Create `BookSearchService` in `server/lib/services/BookSearchService.ts` — calls `OpenLibraryAPI.searchBooks()`, maps results to `BookSearchResult[]`, merges with local `BookMedia` availability status from database (status overlay: check if `foreignBookId` exists in `book_media` table and overlay `mediaStatus`/`requestStatus`); handles pagination (FR-007: 20+ per page)
- [x] T111 [US3] Add audiobook filtering logic to `BookSearchService` — when `type=audiobook`, filter OpenLibrary results by `physical_format` containing "Audio" or publisher names matching known audiobook publishers per research.md audiobook detection strategy

### Search Routes

- [x] T120 [US3] Create `GET /api/v1/book/search` route in `server/routes/book.ts` — query params: `query` (required), `type` (book|audiobook, default book), `page`, `limit`, `language`; calls `BookSearchService`; returns paginated `BookSearchResult[]` per contracts/book-api.md; requires authentication (FR-001, FR-002)
- [x] T121 [US3] Create `GET /api/v1/book/:id` route in `server/routes/book.ts` — fetches work detail from `OpenLibraryAPI.getWork()` + editions from `OpenLibraryAPI.getEdition()`; overlays local availability and request status; returns `BookDetailResult` per contracts/book-api.md (FR-003, FR-004)

### Search Bar Integration

- [x] T130 [US3] Add `isbn:` search provider to `server/lib/search.ts` — pattern `/(?<=isbn:)[\dXx-]+/`; calls `OpenLibraryAPI.getByISBN()`; returns results mapped to unified search format with `media_type: 'book'` (FR-001)
- [x] T131 [US3] Add `book:` search provider to `server/lib/search.ts` — pattern `/(?<=book:).+/`; calls `BookSearchService.search()`; returns results in unified format

### Route Registration

- [x] T140 Register book routes in `server/routes/index.ts` — mount `/api/v1/book` router from `server/routes/book.ts`

---

## Phase 4 — Download Manager Adapters [US1]

### Bindery Adapter

- [x] T200 [US1] Create `BinderyAdapter` in `server/lib/adapters/book/BinderyAdapter.ts` — implements `DownloadManagerAdapter`; extends `ExternalAPI`; methods: `testConnection()` (GET `/api/v1/system/status`), `addBook(foreignBookId, foreignAuthorId, qualityProfileId, rootFolderPath)` (POST `/api/v1/book`), `getProfiles()` (GET `/api/v1/qualityprofile`), `getRootFolders()` (GET `/api/v1/rootfolder`), `getQueue()` (GET `/api/v1/queue`), `getBookStatus(id)` (GET `/api/v1/book/{id}`); auth via `X-Api-Key` header; 1-hour cache for profiles/rootfolders (FR-021, FR-024)
- [x] T201 [US1] Create `BinderyAudiobookAdapter` in `server/lib/adapters/audiobook/BinderyAudiobookAdapter.ts` — extends `BinderyAdapter` or implements `DownloadManagerAdapter` separately; same API as Bindery but with audiobook-specific quality profiles and root folders; shares connection config (FR-023)

### Readarr Adapter

- [x] T210 [US1] Create `ReadarrAdapter` in `server/lib/adapters/book/ReadarrAdapter.ts` — implements `DownloadManagerAdapter`; follows `ServarrBase` pattern from `server/api/servarr/base.ts`; methods: `testConnection()`, `addBook(foreignBookId, author, editions, qualityProfileId, metadataProfileId, rootFolderPath)` per Readarr API format from research.md, `lookupByISBN(isbn)`, `lookupByTitle(title)`, `getProfiles()`, `getMetadataProfiles()`, `getRootFolders()`, `getQueue()`, `getTags()`; auth via `apikey` query param (FR-022, FR-024, FR-025)

### Book Download Service

- [x] T220 [US1] [US5] Create `BookDownloadService` in `server/lib/services/BookDownloadService.ts` — accepts a `BookMedia` or `AudiobookMedia` and `DownloadManagerInstance` config; implements Bindery-first, Readarr-fallback cascade: try primary (non-fallback) instance first, on connection error catch typed error and attempt fallback instance; logs failures; updates `BookMedia.downloadManagerExternalId` and `downloadManagerInstanceId` on success (FR-015, FR-037)

### Settings Routes for Download Managers

- [x] T230 [US1] Create `GET /api/v1/settings/book/download-managers` route in `server/routes/settings/bookSettings.ts` — returns all `DownloadManagerInstance` entities; requires `MANAGE_SETTINGS` permission
- [x] T231 [US1] Create `POST /api/v1/settings/book/download-managers` route in `server/routes/settings/bookSettings.ts` — validates and persists new `DownloadManagerInstance` to database; requires `MANAGE_SETTINGS` (FR-021)
- [x] T232 [US1] Create `PUT /api/v1/settings/book/download-managers/:id` route in `server/routes/settings/bookSettings.ts` — updates existing instance; requires `MANAGE_SETTINGS`
- [x] T233 [US1] Create `DELETE /api/v1/settings/book/download-managers/:id` route in `server/routes/settings/bookSettings.ts` — removes instance; requires `MANAGE_SETTINGS`; warn if requests reference it
- [x] T234 [US1] Create `POST /api/v1/settings/book/download-managers/test` route in `server/routes/settings/bookSettings.ts` — instantiates adapter by `type`, calls `testConnection()`, returns `{ success, version, profiles, rootFolders }` or `{ success: false, message }` (FR-024)

### Settings Route Registration

- [x] T240 Register book settings routes in `server/routes/settings/index.ts` — mount from `server/routes/settings/bookSettings.ts`

---

## Phase 5 — Library Server Adapters [US2]

### Audiobookshelf Adapter

- [x] T300 [P] [US2] Create `AudiobookshelfAdapter` in `server/lib/adapters/audiobook/AudiobookshelfAdapter.ts` — implements `BookLibraryAdapter`; extends `ExternalAPI`; auth via Bearer token or API key; methods: `testConnection()` (GET `/api/ping`), `getLibraries()` (GET `/api/libraries`), `searchByISBN(isbn)` (GET `/api/libraries/{id}/search?q={isbn}`), `searchByTitleAuthor(title, author)`, `searchByASIN(asin)`, `getItem(id)` (GET `/api/items/{id}`); returns `LibraryBookResult` with `title`, `authorName`, `narratorName`, `isbn`, `asin`, `duration`, `serverUrl` (FR-026, FR-029)

### Calibre-Web Adapter

- [x] T310 [P] [US2] Create `CalibreWebAdapter` in `server/lib/adapters/book/CalibreWebAdapter.ts` — implements `BookLibraryAdapter`; extends `ExternalAPI`; auth via session or HTTP Basic; methods: `testConnection()` (GET `/opds` validates Atom XML), `searchByISBN(isbn)` (GET `/opds/search/isbn:{isbn}` + parse Atom XML), `searchByTitleAuthor(title, author)` (GET `/opds/search/{title}+{author}`), `getBookById(id)` (GET `/ajax/book/{id}`); OPDS XML parsing for search results (FR-026, FR-029)

### Kavita Adapter

- [x] T320 [P] [US2] Create `KavitaAdapter` in `server/lib/adapters/book/KavitaAdapter.ts` — implements `BookLibraryAdapter`; extends `ExternalAPI`; auth via JWT from `POST /api/Plugin/authenticate?apiKey={key}&pluginName=Allseerr`; cache JWT token; methods: `testConnection()` (authenticate + GET `/api/Server/server-info`), `searchByISBN(isbn)` (search by title then verify ISBN from `/api/Series/{id}/metadata`), `searchByTitleAuthor(title, author)` (GET `/api/Series/search?queryString={query}`), `getMetadata(seriesId)` (GET `/api/Series/{id}/metadata`); returns `LibraryBookResult` (FR-026, FR-029)

### Grimmory Adapter (Stub)

- [x] T330 [P] [US2] Create `GrimmoryAdapter` stub in `server/lib/adapters/book/GrimmoryAdapter.ts` — implements `BookLibraryAdapter` with `testConnection()` and all search methods; methods throw `NotImplementedError` with descriptive message; include TODO comments for future implementation when API docs are available (risk: API documentation sparse per plan.md)

### Book Matching Service

- [x] T340 [US2] Create `BookMatchingService` in `server/lib/services/BookMatchingService.ts` — implements ISBN cascade matching algorithm from research.md section 5: (1) try `adapter.searchByISBN(isbn13)`, (2) try `adapter.searchByISBN(isbn10)`, (3) try `adapter.searchByASIN(asin)` for audiobooks, (4) fallback `adapter.searchByTitleAuthor(title, authorName)` using first result (no fuzzy scoring); returns `LibraryBookResult | null`; same algorithm for books and audiobooks per FR-039, FR-040, FR-041

### Book Availability Scanner

- [x] T350 [US2] Create `BookAvailabilityScanner` in `server/lib/services/BookAvailabilityScanner.ts` — scheduled job that runs per-instance at `scanIntervalSeconds` interval; queries all enabled `LibraryServerInstance` entities; for each instance, loads all `BookMedia`/`AudiobookMedia` with status != AVAILABLE that have pending/approved requests; calls `BookMatchingService.match()` for each; on match: updates `BookMedia.status` to `AVAILABLE`, sets `libraryServerId`, `libraryServerUrl`, `libraryServerInstanceId`; updates `LibraryServerInstance.lastScan` timestamp (FR-018, FR-030, FR-042)
- [x] T351 [US2] Register `BookAvailabilityScanner` as a scheduled job in `server/index.ts` or appropriate job scheduler — start on server boot; respect per-instance `scanIntervalSeconds`; log scan results

### Settings Routes for Library Servers

- [x] T360 [US2] Create `GET /api/v1/settings/book/library-servers` route in `server/routes/settings/bookSettings.ts` — returns all `LibraryServerInstance` entities; requires `MANAGE_SETTINGS`
- [x] T361 [US2] Create `POST /api/v1/settings/book/library-servers` route in `server/routes/settings/bookSettings.ts` — validates and persists new instance; requires `MANAGE_SETTINGS` (FR-026, FR-027, FR-028)
- [x] T362 [US2] Create `PUT /api/v1/settings/book/library-servers/:id` route in `server/routes/settings/bookSettings.ts` — updates instance including `scanIntervalSeconds`; requires `MANAGE_SETTINGS`
- [x] T363 [US2] Create `DELETE /api/v1/settings/book/library-servers/:id` route in `server/routes/settings/bookSettings.ts` — removes instance; requires `MANAGE_SETTINGS`; existing requests retain status
- [x] T364 [US2] Create `POST /api/v1/settings/book/library-servers/test` route in `server/routes/settings/bookSettings.ts` — instantiates adapter by `type`, calls `testConnection()`, returns `{ success, version, libraries }` or `{ success: false, message }` (FR-029)
- [x] T365 [US2] Create `POST /api/v1/settings/book/library-servers/:id/scan` route in `server/routes/settings/bookSettings.ts` — triggers immediate scan on specific instance; returns 202 (FR-030)

### Availability Route

- [x] T370 [US2] Create `GET /api/v1/book/:id/availability` route in `server/routes/book.ts` — checks all configured library servers for the given OpenLibrary work key; returns `{ available, servers[] }` per contracts/book-api.md (FR-005, FR-019)

---

## Phase 6 — Book Request Flow [US4] [US5]

### Request Submission

- [x] T400 [US4] Create `POST /api/v1/book/request` route in `server/routes/book.ts` — accepts `BookRequestBody` per contracts/book-api.md; validates required fields (`mediaType`, `openLibraryId`, `title`, `authorName`, `foreignBookId`); permission check: `REQUEST` or `REQUEST_BOOK` for books, `REQUEST` or `REQUEST_AUDIOBOOK` for audiobooks (FR-031); duplicate detection via `foreignBookId` lookup in `BookMedia`/`AudiobookMedia` + existing pending/approved requests — return 409 with `existingRequestId` (FR-010); create or reuse `BookMedia`/`AudiobookMedia` entity; create `MediaRequest` with `type` set to BOOK or AUDIOBOOK and link via `bookMedia`/`audiobookMedia` relation (FR-008, FR-009)
- [x] T401 [US4] [US5] Implement auto-approval logic in book request route — check `AUTO_APPROVE_BOOK`/`AUTO_APPROVE_AUDIOBOOK` permission on requesting user; if auto-approved, set status to APPROVED and call `BookDownloadService.dispatch()` immediately (FR-016, FR-033)
- [x] T402 [US4] Implement request quota enforcement for books/audiobooks — extend existing quota logic pattern from `MediaRequest.request()` to count book and audiobook requests separately per user (FR-032)

### Request Management

- [x] T410 [US5] Create `GET /api/v1/book/request` route in `server/routes/book.ts` — list book/audiobook requests with filters: `type`, `status`, `page`, `limit`, `userId`, `sort`, `order`; `MANAGE_REQUESTS` for all requests, own requests for any user; returns paginated results per contracts/book-api.md (FR-012, FR-013)
- [x] T411 [US5] Create `PUT /api/v1/book/request/:id` route in `server/routes/book.ts` — update request status (APPROVED, DECLINED, FAILED, COMPLETED); requires `MANAGE_REQUESTS`; on APPROVED: call `BookDownloadService.dispatch()`; on DECLINED: include optional `reason` in notification (FR-014, FR-015, FR-017)
- [x] T412 [US5] Create `DELETE /api/v1/book/request/:id` route in `server/routes/book.ts` — delete request; `MANAGE_REQUESTS` or own request while PENDING

### Notifications

- [x] T420 [US4] [US5] Integrate book/audiobook requests with existing notification system — dispatch `Notification.MEDIA_PENDING` on new request, `Notification.MEDIA_APPROVED` on approval, `Notification.MEDIA_DECLINED` on decline, `Notification.MEDIA_AVAILABLE` when scanner marks available; include book metadata (title, author, cover URL) in notification payload; reuse existing `notificationManager` dispatch pattern from `server/lib/notifications/index.ts` (FR-011, FR-017, FR-020)

---

## Phase 7 — Frontend: Settings UI [US1] [US2]

### Download Manager Settings

- [x] T500 [US1] Create `src/components/Settings/BooksAudiobooks/index.tsx` — settings page entry point with tabs for "Download Managers" and "Library Servers"; register in settings navigation
- [x] T501 [US1] Create `src/components/Settings/BooksAudiobooks/DownloadManagerSettings.tsx` — CRUD UI for download manager instances; form fields: name, type (Bindery/Readarr dropdown), hostname, port, API key, SSL toggle, base URL, external URL, media types (book/audiobook checkboxes), quality profile dropdown (populated from test response), root folder dropdown, default/fallback toggles; "Test Connection" button calling `POST /api/v1/settings/book/download-managers/test`; save/delete buttons; follow `RadarrModal` pattern from `src/components/Settings/RadarrModal/index.tsx` (FR-021, FR-022, FR-023, FR-024, FR-025)

### Library Server Settings

- [x] T510 [US2] Create `src/components/Settings/BooksAudiobooks/LibraryServerSettings.tsx` — CRUD UI for library server instances; form fields: name, type (Grimmory/Audiobookshelf/Calibre-Web/Kavita dropdown), hostname, port, API key, SSL toggle, base URL, external URL, media types checkboxes, scan interval (seconds, default 300), library selection (populated from test response), enabled toggle; "Test Connection" button; "Scan Now" button calling `POST /api/v1/settings/book/library-servers/:id/scan`; follow same modal pattern as download manager settings (FR-026, FR-027, FR-028, FR-029, FR-042)

### Settings Page Registration

- [x] T520 Register "Books & Audiobooks" section in settings navigation — add entry in settings layout/sidebar linking to the new settings page; place after existing Radarr/Sonarr entries in `src/components/Settings/SettingsLayout.tsx`
- [x] T521 Create settings page route in `src/pages/settings/books-audiobooks.tsx` — renders `BooksAudiobooks/index.tsx` component

---

## Phase 8 — Frontend: Search and Request UI [US3] [US4] [US5]

### Book Card Component

- [x] T600 [P] [US3] Create `src/components/BookCard/index.tsx` — displays book search result: cover image (from OpenLibrary cover URL), title, author(s), year, publisher, page count, format badge, series info; availability badge ("Available" / "Requested" / "Request" button); click navigates to book detail page; follow pattern of existing media cards in the codebase (FR-003, FR-005, FR-035)
- [x] T601 [P] [US3] Create `src/components/AudiobookCard/index.tsx` — displays audiobook search result: cover image, title, author, narrator (prominent), duration (formatted), publisher, ASIN badge; availability badge; same click-through pattern (FR-004, FR-035)

### Book Detail Page

- [x] T610 [US3] [US4] Create `src/components/BookDetail/index.tsx` — book detail page: large cover, title, author(s), description, edition list, series info, subjects; request button (disabled if already available or requested, shows status); optional note input field (FR-009); preferred format selector for audiobooks (FR-036); direct link to library server when available (FR-019); existing request display with status (FR-010)
- [x] T611 [US3] Create `src/pages/book/[bookId].tsx` — Next.js dynamic route for book detail; fetches from `GET /api/v1/book/:id`; renders `BookDetail` component

### Search UI Tabs

- [x] T620 [US3] Extend search results page to add media type tabs — add "Books" and "Audiobooks" tab alongside existing content; "Books" tab calls `GET /api/v1/book/search?type=book`; "Audiobooks" tab calls `GET /api/v1/book/search?type=audiobook`; render `BookCard` or `AudiobookCard` based on tab; maintain existing movie/TV behavior unchanged (FR-001, FR-002, FR-034)

### Request Dashboard Integration

- [x] T630 [US5] Add book/audiobook type badges to existing request management dashboard — show "Book" or "Audiobook" badge on requests with `type = 'book'` or `type = 'audiobook'`; approve/decline buttons call `PUT /api/v1/book/request/:id`; add media type filter to request list (FR-013, FR-014)
- [x] T631 [US4] Add book/audiobook requests to user profile request list — filter by media type; show book cover, title, author, status; link to book detail page (FR-012)

---

## Phase 9 — Permissions and Quotas UI [US10]

- [x] T700 [US10] Add `REQUEST_BOOK`, `REQUEST_AUDIOBOOK`, `AUTO_APPROVE_BOOK`, `AUTO_APPROVE_AUDIOBOOK` permission checkboxes to user permission editing UI in `src/components/Settings/SettingsUsers/index.tsx` or equivalent user management component — follow existing pattern for `REQUEST_MOVIE`/`REQUEST_TV` toggles (FR-031)
- [x] T701 [US10] Add separate book and audiobook quota fields to user settings UI — allow admin to set independent request limits for books and audiobooks per user; follow existing movie/TV quota pattern from `UserSettings` entity (FR-032, FR-033)

---

## Phase 10 — Polish, Edge Cases, and Testing

### Error Handling

- [x] T800 [P] Add graceful error handling for OpenLibrary unavailability in `server/api/openlibrary/index.ts` — return clear error message to frontend; serve cached results if available; log warning (Edge Case: metadata source unreachable)
- [x] T801 [P] Add download manager rejection handling in `server/lib/services/BookDownloadService.ts` — catch "already monitored" or other rejection responses from Bindery/Readarr; update request status to reflect rejection reason; notify admin (Edge Case: download manager rejects request)
- [x] T802 [P] Handle book available in multiple library servers in `server/lib/services/BookAvailabilityScanner.ts` — mark available if found in any server; store all server URLs for detail page display (Edge Case: book in multiple servers)
- [x] T803 [P] Handle library server removal in `server/routes/settings/bookSettings.ts` DELETE route — retain existing request statuses; stop availability checks for removed server; show warning to admin (Edge Case: server removed while requests reference it)
- [x] T804 [P] Handle no download manager configured in `server/routes/book.ts` POST request route — allow request to be stored as PENDING but show warning to admin that no download manager is available (Edge Case: request with no DM configured)
- [x] T805 [P] Add download failure detection in `server/lib/services/BookDownloadService.ts` — monitor download manager queue; mark request as FAILED with visible reason when download fails (FR-020)

### Validation and Safety

- [x] T810 Add input validation to all book API routes in `server/routes/book.ts` — validate `query` length, `page`/`limit` ranges, `openLibraryId` format, `isbn` format (10 or 13 digits), `mediaType` enum values; return 400 with descriptive messages
- [x] T811 Add input validation to all settings routes in `server/routes/settings/bookSettings.ts` — validate `hostname`, `port` range, `apiKey` non-empty, `type` enum values, `scanIntervalSeconds` minimum (30s), `mediaTypes` valid enum values

### Integration Verification

- [x] T820 Verify existing movie/TV request workflow is unaffected — run existing test suites in `server/routes/request.test.ts` and `server/routes/auth.test.ts`; confirm no regressions from MediaType enum extension or MediaRequest relation additions (SC-003, FR-034)
- [x] T821 Verify MediaRequest entity correctly handles polymorphic relations — test that movie requests have `media` set and `bookMedia`/`audiobookMedia` null; book requests have `bookMedia` set and others null; eager loading works for all three types
- [x] T822 Verify notification payloads include book metadata — test that MEDIA_PENDING, MEDIA_APPROVED, MEDIA_DECLINED, MEDIA_AVAILABLE notifications carry title, author, cover URL for book/audiobook requests

---

## Dependency Summary

```
Phase 1 (Setup)
  |
  v
Phase 2 (Foundation) -- all tasks in this phase can start once T002 is done
  |
  +---> Phase 3 (OpenLibrary / US3) -- depends on T050, T060
  |       |
  |       +---> Phase 8 (Frontend Search / US3, US4, US5) -- depends on T120, T121
  |
  +---> Phase 4 (Download Managers / US1) -- depends on T010, T022
  |       |
  |       +---> Phase 5 (Library Servers / US2) -- depends on T010, T023, T220
  |
  +---> Phase 7 (Settings UI / US1, US2) -- depends on T230-T234, T360-T365
  |
  +---> Phase 6 (Request Flow / US4, US5) -- depends on T040, T120, T220
  |
  +---> Phase 9 (Permissions UI / US10) -- depends on T070
  |
  v
Phase 10 (Polish) -- after all feature phases complete
```

Parallelism notes:
- T100/T200/T300/T310/T320/T330 can all run in parallel once Phase 2 foundation is done
- Within Phase 5, all four library adapters (T300/T310/T320/T330) are independent
- T500/T510 (settings UI) can start once their backend routes exist
- T600/T601 (card components) are independent and parallelizable
