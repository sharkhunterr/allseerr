# Tasks: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests` | **Date**: 2026-04-16
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [game-api.md](./contracts/game-api.md)

## Overview

7 user stories across 3 priority tiers:
- **P1** (core): US1 (ROMM config), US2 (game search), US3 (game request), US5 (admin approval)
- **P2** (enhance): US4 (request tracking), US6 (availability detection)
- **P3** (refine): US7 (permissions)

Estimated: ~50 tasks, ~15 new files, 2 new DB tables, ~10 new API endpoints.

---

## Phase 1 -- Setup & Constants

Foundation work with no dependencies. All tasks are parallelizable.

- [x] T001 [P] Add `MediaType.GAME = 'game'` to the `MediaType` enum in `server/constants/media.ts`. Verify no existing enum members are modified.
- [x] T002 [P] Add `REQUEST_GAME = 536870912` (2^29) and `AUTO_APPROVE_GAME = 2147483648` (2^31) to the `Permission` enum in `server/lib/permissions.ts`. Add both to the default user permission set as appropriate.
- [x] T003 [P] Add `'igdb'` and `'romm'` to the `AvailableCacheIds` type in `server/lib/cache.ts`. Create cache instances: `igdb` (stdTtl: 21600, checkPeriod: 1800) and `romm` (stdTtl: 300, checkPeriod: 60).
- [x] T004 [P] Add `IgdbSettings` interface (`clientId`, `clientSecret`) and `RommSettings` interface (see data-model.md Section 3) to `server/lib/settings/index.ts`. Add `igdb: IgdbSettings` and `romm: RommSettings[]` to `AllSettings`. Add defaults: `igdb: { clientId: '', clientSecret: '' }`, `romm: []`. Add `'romm-scan'` to `JobId` type with default schedule `'0 */15 * * * *'`.
- [x] T005 [P] Create settings migration `server/lib/settings/migrations/0009_add_game_settings.ts`. Add `igdb` and `romm` default values to settings.json if missing. Follow existing migration pattern (e.g., `0008_migrate_blacklist_to_blocklist.ts`). Register the migration in the migrator.

---

## Phase 2 -- Entities & Data Layer

Depends on Phase 1 (MediaType, MediaStatus enums must exist).

- [x] T006 Create `server/entity/GameMedia.ts` entity per data-model.md Section 1. Columns: `id`, `igdbId`, `platformIgdbId`, `platformName`, `platformAbbreviation`, `title`, `coverUrl`, `firstReleaseDate`, `developer`, `publisher`, `genres`, `rating`, `summary`, `slug`, `status`, `rommId`, `rommUrl`, `createdAt`, `updatedAt`. Unique composite index on `(igdbId, platformIgdbId)`. Individual indexes on `igdbId`, `platformIgdbId`, `status`.
- [x] T007 Create `server/entity/GameRequestMeta.ts` entity per data-model.md Section 2b. Columns: `id`, `request` (OneToOne -> MediaRequest, onDelete CASCADE), `platformIgdbId`, `platformName`, `userNote`, `adminNote`. Index on `request` join column.
- [x] T008 Register both new entities (`GameMedia`, `GameRequestMeta`) in the TypeORM connection configuration so tables are auto-created on startup.

---

## Phase 3 -- API Adapters

IGDB and ROMM adapters can be built in parallel. Depends on Phase 1 (cache IDs) and Phase 2 (entity types for return mappings).

### IGDB Adapter

