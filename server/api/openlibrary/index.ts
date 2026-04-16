import logger from '@server/logger';
import axios from 'axios';

const OPENLIBRARY_BASE = 'https://openlibrary.org';

export interface OpenLibrarySearchResult {
  key: string;
  title: string;
  author_name?: string[];
  isbn?: string[];
  first_publish_year?: number;
  publisher?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  docs: OpenLibrarySearchResult[];
}

export interface OpenLibraryWork {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
}

export interface BookResult {
  openLibraryId: string;
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  pageCount?: number;
  subjects?: string[];
}

/**
 * OpenLibrary API client following the Libreseerr pattern.
 * Used as the sole user-facing search source for books and audiobooks.
 */
class OpenLibraryAPI {
  /**
   * Search for books by free-text query (title, author, or ISBN).
   */
  async search(
    query: string,
    page = 1,
    limit = 20
  ): Promise<{ results: BookResult[]; totalResults: number }> {
    try {
      const response = await axios.get<OpenLibrarySearchResponse>(
        `${OPENLIBRARY_BASE}/search.json`,
        {
          params: {
            q: query,
            page,
            limit,
            fields:
              'key,title,author_name,isbn,first_publish_year,publisher,cover_i,number_of_pages_median,subject',
          },
          timeout: 10000,
        }
      );

      const results = response.data.docs.map((doc) =>
        this.mapSearchResult(doc)
      );

      return {
        results,
        totalResults: response.data.numFound,
      };
    } catch (e) {
      logger.error('OpenLibrary search failed', {
        label: 'openlibrary',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(
        `OpenLibrary search failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  /**
   * Search by ISBN specifically.
   */
  async searchByISBN(isbn: string): Promise<BookResult | null> {
    try {
      const response = await axios.get<OpenLibrarySearchResponse>(
        `${OPENLIBRARY_BASE}/search.json`,
        {
          params: {
            isbn,
            fields:
              'key,title,author_name,isbn,first_publish_year,publisher,cover_i,number_of_pages_median',
            limit: 1,
          },
          timeout: 10000,
        }
      );

      if (response.data.docs.length === 0) {
        return null;
      }

      return this.mapSearchResult(response.data.docs[0]);
    } catch (e) {
      logger.error('OpenLibrary ISBN search failed', {
        label: 'openlibrary',
        isbn,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Get work details by OpenLibrary work key (e.g., /works/OL12345W).
   */
  async getWork(workKey: string): Promise<OpenLibraryWork | null> {
    try {
      const response = await axios.get<OpenLibraryWork>(
        `${OPENLIBRARY_BASE}${workKey}.json`,
        { timeout: 10000 }
      );
      return response.data;
    } catch (e) {
      logger.error('OpenLibrary work fetch failed', {
        label: 'openlibrary',
        workKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private mapSearchResult(doc: OpenLibrarySearchResult): BookResult {
    const isbns = doc.isbn ?? [];
    const isbn13 = isbns.find((i) => i.length === 13);
    const isbn10 = isbns.find((i) => i.length === 10);

    return {
      openLibraryId: doc.key,
      title: doc.title,
      authorName: doc.author_name?.[0] ?? 'Unknown Author',
      isbn13,
      isbn10,
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined,
      year: doc.first_publish_year,
      publisher: doc.publisher?.[0],
      pageCount: doc.number_of_pages_median,
      subjects: doc.subject?.slice(0, 10),
    };
  }
}

export default OpenLibraryAPI;
