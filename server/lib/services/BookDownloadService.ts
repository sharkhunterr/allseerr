import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import type { AudiobookMedia } from '@server/entity/AudiobookMedia';
import type { BookMedia } from '@server/entity/BookMedia';
import {
  DownloadManagerInstance,
  DownloadManagerType,
} from '@server/entity/DownloadManagerInstance';
import { BinderyAdapter } from '@server/lib/adapters/book/BinderyAdapter';
import { ReadarrAdapter } from '@server/lib/adapters/book/ReadarrAdapter';
import type { DownloadManagerAdapter } from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

/**
 * Dispatches book/audiobook requests to the configured download manager.
 * Implements Bindery-first, Readarr-fallback cascade (FR-015, FR-037).
 */
export class BookDownloadService {
  /**
   * Dispatch a book or audiobook to the appropriate download manager.
   * Tries primary (non-fallback) instances first, then fallback instances.
   */
  async dispatch(
    media: BookMedia | AudiobookMedia,
    mediaType: MediaType
  ): Promise<{ success: boolean; externalId?: string; message?: string }> {
    const repo = getRepository(DownloadManagerInstance);
    const instances = await repo.find({
      where: { isActive: true },
    });

    // Filter instances that handle this media type
    const eligible = instances.filter((inst) =>
      inst.mediaTypes.includes(mediaType)
    );

    if (eligible.length === 0) {
      logger.warn('No download manager configured for media type', {
        label: 'book-download',
        mediaType,
        title: media.title,
      });
      return {
        success: false,
        message: 'No download manager configured for this media type.',
      };
    }

    // Sort: primary first, then fallback
    const primary = eligible.filter((i) => !i.isFallback);
    const fallback = eligible.filter((i) => i.isFallback);
    const ordered = [...primary, ...fallback];

    for (const instance of ordered) {
      try {
        const adapter = this.createAdapter(instance);
        const result = await adapter.submitRequest({
          externalId: media.foreignBookId,
          title: media.title,
          mediaType,
          qualityProfileId: instance.qualityProfileId ?? undefined,
          rootFolderPath: instance.rootFolderPath ?? undefined,
        });

        if (result.success) {
          // Update media with download manager reference
          media.downloadManagerExternalId = result.externalId ?? null;
          logger.info(
            `Book dispatched to ${instance.name}: ${media.title}`,
            { label: 'book-download' }
          );
          return result;
        }

        logger.warn(
          `Download manager ${instance.name} rejected request: ${result.message}`,
          { label: 'book-download' }
        );
      } catch (e) {
        logger.error(
          `Download manager ${instance.name} failed: ${e instanceof Error ? e.message : String(e)}`,
          { label: 'book-download' }
        );
        // Continue to next instance (fallback cascade)
      }
    }

    return {
      success: false,
      message:
        'All download manager instances failed. Check configuration.',
    };
  }

  private createAdapter(
    instance: DownloadManagerInstance
  ): DownloadManagerAdapter {
    const config = {
      hostname: instance.hostname,
      port: instance.port,
      apiKey: instance.apiKey,
      useSsl: instance.useSsl,
      baseUrl: instance.baseUrl ?? undefined,
    };

    switch (instance.serviceType) {
      case DownloadManagerType.BINDERY:
        return new BinderyAdapter(config);
      case DownloadManagerType.READARR:
        return new ReadarrAdapter(config);
      default:
        throw new Error(
          `Unknown download manager type: ${instance.serviceType}`
        );
    }
  }
}

export default BookDownloadService;
