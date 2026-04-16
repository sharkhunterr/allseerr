import { MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DownloadManagerType {
  BINDERY = 'bindery',
  READARR = 'readarr',
}

@Entity()
export class DownloadManagerInstance {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'varchar' })
  public serviceType: DownloadManagerType;

  @Column({ type: 'varchar' })
  public hostname: string;

  @Column({ type: 'integer', default: 8787 })
  public port: number;

  @Column({ type: 'varchar' })
  public apiKey: string;

  @Column({ type: 'boolean', default: false })
  public useSsl: boolean;

  @Column({ type: 'varchar', nullable: true })
  public baseUrl?: string | null;

  @Column({ type: 'simple-array' })
  public mediaTypes: MediaType[];

  @Column({ type: 'boolean', default: false })
  public isFallback: boolean;

  @Column({ type: 'boolean', default: true })
  public isActive: boolean;

  @Column({ type: 'integer', nullable: true })
  public qualityProfileId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public qualityProfileName?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public rootFolderPath?: string | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<DownloadManagerInstance>) {
    Object.assign(this, init);
  }
}

export default DownloadManagerInstance;
