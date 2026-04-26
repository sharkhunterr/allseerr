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
 * Local availability + request tracking for AniList-sourced manga.
 * Mirrors GameMedia's shape: a row per AniList id (anilistId is the
 * unique constraint) with the source metadata cached so the request
 * card / dispatcher don't need a fresh AniList round-trip.
 */
@Entity()
@Unique(['anilistId'])
export class MangaMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.MANGA })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public title: string;

  @Index()
  @Column({ type: 'integer' })
  public anilistId: number;

  @Column({ type: 'integer', nullable: true })
  public malId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public titleNative?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public year?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public format?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public status_anilist?: string | null;

  @Column({ type: 'integer', nullable: true })
  public chapters?: number | null;

  @Column({ type: 'integer', nullable: true })
  public volumes?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public countryOfOrigin?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public authorName?: string | null;

  // Internal availability — separate from `status_anilist` (the
  // publication status from AniList) so we don't conflate "currently
  // releasing" with "available in the user's library".
  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  // Suwayomi (or another download manager) external id once
  // dispatch happens. Null for the manual workflow.
  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId?: string | null;

  // Public URL of the manga inside the configured library server
  // (Komga / Suwayomi / etc.) so the detail page can show a "Read"
  // button when AVAILABLE.
  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public libraryServerId?: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<MangaMedia>) {
    Object.assign(this, init);
  }
}

export default MangaMedia;
