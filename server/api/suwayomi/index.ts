import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

interface SuwayomiConfig {
  url: string;
  apiKey?: string;
  username?: string;
  password?: string;
}

export interface SuwayomiSource {
  id: string;
  name: string;
  lang?: string;
  iconUrl?: string;
}

export interface SuwayomiSearchHit {
  id: number;
  title: string;
  thumbnailUrl?: string;
  url?: string;
  source?: SuwayomiSource;
}

export interface SuwayomiManga {
  id: number;
  title: string;
  thumbnailUrl?: string;
  url?: string;
  inLibrary?: boolean;
  source?: SuwayomiSource;
  chaptersDownloadedCount?: number;
  chaptersTotalCount?: number;
  status?: string;
}

/**
 * Suwayomi (Tachidesk) client.
 *
 * Suwayomi exposes a GraphQL endpoint at `/api/graphql` (newer
 * versions) and a REST endpoint at `/api/v1/...` (older versions).
 * We target the GraphQL API since it's the supported surface going
 * forward — it covers source search, manga lookup, library mutations
 * and chapter status all in a single round-trip-shaped query.
 *
 * Authentication: Suwayomi supports either basic auth (username +
 * password) or an API key passed via `Authorization: Token <key>`,
 * depending on the deployment. We honour both — apiKey wins when
 * both are provided.
 */
class SuwayomiAPI {
  private config: SuwayomiConfig;
  private http: AxiosInstance;

  constructor(config: SuwayomiConfig) {
    if (!config.url) {
      throw new Error('Suwayomi base URL is required.');
    }
    this.config = config;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (config.apiKey) {
      headers.Authorization = `Token ${config.apiKey}`;
    } else if (config.username && config.password) {
      const basic = Buffer.from(
        `${config.username}:${config.password}`
      ).toString('base64');
      headers.Authorization = `Basic ${basic}`;
    }

    this.http = axios.create({
      baseURL: config.url.replace(/\/$/, ''),
      headers,
      timeout: 15000,
    });
  }

