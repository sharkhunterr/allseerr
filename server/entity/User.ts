import { MediaRequestStatus, MediaType } from '@server/constants/media';
import { UserType } from '@server/constants/user';
import { getRepository } from '@server/datasource';
import { Watchlist } from '@server/entity/Watchlist';
import type { QuotaResponse } from '@server/interfaces/api/userInterfaces';
import PreparedEmail from '@server/lib/email';
import type { PermissionCheckOptions } from '@server/lib/permissions';
import { Permission, hasPermission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { DbAwareColumn, resolveDbType } from '@server/utils/DbColumnHelper';
import { AfterDate } from '@server/utils/dateHelpers';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import path from 'path';
import { default as generatePassword } from 'secure-random-password';
import {
  AfterLoad,
  Column,
  Entity,
  Not,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  RelationCount,
  UpdateDateColumn,
} from 'typeorm';
import Issue from './Issue';
import { MediaRequest } from './MediaRequest';
import SeasonRequest from './SeasonRequest';
import { UserPushSubscription } from './UserPushSubscription';
import { UserSettings } from './UserSettings';

@Entity()
export class User {
  public static filterMany(
    users: User[],
    showFiltered?: boolean
  ): Partial<User>[] {
    return users.map((u) => u.filter(showFiltered));
  }

  static readonly filteredFields: string[] = [
    'email',
    'plexId',
    'password',
    'resetPasswordGuid',
    'jellyfinDeviceId',
    'jellyfinAuthToken',
    'plexToken',
    'oidcSub',
    'settings',
  ];

  public displayName: string;

  @PrimaryGeneratedColumn()
  public id: number;

  @Column({
    unique: true,
    transformer: {
      from: (value: string): string => (value ?? '').toLowerCase(),
      to: (value: string): string => (value ?? '').toLowerCase(),
    },
  })
  public email: string;

  @Column({ type: 'varchar', nullable: true })
  public plexUsername?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public jellyfinUsername?: string | null;

  @Column({ nullable: true })
  public username?: string;

  @Column({ nullable: true, select: false })
  public password?: string;

  @Column({ nullable: true, select: false })
  public resetPasswordGuid?: string;

  @DbAwareColumn({ type: 'datetime', nullable: true })
  public recoveryLinkExpirationDate?: Date | null;

  @Column({ type: 'integer', default: UserType.PLEX })
  public userType: UserType;

  @Column({ type: 'integer', nullable: true, select: true })
  public plexId?: number | null;

  @Column({ type: 'varchar', nullable: true })
  public jellyfinUserId?: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  public jellyfinDeviceId?: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  public jellyfinAuthToken?: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  public plexToken?: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  public oidcSub?: string | null;

  @Column({
    type: 'bigint',
    default: 0,
    transformer: {
      // BigInt round-trip: TypeORM hands back a string for bigint
      // columns (precision would be lost as Number for values above
      // 2^53). Our permissions mask stays well under 2^53 for the
      // foreseeable future (a few dozen bits), so coerce back to a
      // regular Number for runtime math — `hasPermission` uses BigInt
      // internally when needed.
      to: (value: number | undefined | null): number | null =>
        value ?? 0,
      from: (value: string | number | null | undefined): number => {
        if (value == null) return 0;
        if (typeof value === 'number') return value;
        return Number(value);
      },
    },
  })
  public permissions = 0;

  @Column()
  public avatar: string;

  @Column({ type: 'varchar', nullable: true })
  public avatarETag?: string | null;

  @Column({ type: 'varchar', nullable: true })
  public avatarVersion?: string | null;

  @RelationCount((user: User) => user.requests)
  public requestCount: number;

  @OneToMany(() => MediaRequest, (request) => request.requestedBy)
  public requests: MediaRequest[];

  @OneToMany(() => Watchlist, (watchlist) => watchlist.requestedBy)
  public watchlists: Watchlist[];

  @Column({ nullable: true })
  public movieQuotaLimit?: number;

  @Column({ nullable: true })
  public movieQuotaDays?: number;

  @Column({ nullable: true })
  public tvQuotaLimit?: number;

  @Column({ nullable: true })
  public tvQuotaDays?: number;

  @Column({ nullable: true })
  public bookQuotaLimit?: number;

  @Column({ nullable: true })
  public bookQuotaDays?: number;

  @Column({ nullable: true })
  public audiobookQuotaLimit?: number;

  @Column({ nullable: true })
  public audiobookQuotaDays?: number;

  @Column({ nullable: true })
  public gameQuotaLimit?: number;

  @Column({ nullable: true })
  public gameQuotaDays?: number;

  @Column({ nullable: true })
  public mangaQuotaLimit?: number;

  @Column({ nullable: true })
  public mangaQuotaDays?: number;

  @Column({ nullable: true })
  public comicQuotaLimit?: number;

  @Column({ nullable: true })
  public comicQuotaDays?: number;

  @OneToOne(() => UserSettings, (settings) => settings.user, {
    cascade: true,
    eager: true,
    onDelete: 'CASCADE',
  })
  public settings?: UserSettings;

  @OneToMany(() => UserPushSubscription, (pushSub) => pushSub.user)
  public pushSubscriptions: UserPushSubscription[];

  @OneToMany(() => Issue, (issue) => issue.createdBy, { cascade: true })
  public createdIssues: Issue[];

  @DbAwareColumn({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt: Date;

  @UpdateDateColumn({ type: resolveDbType('datetime') })
  public updatedAt: Date;

  public warnings: string[] = [];

  constructor(init?: Partial<User>) {
    Object.assign(this, init);
  }

  public filter(showFiltered?: boolean): Partial<User> {
    const filtered: Partial<User> = Object.assign(
      {},
      ...(Object.keys(this) as (keyof User)[])
        .filter((k) => showFiltered || !User.filteredFields.includes(k))
        .map((k) => ({ [k]: this[k] }))
    );

    return filtered;
  }

  public hasPermission(
    permissions: Permission | Permission[],
    options?: PermissionCheckOptions
  ): boolean {
    return !!hasPermission(permissions, this.permissions, options);
  }

  public passwordMatch(password: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.password) {
        resolve(bcrypt.compare(password, this.password));
      } else {
        return resolve(false);
      }
    });
  }

  public async setPassword(password: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(password, 12);
    this.password = hashedPassword;
  }

  public async generatePassword(): Promise<void> {
    const password = generatePassword.randomPassword({ length: 16 });
    await this.setPassword(password);

    const { applicationTitle, applicationUrl } = getSettings().main;
    try {
      logger.info(`Sending generated password email for ${this.email}`, {
        label: 'User Management',
      });

      const email = new PreparedEmail(getSettings().notifications.agents.email);
      await email.send({
        template: path.join(__dirname, '../templates/email/generatedpassword'),
        message: {
          to: this.email,
        },
        locals: {
          password: password,
          applicationUrl,
          applicationTitle,
          recipientName: this.username,
        },
      });
    } catch (e) {
      logger.error('Failed to send out generated password email', {
        label: 'User Management',
        message: e.message,
      });
    }
  }

  public async resetPassword(): Promise<void> {
    const guid = randomUUID();
    this.resetPasswordGuid = guid;

    // 24 hours into the future
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 1);
    this.recoveryLinkExpirationDate = targetDate;

    const { applicationTitle, applicationUrl } = getSettings().main;
    const resetPasswordLink = `${applicationUrl}/resetpassword/${guid}`;

    try {
      logger.info(`Sending reset password email for ${this.email}`, {
        label: 'User Management',
      });
      const email = new PreparedEmail(getSettings().notifications.agents.email);
      await email.send({
        template: path.join(__dirname, '../templates/email/resetpassword'),
        message: {
          to: this.email,
        },
        locals: {
          resetPasswordLink,
          applicationUrl,
          applicationTitle,
          recipientName: this.displayName,
          recipientEmail: this.email,
        },
      });
    } catch (e) {
      logger.error('Failed to send out reset password email', {
        label: 'User Management',
        message: e.message,
      });
    }
  }

  @AfterLoad()
  public setDisplayName(): void {
    this.displayName =
      this.username || this.plexUsername || this.jellyfinUsername || this.email;
  }

  public async getQuota(): Promise<QuotaResponse> {
    const {
      main: { defaultQuotas },
    } = getSettings();
    const requestRepository = getRepository(MediaRequest);
    const canBypass = this.hasPermission([Permission.MANAGE_USERS], {
      type: 'or',
    });

    const movieQuotaLimit = !canBypass
      ? (this.movieQuotaLimit ?? defaultQuotas.movie.quotaLimit)
      : 0;
    const movieQuotaDays = this.movieQuotaDays ?? defaultQuotas.movie.quotaDays;

    // Count movie requests made during quota period
    const movieDate = new Date();
    if (movieQuotaDays) {
      movieDate.setDate(movieDate.getDate() - movieQuotaDays);
    }

    const movieQuotaUsed = movieQuotaLimit
      ? await requestRepository.count({
          where: {
            requestedBy: {
              id: this.id,
            },
            ...(movieQuotaDays ? { createdAt: AfterDate(movieDate) } : {}),
            type: MediaType.MOVIE,
            status: Not(MediaRequestStatus.DECLINED),
          },
        })
      : 0;

    const tvQuotaLimit = !canBypass
      ? (this.tvQuotaLimit ?? defaultQuotas.tv.quotaLimit)
      : 0;
    const tvQuotaDays = this.tvQuotaDays ?? defaultQuotas.tv.quotaDays;

    // Count tv season requests made during quota period
    const tvDate = new Date();
    if (tvQuotaDays) {
      tvDate.setDate(tvDate.getDate() - tvQuotaDays);
    }
    const tvQuotaStartDate = tvDate.toJSON();
    const tvQuotaUsedQuery = requestRepository
      .createQueryBuilder('request')
      .leftJoin('request.requestedBy', 'requestedBy')
      .where('request.type = :requestType', {
        requestType: MediaType.TV,
      })
      .andWhere('requestedBy.id = :userId', {
        userId: this.id,
      })
      .andWhere('request.status != :declinedStatus', {
        declinedStatus: MediaRequestStatus.DECLINED,
      });

    if (tvQuotaDays) {
      tvQuotaUsedQuery.andWhere('request.createdAt > :date', {
        date: tvQuotaStartDate,
      });
    }

    const tvQuotaUsed = tvQuotaLimit
      ? (
          await tvQuotaUsedQuery
            .addSelect((subQuery) => {
              return subQuery
                .select('COUNT(season.id)', 'seasonCount')
                .from(SeasonRequest, 'season')
                .leftJoin('season.request', 'parentRequest')
                .where('parentRequest.id = request.id');
            }, 'seasonCount')
            .getMany()
        ).reduce((sum: number, req: MediaRequest) => sum + req.seasonCount, 0)
      : 0;

    // Book, audiobook and game quotas follow the simpler movie
    // pattern: one-request-per-work, counted within a rolling window.
    const countSimpleQuota = async (
      mediaType: MediaType,
      limit: number,
      days: number
    ): Promise<number> => {
      if (!limit) return 0;
      const since = new Date();
      if (days) since.setDate(since.getDate() - days);
      return requestRepository.count({
        where: {
          requestedBy: { id: this.id },
          ...(days ? { createdAt: AfterDate(since) } : {}),
          type: mediaType,
          status: Not(MediaRequestStatus.DECLINED),
        },
      });
    };

    const bookQuotaLimit = !canBypass
      ? (this.bookQuotaLimit ?? defaultQuotas.book?.quotaLimit ?? 0)
      : 0;
    const bookQuotaDays =
      this.bookQuotaDays ?? defaultQuotas.book?.quotaDays ?? 0;
    const bookQuotaUsed = await countSimpleQuota(
      MediaType.BOOK,
      bookQuotaLimit,
      bookQuotaDays
    );

    const audiobookQuotaLimit = !canBypass
      ? (this.audiobookQuotaLimit ?? defaultQuotas.audiobook?.quotaLimit ?? 0)
      : 0;
    const audiobookQuotaDays =
      this.audiobookQuotaDays ?? defaultQuotas.audiobook?.quotaDays ?? 0;
    const audiobookQuotaUsed = await countSimpleQuota(
      MediaType.AUDIOBOOK,
      audiobookQuotaLimit,
      audiobookQuotaDays
    );

    const gameQuotaLimit = !canBypass
      ? (this.gameQuotaLimit ?? defaultQuotas.game?.quotaLimit ?? 0)
      : 0;
    const gameQuotaDays =
      this.gameQuotaDays ?? defaultQuotas.game?.quotaDays ?? 0;
    const gameQuotaUsed = await countSimpleQuota(
      MediaType.GAME,
      gameQuotaLimit,
      gameQuotaDays
    );

    const mangaQuotaLimit = !canBypass
      ? (this.mangaQuotaLimit ?? defaultQuotas.manga?.quotaLimit ?? 0)
      : 0;
    const mangaQuotaDays =
      this.mangaQuotaDays ?? defaultQuotas.manga?.quotaDays ?? 0;
    const mangaQuotaUsed = await countSimpleQuota(
      MediaType.MANGA,
      mangaQuotaLimit,
      mangaQuotaDays
    );

    const comicQuotaLimit = !canBypass
      ? (this.comicQuotaLimit ?? defaultQuotas.comic?.quotaLimit ?? 0)
      : 0;
    const comicQuotaDays =
      this.comicQuotaDays ?? defaultQuotas.comic?.quotaDays ?? 0;
    const comicQuotaUsed = await countSimpleQuota(
      MediaType.COMIC,
      comicQuotaLimit,
      comicQuotaDays
    );

    return {
      movie: {
        days: movieQuotaDays,
        limit: movieQuotaLimit,
        used: movieQuotaUsed,
        remaining: movieQuotaLimit
          ? Math.max(0, movieQuotaLimit - movieQuotaUsed)
          : undefined,
        restricted: !!(
          movieQuotaLimit && movieQuotaLimit - movieQuotaUsed <= 0
        ),
      },
      tv: {
        days: tvQuotaDays,
        limit: tvQuotaLimit,
        used: tvQuotaUsed,
        remaining: tvQuotaLimit
          ? Math.max(0, tvQuotaLimit - tvQuotaUsed)
          : undefined,
        restricted: !!(tvQuotaLimit && tvQuotaLimit - tvQuotaUsed <= 0),
      },
      book: {
        days: bookQuotaDays,
        limit: bookQuotaLimit,
        used: bookQuotaUsed,
        remaining: bookQuotaLimit
          ? Math.max(0, bookQuotaLimit - bookQuotaUsed)
          : undefined,
        restricted: !!(bookQuotaLimit && bookQuotaLimit - bookQuotaUsed <= 0),
      },
      audiobook: {
        days: audiobookQuotaDays,
        limit: audiobookQuotaLimit,
        used: audiobookQuotaUsed,
        remaining: audiobookQuotaLimit
          ? Math.max(0, audiobookQuotaLimit - audiobookQuotaUsed)
          : undefined,
        restricted: !!(
          audiobookQuotaLimit && audiobookQuotaLimit - audiobookQuotaUsed <= 0
        ),
      },
      game: {
        days: gameQuotaDays,
        limit: gameQuotaLimit,
        used: gameQuotaUsed,
        remaining: gameQuotaLimit
          ? Math.max(0, gameQuotaLimit - gameQuotaUsed)
          : undefined,
        restricted: !!(gameQuotaLimit && gameQuotaLimit - gameQuotaUsed <= 0),
      },
      manga: {
        days: mangaQuotaDays,
        limit: mangaQuotaLimit,
        used: mangaQuotaUsed,
        remaining: mangaQuotaLimit
          ? Math.max(0, mangaQuotaLimit - mangaQuotaUsed)
          : undefined,
        restricted: !!(mangaQuotaLimit && mangaQuotaLimit - mangaQuotaUsed <= 0),
      },
      comic: {
        days: comicQuotaDays,
        limit: comicQuotaLimit,
        used: comicQuotaUsed,
        remaining: comicQuotaLimit
          ? Math.max(0, comicQuotaLimit - comicQuotaUsed)
          : undefined,
        restricted: !!(comicQuotaLimit && comicQuotaLimit - comicQuotaUsed <= 0),
      },
    };
  }
}