- [x] T009 [P] Create `server/api/igdb/interfaces.ts` with TypeScript interfaces for IGDB API responses: `IgdbGame`, `IgdbPlatform`, `IgdbCover`, `IgdbCompany`, `IgdbInvolvedCompany`, `IgdbGenre`, `IgdbSearchResult`. All fields fully typed, no `any`.
- [x] T010 [P] Create `server/api/igdb/index.ts` extending `ExternalAPI`. Implement Twitch OAuth2 token management: `getAccessToken()` method that exchanges client credentials via `POST https://id.twitch.tv/oauth2/token`, caches token in memory, refreshes at 75% of `expires_in` or on 401 response. All requests include `Client-ID` and `Authorization: Bearer` headers.
- [x] T011 Implement `searchGames(query: string, platformIds?: number[]): Promise<IgdbSearchResult[]>` in the IGDB adapter. Build Apicalypse POST body with fields: `name, cover.url, platforms.name, platforms.abbreviation, platforms.id, first_release_date, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, genres.name, total_rating, summary, slug`. Support optional `where platforms = (...)` clause for platform filtering. Limit 20 results. Rate limit to 4 req/s.
- [x] T012 Implement `getGameDetails(igdbId: number): Promise<IgdbGame>` in the IGDB adapter. Fetch a single game by ID with full field expansion including `screenshots.url`. Return null/throw if not found.
- [x] T013 Implement `getPlatforms(): Promise<IgdbPlatform[]>` in the IGDB adapter. Fetch all platforms (`fields id,name,abbreviation,slug; limit 500;`). Cache results for 24 hours using the `igdb` cache.

### ROMM Adapter

- [x] T014 [P] Create `server/api/romm/interfaces.ts` with TypeScript interfaces for ROMM API responses: `RommRom`, `RommPlatform`, `RommHeartbeat`. Match fields from research.md Section 2.
- [x] T015 [P] Create `server/api/romm/index.ts` extending `ExternalAPI`. Constructor accepts `RommSettings`. Implement auth header injection based on `authType` (`apikey` -> Bearer header, `basic` -> Basic auth header). Base URL construction from `hostname`, `port`, `useSsl`, `baseUrl`.
- [x] T016 Implement `testConnection(): Promise<{ success: boolean; version?: string }>` in the ROMM adapter. Call `GET /api/heartbeat`. Return success/failure with version if available.
- [x] T017 Implement `getPlatforms(): Promise<RommPlatform[]>` in the ROMM adapter. Call `GET /api/platforms`. Cache for 1 hour via `romm` cache.
- [x] T018 Implement `getRecentRoms(since?: string): Promise<RommRom[]>` in the ROMM adapter. Call `GET /api/roms?order_by=created_at&order_dir=desc` with pagination. Fetch pages until `created_at < since` timestamp. Return all ROMs newer than `since`.
- [x] T019 Implement `getRomDetails(romId: number): Promise<RommRom>` in the ROMM adapter. Call `GET /api/roms/{id}`.

### ROMM Library Adapter

- [x] T020 Create `server/lib/adapters/game/RommAdapter.ts` implementing the `MediaLibraryAdapter` pattern. Methods: `checkAvailability(igdbId, platformIgdbId)`, `triggerLibraryScan(serverId)`, `testConnection(settings)`. Bridges `server/api/romm/` raw client to the adapter interface. Uses `RommSettings` from settings.

---

## Phase 4 -- Settings Routes [US1]

Depends on Phase 3 (adapters for test connection). These provide the admin configuration UI backend.

### IGDB Settings Routes

- [x] T021 [US1] [P] Create `server/routes/settings/igdb.ts` with Express router. Implement `GET /` -- return `{ clientId, isConfigured: boolean }` (never expose `clientSecret`). Permission: `ADMIN`.
- [x] T022 [US1] [P] Implement `PUT /` on IGDB settings router. Accept `{ clientId, clientSecret }` body. Save to settings. Return `{ clientId, isConfigured }`. Permission: `ADMIN`. File: `server/routes/settings/igdb.ts`.
- [x] T023 [US1] Implement `POST /test` on IGDB settings router. Accept `{ clientId, clientSecret }` body. Attempt Twitch OAuth2 token exchange without saving. Return `{ success, message }`. File: `server/routes/settings/igdb.ts`.

### ROMM Settings Routes

