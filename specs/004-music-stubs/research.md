# Research: Music Request Foundation (Structure Only)

**Date**: 2026-04-16 | **Feature**: 004-music-stubs

## 1. Feature Flag Pattern

### How the codebase handles environment-based configuration

The existing codebase reads environment variables directly via `process.env` in several places:

- `server/datasource.ts` uses `process.env.DB_TYPE`, `process.env.NODE_ENV`, etc.
- `server/lib/settings/index.ts` reads config from disk but does not use env-based feature flags today.

### Recommended approach

Create a minimal `server/lib/featureflags.ts` module:

```typescript
export function isMusicEnabled(): boolean {
  return process.env.ENABLE_MUSIC?.toLowerCase() === 'true';
}
```

This is checked:
1. At route registration time in `server/routes/index.ts` -- if `false`, the `/music` routes are never mounted, so requests get a natural 404.
2. At adapter registration time -- if `false`, Lidarr/Subsonic stubs are never instantiated.
3. At startup -- the flag state is logged once.

No runtime toggling is needed. The flag is read at startup. Restarting the application is required to change the flag value. This matches how other environment-based config (like `DB_TYPE`) works in the codebase.

### Why not put it in Settings?

The settings singleton (`server/lib/settings/index.ts`) persists to disk and is exposed via the settings API. The spec explicitly states "no music settings appear" (FR-016), so the flag must not live in the settings object. An environment variable is the correct home.

## 2. TypeORM Migration for a Stub Entity

### How migrations work in this codebase

- SQLite migrations live in `server/migration/sqlite/`
- PostgreSQL migrations live in `server/migration/postgres/`
- Both use TypeORM's `MigrationInterface` with `up()` and `down()` methods
- Naming convention: `<timestamp>-<DescriptiveName>.ts`
- SQLite dev mode has `synchronize: true` so the entity auto-creates the table, but a migration is still needed for production and PostgreSQL
- The entity glob in `datasource.ts` is `server/entity/**/*.ts`, so any `.ts` file in that directory is auto-discovered

### Migration strategy

The migration creates a `music_request` table with columns matching the `MusicRequest` entity. It is purely additive -- no `ALTER TABLE` on existing tables, no foreign key changes to existing entities. The `down()` method drops the table.

Key consideration: the `MusicRequest` entity exists in `server/entity/` and will be picked up by TypeORM entity scanning regardless of the feature flag. This is fine because:
- The table is created by migration (not by synchronize in production)
- No code queries this table unless the feature flag is enabled
- The entity class itself has no side effects on import

### Column types

The entity uses standard TypeORM decorators matching existing patterns:
- `@PrimaryGeneratedColumn()` for `id`
- `@Column({ type: 'varchar' })` for string fields
- `@Column({ type: 'integer', nullable: true })` for optional numeric fields
- `@DbAwareColumn({ type: 'datetime' })` for timestamps (using the existing cross-DB helper)
- `@Index()` on `status` and `musicbrainzId` for future query performance

## 3. Error Class Pattern

### NotImplementedError

The codebase already defines custom error classes inline (see `RequestPermissionError`, `QuotaRestrictedError`, etc. in `server/entity/MediaRequest.ts`). For the music stubs, a shared `NotImplementedError` in `server/errors/NotImplementedError.ts` is cleaner since it is used across multiple files.

```typescript
export class NotImplementedError extends Error {
  constructor(message = 'Music support is not yet implemented. See Phase 3 spec.') {
    super(message);
    this.name = 'NotImplementedError';
  }
}
```

## 4. Adapter Interface Placement

### No existing adapter directory

The codebase does not yet have a `server/lib/adapters/` directory (confirmed via glob). This phase creates it with the `music/` subdirectory. The interfaces (`MusicLibraryAdapter`, `MusicDownloadAdapter`) and stubs (`LidarrAdapter`, `SubsonicAdapter`) all live here with a barrel `index.ts`.

The constitution specifies the convention `server/lib/adapters/<mediaType>/<ServiceName>Adapter.ts`, which this plan follows exactly.

## 5. Route Registration Pattern

### How routes are mounted

In `server/routes/index.ts`, routes are mounted with:
```typescript
router.use('/movie', isAuthenticated(), movieRoutes);
```

For music, this becomes conditional:
```typescript
if (isMusicEnabled()) {
  router.use('/music', isAuthenticated(), musicRoutes);
  logger.info('Music feature flag is enabled — stub routes registered', { label: 'Music' });
} else {
  logger.info('Music feature flag is disabled — no music routes registered', { label: 'Music' });
}
```

When disabled, the routes are simply never mounted, producing a natural 404 for any `/api/v1/music/*` request. This is the simplest approach and matches FR-014 and FR-016.
