# Data Model: MusicRequest Entity

**Date**: 2026-04-16 | **Feature**: 004-music-stubs

## MediaType Enum Addition

**File**: `server/constants/media.ts`

```typescript
export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  MUSIC = 'music',   // NEW — Phase 3
}
```

No other enum changes. `MediaRequestStatus` and `MediaStatus` are reused as-is.

## MusicRequest Entity

**File**: `server/entity/MusicRequest.ts`

### Schema

| Column | TypeORM Type | SQL Type | Nullable | Indexed | Description |
|--------|-------------|----------|----------|---------|-------------|
| `id` | `@PrimaryGeneratedColumn()` | `INTEGER` / `SERIAL` | No | PK | Auto-increment primary key |
| `status` | `@Column({ type: 'integer' })` | `INTEGER` | No | Yes | `MediaRequestStatus` enum value |
| `artistName` | `@Column({ type: 'varchar' })` | `VARCHAR` | No | No | Artist or band name |
| `albumTitle` | `@Column({ type: 'varchar' })` | `VARCHAR` | No | No | Album title |
| `releaseYear` | `@Column({ type: 'integer', nullable: true })` | `INTEGER` | Yes | No | Year of release (nullable for unknown) |
| `musicbrainzId` | `@Column({ type: 'varchar', nullable: true })` | `VARCHAR` | Yes | Yes | MusicBrainz release UUID |
| `requestedFormat` | `@Column({ type: 'varchar', nullable: true })` | `VARCHAR` | Yes | No | Requested audio format (see enum below) |
| `mediaType` | `@Column({ type: 'varchar', default: "'music'" })` | `VARCHAR` | No | No | Always `MediaType.MUSIC` |
| `requestedBy` | `@ManyToOne(() => User)` | FK `INTEGER` | No | Yes | User who created the request |
| `createdAt` | `@DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })` | `DATETIME` / `TIMESTAMP` | No | No | Creation timestamp |
| `updatedAt` | `@UpdateDateColumn()` | `DATETIME` / `TIMESTAMP` | No | No | Last update timestamp |

### AudioFormat Enum

**Defined in**: `server/entity/MusicRequest.ts` (co-located, not exported globally)

```typescript
export enum AudioFormat {
  MP3 = 'mp3',
  FLAC = 'flac',
  AAC = 'aac',
  OGG = 'ogg',
  OPUS = 'opus',
  ANY = 'any',
}
```

This is a simple string enum for the `requestedFormat` column. The exact values may be revised in the full music implementation phase (per spec assumptions). `ANY` is the default when the user has no format preference.

### Entity Class

```typescript
import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { User } from '@server/entity/User';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AudioFormat {
  MP3 = 'mp3',
  FLAC = 'flac',
  AAC = 'aac',
  OGG = 'ogg',
  OPUS = 'opus',
  ANY = 'any',
}

@Entity()
export class MusicRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'integer' })
  @Index()
  public status: MediaRequestStatus;

  @Column({ type: 'varchar' })
  public artistName: string;

  @Column({ type: 'varchar' })
  public albumTitle: string;

  @Column({ type: 'integer', nullable: true })
  public releaseYear: number | null;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  public musicbrainzId: string | null;

  @Column({ type: 'varchar', nullable: true })
  public requestedFormat: AudioFormat | null;

  @Column({ type: 'varchar', default: MediaType.MUSIC })
  public mediaType: MediaType;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  @Index()
  public requestedBy: User;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  constructor(init?: Partial<MusicRequest>) {
    Object.assign(this, init);
  }
}

export default MusicRequest;
```

### Design Decisions

1. **Separate entity, not reusing `MediaRequest`**: The existing `MediaRequest` is tightly coupled to TMDB IDs, seasons, 4K flags, Radarr/Sonarr server IDs, and movie/TV-specific logic. Music requests have fundamentally different fields (artist, album, MusicBrainz ID, audio format). A separate entity avoids polluting the existing entity with nullable music fields and keeps the migration purely additive.

2. **No relation to `Media` entity**: The `Media` entity is built around TMDB IDs and movie/TV media types. Music has no TMDB representation. Linking `MusicRequest` to `Media` would require modifying `Media`, which violates FR-020. A future phase may introduce a `MusicMedia` entity if needed.

3. **`requestedBy` relation**: Uses `@ManyToOne` to `User`, matching the pattern in `MediaRequest`. The `eager: true` and `onDelete: 'CASCADE'` settings match existing conventions.

4. **No `modifiedBy` field yet**: The spec only requires standard request fields. Approval/modification workflows are out of scope for stubs. The field can be added in the full implementation phase.

## Migration

Two migration files are needed (SQLite and PostgreSQL), following existing conventions.

**Naming**: `<timestamp>-AddMusicRequest.ts`

The migration:
- Creates the `music_request` table with all columns listed above
- Creates indexes on `status`, `musicbrainzId`, and `requestedById` (the FK column)
- Does NOT alter any existing table
- The `down()` method drops the `music_request` table

The `User` foreign key references `user.id` (matching existing FK patterns in the codebase).
