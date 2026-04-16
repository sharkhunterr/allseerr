# Data Model: Books and Audiobooks Requests

**Date**: 2026-04-16 | **Spec**: spec.md | **Plan**: plan.md

## Overview

Four new entities are introduced. `BookMedia` and `AudiobookMedia` track metadata and availability for individual items. `DownloadManagerInstance` and `LibraryServerInstance` persist admin-configured service connections. The existing `MediaRequest` entity is reused via the new `MediaType.BOOK` and `MediaType.AUDIOBOOK` enum values.

No existing entities are modified. New entities get their own database tables.

## Entity: BookMedia

**File**: `server/entity/BookMedia.ts`
**Table**: `book_media`

Represents a book known to the system (discovered via OpenLibrary search or library server scan).

```typescript
import { MediaRequestStatus, MediaStatus, MediaType } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';

@Entity()
@Index(['foreignBookId'], { unique: true })
class BookMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  /** OpenLibrary work key, e.g., "/works/OL12345W" */
  @Column({ type: 'varchar' })
  @Index()
  public foreignBookId: string;

  /** OpenLibrary author key, e.g., "/authors/OL1234A" */
  @Column({ type: 'varchar', nullable: true })
  @Index()
  public foreignAuthorId: string | null;

  @Column({ type: 'varchar' })
  public title: string;

  /** Comma-separated author names */
  @Column({ type: 'varchar' })
  public authorName: string;

  @Column({ type: 'varchar', nullable: true })
  public isbn13: string | null;

  @Column({ type: 'varchar', nullable: true })
  public isbn10: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher: string | null;

  @Column({ type: 'int', nullable: true })
  public firstPublishYear: number | null;

  /** OpenLibrary cover ID */
  @Column({ type: 'int', nullable: true })
  public coverId: number | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl: string | null;

  @Column({ type: 'int', nullable: true })
  public pageCount: number | null;

  /** Physical format: "Paperback", "Hardcover", "Ebook", etc. */
  @Column({ type: 'varchar', nullable: true })
  public format: string | null;

  /** Series name if part of a series */
  @Column({ type: 'varchar', nullable: true })
  public seriesName: string | null;

  /** Position within series (e.g., "1", "2.5") */
  @Column({ type: 'varchar', nullable: true })
  public seriesPosition: string | null;

  /** Description/summary from OpenLibrary */
  @Column({ type: 'text', nullable: true })
  public description: string | null;

  @Column({ type: 'varchar', nullable: true })
  public language: string | null;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  @Index()
  public status: MediaStatus;

  /** Edition count from OpenLibrary */
  @Column({ type: 'int', default: 0 })
  public editionCount: number;

  /** ID in the library server (set when matched during availability scan) */
  @Column({ type: 'varchar', nullable: true })
  public libraryServerId: string | null;

  /** Which LibraryServerInstance matched this book */
  @Column({ type: 'int', nullable: true })
  public libraryServerInstanceId: number | null;

  /** URL to the item in the library server (for direct linking) */
  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl: string | null;

  /** ID in the download manager (set when request is forwarded) */
  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId: string | null;

  /** Which DownloadManagerInstance is handling this book */
  @Column({ type: 'int', nullable: true })
  public downloadManagerInstanceId: number | null;

  @OneToMany(() => MediaRequest, (request) => request.media)
  public requests: MediaRequest[];

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public mediaAddedAt: Date | null;

  constructor(init?: Partial<BookMedia>) {
    Object.assign(this, init);
  }
}

export default BookMedia;
```

### Notes

- `foreignBookId` is the unique deduplication key (OpenLibrary work key)
- `isbn13` and `isbn10` are stored separately for the cascading match strategy
- `authorName` is stored as a simple string (comma-separated) to keep queries simple; author normalization is out of scope for Phase 1
- The `requests` relation connects to `MediaRequest` through the existing `media` ManyToOne; this requires the `MediaRequest` entity to support a polymorphic reference (see "MediaRequest Extension" below)

## Entity: AudiobookMedia

**File**: `server/entity/AudiobookMedia.ts`
**Table**: `audiobook_media`

Represents an audiobook known to the system.