- [x] T024 [US1] [P] Create `server/routes/settings/romm.ts` with Express router. Implement `GET /` -- return all ROMM server instances with sensitive fields (`apiKey`, `username`, `password`) stripped. Permission: `ADMIN`.
- [x] T025 [US1] [P] Implement `POST /` on ROMM settings router. Accept `RommSettings` body. Assign auto-increment ID. Handle `isDefault` flag (clear other defaults). Save to settings. Return sanitized server object. Permission: `ADMIN`. File: `server/routes/settings/romm.ts`.
- [x] T026 [US1] Implement `PUT /:serverId` on ROMM settings router. Update existing ROMM server by ID. Handle `isDefault` flag. Save to settings. Return sanitized server. Permission: `ADMIN`. File: `server/routes/settings/romm.ts`.
- [x] T027 [US1] Implement `DELETE /:serverId` on ROMM settings router. Remove ROMM server by ID. Return `204 No Content`. Permission: `ADMIN`. File: `server/routes/settings/romm.ts`.
- [x] T028 [US1] Implement `POST /test` on ROMM settings router. Accept connection params body. Instantiate ROMM adapter and call `testConnection()`. Return `{ success, message, version }`. Permission: `ADMIN`. File: `server/routes/settings/romm.ts`.
- [x] T029 [US1] Implement `POST /:serverId/sync` on ROMM settings router. Load server config by ID, run ROMM scan immediately (reuse scanner logic from T041). Return `{ success, message }`. Permission: `ADMIN`. File: `server/routes/settings/romm.ts`.
- [x] T030 [US1] Register IGDB and ROMM settings routes in `server/routes/settings/index.ts` under `/igdb` and `/romm` paths.
- [x] T031 [US1] Register game-related routes in `server/routes/index.ts`. Mount settings sub-routes and game detail/platform routes (from Phase 5).

---

## Phase 5 -- Search Integration [US2]

Depends on Phase 3 (IGDB adapter). Enables users to discover games.

- [x] T032 [US2] Create `server/models/Game.ts` with `GameSearchResult` interface matching the contract (game-api.md Section 1a). Implement `mapIgdbToGameResult(igdbGame: IgdbSearchResult): GameSearchResult` mapper -- extract developers/publishers from `involved_companies`, transform `cover.url` (prefix `https:`, replace `t_thumb` with `t_cover_big`), convert timestamps.
- [x] T033 [US2] Add `igdb:` search provider to `server/lib/search.ts`. When query matches `igdb:{id}` pattern, fetch game by IGDB ID via adapter and return as `GameSearchResult`. Follow existing provider pattern (e.g., `tmdb:`, `tvdb:`).
- [x] T034 [US2] Extend `server/routes/search.ts` to accept `mediaType` query parameter. When `mediaType=all` (default), search TMDB and IGDB in parallel using `Promise.allSettled`, merge results tagged with `mediaType`. When `mediaType=game`, search IGDB only. When `mediaType=movie` or `mediaType=tv`, search TMDB only (existing behavior).
- [x] T035 [US2] Implement availability/request status enrichment for game search results in `server/routes/search.ts`. For each game result, query `GameMedia` by `igdbId` to populate `mediaInfo` per platform (status, requestStatus, rommUrl). File: `server/routes/search.ts`.
- [x] T036 [US2] Create `server/routes/game.ts` with Express router. Implement `GET /:igdbId` -- fetch game details from IGDB adapter, query `GameMedia` rows for all platforms, include `mediaInfo` array with per-platform status and requests (including `gameMeta` from `GameRequestMeta`). Return 404 if IGDB game not found.
- [x] T037 [US2] Implement `GET /platforms` on game router (`server/routes/game.ts`). Return cached IGDB platform list from adapter. Used by frontend for platform filter dropdowns.

---

## Phase 6 -- Request Workflow [US3, US5]

Depends on Phase 2 (entities) and Phase 5 (game detail route for context). Core request creation and admin management.

### Request Creation [US3]

