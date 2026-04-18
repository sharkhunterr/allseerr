import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

interface GrimmoryConfig {
  hostname: string;
  port: number;
  useSsl: boolean;
  email: string;
  password: string;
  baseUrl?: string;
}

interface GrimmoryAuthor {
  name: string;
}

interface GrimmoryBook {
  id: string | number;
  title: string;
  subtitle?: string;
  authors?: GrimmoryAuthor[];
  authorNames?: string[];
  isbn?: string;
  isbn10?: string;
  isbn13?: string;
  publisher?: string;
  publishedYear?: number;
  publishedDate?: string;
  coverUrl?: string;
  libraryId?: string | number;
}

interface GrimmoryPage<T> {
  content?: T[];
  items?: T[];
  data?: T[];
  totalElements?: number;
  total?: number;
  number?: number;
  page?: number;
  totalPages?: number;
}

interface GrimmoryLibrary {
  id: string | number;
  name: string;
}

/**
 * Grimmory adapter for ebook/book library management.
 * Auth via JWT (email + password) with automatic refresh.
 * https://github.com/bannert1337/grimmory-mcp (derived from live API usage)
 */
export class GrimmoryAdapter implements BookLibraryAdapter {
  readonly mediaTypes = [MediaType.BOOK];
  readonly name = 'Grimmory';

  private axios: AxiosInstance;
  private config: GrimmoryConfig;
  private accessToken?: string;
  private refreshToken?: string;
  private tokenExpiresAt = 0;

  constructor(config: GrimmoryConfig) {
    this.config = config;
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}`;
    this.axios = axios.create({ baseURL: baseUrl, timeout: 15000 });
  }

  private async authenticate(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30_000) return;

    if (this.refreshToken && Date.now() < this.tokenExpiresAt + 300_000) {
      try {
        const refreshResponse = await this.axios.post('/api/auth/refresh', {
          refreshToken: this.refreshToken,
        });
        this.accessToken = refreshResponse.data?.accessToken;
        this.refreshToken = refreshResponse.data?.refreshToken;
        this.tokenExpiresAt = Date.now() + 15 * 60 * 1000;
        return;
      } catch {
        // fall through to fresh login
      }
    }

    const response = await this.axios.post('/api/auth/login', {
      username: this.config.email,
      password: this.config.password,
    });
    this.accessToken = response.data?.accessToken;
    this.refreshToken = response.data?.refreshToken;
    this.tokenExpiresAt = Date.now() + 15 * 60 * 1000;
  }

  private async request<T = unknown>(
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    options: { params?: Record<string, unknown>; data?: unknown } = {}
  ): Promise<T> {
    await this.authenticate();
    const response = await this.axios.request<T>({
      method,
      url: path,
      params: options.params,
      data: options.data,
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    return response.data;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.authenticate();
      return { success: true, message: 'Connected to Grimmory' };
    } catch (e) {
      return {
        success: false,
        message: `Grimmory connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      const result = await this.searchByISBN(externalId);
      if (result) {
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL}/book/${result.foreignBookId}`,
        };
      }
      return { available: false };
    } catch (e) {
      logger.warn('Grimmory availability check failed', {
        label: 'grimmory',
        error: e instanceof Error ? e.message : String(e),
      });
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    // Grimmory exposes library-wide scan through its libraries endpoint.
    try {
      const libraries = await this.getLibrariesList();
      for (const lib of libraries) {
        try {
          await this.request('post', `/api/v1/libraries/${lib.id}/scan`);
        } catch {
          // ignore per-library failures
        }
      }
    } catch (e) {
      logger.warn('Grimmory library scan failed', {
        label: 'grimmory',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async searchByISBN(isbn: string): Promise<BookSearchResult | null> {
    try {
      const data = await this.request<GrimmoryPage<GrimmoryBook>>(
        'get',
        '/api/v1/books',
        { params: { isbn, size: 5 } }
      );
      const books = data.content ?? data.items ?? data.data ?? [];
      const match = books.find(
        (b) => b.isbn === isbn || b.isbn13 === isbn || b.isbn10 === isbn
      );
      return match ? this.toSearchResult(match) : null;
    } catch (e) {
      logger.warn('Grimmory searchByISBN failed', {
        label: 'grimmory',
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
      const data = await this.request<GrimmoryPage<GrimmoryBook>>(
        'get',
        '/api/v1/books',
        { params: { search: `${title} ${author}`.trim(), size: 10 } }
      );
      const books = data.content ?? data.items ?? data.data ?? [];
      return books.slice(0, 5).map((b) => this.toSearchResult(b));
    } catch (e) {
      logger.warn('Grimmory searchByTitleAuthor failed', {
        label: 'grimmory',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  async getLibrariesList(): Promise<
    Array<{ id: string; name: string; mediaType: string }>
  > {
    const data = await this.request<GrimmoryPage<GrimmoryLibrary>>(
      'get',
      '/api/v1/libraries'
    );
    const libs = data.content ?? data.items ?? data.data ?? [];
    return libs.map((l) => ({
      id: String(l.id),
      name: l.name,
      mediaType: 'book',
    }));
  }

  async getLibraryBooks(
    libraryId: string,
    page = 0,
    size = 200
  ): Promise<{ books: GrimmoryBook[]; hasMore: boolean; total: number }> {
    const data = await this.request<GrimmoryPage<GrimmoryBook>>(
      'get',
      '/api/v1/books',
      { params: { library_id: libraryId, page, size } }
    );
    const books = data.content ?? data.items ?? data.data ?? [];
    const totalPages = data.totalPages ?? Math.ceil((data.total ?? 0) / size);
    return {
      books,
      hasMore: (data.number ?? data.page ?? page) + 1 < totalPages,
      total: data.totalElements ?? data.total ?? books.length,
    };
  }

  private toSearchResult(b: GrimmoryBook): BookSearchResult {
    const author =
      b.authors?.[0]?.name ?? b.authorNames?.[0] ?? 'Unknown';
    const year =
      b.publishedYear ??
      (b.publishedDate
        ? parseInt(b.publishedDate.slice(0, 4), 10)
        : undefined);
    return {
      foreignBookId: String(b.id),
      title: b.title,
      authorName: author,
      isbn13: b.isbn13 ?? b.isbn,
      isbn10: b.isbn10,
      coverUrl: b.coverUrl,
      year,
      publisher: b.publisher,
    };
  }
}

export default GrimmoryAdapter;
