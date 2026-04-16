# Data Model: Video Game ROM Requests

**Feature Branch**: `003-game-rom-requests` | **Date**: 2026-04-16

## Entity Relationship Overview

```
GameMedia (1) ----< (N) MediaRequest
    |                       |
    | igdbId + platformId   | requestedBy
    |                       |
    v                       v
  [IGDB]                  User

RommServerInstance ------> settings.json (romm[] array)
IgdbCredentials ---------> settings.json (igdb object)
```

---

## 1. GameMedia Entity

**File**: `server/entity/GameMedia.ts`

This is a NEW entity (does not modify the existing `Media` entity).
It tracks game metadata and availability, analogous to how `Media`
tracks movie/TV metadata.

```typescript
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import { MediaStatus } from '@server/constants/media';

@Entity()
@Index(['igdbId', 'platformIgdbId'], { unique: true })
class GameMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'int' })
  @Index()
  public igdbId: number;

  @Column({ type: 'int' })
  @Index()
  public platformIgdbId: number;

  @Column({ type: 'varchar' })
  public platformName: string;

  @Column({ type: 'varchar', nullable: true })
  public platformAbbreviation: string | null;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl: string | null;

  @Column({ type: 'int', nullable: true })
  public firstReleaseDate: number | null;  // Unix timestamp

  @Column({ type: 'varchar', nullable: true })
  public developer: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher: string | null;

  @Column({ type: 'varchar', nullable: true })
  public genres: string | null;  // Comma-separated

  @Column({ type: 'real', nullable: true })
  public rating: number | null;  // 0-100

  @Column({ type: 'text', nullable: true })
  public summary: string | null;

  @Column({ type: 'varchar', nullable: true })
  public slug: string | null;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  @Index()
  public status: MediaStatus;

  @Column({ type: 'int', nullable: true })
  public rommId: number | null;  // ROMM's internal ROM ID

  @Column({ type: 'varchar', nullable: true })
  public rommUrl: string | null;  // Direct link to ROMM entry

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  constructor(init?: Partial<GameMedia>) {
    Object.assign(this, init);
  }
}

export default GameMedia;
```

### Column Rationale

| Column | Type | Why |
|---|---|---|
| `igdbId` | int | IGDB game ID -- primary external key for metadata lookups |
| `platformIgdbId` | int | IGDB platform ID -- combined with `igdbId` forms the unique request key |
| `platformName` | varchar | Human-readable platform name for display (denormalized from IGDB) |
| `platformAbbreviation` | varchar, nullable | Short platform label (e.g., "SNES", "PS2") for badges |
| `title` | varchar | Game title from IGDB |
| `coverUrl` | varchar, nullable | IGDB cover art URL (full-size) |
| `firstReleaseDate` | int, nullable | Unix timestamp; some games lack release dates |
| `developer` | varchar, nullable | Primary developer name |
| `publisher` | varchar, nullable | Primary publisher name |
| `genres` | varchar, nullable | Comma-separated genre list (stored as string for simplicity) |
| `rating` | real, nullable | IGDB total_rating (0-100 scale) |
| `summary` | text, nullable | Game description from IGDB |
| `slug` | varchar, nullable | URL-safe identifier from IGDB |
| `status` | int | Reuses existing `MediaStatus` enum (UNKNOWN, PENDING, AVAILABLE, etc.) |
| `rommId` | int, nullable | ROMM's internal ID for this ROM (set when matched) |
| `rommUrl` | varchar, nullable | Direct URL to the ROMM entry (set when available) |

### Indexes

- `(igdbId, platformIgdbId)` -- unique composite, prevents duplicate game/platform entries
- `igdbId` -- fast lookup when matching ROMM ROMs by IGDB ID
- `platformIgdbId` -- fast platform-filtered queries
- `status` -- fast status-based filtering (e.g., "show all available games")

---

## 2. MediaRequest Extensions

**File**: `server/entity/MediaRequest.ts` -- NOT MODIFIED