```typescript
import { MediaRequestStatus, MediaStatus, MediaType } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MediaRequest } from './MediaRequest';

@Entity()
@Index(['foreignBookId'], { unique: true })
class AudiobookMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  /** OpenLibrary work key or Audnexus ID */
  @Column({ type: 'varchar' })
  @Index()
  public foreignBookId: string;

  @Column({ type: 'varchar', nullable: true })
  @Index()
  public foreignAuthorId: string | null;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'varchar' })
  public authorName: string;

  /** Comma-separated narrator names */
  @Column({ type: 'varchar', nullable: true })
  public narratorName: string | null;

  /** Duration in seconds */
  @Column({ type: 'int', nullable: true })
  public durationSeconds: number | null;

  @Column({ type: 'varchar', nullable: true })
  public isbn13: string | null;

  @Column({ type: 'varchar', nullable: true })
  public isbn10: string | null;

  /** Audible ASIN for audiobook-specific matching */
  @Column({ type: 'varchar', nullable: true })
  @Index()
  public asin: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher: string | null;

  @Column({ type: 'int', nullable: true })
  public publishYear: number | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl: string | null;

  @Column({ type: 'int', nullable: true })
  public coverId: number | null;

  /** "Unabridged", "Abridged", etc. */
  @Column({ type: 'varchar', nullable: true })
  public abridgement: string | null;

  @Column({ type: 'text', nullable: true })
  public description: string | null;

  @Column({ type: 'varchar', nullable: true })
  public language: string | null;

  /** Series name if part of a series */
  @Column({ type: 'varchar', nullable: true })
  public seriesName: string | null;

  @Column({ type: 'varchar', nullable: true })
  public seriesPosition: string | null;

  @Column({ type: 'int', default: MediaStatus.UNKNOWN })
  @Index()
  public status: MediaStatus;

  @Column({ type: 'varchar', nullable: true })
  public libraryServerId: string | null;

  @Column({ type: 'int', nullable: true })
  public libraryServerInstanceId: number | null;

  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId: string | null;

  @Column({ type: 'int', nullable: true })
  public downloadManagerInstanceId: number | null;

  @OneToMany(() => MediaRequest, (request) => request.media)
  public requests: MediaRequest[];

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public mediaAddedAt: Date | null;

  constructor(init?: Partial<AudiobookMedia>) {
    Object.assign(this, init);
  }
}

export default AudiobookMedia;
```

### Notes

- Shares the same `foreignBookId` pattern as `BookMedia` for cross-referencing work<->audiobook
- `asin` field enables Audiobookshelf matching (which indexes by ASIN)
- `narratorName` and `durationSeconds` are audiobook-specific fields
- `abridgement` captures user preference for unabridged vs abridged (FR-036)

## Entity: DownloadManagerInstance

**File**: `server/entity/DownloadManagerInstance.ts`
**Table**: `download_manager_instance`

Persists admin-configured download manager connections (Bindery, Readarr).

```typescript
import { MediaType } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DownloadManagerType {
  BINDERY = 'bindery',
  READARR = 'readarr',
}

@Entity()
class DownloadManagerInstance {
  @PrimaryGeneratedColumn()
  public id: number;

  /** Human-readable name set by admin */
  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'varchar' })
  public type: DownloadManagerType;

  @Column({ type: 'varchar' })
  public hostname: string;

  @Column({ type: 'int' })
  public port: number;

  @Column({ type: 'varchar' })
  public apiKey: string;

  @Column({ type: 'boolean', default: false })
  public useSsl: boolean;

  @Column({ type: 'varchar', nullable: true })
  public baseUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  public externalUrl: string | null;

  /**
   * Which media types this instance handles.
   * Stored as comma-separated values: "book", "audiobook", or "book,audiobook".
   */
  @Column({
    type: 'text',
    transformer: {
      from: (value: string | null): MediaType[] => {
        if (!value) return [];
        return value.split(',') as MediaType[];
      },
      to: (value: MediaType[] | null): string | null => {
        if (!value || value.length === 0) return null;
        return value.join(',');
      },
    },
  })
  public mediaTypes: MediaType[];

  /** Active quality profile ID on the download manager */
  @Column({ type: 'int', nullable: true })
  public activeProfileId: number | null;

  @Column({ type: 'varchar', nullable: true })
  public activeProfileName: string | null;

  /** Root folder path on the download manager */
  @Column({ type: 'varchar', nullable: true })
  public activeDirectory: string | null;

  /** Whether this is the default instance for its media types */
  @Column({ type: 'boolean', default: false })
  public isDefault: boolean;

  /** Whether this is a fallback instance (used only when primary fails) */
  @Column({ type: 'boolean', default: false })
  public isFallback: boolean;

  /** Tags to apply to items added via this instance */
  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      from: (value: string | null): number[] => {
        if (!value) return [];
        return value.split(',').map(Number);
      },
      to: (value: number[] | null): string | null => {
        if (!value || value.length === 0) return null;
        return value.join(',');
      },
    },
  })
  public tags: number[];

  @Column({ type: 'boolean', default: true })
  public syncEnabled: boolean;

  @Column({ type: 'boolean', default: false })
  public preventSearch: boolean;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  constructor(init?: Partial<DownloadManagerInstance>) {
    Object.assign(this, init);
  }
}

export default DownloadManagerInstance;
```

