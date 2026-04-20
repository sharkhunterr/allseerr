import logger from '@server/logger';
import axios from 'axios';

const OPENLIBRARY_BASE = 'https://openlibrary.org';

export interface OpenLibrarySearchResult {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
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
  series?: Array<{
    series: { key: string };
    position?: string;
  }>;
}

export interface OpenLibrarySeries {
  key: string; // e.g. "OL326110L"
  name: string;
  description?: string;
  seedCount: number;
}

export interface OpenLibrarySeriesMember {
  workKey: string; // e.g. "OL82563W"
  title: string;
  coverUrl?: string;
}

export interface BookResult {
  openLibraryId: string;
  title: string;
  authorName: string;
  authorKey?: string;
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
              'key,title,author_name,author_key,isbn,first_publish_year,publisher,cover_i,number_of_pages_median,subject',
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
              'key,title,author_name,author_key,isbn,first_publish_year,publisher,cover_i,number_of_pages_median',
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

  /**
   * Fetch metadata for an OpenLibrary series (e.g. "OL326110L" or
   * "/series/OL326110L").
   */
  async getSeries(seriesKey: string): Promise<OpenLibrarySeries | null> {
    const key = seriesKey.replace(/^\/series\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        name?: string;
        description?: string | { value: string };
        seed_count?: number;
      }>(`${OPENLIBRARY_BASE}/series/${key}.json`, { timeout: 10000 });
      return {
        key,
        name: response.data.name ?? key,
        description:
          typeof response.data.description === 'string'
            ? response.data.description
            : response.data.description?.value,
        seedCount: response.data.seed_count ?? 0,
      };
    } catch (e) {
      logger.error('OpenLibrary series fetch failed', {
        label: 'openlibrary',
        seriesKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * List the works that belong to an OpenLibrary series.
   */
  async getSeriesMembers(
    seriesKey: string
  ): Promise<OpenLibrarySeriesMember[]> {
    const key = seriesKey.replace(/^\/series\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        entries?: {
          url: string;
          type: string;
          title: string;
          picture?: { url?: string };
        }[];
      }>(`${OPENLIBRARY_BASE}/series/${key}/seeds.json`, { timeout: 10000 });
      return (response.data.entries ?? [])
        .filter((e) => e.type === 'work' && e.url.startsWith('/works/'))
        .map((e) => ({
          workKey: e.url.replace('/works/', ''),
          title: e.title,
          coverUrl: e.picture?.url
            ? e.picture.url.startsWith('//')
              ? `https:${e.picture.url.replace('-S.jpg', '-L.jpg')}`
              : e.picture.url
            : undefined,
        }));
    } catch (e) {
      logger.error('OpenLibrary series seeds fetch failed', {
        label: 'openlibrary',
        seriesKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Fetch editions for a work and pull a representative ISBN-13 / ISBN-10.
   * OpenLibrary work objects don't carry ISBNs (those live on editions),
   * so callers needing ISBN for downstream services must call this.
   */
  async getWorkIsbns(
    workKey: string
  ): Promise<{ isbn13?: string; isbn10?: string }> {
    const key = workKey.replace(/^\/works\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        entries?: { isbn_13?: string[]; isbn_10?: string[] }[];
      }>(`${OPENLIBRARY_BASE}/works/${key}/editions.json`, {
        params: { limit: 20 },
        timeout: 10000,
      });
      const entries = response.data.entries ?? [];
      const isbn13 = entries
        .flatMap((e) => e.isbn_13 ?? [])
        .find((v) => /^[0-9]{13}$/.test(v));
      const isbn10 = entries
        .flatMap((e) => e.isbn_10 ?? [])
        .find((v) => /^[0-9Xx]{10}$/.test(v));
      return { isbn13, isbn10 };
    } catch (e) {
      logger.error('OpenLibrary editions fetch failed', {
        label: 'openlibrary',
        workKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return {};
    }
  }

  /**
   * Get author name by OpenLibrary author key (e.g., "OL12345A" or
   * "/authors/OL12345A").
   */
  async getAuthorName(authorKey: string): Promise<string | null> {
    const path = authorKey.startsWith('/')
      ? authorKey
      : `/authors/${authorKey}`;
    try {
      const response = await axios.get<{ name?: string }>(
        `${OPENLIBRARY_BASE}${path}.json`,
        { timeout: 10000 }
      );
      return response.data.name ?? null;
    } catch (e) {
      logger.error('OpenLibrary author fetch failed', {
        label: 'openlibrary',
        authorKey,
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
      authorKey: doc.author_key?.[0],
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