Per the constitution, existing entities must not be modified. Instead,
the game request workflow uses the existing `MediaRequest` entity as-is,
with these conventions:

| MediaRequest Field | Game Usage |
|---|---|
| `type` | `MediaType.GAME` |
| `status` | Standard `MediaRequestStatus` enum (PENDING, APPROVED, DECLINED, COMPLETED) |
| `media` | Points to a `Media` row (see Section 2a below) |
| `is4k` | Always `false` for games (no 4K concept) |
| `serverId` | Not used for games (no download manager) |
| `profileId` | Not used for games |
| `rootFolder` | Not used for games |
| `seasons` | Empty array for games |

### 2a. Bridging GameMedia to MediaRequest via Media

The existing `MediaRequest.media` relation points to `Media`, which uses
`tmdbId` as its external key. For games, we repurpose the `Media` entity
as a thin bridge:

- `Media.mediaType` = `MediaType.GAME`
- `Media.tmdbId` = `igdbId` (repurposed; the column name is legacy but
  the semantics are "external metadata ID")
- `Media.status` = tracks availability status

This avoids modifying the `Media` entity schema while allowing game
requests to flow through the existing `MediaRequest -> Media` relation.
The `GameMedia` entity holds the rich game-specific metadata separately
and is linked by the `(igdbId, platformIgdbId)` key.

**Lookup flow**:
```
MediaRequest -> Media (tmdbId=igdbId, mediaType='game')
                   |
                   +-- GameMedia (igdbId=Media.tmdbId, platformIgdbId=<from request context>)
```

### 2b. GameRequestMeta Entity (NEW)

To store game-specific request data (platform, notes) without modifying
`MediaRequest`, a small companion entity is introduced.

**File**: `server/entity/GameRequestMeta.ts`

```typescript
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';

@Entity()
class GameRequestMeta {
  @PrimaryGeneratedColumn()
  public id: number;

  @OneToOne(() => MediaRequest, { onDelete: 'CASCADE' })
  @JoinColumn()
  @Index()
  public request: MediaRequest;

  @Column({ type: 'int' })
  public platformIgdbId: number;

  @Column({ type: 'varchar' })
  public platformName: string;

  @Column({ type: 'text', nullable: true })
  public userNote: string | null;

  @Column({ type: 'text', nullable: true })
  public adminNote: string | null;

  constructor(init?: Partial<GameRequestMeta>) {
    Object.assign(this, init);
  }
}

export default GameRequestMeta;
```

### Column Rationale

| Column | Type | Why |
|---|---|---|
| `request` | OneToOne -> MediaRequest | Links game-specific data to the base request |
| `platformIgdbId` | int | Requested platform (IGDB platform ID) -- needed for matching |
| `platformName` | varchar | Display name (denormalized for convenience) |
| `userNote` | text, nullable | Optional user note (FR-008: "PAL region", "No-Intro verified") |
| `adminNote` | text, nullable | Optional admin note (FR-018: "Will add next weekend") |

---

## 3. RommServerInstance (Settings)

**Storage**: `settings.json` (not a TypeORM entity)

Follows the same pattern as `RadarrSettings[]` and `SonarrSettings[]`
-- an array of server configurations stored in the settings singleton.

```typescript
// In server/lib/settings/index.ts (NEW interface, added to AllSettings)

export interface RommSettings {
  id: number;
  name: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  authType: 'apikey' | 'basic';
  username?: string;
  password?: string;
  isDefault: boolean;
  pollIntervalMinutes: number;  // Default: 15
  lastSyncTimestamp: string | null;  // ISO 8601
  syncEnabled: boolean;
}
```

**Added to `AllSettings`**:
```typescript
export interface AllSettings {
  // ... existing fields ...
  romm: RommSettings[];
}
```

**Added to `JobId` type**:
```typescript
export type JobId =
  | // ... existing job IDs ...
  | 'romm-scan';
```

**Default job schedule**:
```typescript
'romm-scan': {
  schedule: '0 */15 * * * *',  // Every 15 minutes
}
```

### Field Descriptions

