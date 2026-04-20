import logger from '@server/logger';
import axios from 'axios';

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';

export interface GoogleBookVolume {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    authors?: string[];
    publisher?: string;
    publishedDate?: string;
    description?: string;
    pageCount?: number;
    categories?: string[];
    language?: string;
    industryIdentifiers?: { type: string; identifier: string }[];
    imageLinks?: {
      thumbnail?: string;
      smallThumbnail?: string;
      large?: string;
      extraLarge?: string;
    };
  };
}

export interface GoogleBooksSearchResponse {
  totalItems: number;
  items?: GoogleBookVolume[];
}

export interface GoogleBookResult {
  googleBookId: string;
  title: string;
  authorName: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  pageCount?: number;
  subjects?: string[];
  description?: string;
  language?: string;
}

/**
 * Google Books API client — public v1 REST API. An API key is optional
 * (unauthenticated calls are rate-limited) and can be set in settings.
 */
class GoogleBooksAPI {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || undefined;
  }

  async search(
    query: string,
    page = 1,
    limit = 20
  ): Promise<{ results: GoogleBookResult[]; totalResults: number }> {
    try {
      const startIndex = Math.max(0, (page - 1) * limit);
      const response = await axios.get<GoogleBooksSearchResponse>(
        `${GOOGLE_BOOKS_BASE}/volumes`,
        {
          params: {
            q: query,
            maxResults: Math.min(limit, 40),
            startIndex,
            printType: 'books',
            ...(this.apiKey ? { key: this.apiKey } : {}),
          },
          timeout: 10000,
        }
      );
      const results = (response.data.items ?? []).map((v) =>
        this.mapVolume(v)
      );
      return { results, totalResults: response.data.totalItems ?? 0 };
    } catch (e) {
      logger.error('Google Books search failed', {
        label: 'googlebooks',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(
        `Google Books search failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  private mapVolume(v: GoogleBookVolume): GoogleBookResult {
    const info = v.volumeInfo ?? {};
    const isbns = info.industryIdentifiers ?? [];
    const isbn13 = isbns.find((i) => i.type === 'ISBN_13')?.identifier;
    const isbn10 = isbns.find((i) => i.type === 'ISBN_10')?.identifier;
    const cover =
      info.imageLinks?.extraLarge ||
      info.imageLinks?.large ||
      info.imageLinks?.thumbnail ||
      info.imageLinks?.smallThumbnail;
    // Google returns '2013-01-01' or '2013' or '2013-03'
    const year = info.publishedDate
      ? parseInt(info.publishedDate.slice(0, 4), 10) || undefined
      : undefined;
    return {
      googleBookId: v.id,
      title: info.title ?? 'Unknown title',
      authorName: info.authors?.[0] ?? 'Unknown Author',
      isbn13,
      isbn10,
      coverUrl: cover?.replace(/^http:/, 'https:'),
      year,
      publisher: info.publisher,
      pageCount: info.pageCount,
      subjects: info.categories?.slice(0, 10),
      description: info.description,
      language: info.language,
    };
  }
}

export default GoogleBooksAPI;
