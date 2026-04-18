import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookMedia } from '@server/entity/BookMedia';
import { KomgaAdapter } from '@server/lib/adapters/book/KomgaAdapter';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface KomgaSyncStatus extends StatusBase {
  newBooks: number;
  updatedBooks: number;
}

const PAGE_SIZE = 200;

class KomgaScanner {
  private running = false;
  private progress = 0;
  private totalSize = 0;
  private newBooks = 0;
  private updatedBooks = 0;

  public status(): KomgaSyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.totalSize,
      newBooks: this.newBooks,
      updatedBooks: this.updatedBooks,
    };
  }

  public cancel(): void {
    this.running = false;
  }

  public async run(): Promise<void> {
    if (this.running) {
      logger.warn('Komga scan already running', { label: 'Komga Scan' });
      return;
    }

    const settings = getSettings();
    const komga = settings.book.komga;

    if (!komga.enabled || !komga.url) {
      logger.debug('Komga scan skipped: not configured or disabled', {
        label: 'Komga Scan',
      });
      return;
    }

    this.running = true;
    this.progress = 0;
    this.totalSize = 0;
    this.newBooks = 0;
    this.updatedBooks = 0;

    try {
      const parsedUrl = new URL(komga.url);
      const adapter = new KomgaAdapter({
        hostname: parsedUrl.hostname,
        port:
          parseInt(parsedUrl.port) ||
          (parsedUrl.protocol === 'https:' ? 443 : 80),
        apiKey: komga.apiKey,
        useSsl: parsedUrl.protocol === 'https:',
      });

      const publicBase = komga.publicUrl || komga.url;
      logger.info('Starting Komga scan', { label: 'Komga Scan' });

      const bookRepo = getRepository(BookMedia);
      const libraries = await adapter.getLibrariesList();

      for (const library of libraries) {
        if (!this.running) break;

        let page = 0;
        let hasMore = true;
        while (hasMore && this.running) {
          const result = await adapter.getLibraryBooks(
            library.id,
            page,
            PAGE_SIZE
          );
          hasMore = result.hasMore;
          this.totalSize = Math.max(this.totalSize, result.total);

          for (const book of result.books) {
            if (!this.running) break;
            this.progress++;

            const meta = book.metadata;
            if (!meta?.title) continue;

            const itemUrl = `${publicBase}/book/${book.id}`;
            const coverUrl = `${komga.url}/api/v1/books/${book.id}/thumbnail`;
            const foreignId = `komga:${book.id}`;

            let existing: BookMedia | null = null;
            if (meta.isbn) {
              existing = await bookRepo.findOne({
                where: [{ isbn13: meta.isbn }, { isbn10: meta.isbn }],
              });
            }
            if (!existing) {
              existing = await bookRepo.findOne({
                where: { foreignBookId: foreignId },
              });
            }

            if (existing) {
              if (
                existing.status !== MediaStatus.AVAILABLE ||
                existing.libraryServerUrl !== itemUrl
              ) {
                existing.status = MediaStatus.AVAILABLE;
                existing.libraryServerUrl = itemUrl;
                if (!existing.coverUrl) existing.coverUrl = coverUrl;
                await bookRepo.save(existing);
                this.updatedBooks++;
              }
            } else {
              try {
                const newMedia = new BookMedia({
                  title: meta.title,
                  authorName:
                    meta.authors?.[0]?.name ?? 'Unknown',
                  foreignBookId: foreignId,
                  openLibraryId: foreignId,
                  isbn13: meta.isbn,
                  coverUrl,
                  year: meta.releaseDate
                    ? parseInt(meta.releaseDate.slice(0, 4), 10)
                    : undefined,
                  publisher: meta.publisher,
                  status: MediaStatus.AVAILABLE,
                  libraryServerUrl: itemUrl,
                });
                await bookRepo.save(newMedia);
                this.newBooks++;
              } catch {
                // Skip duplicates
              }
            }
          }
          page++;
        }
      }

      logger.info(
        `Komga scan complete: ${this.newBooks} new, ${this.updatedBooks} updated out of ${this.totalSize} books`,
        { label: 'Komga Scan' }
      );
    } catch (e) {
      logger.error('Komga scan failed', {
        label: 'Komga Scan',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }
}

export const komgaScanner = new KomgaScanner();
