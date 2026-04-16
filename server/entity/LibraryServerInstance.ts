import { MediaType } from '@server/constants/media';
import {
  Column,
  CreateDateColumn,
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
export class LibraryServerInstance {
  @PrimaryGeneratedColumn()
  public id: number;

  @Column({ type: 'varchar' })
  public name: string;

  @Column({ type: 'varchar' })
  public serviceType: LibraryServerType;

  @Column({ type: 'varchar' })
  public hostname: string;

  @Column({ type: 'integer', default: 8080 })
  public port: number;

  @Column({ type: 'varchar', nullable: true })
  public apiKey?: string | null;

  @Column({ type: 'boolean', default: false })
  public useSsl: boolean;

  @Column({ type: 'varchar', nullable: true })
  public baseUrl?: string | null;

  @Column({ type: 'simple-array' })
  public mediaTypes: MediaType[];

  @Column({ type: 'boolean', default: true })
  public isActive: boolean;

  /** Scan interval in seconds. Default: 300 (5 minutes). */
  @Column({ type: 'integer', default: 300 })
  public scanIntervalSeconds: number;

  @Column({ type: 'integer', nullable: true })
  public lastScanTimestamp?: number | null;

  @CreateDateColumn()
  public createdAt: Date;

  @UpdateDateColumn()
  public updatedAt: Date;

  constructor(init?: Partial<LibraryServerInstance>) {
    Object.assign(this, init);
  }
}

export default LibraryServerInstance;