### Notes

- Follows the pattern of `RadarrSettings`/`SonarrSettings` from existing code, but stored in the database rather than settings.json to support multiple instances and CRUD
- `apiKey` storage: for Phase 1, stored as plaintext in the database (same as existing Radarr/Sonarr settings in settings.json). Encryption at rest is a future enhancement.
- `isFallback` distinguishes primary (Bindery) from fallback (Readarr) instances
- `mediaTypes` transformer follows the same pattern as `tags` on `MediaRequest`

## Entity: LibraryServerInstance

**File**: `server/entity/LibraryServerInstance.ts`
**Table**: `library_server_instance`

Persists admin-configured library server connections.

```typescript
import { MediaType } from '@server/constants/media';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum LibraryServerType {
  GRIMMORY = 'grimmory',
  AUDIOBOOKSHELF = 'audiobookshelf',
  CALIBRE_WEB = 'calibre-web',
  KAVITA = 'kavita',
}

@Entity()
class LibraryServerInstance {
  @PrimaryGeneratedColumn()
  public id: number;

  /** Human-readable name set by admin */
  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'varchar' })
  public type: LibraryServerType;

  @Column({ type: 'varchar' })
  public hostname: string;

  @Column({ type: 'int' })
  public port: number;

  @Column({ type: 'varchar' })
  public apiKey: string;

  @Column({ type: 'boolean', default: false })
  public useSsl: boolean;

  @Column({ type: 'varchar', nullable: true })
  public baseUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  public externalUrl: string | null;

  /**
   * Which media types this library handles.
   * Stored as comma-separated values: "book", "audiobook", or "book,audiobook".
   */
  @Column({
    type: 'text',
    transformer: {
      from: (value: string | null): MediaType[] => {
        if (!value) return [];
        return value.split(',') as MediaType[];
      },
      to: (value: MediaType[] | null): string | null => {
        if (!value || value.length === 0) return null;
        return value.join(',');
      },
    },
  })
  public mediaTypes: MediaType[];

  /** Scan interval in seconds. Default 300 (5 minutes). FR-042. */
  @Column({ type: 'int', default: 300 })
  public scanIntervalSeconds: number;

  /** Timestamp of last completed scan */
  @DbAwareColumn({ type: 'datetime', nullable: true })
  public lastScan: Date | null;

  /** Comma-separated library IDs to scan (empty = all) */
  @Column({ type: 'text', nullable: true })
  public libraryIds: string | null;

  /** Whether this instance is enabled for scanning */
  @Column({ type: 'boolean', default: true })
  public enabled: boolean;

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  constructor(init?: Partial<LibraryServerInstance>) {
    Object.assign(this, init);
  }
}

export default LibraryServerInstance;
```

### Notes

- `scanIntervalSeconds` defaults to 300 (5 minutes) per FR-042
- `libraryIds` allows admins to select specific libraries within a server (e.g., an Audiobookshelf instance with multiple libraries)
- `lastScan` tracks when the availability scanner last completed for this instance

## MediaRequest Extension

The existing `MediaRequest` entity already uses `MediaType` as a varchar column for `type`. Adding `BOOK` and `AUDIOBOOK` to the `MediaType` enum means MediaRequest can immediately track book/audiobook requests with no schema change.

However, MediaRequest currently has a `ManyToOne` relation to `Media` (the movie/TV entity). For book/audiobook requests, we need a parallel relation to `BookMedia` / `AudiobookMedia`. Two approaches:

### Option A: Nullable Relations (Recommended for Phase 1)

Add two new nullable `ManyToOne` relations to `MediaRequest`:

```typescript
// In MediaRequest entity -- NEW columns (additive, no existing column changes)

@ManyToOne(() => BookMedia, { nullable: true, eager: true, onDelete: 'CASCADE' })
@Index()
public bookMedia: BookMedia | null;

@ManyToOne(() => AudiobookMedia, { nullable: true, eager: true, onDelete: 'CASCADE' })
@Index()
public audiobookMedia: AudiobookMedia | null;
```