- [x] T038 [US3] Extend `server/routes/request.ts` POST handler to support `mediaType === 'game'`. When game request: validate `mediaId` (igdbId), `platformIgdbId`, `platformName` are present. Check `REQUEST` or `REQUEST_GAME` permission. Check game-specific quota if configured.
- [x] T039 [US3] Implement game request creation logic in `server/routes/request.ts`. Create or find `Media` row with `mediaType='game'` and `tmdbId=igdbId`. Create or find `GameMedia` row by `(igdbId, platformIgdbId)` -- populate metadata from IGDB if new. Create `MediaRequest` with `type='game'`, `is4k=false`. Create `GameRequestMeta` with platform and user note. Return response with `gameMeta` field.
- [x] T040 [US3] Implement duplicate detection for game requests in `server/routes/request.ts`. Before creating, query for existing `MediaRequest` + `GameRequestMeta` where `igdbId` matches and `platformIgdbId` matches and status is not DECLINED/COMPLETED. Return `409 Conflict` with existing request info if found.
- [x] T041 [US3] Implement auto-approval logic for game requests in `server/routes/request.ts`. If requesting user has `AUTO_APPROVE_GAME` permission, set request status to APPROVED immediately after creation. No download manager is contacted (game-specific: approval just sets status).

### Admin Approval [US5]

- [x] T042 [US5] Extend `server/routes/request.ts` PUT handler for game requests. When updating a game request: support `adminNote` field -- save to `GameRequestMeta.adminNote`. On approval, set status to APPROVED (no download manager call). On decline, trigger notification with `adminNote` as reason.
- [x] T043 [US5] Implement `POST /:requestId/available` endpoint in `server/routes/request.ts`. Permission: `MANAGE_REQUESTS` or `ADMIN`. Accept optional `rommUrl` body. Update `MediaRequest` status to COMPLETED. Update associated `GameMedia` status to AVAILABLE and set `rommUrl`. Send availability notification to requesting user.
- [x] T044 [US5] Extend request list endpoint (`GET /` in `server/routes/request.ts`) with `mediaType` query parameter filter. When `mediaType=game`, return only game requests. Include `gameMeta` field (from `GameRequestMeta`) on game request responses. Eager-load `GameRequestMeta` via join when `type === 'game'`.

### Notifications [US3, US5]

- [x] T045 [US3] [US5] Extend notification payloads for game requests. Add game-specific notification events: `Game Request Pending`, `Game Request Approved`, `Game Request Declined`, `Game Request Available`. Include `subject` as `"{title} ({platformAbbreviation})"`, `image` as cover URL, `extra` array with Platform and User Note. File: notification integration point (follow existing pattern for movie/TV notifications).

---

## Phase 7 -- Request Tracking [US4]

Depends on Phase 6 (requests must exist). Enhances user profile display.

- [x] T046 [US4] Ensure game requests appear in user profile request list. Verify the existing user request endpoint (`server/routes/user/index.ts`) includes game requests when querying `MediaRequest`. The `gameMeta` field must be present on game request items (eager-load `GameRequestMeta`). File: `server/routes/user/index.ts`.
- [x] T047 [US4] Ensure game request responses include human-readable status mapping. When `type === 'game'` and status is APPROVED, response should include a `statusLabel` or `statusDescription` field indicating "Approved (awaiting addition)". When COMPLETED, include `rommUrl` from `GameMedia`. File: `server/routes/request.ts`.

---

## Phase 8 -- ROMM Polling & Availability Detection [US6]

Depends on Phase 3 (ROMM adapter), Phase 4 (ROMM settings), Phase 6 (requests to match against).

