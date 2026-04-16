# Tasks: Music Request Foundation (Structure Only)

**Feature**: 004-music-stubs | **Generated**: 2026-04-16 | **Spec**: spec.md | **Plan**: plan.md

## Phase 1 — Setup

- [x] T001 [P] Create `NotImplementedError` custom error class with default message "Music support is not yet implemented. See Phase 3 spec." — `server/errors/NotImplementedError.ts`
- [x] T002 [P] Create `isMusicEnabled()` feature flag helper that reads `ENABLE_MUSIC` env var, defaults to `false` — `server/lib/featureflags.ts`

## Phase 2 — Foundation (Data Model & Interfaces)

- [x] T003 [US1] Add `MUSIC = 'music'` to the `MediaType` enum — `server/constants/media.ts`
- [x] T004 [US1] [P] Create `MusicRequest` entity with `AudioFormat` enum, all columns per data-model.md (id, status, artistName, albumTitle, releaseYear, musicbrainzId, requestedFormat, mediaType, requestedBy, createdAt, updatedAt) — `server/entity/MusicRequest.ts`
- [x] T005 [US1] [P] Create SQLite migration `AddMusicRequest` that creates `music_request` table with indexes on status, musicbrainzId, requestedById; `down()` drops table — `server/migration/sqlite/<timestamp>-AddMusicRequest.ts`
- [x] T006 [US1] [P] Create PostgreSQL migration `AddMusicRequest` matching SQLite migration — `server/migration/postgres/<timestamp>-AddMusicRequest.ts`
- [x] T007 [US2] [P] Create `MusicLibraryAdapter` interface with methods: `searchArtists()`, `searchAlbums()`, `checkAlbumAvailability()` — all fully typed, JSDoc on each method — `server/lib/adapters/music/MusicLibraryAdapter.ts`
- [x] T008 [US2] [P] Create `MusicDownloadAdapter` interface with methods: `submitAlbumRequest()`, `submitTrackRequest()` — all fully typed, JSDoc on each method — `server/lib/adapters/music/MusicDownloadAdapter.ts`
- [x] T009 [US2] Create barrel `index.ts` exporting both interfaces and all adapter stubs — `server/lib/adapters/music/index.ts`

## Phase 3 — Adapter Stubs [US3]

- [x] T010 [US3] [P] Create `LidarrAdapter` stub class implementing `MusicDownloadAdapter`; every method throws `NotImplementedError`; JSDoc on each method describing future behaviour — `server/lib/adapters/music/LidarrAdapter.ts`
- [x] T011 [US3] [P] Create `SubsonicAdapter` stub class implementing `MusicLibraryAdapter`; every method throws `NotImplementedError`; JSDoc on each method describing future behaviour — `server/lib/adapters/music/SubsonicAdapter.ts`

## Phase 4 — Routes & Integration [US4, US5]

- [x] T012 [US4] Create music stub route file with `notImplemented` handler returning 501 JSON `{"message": "Music support is not yet implemented."}` for: `GET /search`, `POST /request`, `GET /request`, `GET /request/:id` — `server/routes/music.ts`
- [x] T013 [US4] [US5] Modify route index to conditionally register music routes when `isMusicEnabled()` is true; log flag state at startup — `server/routes/index.ts`

## Phase 5 — Polish & Verification

- [x] T014 Verify TypeScript compilation passes with no errors for all new files (`npx tsc --noEmit`)
- [x] T015 Manual smoke test: start app without `ENABLE_MUSIC` — confirm no music routes registered (404 on `/api/v1/music/search`); set `ENABLE_MUSIC=true` — confirm 501 responses and startup log message
