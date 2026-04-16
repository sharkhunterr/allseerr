import { MediaRequestStatus, MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './User';

export enum AudioFormat {
  MP3 = 'mp3',
  FLAC = 'flac',
  AAC = 'aac',
  OGG = 'ogg',
  OPUS = 'opus',
  WAV = 'wav',
}

/**
 * Music request entity — structure only (Phase 3).
 * Not actively used until ENABLE_MUSIC feature flag is enabled.
 */
@Entity()
export class MusicRequest {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.MUSIC })
  public mediaType: MediaType;

  @Column({ type: 'integer', default: MediaRequestStatus.PENDING })
  public status: MediaRequestStatus;

  @Column({ type: 'varchar' })
  public artistName: string;

  @Column({ type: 'varchar' })
  public albumTitle: string;

  @Column({ type: 'integer', nullable: true })
  public releaseYear?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public musicbrainzId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public requestedFormat?: AudioFormat | null;

  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  public requestedBy: User;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<MusicRequest>) {
    Object.assign(this, init);
  }
}

export default MusicRequest;
