import { MediaStatus, MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class AudiobookMedia {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar', default: MediaType.AUDIOBOOK })
  public mediaType: MediaType;

  @Column({ type: 'varchar' })
  public title: string;

  @Column({ type: 'varchar' })
  public authorName: string;

  @Column({ type: 'varchar', nullable: true })
  public narratorName?: string | null;

  @Column({ type: 'integer', nullable: true })
  public durationSeconds?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public asin?: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar' })
  public foreignBookId: string;

  @Column({ type: 'varchar', nullable: true })
  public foreignAuthorId?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public publisher?: string | null;

  @Column({ type: 'integer', nullable: true })
  public year?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public coverUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public openLibraryId?: string | null;

  @Column({ type: 'integer', default: MediaStatus.UNKNOWN })
  public status: MediaStatus;

  @Column({ type: 'integer', nullable: true })
  public libraryServerId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public libraryServerUrl?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public downloadManagerExternalId?: string | null;

  @Column({ type: 'boolean', default: false })
  public isAbridged: boolean;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<AudiobookMedia>) {
    Object.assign(this, init);
  }
}

export default AudiobookMedia;