- [x] T048 [US6] Create `server/lib/scanners/rommScanner.ts`. Implement `RommScanner` class. Main method `run()`: load all ROMM server instances from settings where `syncEnabled=true`. For each instance, fetch platforms (cache 1 hour), then fetch recent ROMs since `lastSyncTimestamp`.
- [x] T049 [US6] Implement matching algorithm in `server/lib/scanners/rommScanner.ts`. For each new ROM: (1) if `rom.igdb_id` present, query `GameMedia` by `(igdbId=rom.igdb_id, platformIgdbId=platform.igdb_id)`; (2) if `igdb_id` absent, normalize ROM name (strip region tags, file extensions), search `GameMedia` by normalized title + platform. Log fuzzy matches for admin review.
- [x] T050 [US6] Implement availability update logic in `server/lib/scanners/rommScanner.ts`. When a ROM matches a `GameMedia` row: set `GameMedia.status = AVAILABLE`, set `GameMedia.rommId`, construct and set `GameMedia.rommUrl` (`{protocol}://{hostname}:{port}{baseUrl}/rom/{rommId}`). Find all APPROVED `MediaRequest` rows for that `GameMedia`, update to COMPLETED. Send notification to each requesting user.
- [x] T051 [US6] Implement `lastSyncTimestamp` update in `server/lib/scanners/rommScanner.ts`. After processing all ROMs for a server instance, update `lastSyncTimestamp` in settings. On first run (no timestamp), perform full scan of all ROMs.
- [x] T052 [US6] Implement failure isolation in `server/lib/scanners/rommScanner.ts`. Wrap each server instance scan in try/catch. Log errors with label `'ROMM Scan'`. Never throw -- failed instance must not affect other instances or other media type jobs. Continue to next instance on failure.
- [x] T053 [US6] Register `romm-scan` job in the job scheduler. Use default schedule from settings (`0 */15 * * * *`). The job calls `RommScanner.run()`. Ensure the job is independent of existing Radarr/Sonarr/Plex scan jobs. File: job scheduler registration point (follow existing scan job pattern).

---

## Phase 9 -- Permissions & Quotas [US7]

Depends on Phase 1 (permission bits) and Phase 6 (request creation checks permission).

- [x] T054 [US7] Ensure `REQUEST_GAME` permission is checked in game request creation (T038). Users without `REQUEST` and without `REQUEST_GAME` must receive `403 Forbidden`. File: `server/routes/request.ts`.
- [x] T055 [US7] Implement game-specific request quota check. Add `gameQuota` field to user settings or global settings (follow pattern of existing movie/TV quotas). In game request creation, count active game requests for the user and compare against quota. Return `429 Too Many Requests` if exceeded. File: `server/routes/request.ts`, `server/lib/settings/index.ts`.
- [x] T056 [US7] Ensure `AUTO_APPROVE_GAME` permission integrates with auto-approval logic (T041). Default: off. Only users explicitly granted this permission get auto-approved game requests. File: `server/routes/request.ts`.

---

## Phase 10 -- Testing

Depends on all implementation phases.

### Unit Tests

- [x] T057 [P] Create `server/api/igdb/__tests__/igdb.test.ts`. Test: Twitch OAuth2 token exchange (success, failure, refresh on 401). Test: `searchGames` maps IGDB response to typed results correctly. Test: `getPlatforms` returns cached results. Test: rate limiting behavior. Mock axios/fetch.
- [x] T058 [P] Create `server/api/romm/__tests__/romm.test.ts`. Test: `testConnection` success and failure (network error, auth error). Test: `getPlatforms` response mapping. Test: `getRecentRoms` pagination and timestamp filtering. Test: auth header injection for both `apikey` and `basic` auth types. Mock axios/fetch.
- [x] T059 [P] Create `server/lib/scanners/__tests__/rommScanner.test.ts`. Test: matching algorithm with IGDB ID match. Test: matching algorithm with fuzzy title fallback. Test: availability update sets correct fields on `GameMedia` and `MediaRequest`. Test: failure isolation (one server fails, others continue). Test: `lastSyncTimestamp` update. Mock DB and ROMM adapter.
- [x] T060 [P] Create `server/models/__tests__/Game.test.ts`. Test: `mapIgdbToGameResult` correctly extracts developers, publishers, transforms cover URL, handles null fields.

### Integration Tests

