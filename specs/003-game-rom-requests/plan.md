# Implementation Plan: Video Game ROM Requests

**Branch**: `003-game-rom-requests` | **Date**: 2026-04-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-game-rom-requests/spec.md`

## Summary

Add a video game ROM request workflow to Allseerr. Users search for
games via IGDB metadata, submit requests specifying a platform, and
admins approve them. There is no automated download step -- games are
added manually to ROMM by the admin. Allseerr polls ROMM to detect
when a ROM appears and automatically marks the request as available.

The implementation introduces two new TypeORM entities (`GameMedia`,
`GameRequestMeta`), two new API adapters (IGDB, ROMM), settings for
both services, a ROMM polling job, and extends the unified search to
include game results alongside movies and TV shows.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js (per `.nvmrc`)
**Primary Dependencies**: Next.js, TypeORM, Express, axios, node-cache
**Storage**: SQLite (default) / PostgreSQL (optional) via TypeORM
**Testing**: Co-located `__tests__/` with Jest
**Target Platform**: Linux server (Docker), macOS/Windows dev
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Game search results in < 3 seconds (SC-004); ROMM
  availability detection within one polling interval (SC-005)
**Constraints**: IGDB rate limit 4 req/s; no `any` types; no modification
  of existing entities or routes
**Scale/Scope**: ~15 new files, 2 new DB tables, 2 new API adapters,
  ~10 new API endpoints

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Never Break Existing Functionality | PASS | All changes are additive. No existing entities, routes, or services modified. Existing test suite must pass. |
| II. Provider/Adapter Pattern | PASS | IGDB adapter (`server/api/igdb/`) and ROMM adapter (`server/api/romm/`) both extend `ExternalAPI`. No direct external API calls outside adapters. |
| III. MediaType Enum Authority | PASS | `MediaType.GAME = 'game'` added to `server/constants/media.ts`. All game logic branches on this enum value. No hardcoded string comparisons. |
| IV. Explicit Over Implicit | PASS | All interfaces, adapter methods, and API responses are fully typed. No `any`. |
| V. Incremental Delivery | PASS | Phase 2 feature. Independent of Phase 1 (books/audiobooks). Phase 3 stubs (music) not touched. |

**Constitution-specific constraints verified**:

- Game ROM workflow matches constitution Section "Game ROM Workflow (Special Case)": User requests -> Admin approves -> Manual addition -> ROMM detects -> Available.
- Adapter interfaces follow `MediaLibraryAdapter` pattern from constitution (ROMM adapter implements `checkAvailability`, `triggerLibraryScan`, `testConnection`).
- No download manager adapter needed (games have no automated download).
- `MediaType.GAME` declared in enum per constitution Section III.
- File locations follow constitution conventions (`server/lib/adapters/`, `server/entity/`, etc.).

**Post-design re-check**: PASS. The `GameMedia` entity is a new table
(not a modification of `Media`). The `GameRequestMeta` companion entity
avoids modifying `MediaRequest`. The `Media` entity is used as a bridge
via convention (storing `igdbId` in the `tmdbId` column) without schema
changes.

## Project Structure

### Documentation (this feature)

```text
specs/003-game-rom-requests/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: IGDB API, ROMM API, matching strategy
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Developer quickstart
├── contracts/
│   └── game-api.md      # Phase 1: API contracts
└── tasks.md             # Phase 2: Task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── api/
│   ├── igdb/
│   │   ├── index.ts                 # IGDB adapter (extends ExternalAPI)
│   │   └── interfaces.ts            # IGDB response types
│   └── romm/
│       ├── index.ts                 # ROMM adapter (extends ExternalAPI)
│       └── interfaces.ts            # ROMM response types
├── constants/
│   └── media.ts                     # + MediaType.GAME (additive)
├── entity/
│   ├── GameMedia.ts                 # NEW: game metadata entity
│   └── GameRequestMeta.ts           # NEW: game request companion
├── lib/
│   ├── adapters/
│   │   └── game/
│   │       └── RommAdapter.ts       # MediaLibraryAdapter for ROMM
│   ├── cache.ts                     # + 'igdb', 'romm' cache IDs
│   ├── permissions.ts               # + REQUEST_GAME, AUTO_APPROVE_GAME
│   ├── scanners/
│   │   └── rommScanner.ts           # ROMM polling job logic
│   ├── search.ts                    # + igdb: search provider
│   └── settings/
│       ├── index.ts                 # + RommSettings, IgdbSettings, defaults
│       └── migrations/
│           └── 0009_add_game_settings.ts  # Settings migration
├── models/
│   └── Game.ts                      # Game search result mapping
└── routes/
    ├── game.ts                      # Game detail + platform routes
    ├── index.ts                     # + register game/romm/igdb routes
    ├── request.ts                   # + game request creation handling
    ├── search.ts                    # + mediaType param, IGDB parallel search
    └── settings/
        ├── igdb.ts                  # IGDB settings routes
        └── romm.ts                  # ROMM settings routes

