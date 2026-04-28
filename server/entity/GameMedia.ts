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

@Entity()
@Unique(['igdbId', 'platformIgdbId'])
export class GameMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.GAME })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public title: string;

  @Index()
  @Column({ type: 'integer' })
  public igdbId: number;

  @Column({ type: 'integer' })
  public platformIgdbId: number;

  @Column({ type: 'varchar' })
  public platformName: string;

  @Column({ type: 'integer', nullable: true })
  public releaseYear?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public developer?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public genre?: string | null;

  @Column({ type: 'float', nullable: true })
  public userRating?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public summary?: string | null;

  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  @Column({ type: 'integer', nullable: true })
  public rommId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public rommUrl?: string | null;

  // Human-readable explanation of why the request is in its current
  // state — set at dispatch time by the subscriber. Null means
  // "nothing to communicate beyond what the badge already says".
  // Game requests have no automated dispatcher, so this is set to a
  // manual-workflow notice on creation.
  @Column({ type: 'varchar', nullable: true })
  public statusReason?: string | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<GameMedia>) {
    Object.assign(this, init);
  }
}

export default GameMedia;