- [x] T061 Create `server/routes/__tests__/game.test.ts`. Test: game search returns results with `mediaType: 'game'`. Test: game detail endpoint returns platforms and mediaInfo. Test: platform list endpoint returns cached IGDB platforms. Test: search with `mediaType=all` returns both TMDB and IGDB results.
- [x] T062 Create `server/routes/__tests__/gameRequest.test.ts`. Test: full game request lifecycle -- create request, verify duplicate detection (409), admin approve (PUT), mark available (POST /available). Test: permission checks (403 without REQUEST_GAME). Test: quota enforcement (429). Test: `gameMeta` appears in request list responses.
- [x] T063 Create `server/routes/settings/__tests__/igdb.test.ts`. Test: GET returns clientId but not clientSecret. Test: PUT saves credentials. Test: POST /test validates against Twitch API.
- [x] T064 Create `server/routes/settings/__tests__/romm.test.ts`. Test: CRUD operations for ROMM server instances. Test: POST /test calls ROMM heartbeat. Test: POST /sync triggers scanner. Test: sensitive fields stripped from GET responses.

### Regression

- [x] T065 Run existing test suite and verify zero failures. No existing movie, TV, or other media type tests should be affected by game additions. File: `npm test` / CI pipeline.

---

## Dependency Summary

```
Phase 1 (T001-T005) -- Setup & Constants
  |
  +---> Phase 2 (T006-T008) -- Entities
  |       |
  |       +---> Phase 3 (T009-T020) -- API Adapters
  |               |
  |               +---> Phase 4 (T021-T031) -- Settings Routes [US1]
  |               |       |
  |               |       +---> Phase 8 (T048-T053) -- ROMM Polling [US6]
  |               |
  |               +---> Phase 5 (T032-T037) -- Search [US2]
  |                       |
  |                       +---> Phase 6 (T038-T045) -- Requests [US3, US5]
  |                               |
  |                               +---> Phase 7 (T046-T047) -- Tracking [US4]
  |                               |
  |                               +---> Phase 8 (T048-T053) -- ROMM Polling [US6]
  |                               |
  |                               +---> Phase 9 (T054-T056) -- Permissions [US7]
  |
  +---> Phase 10 (T057-T065) -- Testing (after all implementation)
```

## Task-to-User-Story Matrix

| User Story | Tasks |
|---|---|
| US1 (ROMM config) | T021-T031 |
| US2 (game search) | T032-T037 |
| US3 (game request) | T038-T041, T045 |
| US4 (request tracking) | T046-T047 |
| US5 (admin approval) | T042-T045 |
| US6 (availability detection) | T048-T053 |
| US7 (permissions) | T054-T056 |

## Task-to-Requirement Matrix

| Requirement | Tasks |
|---|---|
| FR-001 (game search) | T011, T034 |
| FR-002 (platform filter) | T011, T034, T037 |
| FR-003 (search result display) | T032 |
| FR-004 (availability badge) | T035 |
| FR-005 (request status badge) | T035 |
| FR-006 (one-click request) | T038, T039 |
| FR-007 (platform selection) | T039 |
| FR-008 (user note) | T039 |
| FR-009 (manual download notice) | Frontend (out of scope) |
| FR-010 (duplicate detection) | T040 |
| FR-011 (notifications) | T045, T050 |
| FR-012 (profile display) | T046 |
| FR-013 (status labels) | T047 |
| FR-014 (approved explanation) | T047 |
| FR-015 (admin dashboard) | T044 |
| FR-016 (approve/decline) | T042, T043 |
| FR-017 (awaiting addition) | T042 |
| FR-018 (admin note) | T042 |
| FR-019 (decline notification) | T045 |
| FR-020 (media type filter) | T044 |
| FR-021 (ROMM config) | T024-T027 |
| FR-022 (ROMM test) | T028 |
| FR-023 (polling interval) | T004, T025 |
| FR-024 (manual sync) | T029 |
| FR-025 (auto availability) | T048-T050 |
| FR-026 (title+platform match) | T049 |
| FR-027 (ROMM link) | T050 |
| FR-028 (failure isolation) | T052 |
| FR-029 (manual available) | T043 |
| FR-030 (permissions) | T002, T054 |
| FR-031 (game quota) | T055 |
| FR-032 (auto-approval) | T041, T056 |
| FR-033 (no regression) | T065 |
| FR-034 (no auto download) | By design |
| FR-035 (IGDB credentials) | T021-T023 |
| FR-036 (15 min default) | T004, T053 |
