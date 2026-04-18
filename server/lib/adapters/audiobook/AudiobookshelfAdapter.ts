import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AudiobookSearchResult,
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface AudiobookshelfConfig {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

/**
 * Audiobookshelf adapter for audiobook library management.
 * Auth via Bearer token (API key).
 */
export class AudiobookshelfAdapter
  extends ExternalAPI
  implements BookLibraryAdapter
{
  readonly mediaTypes = [MediaType.AUDIOBOOK];
  readonly name = 'Audiobookshelf';

  constructor(config: AudiobookshelfConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}`;

    super(baseUrl, {}, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/api/ping');
      return {
        success: response.data?.success === true,
        message: response.data?.success
          ? 'Connected to Audiobookshelf'
          : 'Audiobookshelf ping returned unexpected response',
      };
    } catch (e) {
      return {
        success: false,
        message: `Audiobookshelf connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      // Search all libraries for the item
      const libraries = await this.getLibraries();
      for (const lib of libraries) {
        const results = await this.axios.get(
          `/api/libraries/${lib.id}/search`,
          { params: { q: externalId, limit: 5 } }
        );
        const match = results.data?.book?.find(
          (b: { libraryItem: { media: { metadata: { asin?: string; isbn?: string } } } }) =>
            b.libraryItem?.media?.metadata?.asin === externalId ||
            b.libraryItem?.media?.metadata?.isbn === externalId
        );
        if (match) {
          return {
            available: true,
            libraryUrl: `${this.axios.defaults.baseURL}/item/${match.libraryItem.id}`,
          };
        }
      }
      return { available: false };
    } catch (e) {
      logger.warn('Audiobookshelf availability check failed', {
        label: 'audiobookshelf',
        error: e instanceof Error ? e.message : String(e),
      });
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    const libraries = await this.getLibraries();
    for (const lib of libraries) {
      await this.axios.post(`/api/libraries/${lib.id}/scan`);
    }
  }

  async searchByISBN(isbn: string): Promise<BookSearchResult | null> {
    return this.searchLibraries(isbn);
  }

  async searchByTitleAuthor(
    title: string,
    author: string
  ): Promise<BookSearchResult[]> {
    const result = await this.searchLibraries(`${title} ${author}`);
    return result ? [result] : [];
  }

  private async searchLibraries(
    query: string
  ): Promise<BookSearchResult | null> {
    try {
      const libraries = await this.getLibraries();
      for (const lib of libraries) {
        const response = await this.axios.get(
          `/api/libraries/${lib.id}/search`,
          { params: { q: query, limit: 1 } }
        );
        const books = response.data?.book;
        if (books?.length > 0) {
          const item = books[0].libraryItem;
          const meta = item.media.metadata;
          return {
            foreignBookId: item.id,
            title: meta.title,
            authorName: meta.authorName || 'Unknown',
            isbn13: meta.isbn,
            coverUrl: item.media.coverPath
              ? `${this.axios.defaults.baseURL}/api/items/${item.id}/cover`
              : undefined,
            year: meta.publishedYear
              ? parseInt(meta.publishedYear, 10)
              : undefined,
            publisher: meta.publisher,
          };
        }
      }
    } catch (e) {
      logger.warn('Audiobookshelf search failed', {
        label: 'audiobookshelf',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }

  /**
   * Fetch all items from a specific library.
   */
  async getLibraryItems(
    libraryId: string,
    limit = 10000
  ): Promise<
    Array<{
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
    }>
  > {
    const response = await this.axios.get(
      `/api/libraries/${libraryId}/items`,
      { params: { limit } }
    );
    return response.data?.results ?? [];
  }

  /**
   * Public method to list libraries with their media type hint.
   * Audiobookshelf library types: 'book' (includes ebooks+audiobooks mixed),
   * 'podcast'. Use mediaType hint from library settings when available.
   */
  async getLibrariesList(): Promise<
    Array<{ id: string; name: string; mediaType: string }>
  > {
    const response = await this.axios.get('/api/libraries');
    const libraries: Array<{
      id: string;
      name: string;
      mediaType: string;
    }> = response.data?.libraries ?? [];
    return libraries.map((l) => ({
      id: l.id,
      name: l.name,
      mediaType: l.mediaType ?? 'book',
    }));
  }

  private async getLibraries(): Promise<
    Array<{ id: string; name: string }>
  > {
    const response = await this.axios.get('/api/libraries');
    return response.data?.libraries ?? [];
  }
}

export default AudiobookshelfAdapter;
