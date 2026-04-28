import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

interface MylarConfig {
  url: string;
  apiKey: string;
}

export interface MylarComicSummary {
  comicId: string;
  comicName: string;
  status?: string;
  totalIssues?: number;
  haveIssues?: number;
  comicImage?: string;
  comicYear?: string;
}

interface MylarEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Mylar3 client.
 *
 * The Mylar3 API is REST-shaped, single-endpoint:
 *   GET  /api?apikey=<key>&cmd=<command>&<args>
 *
 * (Same conceptual shape as SABnzbd or NZBGet.) The `cmd` query
 * param drives which operation runs; arguments are appended as
 * extra query params. Responses are JSON when the `cmd` is one of
 * the documented JSON-returning commands; some commands return
 * plain text "OK" / "ERROR".
 *
 * The integration unit on the allseerr side is the *volume* (a
 * series — ComicVine id), which lines up neatly with Mylar3's
 * `addComic` command (it takes a ComicVine id).
 */
class MylarAPI {
  private config: MylarConfig;
  private http: AxiosInstance;

  constructor(config: MylarConfig) {
    if (!config.url) {
      throw new Error('Mylar URL is required.');
    }
    if (!config.apiKey) {
      throw new Error('Mylar API key is required.');
    }
    this.config = config;
    this.http = axios.create({
      baseURL: config.url.replace(/\/$/, ''),
      timeout: 15000,
    });
  }

  /**
   * Issue a single Mylar `cmd`. Mylar is permissive about response
   * shape — some commands return JSON envelopes, others plain text
   * ("OK" / "ERROR"). We normalise both into MylarEnvelope.
   */
  private async cmd<T = unknown>(
    command: string,
    extra: Record<string, string | number | undefined> = {}
  ): Promise<MylarEnvelope<T>> {
    const params: Record<string, string | number> = {
      apikey: this.config.apiKey,
      cmd: command,
    };
    for (const [k, v] of Object.entries(extra)) {
      if (v !== undefined) params[k] = v;
    }

    const response = await this.http.get('/api', { params });
    const body = response.data;

    if (typeof body === 'string') {
      // Plain-text response — "OK" / "Error: …"
      const trimmed = body.trim();
      if (/^ok$/i.test(trimmed)) {
        return { success: true };
      }
      return { success: false, error: trimmed };
    }

    if (body && typeof body === 'object') {
      const env = body as MylarEnvelope<T>;
      if (typeof env.success === 'boolean') {
        return env;
      }
      // Some Mylar commands return the data object directly without
      // wrapping it. Treat any non-null object as success.
      return { success: true, data: body as T };
    }

    return { success: false, error: 'Unexpected Mylar response shape.' };
  }

  /**
   * Quick handshake — used by the Settings → Test button. `getIndex`
   * is the cheapest universally-available command.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const env = await this.cmd<unknown>('getIndex');
      if (env.success) {
        return { success: true, message: 'Connected to Mylar.' };
      }
      return {
        success: false,
        message: env.error ?? 'Mylar rejected the request.',
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn('Mylar test connection failed', {
        label: 'mylar',
        error: message,
      });
      return { success: false, message };
    }
  }

  /**
   * Add a comic series to Mylar by ComicVine volume id. This is the
   * trigger that makes Mylar start monitoring + downloading new
   * issues for the series.
   */
  async addComic(comicVineId: number): Promise<boolean> {
    try {
      const env = await this.cmd('addComic', { id: comicVineId });
      return env.success;
    } catch (e) {
      logger.error('Mylar addComic failed', {
        label: 'mylar',
        comicVineId,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  /**
   * Get a single series from Mylar by ComicVine id. Used to surface
   * progress / availability — `haveIssues / totalIssues` is what the
   * scanner promotes to AVAILABLE when complete.
   */
  async getComic(comicVineId: number): Promise<MylarComicSummary | null> {
    try {
      const env = await this.cmd<{ comic?: MylarComicSummary }>('getComic', {
        id: comicVineId,
      });
      if (!env.success) return null;
      return env.data?.comic ?? null;
    } catch (e) {
      logger.warn('Mylar getComic failed', {
        label: 'mylar',
        comicVineId,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Force a refresh of a series in Mylar — checks for new issues
   * and queues anything missing.
   */
  async refreshComic(comicVineId: number): Promise<boolean> {
    try {
      const env = await this.cmd('refreshComic', { id: comicVineId });
      return env.success;
    } catch (e) {
      logger.warn('Mylar refreshComic failed', {
        label: 'mylar',
        comicVineId,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }
}

export default MylarAPI;