| Field | Type | Description |
|---|---|---|
| `id` | number | Auto-incrementing ID (assigned on save, like Radarr/Sonarr) |
| `name` | string | User-friendly label (e.g., "Main ROMM Server") |
| `hostname` | string | ROMM server hostname or IP |
| `port` | number | ROMM server port (default: 80 or 443) |
| `apiKey` | string | ROMM API key (stored in settings.json; encrypted at rest is out of scope for Phase 2 -- follows existing Radarr/Sonarr pattern) |
| `useSsl` | boolean | Whether to use HTTPS |
| `baseUrl` | string, optional | Base URL path (e.g., `/romm`) |
| `authType` | `'apikey' \| 'basic'` | Authentication method |
| `username` | string, optional | Username for basic auth |
| `password` | string, optional | Password for basic auth |
| `isDefault` | boolean | Whether this is the default ROMM instance |
| `pollIntervalMinutes` | number | Polling interval (default: 15, FR-036) |
| `lastSyncTimestamp` | string, nullable | ISO 8601 timestamp of last successful sync |
| `syncEnabled` | boolean | Whether automatic polling is enabled |

---

## 4. IgdbCredentials (Settings)

**Storage**: `settings.json` (not a TypeORM entity)

```typescript
// In server/lib/settings/index.ts (NEW interface, added to AllSettings)

export interface IgdbSettings {
  clientId: string;
  clientSecret: string;
}
```

**Added to `AllSettings`**:
```typescript
export interface AllSettings {
  // ... existing fields ...
  igdb: IgdbSettings;
}
```

**Defaults**:
```typescript
igdb: {
  clientId: '',
  clientSecret: '',
}
```

The access token is NOT stored in settings. It is held in memory by
the IGDB adapter and refreshed as needed (see research.md Section 1).

---

## 5. Cache Entries

**File**: `server/lib/cache.ts`

New cache IDs to add to `AvailableCacheIds`:

```typescript
export type AvailableCacheIds =
  | // ... existing IDs ...
  | 'igdb'
  | 'romm';
```

New cache instances in `CacheManager`:

```typescript
igdb: new Cache('igdb', 'IGDB API', {
  stdTtl: 21600,       // 6 hours (same as TMDB)
  checkPeriod: 60 * 30,
}),
romm: new Cache('romm', 'ROMM API', {
  stdTtl: 300,          // 5 minutes
  checkPeriod: 60,
}),
```

---

## 6. Permission Extensions

**File**: `server/lib/permissions.ts`

New permission flags (additive, next available bit positions):

```typescript
export enum Permission {
  // ... existing permissions ...
  REQUEST_GAME = 536870912,         // 2^29
  AUTO_APPROVE_GAME = 2147483648,   // 2^31 (max safe 32-bit)
}
```

Note: The existing permission system uses 32-bit bitwise flags.
`2^29 = 536870912` and `2^31 = 2147483648` are the next available
positions after the existing `VIEW_BLOCKLIST = 1073741824 (2^30)`.

If more permission bits are needed in the future, the system will
need to migrate to BigInt permissions (out of scope for Phase 2).

---

## 7. MediaType Enum Extension

**File**: `server/constants/media.ts`

```typescript
export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  GAME = 'game',
}
```

Per the constitution, `BOOK`, `AUDIOBOOK`, and `MUSIC` will also be
added in their respective phases. This plan only adds `GAME`.

---

## 8. Migration Notes

### TypeORM Migrations

Two new entities require table creation:

1. `game_media` table (from `GameMedia` entity)
2. `game_request_meta` table (from `GameRequestMeta` entity)

These are additive migrations only -- no existing tables are modified.

### Settings Migration

A settings migration should add default values for `romm` and `igdb`
when upgrading from a version that lacks them:

**File**: `server/lib/settings/migrations/0009_add_game_settings.ts`

```typescript
// Adds romm: [] and igdb: { clientId: '', clientSecret: '' }
// to settings.json if missing
```

This follows the existing migration pattern in
`server/lib/settings/migrations/`.
