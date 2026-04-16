# Implementation Plan: Music Request Foundation (Structure Only)

**Branch**: `004-music-stubs` | **Date**: 2026-04-16 | **Spec**: spec.md

## Summary

Add the structural foundation for future music request support: a `MediaType.MUSIC` enum value, a `MusicRequest` TypeORM entity with migration, typed adapter interfaces for music library and download services, Lidarr and Subsonic stub adapters that throw `NotImplementedError`, API routes that return HTTP 501, and an `ENABLE_MUSIC` feature flag that defaults to `false`. No working functionality, no external service contact, no UI changes. All music code paths are inert unless the flag is explicitly enabled, and even then every endpoint returns 501.

## Technical Context

**Language/Version**: TypeScript 5.x on Node.js (Next.js custom server)
**Primary Dependencies**: Express (routing), TypeORM (entities/migrations), Next.js (framework)
**Storage**: SQLite (default) / PostgreSQL (optional) via TypeORM
**Testing**: Jest (existing test setup; `server/routes/request.test.ts` pattern)
**Target Platform**: Linux server (Docker), development on any OS
**Project Type**: Web service (Next.js + Express API)
**Performance Goals**: Zero measurable startup impact (<100ms per SC-006)
**Constraints**: Feature flag off = zero observable music behaviour (FR-016)
**Scale/Scope**: ~10 new files, 0 modified existing files beyond `server/constants/media.ts` and `server/routes/index.ts`

## Constitution Check

| Gate | Status | Notes |
|------|--------|-------|
| Music = stubs only, no business logic | PASS | Every method throws `NotImplementedError` |
| `MediaType.MUSIC` in enum | PASS | Added to `server/constants/media.ts` |
| No `any` types | PASS | All interfaces fully typed |
| No music UI, settings, or service integration | PASS | No frontend files, no settings schema changes, no HTTP calls to external services |
| No modification to existing media workflows | PASS | Existing `MediaRequest` entity untouched; new `MusicRequest` is a separate entity |
| Adapter convention: `server/lib/adapters/<mediaType>/` | PASS | `server/lib/adapters/music/` directory |

## Project Structure

### Documentation (this feature)

```text
specs/004-music-stubs/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Feature flag patterns, migration approach
├── data-model.md        # MusicRequest entity definition
├── quickstart.md        # How to test the stubs
├── contracts/
│   └── music-api.md     # Stub API route contracts (all 501)
└── tasks.md             # (generated separately by /speckit.tasks)
```

### Source Code (repository root)

```text
server/
├── constants/
│   └── media.ts                          # MODIFIED: add MediaType.MUSIC
├── entity/
│   └── MusicRequest.ts                   # NEW: music request entity
├── lib/
│   ├── adapters/
│   │   └── music/
│   │       ├── index.ts                  # NEW: barrel exports
│   │       ├── MusicLibraryAdapter.ts    # NEW: interface
│   │       ├── MusicDownloadAdapter.ts   # NEW: interface
│   │       ├── LidarrAdapter.ts          # NEW: stub (throws NotImplementedError)
│   │       └── SubsonicAdapter.ts        # NEW: stub (throws NotImplementedError)
│   └── featureflags.ts                   # NEW: ENABLE_MUSIC flag helper
├── migration/
│   ├── sqlite/
│   │   └── <timestamp>-AddMusicRequest.ts   # NEW: SQLite migration
│   └── postgres/
│       └── <timestamp>-AddMusicRequest.ts   # NEW: PostgreSQL migration
├── routes/
│   ├── index.ts                          # MODIFIED: conditional music route registration
│   └── music.ts                          # NEW: stub routes returning 501
└── errors/
    └── NotImplementedError.ts            # NEW: custom error class
```

**Structure Decision**: Follows existing Allseerr conventions exactly. Entity in `server/entity/`, routes in `server/routes/`, adapters in `server/lib/adapters/music/`. The only new pattern is `server/lib/featureflags.ts` for centralised flag access and `server/errors/NotImplementedError.ts` for the shared error class. Both are minimal single-purpose files.

## Complexity Tracking

No constitution violations. This is the simplest possible implementation:

- No new dependencies
- No new design patterns (adapters already exist conceptually in the codebase)
- No changes to existing entities or migrations
- Every new method body is a single `throw` statement
- Feature flag is a single `process.env` read with a boolean default