src/
└── components/
    └── Settings/
        └── Games/                   # Game settings UI (IGDB + ROMM config)
```

**Structure Decision**: Follows the existing Seerr codebase layout
exactly. API adapters go in `server/api/<service>/`, entities in
`server/entity/`, routes in `server/routes/`, settings in
`server/lib/settings/`. No new top-level directories. The adapter
layer at `server/lib/adapters/game/` bridges the raw API client
(`server/api/romm/`) with the constitution's `MediaLibraryAdapter`
interface.

## Implementation Phases

### Phase 0: Foundation (No UI)

1. Add `MediaType.GAME` to enum
2. Add `REQUEST_GAME` and `AUTO_APPROVE_GAME` to permissions
3. Add `'igdb'` and `'romm'` cache IDs
4. Add `RommSettings` and `IgdbSettings` interfaces + defaults to settings
5. Create settings migration `0009_add_game_settings.ts`
6. Create `GameMedia` entity
7. Create `GameRequestMeta` entity

### Phase 1: API Adapters

8. Create IGDB adapter (`server/api/igdb/`) with:
   - Twitch OAuth2 token management (auto-refresh)
   - Game search (Apicalypse query builder)
   - Game details fetch
   - Platform list fetch
   - Rate limiting (4 req/s)
9. Create ROMM adapter (`server/api/romm/`) with:
   - Connection test (heartbeat)
   - Platform list
   - ROM list (paginated, sorted by created_at)
   - ROM details
10. Create ROMM library adapter (`server/lib/adapters/game/RommAdapter.ts`)
    implementing `MediaLibraryAdapter`

### Phase 2: Settings Routes

11. Create IGDB settings routes (`server/routes/settings/igdb.ts`):
    - GET/PUT credentials, POST test connection
12. Create ROMM settings routes (`server/routes/settings/romm.ts`):
    - CRUD servers, POST test connection, POST manual sync
13. Register routes in `server/routes/index.ts`

### Phase 3: Search Integration

14. Add `igdb:` search provider to `server/lib/search.ts`
15. Create game search result mapping (`server/models/Game.ts`)
16. Extend search route with `mediaType` parameter
17. Implement parallel TMDB + IGDB search for `mediaType=all`
18. Create game detail route (`server/routes/game.ts`)

### Phase 4: Request Workflow

19. Extend request creation to handle `mediaType === 'game'`:
    - Create `Media` row with `mediaType='game'`, `tmdbId=igdbId`
    - Create `GameMedia` row if not exists
    - Create `MediaRequest` row with `type='game'`
    - Create `GameRequestMeta` row with platform and notes
    - Duplicate detection by `(igdbId, platformIgdbId)`
    - Permission and quota checks for `REQUEST_GAME`
20. Add game-specific approval behavior (no download manager)
21. Add manual "mark as available" endpoint
22. Extend request list with `mediaType` filter and `gameMeta` field
23. Extend notification payloads for game requests

### Phase 5: ROMM Polling

24. Create ROMM scanner (`server/lib/scanners/rommScanner.ts`)
25. Register `romm-scan` job with default 15-minute schedule
26. Implement matching algorithm (IGDB ID + platform primary, fuzzy fallback)
27. Implement availability updates (GameMedia status, request status, notifications)

### Phase 6: Testing and Polish

28. Unit tests for IGDB adapter (token refresh, search mapping)
29. Unit tests for ROMM adapter (connection test, ROM listing)
30. Unit tests for ROMM scanner (matching, availability updates)
31. Integration tests for game request lifecycle
32. Integration tests for search with game results
33. Manual end-to-end testing per quickstart checklist

## Dependency Graph

```
Phase 0 (Foundation)
  |
  +---> Phase 1 (API Adapters)
  |       |
  |       +---> Phase 2 (Settings Routes)
  |       |       |
  |       |       +---> Phase 5 (ROMM Polling)
  |       |
  |       +---> Phase 3 (Search Integration)
  |
  +---> Phase 4 (Request Workflow)
          |
          +---> Phase 5 (ROMM Polling)
                  |
                  +---> Phase 6 (Testing)
