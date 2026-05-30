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
 * Local availability + request tracking for magazine / periodical
 * requests. Mirrors ComicMedia's shape (a row per magazine
 * title, not per individual issue) since pressarr also
 * monitors a whole publication then auto-grabs new issues as
 * they're posted by indexers.
 *
 * Identity: magazines have no single canonical identifier the
 * way books have OpenLibrary keys or games have IGDB ids — the
 * cleanest stable id is ISSN when it exists (International
 * Standard Serial Number, 8-digit numeric). When the operator
 * adds a magazine without an ISSN (free-text "Le Monde" entry
 * for example), we fall back to a slugified title stored in
 * ``externalKey`` so the dedupe still works.
 *
 * Pressarr is the dispatch target; ``downloadManagerExternalId``
 * holds the pressarr internal Magazine row id once dispatched.
 */
@Entity()
@Unique(['externalKey'])
export class MagazineMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.MAGAZINE })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public title: string;

  /**
   * Stable de-duplication key. Format:
   *   * ``issn:NNNN-NNNN`` when the operator picked a magazine
   *     with a known ISSN (Google Books surfaces those when the
   *     publisher registered)
   *   * ``slug:<lowercase-title>`` for free-text entries
   *     (operator typed a title without picking a suggestion)
   *
   * The Unique constraint on this column is what prevents two
   * dispatches for the same magazine.
   */
  @Index()
  @Column({ type: 'varchar' })
  public externalKey: string;

  /**
   * ISSN when known (8 digits, hyphenated). Surfaced separately
   * from ``externalKey`` so the dispatcher can pass it to
   * Pressarr alongside the title — Pressarr's matcher prefers
   * ISSN over fuzzy title match when available.
   */
  @Column({ type: 'varchar', nullable: true })
  public issn?: string | null;

  /**
   * Google Books volume id when the magazine came from a Google
   * Books suggestion. Kept for re-enrichment and to allow the
   * detail page to deep-link back to the source listing.
   */
  @Column({ type: 'varchar', nullable: true })
  public googleBooksId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public year?: number | null;

  /**
   * Publication frequency hint when discoverable (monthly /
   * weekly / quarterly). Free-text since neither Google Books
   * nor ISSN portal expose a normalised enum here.
   */
  @Column({ type: 'varchar', nullable: true })
  public frequency?: string | null;

  /**
   * Free-text language code (ISO 639-1 when we can resolve it,
   * the indexer's raw string otherwise). Mirrors what
   * BookMedia.language carries — surfaced on the request card.
   */
  @Column({ type: 'varchar', nullable: true })
  public language?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public description?: string | null;

  /**
   * Live count of issues pressarr has already downloaded for
   * this magazine. Drives the PARTIALLY_AVAILABLE badge on the
   * dashboard card the same way ComicMedia.availableIssues
   * does. Null until the first availability scan completes.
   */
  @Column({ type: 'integer', nullable: true })
  public availableIssues?: number | null;

  /**
   * Total expected issues per pressarr — periodicals are
   * open-ended (new issues forever) so a static total isn't
   * always meaningful; when populated it's pressarr's
   * "monitored issue count" so the badge can render
   * PARTIAL vs AVAILABLE consistently.
   */
  @Column({ type: 'integer', nullable: true })
  public issueCount?: number | null;

  // Internal availability — separate from any "publication
  // ongoing" state pressarr knows about.
  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  // Pressarr external id once dispatch happens. Null for the
  // manual workflow.
  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId?: string | null;

  // Human-readable explanation of why the request is in its
  // current state — set at dispatch time. Null means "nothing
  // to communicate beyond what the badge already says".
  @Column({ type: 'varchar', nullable: true })
  public statusReason?: string | null;

  // Public URL of the magazine inside the configured library
  // server (Pressarr's own browse UI, by default) so the
  // detail page can show a "Read" / "Open" button when
  // AVAILABLE.
  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl?: string | null;

  @Column({ type: 'integer', nullable: true })
  public libraryServerId?: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<MagazineMedia>) {
    Object.assign(this, init);
  }
}

export default MagazineMedia;
