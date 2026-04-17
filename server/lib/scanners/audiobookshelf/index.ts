import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import { AudiobookshelfAdapter } from '@server/lib/adapters/audiobook/AudiobookshelfAdapter';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface AudiobookshelfSyncStatus extends StatusBase {
  newBooks: number;
  newAudiobooks: number;
  updatedItems: number;
}

interface LibraryItem {
  id: string;
  media: {
    metadata: {
      title: string;
      authorName?: string;
      isbn?: string;
      asin?: string;
      publishedYear?: string;
      publisher?: string;
    };
    coverPath?: string;
  };
}

class AudiobookshelfScanner {
  private running = false;
  private progress = 0;
  private totalSize = 0;
  private newBooks = 0;
  private newAudiobooks = 0;
  private updatedItems = 0;

  public status(): AudiobookshelfSyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.totalSize,
      newBooks: this.newBooks,
      newAudiobooks: this.newAudiobooks,
      updatedItems: this.updatedItems,
    };
  }

  public cancel(): void {
    this.running = false;
  }

  public async run(): Promise<void> {
    if (this.running) {
      logger.warn('Audiobookshelf scan already running', {
        label: 'Audiobookshelf Scan',
      });
      return;
    }

    const settings = getSettings();
    const absSettings = settings.book.audiobookshelf;

    if (!absSettings.enabled || !absSettings.url) {
      logger.debug('Audiobookshelf scan skipped: not configured or disabled', {
        label: 'Audiobookshelf Scan',
      });
      return;
    }

    this.running = true;
    this.progress = 0;
    this.totalSize = 0;
    this.newBooks = 0;
    this.newAudiobooks = 0;
    this.updatedItems = 0;

    try {
      const url = new URL(absSettings.url);
      const adapter = new AudiobookshelfAdapter({
        hostname: url.hostname,
        port:
          parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
        apiKey: absSettings.apiKey,
        useSsl: url.protocol === 'https:',
      });

      const publicBase = absSettings.publicUrl || absSettings.url;
      logger.info('Starting Audiobookshelf scan', {
        label: 'Audiobookshelf Scan',
      });

      const bookRepo = getRepository(BookMedia);
      const audiobookRepo = getRepository(AudiobookMedia);

      // Process only libraries mapped to book or audiobook (ignore others)
      const mappedLibraries = absSettings.libraries.filter(
        (l) => l.mediaType === 'book' || l.mediaType === 'audiobook'
      );

      if (mappedLibraries.length === 0) {
        logger.warn(
          'No Audiobookshelf libraries mapped. Configure library types in settings.',
          { label: 'Audiobookshelf Scan' }
        );
        this.running = false;
        return;
      }

      for (const library of mappedLibraries) {
        if (!this.running) break;

        const items: LibraryItem[] = await adapter.getLibraryItems(
          library.libraryId
        );
        this.totalSize += items.length;

        const isBook = library.mediaType === 'book';

        for (const item of items) {
          if (!this.running) break;
          this.progress++;

          const meta = item.media?.metadata;
          if (!meta?.title) continue;

          const itemUrl = `${publicBase}/item/${item.id}`;
          const coverUrl = item.media?.coverPath
            ? `${absSettings.url}/api/items/${item.id}/cover`
            : undefined;

          // Try to match existing media by ISBN, ASIN, or title+author
          let existing: BookMedia | AudiobookMedia | null = null;

          if (isBook && meta.isbn) {
            existing = await bookRepo.findOne({
              where: [{ isbn13: meta.isbn }, { isbn10: meta.isbn }],
            });
          } else if (!isBook && meta.asin) {
            existing = await audiobookRepo.findOne({
              where: { asin: meta.asin },
            });
          }

          if (!existing && meta.authorName) {
            if (isBook) {
              existing = await bookRepo.findOne({
                where: { title: meta.title, authorName: meta.authorName },
              });
            } else {
              existing = await audiobookRepo.findOne({
                where: { title: meta.title, authorName: meta.authorName },
              });
            }
          }

          if (existing) {
            if (
              existing.status !== MediaStatus.AVAILABLE ||
              existing.libraryServerUrl !== itemUrl
            ) {
              existing.status = MediaStatus.AVAILABLE;
              existing.libraryServerUrl = itemUrl;
              if (coverUrl && !existing.coverUrl) {
                existing.coverUrl = coverUrl;
              }
              if (isBook) {
                await bookRepo.save(existing as BookMedia);
              } else {
                await audiobookRepo.save(existing as AudiobookMedia);
              }
              this.updatedItems++;
            }
          } else {
            try {
              if (isBook) {
                const newMedia = new BookMedia({
                  title: meta.title,
                  authorName: meta.authorName ?? 'Unknown',
                  foreignBookId: `abs:${item.id}`,
                  isbn13: meta.isbn,
                  openLibraryId: `abs:${item.id}`,
                  coverUrl,
                  year: meta.publishedYear
                    ? parseInt(meta.publishedYear, 10)
                    : undefined,
                  publisher: meta.publisher,
                  status: MediaStatus.AVAILABLE,
                  libraryServerUrl: itemUrl,
                });
                await bookRepo.save(newMedia);
                this.newBooks++;
              } else {
                const newMedia = new AudiobookMedia({
                  title: meta.title,
                  authorName: meta.authorName ?? 'Unknown',
                  foreignBookId: `abs:${item.id}`,
                  asin: meta.asin,
                  openLibraryId: `abs:${item.id}`,
                  coverUrl,
                  year: meta.publishedYear
                    ? parseInt(meta.publishedYear, 10)
                    : undefined,
                  publisher: meta.publisher,
                  status: MediaStatus.AVAILABLE,
                  libraryServerUrl: itemUrl,
                });
                await audiobookRepo.save(newMedia);
                this.newAudiobooks++;
              }
            } catch {
              // Skip duplicates
            }
          }
        }
      }

      logger.info(
        `Audiobookshelf scan complete: ${this.newBooks} new books, ${this.newAudiobooks} new audiobooks, ${this.updatedItems} updated out of ${this.totalSize} items`,
        { label: 'Audiobookshelf Scan' }
      );
    } catch (e) {
      logger.error('Audiobookshelf scan failed', {
        label: 'Audiobookshelf Scan',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }
}

export const audiobookshelfScanner = new AudiobookshelfScanner();