```

## Requirement Traceability

| Requirement | Implementation Phase | Key Files |
|---|---|---|
| FR-001 (game search) | Phase 3 | `search.ts`, `igdb/index.ts` |
| FR-002 (platform filter) | Phase 3 | `search.ts`, `game.ts` |
| FR-003 (search result display) | Phase 3 | `models/Game.ts` |
| FR-004 (availability badge) | Phase 3 | `search.ts`, `GameMedia.ts` |
| FR-005 (request status badge) | Phase 3, 4 | `search.ts`, `request.ts` |
| FR-006 (one-click request) | Phase 4 | `request.ts` |
| FR-007 (platform selection) | Phase 4 | `request.ts`, `GameRequestMeta.ts` |
| FR-008 (user note) | Phase 4 | `GameRequestMeta.ts` |
| FR-009 (manual download notice) | Phase 4 | Frontend (out of scope for backend plan) |
| FR-010 (duplicate detection) | Phase 4 | `request.ts` |
| FR-011 (notifications) | Phase 4, 5 | `request.ts`, `rommScanner.ts` |
| FR-012 (profile display) | Phase 4 | `request.ts` |
| FR-013 (status labels) | Phase 4 | Frontend mapping |
| FR-014 (approved explanation) | Phase 4 | Frontend |
| FR-015 (admin dashboard) | Phase 4 | `request.ts` |
| FR-016 (approve/decline/unavailable) | Phase 4 | `request.ts` |
| FR-017 (approved awaiting addition) | Phase 4 | `request.ts` |
| FR-018 (admin note) | Phase 4 | `GameRequestMeta.ts` |
| FR-019 (decline notification) | Phase 4 | `request.ts` |
| FR-020 (media type filter) | Phase 4 | `request.ts` |
| FR-021 (ROMM config) | Phase 2 | `settings/romm.ts` |
| FR-022 (ROMM test) | Phase 2 | `settings/romm.ts`, `romm/index.ts` |
| FR-023 (polling interval) | Phase 2, 5 | `settings/romm.ts`, `rommScanner.ts` |
| FR-024 (manual sync) | Phase 2, 5 | `settings/romm.ts`, `rommScanner.ts` |
| FR-025 (auto availability) | Phase 5 | `rommScanner.ts` |
| FR-026 (title+platform match) | Phase 5 | `rommScanner.ts` |
| FR-027 (ROMM link) | Phase 5 | `GameMedia.ts`, `rommScanner.ts` |
| FR-028 (failure isolation) | Phase 5 | `rommScanner.ts` |
| FR-029 (manual available) | Phase 4 | `request.ts` |
| FR-030 (permissions) | Phase 0, 4 | `permissions.ts`, `request.ts` |
| FR-031 (game quota) | Phase 4 | `request.ts`, `settings/index.ts` |
| FR-032 (auto-approval) | Phase 4 | `request.ts`, `permissions.ts` |
| FR-033 (no regression) | Phase 6 | Existing test suite |
| FR-034 (no auto download) | Phase 4 | By design -- no download manager integration |
| FR-035 (IGDB credentials) | Phase 2 | `settings/igdb.ts` |
| FR-036 (15 min default) | Phase 0, 5 | `settings/index.ts`, `rommScanner.ts` |

## Complexity Tracking

No constitution violations. All changes are additive. No existing
entities, routes, or services are modified.

| Concern | Mitigation |
|---|---|
| `Media.tmdbId` reused for `igdbId` | Convention-based (not a schema change). Documented in data-model.md. The column name is misleading but avoids modifying the existing entity. |
| 32-bit permission space nearly exhausted | `REQUEST_GAME` uses bit 29, `AUTO_APPROVE_GAME` uses bit 31. If Phase 3 (music) needs more bits, a BigInt migration will be needed. Flagged for future planning. |
| IGDB Apicalypse query language | Encapsulated entirely within the IGDB adapter. No Apicalypse syntax leaks outside `server/api/igdb/`. |
