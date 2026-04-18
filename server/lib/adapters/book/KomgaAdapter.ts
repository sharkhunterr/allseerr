import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface KomgaConfig {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

interface KomgaBookMetadata {
  title: string;
  summary?: string;
  isbn?: string;
  authors?: { name: string; role?: string }[];
  publisher?: string;
  releaseDate?: string;
}

interface KomgaBook {
  id: string;
  name: string;
  url?: string;
  seriesId?: string;
  metadata: KomgaBookMetadata;
  media?: { pagesCount?: number };
}

interface KomgaPage<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
}

interface KomgaLibrary {
  id: string;
  name: string;
  root: string;
}

/**
 * Komga adapter for ebook/comic library management.
 * Auth via X-API-Key header.
 * https://komga.org/docs/openapi/komga-api/
 */
export class KomgaAdapter
  extends ExternalAPI
  implements BookLibraryAdapter
{
  readonly mediaTypes = [MediaType.BOOK];
  readonly name = 'Komga';

  constructor(config: KomgaConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}`;

    super(
      baseUrl,
      {},
      {
        headers: { 'X-API-Key': config.apiKey },
      }
    );
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/api/v2/users/me');
      return {
        success: response.status === 200 && !!response.data,
        message: 'Connected to Komga',
      };
    } catch (e) {
      return {
        success: false,
        message: `Komga connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      // externalId can be ISBN or book id
      const result = await this.searchByISBN(externalId);
      if (result) {
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL}/book/${result.foreignBookId}`,
        };
      }
      return { available: false };
    } catch (e) {
      logger.warn('Komga availability check failed', {
        label: 'komga',
        error: e instanceof Error ? e.message : String(e),
      });
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    const libraries = await this.getLibrariesList();
    for (const lib of libraries) {
      try {
        await this.axios.post(`/api/v1/libraries/${lib.id}/scan`);
      } catch (e) {
        logger.warn(`Komga scan failed for library ${lib.name}`, {
          label: 'komga',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  async searchByISBN(isbn: string): Promise<BookSearchResult | null> {
    try {
      const response = await this.axios.get<KomgaPage<KomgaBook>>(
        '/api/v1/books',
        {
          params: { search: isbn, size: 5 },
        }
      );
      const match = response.data.content.find(
        (b) => b.metadata?.isbn === isbn
      );
      if (!match) return null;
      return this.toSearchResult(match);
    } catch (e) {
      logger.warn('Komga searchByISBN failed', {
        label: 'komga',
        isbn,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  async searchByTitleAuthor(
    title: string,
    author: string
  ): Promise<BookSearchResult[]> {
    try {
      const query = `${title} ${author}`.trim();
      const response = await this.axios.get<KomgaPage<KomgaBook>>(
        '/api/v1/books',
        {
          params: { search: query, size: 10 },
        }
      );
      return response.data.content
        .filter((b) =>
          b.metadata?.authors?.some((a) =>
            a.name.toLowerCase().includes(author.toLowerCase())
          )
        )
        .slice(0, 5)
        .map((b) => this.toSearchResult(b));
    } catch (e) {
      logger.warn('Komga searchByTitleAuthor failed', {
        label: 'komga',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  async getLibrariesList(): Promise<
    Array<{ id: string; name: string; mediaType: string }>
  > {
    const response = await this.axios.get<KomgaLibrary[]>(
      '/api/v1/libraries'
    );
    return (response.data ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      mediaType: 'book',
    }));
  }

  async getLibraryBooks(
    libraryId: string,
    page = 0,
    size = 200
  ): Promise<{ books: KomgaBook[]; hasMore: boolean; total: number }> {
    const response = await this.axios.get<KomgaPage<KomgaBook>>(
      '/api/v1/books',
      {
        params: { library_id: libraryId, page, size },
      }
    );
    const data = response.data;
    return {
      books: data.content ?? [],
      hasMore: data.number + 1 < data.totalPages,
      total: data.totalElements,
    };
  }

  private toSearchResult(b: KomgaBook): BookSearchResult {
    const author =
      b.metadata?.authors?.find((a) => !a.role || a.role === 'writer')?.name ??
      b.metadata?.authors?.[0]?.name ??
      'Unknown';
    const year = b.metadata?.releaseDate
      ? parseInt(b.metadata.releaseDate.slice(0, 4), 10)
      : undefined;
    return {
      foreignBookId: b.id,
      title: b.metadata?.title ?? b.name,
      authorName: author,
      isbn13: b.metadata?.isbn,
      coverUrl: `${this.axios.defaults.baseURL}/api/v1/books/${b.id}/thumbnail`,
      year,
      publisher: b.metadata?.publisher,
    };
  }
}

export default KomgaAdapter;
