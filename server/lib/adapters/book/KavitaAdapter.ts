import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  BookLibraryAdapter,
  BookSearchResult,
  ConnectionTestResult,
} from '@server/lib/adapters/interfaces';
import logger from '@server/logger';

interface KavitaConfig {
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
}

/**
 * Kavita adapter — JWT auth via Plugin/authenticate endpoint.
 */
export class KavitaAdapter extends ExternalAPI implements BookLibraryAdapter {
  readonly mediaTypes = [MediaType.BOOK];
  readonly name = 'Kavita';

  private apiKey: string;
  private cachedJwt?: string;

  constructor(config: KavitaConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}/api`;

    super(baseUrl, {}, {});
    this.apiKey = config.apiKey;
  }

  private async authenticate(): Promise<string> {
    if (this.cachedJwt) return this.cachedJwt;

    const response = await this.axios.post(
      `/Plugin/authenticate?apiKey=${this.apiKey}&pluginName=Allseerr`
    );
    this.cachedJwt = response.data.token;
    this.axios.defaults.headers.common['Authorization'] =
      `Bearer ${this.cachedJwt}`;
    return this.cachedJwt!;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      await this.authenticate();
      const response = await this.axios.get('/Server/server-info');
      return {
        success: true,
        message: `Connected to Kavita v${response.data.kavitaVersion}`,
      };
    } catch (e) {
      this.cachedJwt = undefined;
      return {
        success: false,
        message: `Kavita connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      await this.authenticate();
      const results = await this.axios.get('/Series/search', {
        params: { queryString: externalId },
      });
      if (results.data?.series?.length > 0) {
        const series = results.data.series[0];
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL?.replace('/api', '')}/library/${series.libraryId}/series/${series.id}`,
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    await this.authenticate();
    await this.axios.post('/Library/scan');
  }

  async searchByISBN(isbn: string): Promise<BookSearchResult | null> {
    try {
      await this.authenticate();
      const response = await this.axios.get('/Series/search', {
        params: { queryString: isbn },
      });
      const series = response.data?.series;
      if (series?.length > 0) {
        const meta = await this.axios.get(
          `/Series/${series[0].id}/metadata`
        );
        if (
          meta.data?.isbn === isbn ||
          meta.data?.isbn13 === isbn
        ) {
          return this.mapSeries(series[0], meta.data);
        }
      }
    } catch (e) {
      logger.warn('Kavita ISBN search failed', {
        label: 'kavita',
        isbn,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  }

  async searchByTitleAuthor(
    title: string,
    author: string
  ): Promise<BookSearchResult[]> {
    try {
      await this.authenticate();
      const response = await this.axios.get('/Series/search', {
        params: { queryString: `${title} ${author}` },
      });
      const results: BookSearchResult[] = [];
      for (const s of response.data?.series ?? []) {
        results.push({
          foreignBookId: String(s.id),
          title: s.name,
          authorName: author,
          coverUrl: s.coverImage
            ? `${this.axios.defaults.baseURL}/image/series-cover?seriesId=${s.id}`
            : undefined,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private mapSeries(
    series: { id: number; name: string; coverImage?: string },
    metadata: { isbn?: string; isbn13?: string; publishers?: string[] }
  ): BookSearchResult {
    return {
      foreignBookId: String(series.id),
      title: series.name,
      authorName: 'Unknown',
      isbn13: metadata.isbn13,
      isbn10: metadata.isbn,
      coverUrl: series.coverImage
        ? `${this.axios.defaults.baseURL}/image/series-cover?seriesId=${series.id}`
        : undefined,
      publisher: metadata.publishers?.[0],
    };
  }
}

export default KavitaAdapter;