For movie/TV requests: `media` is set, `bookMedia` and `audiobookMedia` are null.
For book requests: `bookMedia` is set, `media` and `audiobookMedia` are null.
For audiobook requests: `audiobookMedia` is set, `media` and `bookMedia` are null.

### Option B: Generic Foreign Key (Future)

A more elegant approach using a discriminator pattern, but would require more substantial changes to `MediaRequest`. Deferred to a future refactor.

### Extended MediaRequestBody

```typescript
// In server/interfaces/api/requestInterfaces.ts -- extend existing type

export type MediaRequestBody = {
  mediaType: MediaType;
  mediaId: number;
  tvdbId?: number;
  seasons?: number[] | 'all';
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  profileName?: string;
  rootFolder?: string;
  languageProfileId?: number;
  userId?: number;
  tags?: number[];
  // New fields for books/audiobooks
  openLibraryId?: string;     // OpenLibrary work key
  isbn?: string;              // ISBN-13 or ISBN-10
  foreignBookId?: string;     // Dedup key from OpenLibrary
  note?: string;              // User note (FR-009)
  preferredFormat?: string;   // "unabridged" | "abridged" (FR-036)
};
```

## MediaType Enum Extension

```typescript
// server/constants/media.ts

export enum MediaType {
  MOVIE = 'movie',
  TV = 'tv',
  BOOK = 'book',           // NEW
  AUDIOBOOK = 'audiobook', // NEW
}
```

## Permission Flags Extension

```typescript
// server/lib/permissions.ts -- new flags (additive)

export enum Permission {
  // ... existing flags unchanged ...
  VIEW_BLOCKLIST = 1073741824,
  // New book/audiobook flags -- use next available powers of 2
  // Note: JS bitwise ops work on 32-bit signed integers, max safe flag is 2^30 = 1073741824
  // We need to use bigint or a different approach for flags beyond 2^30
  // For now, reuse the generic REQUEST permission and add specific ones:
  REQUEST_BOOK = 536870912,           // 2^29 (available slot)
  REQUEST_AUDIOBOOK = 2147483648,     // 2^31 -- CAUTION: exceeds 32-bit signed int
}
```

**Important note on permission flags**: The current system uses 32-bit signed integer bitwise operations. `VIEW_BLOCKLIST` at `1073741824` is `2^30`, which is the maximum safe positive value for 32-bit signed ints. Adding more flags requires either:
1. Using unused slots between existing flags (if any exist)
2. Migrating to a BigInt-based permission system
3. Using a separate permission column for book/audiobook permissions

This needs investigation during Sub-Phase 1A. The recommended approach is to audit existing flag values for gaps, or introduce a `bookPermissions` column.

## Settings Extension

```typescript
// In server/lib/settings/index.ts -- new interfaces

export interface DownloadManagerSettings {
  id: number;
  name: string;
  type: 'bindery' | 'readarr';
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  externalUrl?: string;
  mediaTypes: string[];  // ['book'], ['audiobook'], or ['book', 'audiobook']
  activeProfileId?: number;
  activeProfileName?: string;
  activeDirectory?: string;
  isDefault: boolean;
  isFallback: boolean;
  tags: number[];
  syncEnabled: boolean;
  preventSearch: boolean;
}

export interface LibraryServerSettings {
  id: number;
  name: string;
  type: 'grimmory' | 'audiobookshelf' | 'calibre-web' | 'kavita';
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  externalUrl?: string;
  mediaTypes: string[];
  scanIntervalSeconds: number;
  libraryIds?: string[];
  enabled: boolean;
}

// Add to AllSettings interface:
export interface AllSettings {
  // ... existing fields ...
  downloadManagers: DownloadManagerSettings[];
  libraryServers: LibraryServerSettings[];
}
```

**Design note**: Settings are stored in both `settings.json` (for backward compatibility and simple config) and the database entities (for CRUD operations). The settings.json entries serve as defaults; the database entities are the runtime source of truth. This mirrors how Radarr/Sonarr settings work in the existing codebase (stored in settings.json arrays).

## Database Migration

A TypeORM migration must be created to add the new tables:

- `book_media`
- `audiobook_media`
- `download_manager_instance`
- `library_server_instance`
- Two new nullable foreign key columns on `media_request`: `bookMediaId`, `audiobookMediaId`

The migration must be idempotent and must not modify any existing tables or columns beyond adding the new nullable FK columns to `media_request`.
