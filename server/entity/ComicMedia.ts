import { MediaStatus, MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Local availability + request tracking for ComicVine-sourced comic
 * volumes (series). Mirrors MangaMedia / GameMedia: a row per
 * ComicVine volume id (the unique constraint) with the source
 * metadata cached so the request card / dispatcher don't need a
 * fresh ComicVine round-trip — that matters here because ComicVine
 * is throttled at 200 req/h per resource type.
 */
@Entity()
@Unique(['comicVineId'])
export class ComicMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.COMIC })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public title: string;

  @Index()
  @Column({ type: 'integer' })
  public comicVineId: number;

  @Column({ type: 'integer', nullable: true })
  public year?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public issueCount?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher?: string | null;

  @Column({ type: 'integer', nullable: true })
  public publisherId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public creatorName?: string | null;

  @Column({ type: 'integer', nullable: true })
  public creatorKey?: number | null;

  // Internal availability — separate from any ComicVine-side status
  // (volumes have a "Continuing" / "Ended" notion that lives in the
  // metadata, not in our request lifecycle).
  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  // Mylar3 (or another download manager) external id once dispatch
  // happens. Null for the manual workflow.
  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId?: string | null;

  // Human-readable explanation of why the request is in its current
  // state — set at dispatch time by the subscriber. Null means
  // "nothing to communicate beyond what the badge already says".
  @Column({ type: 'varchar', nullable: true })
  public statusReason?: string | null;

  // Public URL of the comic inside the configured library server
  // (Komga / Mylar / etc.) so the detail page can show a "Read" /
  // "Open" button when AVAILABLE.
  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public libraryServerId?: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<ComicMedia>) {
    Object.assign(this, init);
  }
}

export default ComicMedia;
