import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import {
  LibraryServerInstance,
  LibraryServerType,
} from '@server/entity/LibraryServerInstance';
import { MediaRequest } from '@server/entity/MediaRequest';
import { AudiobookshelfAdapter } from '@server/lib/adapters/audiobook/AudiobookshelfAdapter';
import { CalibreWebAdapter } from '@server/lib/adapters/book/CalibreWebAdapter';
import { KavitaAdapter } from '@server/lib/adapters/book/KavitaAdapter';
import type { BookLibraryAdapter } from '@server/lib/adapters/interfaces';
import notificationManager, {
  Notification,
} from '@server/lib/notifications';
import { BookMatchingService } from '@server/lib/services/BookMatchingService';
import logger from '@server/logger';

const matchingService = new BookMatchingService();

/**
 * Scheduled scanner that checks library servers for newly available books.
 * FR-018, FR-030, FR-042.
 */
export class BookAvailabilityScanner {
  /**
   * Run a scan for a specific library server instance.
   */
  async scanInstance(instance: LibraryServerInstance): Promise<number> {
    const adapter = this.createAdapter(instance);
    if (!adapter) {
      logger.warn(`No adapter for library server type: ${instance.serviceType}`, {
        label: 'book-scanner',
      });
      return 0;
    }

    let updated = 0;

    // Scan book media
    if (instance.mediaTypes.includes(MediaType.BOOK)) {
      updated += await this.scanMediaType(
        adapter,
        instance,
        MediaType.BOOK
      );
    }

    // Scan audiobook media
    if (instance.mediaTypes.includes(MediaType.AUDIOBOOK)) {
      updated += await this.scanMediaType(
        adapter,
        instance,
        MediaType.AUDIOBOOK
      );
    }

    // Update last scan timestamp
    const repo = getRepository(LibraryServerInstance);
    instance.lastScanTimestamp = Math.floor(Date.now() / 1000);
    await repo.save(instance);

    return updated;
  }

  /**
   * Run a full scan across all active library server instances.
   */
  async scanAll(): Promise<void> {
    const repo = getRepository(LibraryServerInstance);
    const instances = await repo.find({ where: { isActive: true } });

    for (const instance of instances) {
      try {
        const count = await this.scanInstance(instance);
        if (count > 0) {
          logger.info(
            `Scanner updated ${count} items from ${instance.name}`,
            { label: 'book-scanner' }
          );
        }
      } catch (e) {
        logger.error(
          `Scanner failed for ${instance.name}: ${e instanceof Error ? e.message : String(e)}`,
          { label: 'book-scanner' }
        );
      }
    }
  }

  private async scanMediaType(
    adapter: BookLibraryAdapter,
    instance: LibraryServerInstance,
    mediaType: MediaType
  ): Promise<number> {
    const isBook = mediaType === MediaType.BOOK;
    const mediaRepo = isBook
      ? getRepository(BookMedia)
      : getRepository(AudiobookMedia);
    const requestRepo = getRepository(MediaRequest);

    // Find pending/approved items that aren't yet available
    const pendingMedia = await mediaRepo.find({
      where: [
        { status: MediaStatus.PENDING },
        { status: MediaStatus.PROCESSING },
      ],
    });

    let updated = 0;

    for (const media of pendingMedia) {
      try {
        const match = await matchingService.match(adapter, {
          title: media.title,
          authorName: media.authorName,
          isbn13: isBook ? (media as BookMedia).isbn13 : undefined,
          isbn10: isBook ? (media as BookMedia).isbn10 : undefined,
          asin: !isBook ? (media as AudiobookMedia).asin : undefined,
        });

        if (match) {
          media.status = MediaStatus.AVAILABLE;
          media.libraryServerId = instance.id;
          media.libraryServerUrl = match.foreignBookId;
          // mediaRepo is `Repository<BookMedia> | Repository<AudiobookMedia>`
          // and TS can't pick a save() overload off a union of
          // generic repos. The repo selection above already picked
          // the right branch at runtime; cast the call site to bypass
          // TS rather than restructuring the whole branch.
          await (
            mediaRepo as unknown as { save: (m: unknown) => Promise<unknown> }
          ).save(media);

          // Update associated requests
          const requests = await requestRepo.find({
            where: isBook
              ? { bookMedia: { id: media.id } }
              : { audiobookMedia: { id: media.id } },
            relations: ['requestedBy'],
          });

          for (const request of requests) {
            if (
              request.status === MediaRequestStatus.APPROVED ||
              request.status === MediaRequestStatus.PENDING
            ) {
              request.status = MediaRequestStatus.COMPLETED;
              await requestRepo.save(request);

              notificationManager.sendNotification(
                Notification.MEDIA_AVAILABLE,
                // NotificationPayload requires notifySystem +
                // notifyAdmin + a fully-shaped Media entity. For
                // non-TMDB book/audiobook notifications we don't
                // have a Media row at all — cast the whole payload
                // through unknown. Agents that read these fields
                // gate on `media.tmdbId !== 0` first.
                {
                  subject: `Available: ${media.title}`,
                  message: `"${media.title}" is now available in your library`,
                  notifyAdmin: true,
                  notifySystem: true,
                  media: {
                    mediaType,
                    tmdbId: 0,
                    tvdbId: 0,
                    status: MediaStatus.AVAILABLE,
                    status4k: MediaStatus.UNKNOWN,
                  },
                  request,
                } as unknown as Parameters<
                  typeof notificationManager.sendNotification
                >[1]
              );
            }
          }

          updated++;
        }
      } catch (e) {
        logger.debug(
          `Scanner match failed for "${media.title}": ${e instanceof Error ? e.message : String(e)}`,
          { label: 'book-scanner' }
        );
      }
    }

    return updated;
  }

  private createAdapter(
    instance: LibraryServerInstance
  ): BookLibraryAdapter | null {
    const config = {
      hostname: instance.hostname,
      port: instance.port,
      apiKey: instance.apiKey ?? '',
      useSsl: instance.useSsl,
      baseUrl: instance.baseUrl ?? undefined,
    };

    switch (instance.serviceType) {
      case LibraryServerType.AUDIOBOOKSHELF:
        return new AudiobookshelfAdapter(config);
      case LibraryServerType.KAVITA:
        return new KavitaAdapter(config);
      case LibraryServerType.CALIBRE_WEB:
        return new CalibreWebAdapter(config);
      case LibraryServerType.GRIMMORY:
        // Grimmory stub — not yet implemented
        return null;
      default:
        return null;
    }
  }
}

export default BookAvailabilityScanner;