  /**
   * Run a GraphQL operation against `/api/graphql`. Throws on
   * GraphQL-level errors (so the caller doesn't silently swallow a
   * bad query) but returns the raw `data` payload otherwise.
   */
  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.http.post('/api/graphql', {
      query,
      variables,
    });
    const body = response.data as { data?: T; errors?: Array<{ message: string }> };
    if (body.errors && body.errors.length > 0) {
      const message = body.errors.map((e) => e.message).join('; ');
      throw new Error(`Suwayomi GraphQL error: ${message}`);
    }
    if (!body.data) {
      throw new Error('Suwayomi GraphQL response missing data field.');
    }
    return body.data;
  }

  /**
   * Quick handshake — used by the Settings → Test button. Issues a
   * minimal `{ aboutServer { version } }` query so we don't depend on
   * any source being configured.
   */
  async testConnection(): Promise<{
    success: boolean;
    message: string;
    version?: string;
  }> {
    try {
      const data = await this.graphql<{
        aboutServer: { version?: string; name?: string };
      }>(`query { aboutServer { version name } }`);
      return {
        success: true,
        message: `Connected to Suwayomi ${data.aboutServer?.version ?? '?'}`,
        version: data.aboutServer?.version,
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn('Suwayomi test connection failed', {
        label: 'suwayomi',
        error: message,
      });
      return { success: false, message };
    }
  }

  /**
   * Search every enabled source for the given query and flatten the
   * results into a single hit list. Filtering by source / language is
   * left to the caller.
   */
  async searchSources(query: string, limit = 20): Promise<SuwayomiSearchHit[]> {
    const data = await this.graphql<{
      sources: {
        nodes: Array<{
          id: string;
          name: string;
          lang?: string;
          iconUrl?: string;
        }>;
      };
    }>(`query { sources { nodes { id name lang iconUrl } } }`);

    const sources = data.sources?.nodes ?? [];
    const hits: SuwayomiSearchHit[] = [];

    for (const source of sources) {
      try {
        const result = await this.graphql<{
          fetchSourceManga: {
            mangas: Array<{
              id: number;
              title: string;
              thumbnailUrl?: string;
              url?: string;
            }>;
          };
        }>(
          `query Search($input: FetchSourceMangaInput!) {
            fetchSourceManga(input: $input) {
              mangas { id title thumbnailUrl url }
            }
          }`,
          {
            input: {
              type: 'SEARCH',
              source: source.id,
              query,
              page: 1,
            },
          }
        );

        for (const m of result.fetchSourceManga?.mangas ?? []) {
          hits.push({
            id: m.id,
            title: m.title,
            thumbnailUrl: m.thumbnailUrl ?? undefined,
            url: m.url ?? undefined,
            source,
          });
          if (hits.length >= limit) return hits;
        }
      } catch (e) {
        // A single broken source shouldn't prevent the rest of the
        // search from working — log and move on.
        logger.debug('Suwayomi source search failed', {
          label: 'suwayomi',
          sourceId: source.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return hits;
  }

  /**
   * Fetch a single manga by its internal Suwayomi id (the numeric one
   * the search hits return — not the AniList id).
   */
  async getManga(id: number): Promise<SuwayomiManga | null> {
    try {
      const data = await this.graphql<{
        manga: {
          id: number;
          title: string;
          thumbnailUrl?: string;
          url?: string;
          inLibrary: boolean;
          status?: string;
          source?: {
            id: string;
            name: string;
            lang?: string;
          };
          chaptersTotalCount?: number;
          chaptersDownloadedCount?: number;
        };
      }>(
        `query Manga($id: Int!) {
          manga(id: $id) {
            id title thumbnailUrl url inLibrary status
            source { id name lang }
            chaptersTotalCount: chapters { totalCount }
            chaptersDownloadedCount: chapters(filter: { isDownloaded: { equalTo: true } }) { totalCount }
          }
        }`,
        { id }
      );
      const m = data.manga;
      if (!m) return null;
      return {
        id: m.id,
        title: m.title,
        thumbnailUrl: m.thumbnailUrl ?? undefined,
        url: m.url ?? undefined,
        inLibrary: m.inLibrary,
        status: m.status ?? undefined,
        source: m.source
          ? { id: m.source.id, name: m.source.name, lang: m.source.lang }
          : undefined,
        chaptersTotalCount: m.chaptersTotalCount ?? undefined,
        chaptersDownloadedCount: m.chaptersDownloadedCount ?? undefined,
      };
    } catch (e) {
      logger.warn('Suwayomi getManga failed', {
        label: 'suwayomi',
        mangaId: id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Add a manga to the Suwayomi library. This is the trigger that
   * makes Suwayomi start downloading new chapters.
   */
  async addToLibrary(mangaId: number): Promise<boolean> {
    try {
      await this.graphql(
        `mutation Update($input: UpdateMangaInput!) {
          updateManga(input: $input) { manga { id inLibrary } }
        }`,
        {
          input: { id: mangaId, patch: { inLibrary: true } },
        }
      );
      return true;
    } catch (e) {
      logger.error('Suwayomi addToLibrary failed', {
        label: 'suwayomi',
        mangaId,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }

  /**
   * Trigger a chapter list refresh + download for a manga that's
   * already in the library. Useful when re-requesting an existing row.
   */
  async fetchChapters(mangaId: number): Promise<boolean> {
    try {
      await this.graphql(
        `mutation Fetch($input: FetchChaptersInput!) {
          fetchChapters(input: $input) { chapters { id } }
        }`,
        { input: { mangaId } }
      );
      return true;
    } catch (e) {
      logger.warn('Suwayomi fetchChapters failed', {
        label: 'suwayomi',
        mangaId,
        error: e instanceof Error ? e.message : String(e),
      });
      return false;
    }
  }
}

export default SuwayomiAPI;
