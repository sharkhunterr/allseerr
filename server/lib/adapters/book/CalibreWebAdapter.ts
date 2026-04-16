import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface CalibreWebConfig {
  hostname: string;
  port: number;
  apiKey?: string;
  useSsl: boolean;
  baseUrl?: string;
  username?: string;
  password?: string;
}

/**
 * Calibre-Web adapter — uses OPDS search and AJAX API.
 */
export class CalibreWebAdapter
  extends ExternalAPI
  implements BookLibraryAdapter
{
  readonly mediaTypes = [MediaType.BOOK];
  readonly name = 'Calibre-Web';

  constructor(config: CalibreWebConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}`;

    const headers: Record<string, unknown> = {};
    if (config.username && config.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    }

    super(baseUrl, {}, { headers });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/opds');
      if (
        response.status === 200 &&
        (response.headers['content-type']?.includes('xml') ||
          response.headers['content-type']?.includes('atom'))
      ) {
        return { success: true, message: 'Connected to Calibre-Web' };
      }
      return {
        success: false,
        message: 'Calibre-Web returned unexpected response format',
      };
    } catch (e) {
      return {
        success: false,
        message: `Calibre-Web connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      const response = await this.axios.get(`/ajax/book/${externalId}`);
      if (response.data?.title) {
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL}/book/${externalId}`,
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    // Calibre-Web doesn't have a scan trigger — it reads the Calibre DB directly
    logger.debug('Calibre-Web scan trigger is a no-op (reads Calibre DB directly)', {
      label: 'calibre-web',
    });
  }

  async searchByISBN(isbn: string): Promise<BookSearchResult | null> {
    try {
      const response = await this.axios.get('/opds/search', {
        params: { query: `isbn:${isbn}` },
      });
      return this.parseOpdsFirstResult(response.data);
    } catch (e) {
      logger.warn('Calibre-Web ISBN search failed', {
        label: 'calibre-web',
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
      const response = await this.axios.get('/opds/search', {
        params: { query: `${title} ${author}` },
      });
      const result = this.parseOpdsFirstResult(response.data);
      return result ? [result] : [];
    } catch {
      return [];
    }
  }

  /**
   * Parse the first entry from OPDS Atom XML response.
   * Simple extraction — real implementation would use an XML parser.
   */
  private parseOpdsFirstResult(
    data: string
  ): BookSearchResult | null {
    if (!data || typeof data !== 'string') return null;

    // Basic XML extraction for title and author
    const titleMatch = data.match(/<title>([^<]+)<\/title>/);
    const authorMatch = data.match(/<author>\s*<name>([^<]+)<\/name>/);
    const idMatch = data.match(/<id>([^<]+)<\/id>/);

    if (titleMatch && idMatch) {
      return {
        foreignBookId: idMatch[1],
        title: titleMatch[1],
        authorName: authorMatch?.[1] ?? 'Unknown',
      };
    }

    return null;
  }
}

export default CalibreWebAdapter;
