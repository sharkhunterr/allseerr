import type {
  BookLibraryAdapter,
  BookSearchResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

/**
 * Implements the Libreseerr ISBN cascade matching algorithm.
 * FR-039: ISBN first, then title+author free-text fallback.
 * FR-041: Same algorithm for ebooks and audiobooks.
 */
export class BookMatchingService {
  /**
   * Try to match a book against a library server using cascading strategy:
   * 1. ISBN-13 lookup
   * 2. ISBN-10 lookup
   * 3. ASIN lookup (audiobooks)
   * 4. Title + Author free-text fallback (first result, no fuzzy scoring)
   */
  async match(
    adapter: BookLibraryAdapter,
    book: {
      title: string;
      authorName: string;
      isbn13?: string | null;
      isbn10?: string | null;
      asin?: string | null;
    }
  ): Promise<BookSearchResult | null> {
    // Step 1: Try ISBN-13
    if (book.isbn13) {
      try {
        const result = await adapter.searchByISBN(book.isbn13);
        if (result) {
          logger.debug('Book matched by ISBN-13', {
            label: 'book-matching',
            isbn13: book.isbn13,
            title: book.title,
          });
          return result;
        }
      } catch (e) {
        logger.debug('ISBN-13 lookup failed (non-fatal)', {
          label: 'book-matching',
          isbn13: book.isbn13,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Step 2: Try ISBN-10
    if (book.isbn10) {
      try {
        const result = await adapter.searchByISBN(book.isbn10);
        if (result) {
          logger.debug('Book matched by ISBN-10', {
            label: 'book-matching',
            isbn10: book.isbn10,
            title: book.title,
          });
          return result;
        }
      } catch (e) {
        logger.debug('ISBN-10 lookup failed (non-fatal)', {
          label: 'book-matching',
          isbn10: book.isbn10,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Step 3: Try ASIN (audiobooks only)
    if (book.asin && 'searchByASIN' in adapter) {
      try {
        const audiobookAdapter = adapter as BookLibraryAdapter & {
          searchByASIN: (asin: string) => Promise<BookSearchResult | null>;
        };
        const result = await audiobookAdapter.searchByASIN(book.asin);
        if (result) {
          logger.debug('Book matched by ASIN', {
            label: 'book-matching',
            asin: book.asin,
            title: book.title,
          });
          return result;
        }
      } catch (e) {
        logger.debug('ASIN lookup failed (non-fatal)', {
          label: 'book-matching',
          asin: book.asin,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Step 4: Title + Author fallback (first result, no fuzzy scoring)
    try {
      const results = await adapter.searchByTitleAuthor(
        book.title,
        book.authorName
      );
      if (results.length > 0) {
        logger.debug('Book matched by title+author', {
          label: 'book-matching',
          title: book.title,
          authorName: book.authorName,
        });
        return results[0];
      }
    } catch (e) {
      logger.debug('Title+author lookup failed', {
        label: 'book-matching',
        title: book.title,
        error: e instanceof Error ? e.message : String(e),
      });
    }

    logger.debug('No match found for book', {
      label: 'book-matching',
      title: book.title,
      authorName: book.authorName,
    });
    return null;
  }
}

export default BookMatchingService;
