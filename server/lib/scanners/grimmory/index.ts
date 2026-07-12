import { MediaStatus } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookMedia } from '@server/entity/BookMedia';
import { GrimmoryAdapter } from '@server/lib/adapters/book/GrimmoryAdapter';
import type { StatusBase } from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface GrimmorySyncStatus extends StatusBase {
  newBooks: number;
  updatedBooks: number;
}

const PAGE_SIZE = 200;

class GrimmoryScanner {
  private running = false;
  private progress = 0;
  private totalSize = 0;
  private newBooks = 0;
  private updatedBooks = 0;

  public status(): GrimmorySyncStatus {
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
      logger.warn('Grimmory scan already running', {
        label: 'Grimmory Scan',
      });
      return;
    }

    const settings = getSettings();
    const grimmory = settings.book.grimmory;

    if (!grimmory.enabled || !grimmory.url) {
      logger.debug('Grimmory scan skipped: not configured or disabled', {
        label: 'Grimmory Scan',
      });
      return;
    }

    this.running = true;
    this.progress = 0;
    this.totalSize = 0;
    this.newBooks = 0;
    this.updatedBooks = 0;

    try {
      const parsedUrl = new URL(grimmory.url);
      const adapter = new GrimmoryAdapter({
        hostname: parsedUrl.hostname,
        port:
          parseInt(parsedUrl.port) ||
          (parsedUrl.protocol === 'https:' ? 443 : 80),
        useSsl: parsedUrl.protocol === 'https:',
        username: grimmory.username,
        password: grimmory.password,
      });

      const publicBase = grimmory.publicUrl || grimmory.url;
      logger.info('Starting Grimmory scan', { label: 'Grimmory Scan' });

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
            if (!book.title) continue;

            const itemUrl = `${publicBase}/book/${book.id}`;
            const foreignId = `grimmory:${book.id}`;
            const isbn = book.isbn13 ?? book.isbn;

            let existing: BookMedia | null = null;
            if (isbn) {
              existing = await bookRepo.findOne({
                where: [{ isbn13: isbn }, { isbn10: isbn }],
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
                if (book.coverUrl && !existing.coverUrl) {
                  existing.coverUrl = book.coverUrl;
                }
                await bookRepo.save(existing);
                this.updatedBooks++;
              }
            } else {
              try {
                const newMedia = new BookMedia({
                  title: book.title,
                  authorName:
                    book.authors?.[0]?.name ??
                    book.authorNames?.[0] ??
                    'Unknown',
                  foreignBookId: foreignId,
                  openLibraryId: foreignId,
                  isbn13: book.isbn13 ?? book.isbn,
                  isbn10: book.isbn10,
                  coverUrl: book.coverUrl,
                  year:
                    book.publishedYear ??
                    (book.publishedDate
                      ? parseInt(book.publishedDate.slice(0, 4), 10)
                      : undefined),
                  publisher: book.publisher,
                  status: MediaStatus.AVAILABLE,
                  libraryServerUrl: itemUrl,
                });
                await bookRepo.save(newMedia);
                this.newBooks++;
              } catch {
                // skip duplicates
              }
            }
          }
          page++;
        }
      }

      logger.info(
        `Grimmory scan complete: ${this.newBooks} new, ${this.updatedBooks} updated out of ${this.totalSize} books`,
        { label: 'Grimmory Scan' }
      );
    } catch (e) {
      logger.error('Grimmory scan failed', {
        label: 'Grimmory Scan',
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      this.running = false;
    }
  }
}

export const grimmoryScanner = new GrimmoryScanner();
