import ExternalAPI from '@server/api/externalapi';
import { MediaType } from '@server/constants/media';
import type {
  AvailabilityResult,
  ConnectionTestResult,
  MediaLibraryAdapter,
} from '@server/lib/adapters/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

const rommCache = cacheManager.getCache('romm').data;

/**
 * Build a RommAdapter from the current settings. Centralises the URL /
 * port / protocol parsing so every route handler doesn't re-derive it.
 * Returns null when ROMM is disabled or unconfigured.
 */
export function createRommAdapterFromSettings(): RommAdapter | null {
  const settings = getSettings();
  const cfg = settings.game?.romm;
  if (!cfg?.enabled || !cfg?.url) return null;
  try {
    const parsed = new URL(cfg.url);
    return new RommAdapter({
      hostname: parsed.hostname,
      port:
        parseInt(parsed.port) ||
        (parsed.protocol === 'https:' ? 443 : 80),
      apiKey: cfg.apiKey || undefined,
      username: cfg.username || undefined,
      password: cfg.password || undefined,
      useSsl: parsed.protocol === 'https:',
      baseUrl: parsed.pathname !== '/' ? parsed.pathname.replace(/\/$/, '') : '',
    });
  } catch (e) {
    logger.warn('Invalid ROMM URL', {
      label: 'romm',
      url: cfg.url,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

interface RommConfig {
  hostname: string;
  port: number;
  apiKey?: string;
  username?: string;
  password?: string;
  useSsl: boolean;
  baseUrl?: string;
}

interface RommGame {
  id: number;
  igdb_id?: number;
  name: string;
  platform_name?: string;
  platform_display_name?: string;
  platform_igdb_id?: number;
  platform_id?: number;
  file_name?: string;
  fs_name_no_tags?: string;
  path_cover_s?: string | null;
  path_cover_l?: string | null;
  url_cover?: string | null;
  first_release_date?: number | null;
}

interface RommPaginatedResponse {
  items: RommGame[];
  total: number;
  limit: number;
  offset: number;
}

interface RommCollectionRaw {
  id: number;
  name: string;
  description?: string | null;
  path_cover_s?: string | null;
  path_cover_l?: string | null;
  url_cover?: string | null;
  user_id?: number | null;
  is_public?: boolean | null;
  rom_count?: number | null;
  roms?: number[] | null;
}

export interface RommCollectionSummary {
  id: number;
  name: string;
  description?: string;
  coverUrl?: string;
  romCount?: number;
}

export interface RommCollectionDetail extends RommCollectionSummary {
  romIds: number[];
}

export interface RommRomSummary {
  id: number;
  igdbId?: number;
  title: string;
  platformName?: string;
  platformIgdbId?: number;
  coverUrl?: string;
  releaseYear?: number;
}

/**
 * ROMM adapter for game library management.
 * Polls ROMM for new game entries to update availability.
 */
export class RommAdapter extends ExternalAPI implements MediaLibraryAdapter {
  readonly mediaTypes = [MediaType.GAME];
  readonly name = 'ROMM';

  constructor(config: RommConfig) {
    const protocol = config.useSsl ? 'https' : 'http';
    const baseUrl = `${protocol}://${config.hostname}:${config.port}${config.baseUrl || ''}/api`;

    const headers: Record<string, unknown> = {};
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    } else if (config.username && config.password) {
      headers['Authorization'] = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
    }

    super(baseUrl, {}, { headers });
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await this.axios.get('/heartbeat');
      return {
        success: response.status === 200,
        message: 'Connected to ROMM',
      };
    } catch (e) {
      return {
        success: false,
        message: `ROMM connection failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async checkAvailability(
    externalId: string,
    _type: MediaType
  ): Promise<AvailabilityResult> {
    try {
      const [igdbId] = externalId.split(':').map(Number);
      let match: RommGame | undefined;
      let page = 1;
      let hasMore = true;
      while (hasMore && !match) {
        const result = await this.getGamesPage(page, 100);
        match = result.games.find(
          (g: RommGame) => g.igdb_id === igdbId
        );
        hasMore = result.hasMore;
        page++;
      }
      if (match) {
        return {
          available: true,
          libraryUrl: `${this.axios.defaults.baseURL?.replace('/api', '')}/rom/${match.id}`,
        };
      }
      return { available: false };
    } catch {
      return { available: false };
    }
  }

  async triggerLibraryScan(): Promise<void> {
    try {
      await this.axios.put('/tasks/scan');
    } catch (e) {
      logger.warn('ROMM scan trigger failed', {
        label: 'romm',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  /**
   * Get a page of games from ROMM.
   */
  async getGamesPage(
    page = 1,
    pageSize = 100
  ): Promise<{ games: RommGame[]; hasMore: boolean; total: number }> {
    try {
      const offset = (page - 1) * pageSize;
      const response = await this.axios.get<RommPaginatedResponse>('/roms', {
        params: { limit: pageSize, offset },
      });
      const data = response.data;
      const games: RommGame[] = data.items ?? [];
      return {
        games,
        hasMore: offset + games.length < data.total,
        total: data.total,
      };
    } catch (e) {
      logger.error('ROMM get games page failed', {
        label: 'romm',
        page,
        error: e instanceof Error ? e.message : String(e),
      });
      return { games: [], hasMore: false, total: 0 };
    }
  }

  /**
   * Get platforms from ROMM.
   */
  async getPlatforms(): Promise<
    Array<{ id: number; name: string; igdb_id?: number }>
  > {
    try {
      const response = await this.axios.get('/platforms');
      return response.data ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Resolve a ROMM-relative cover path to a fully-qualified URL. ROMM
   * stores covers under `/assets/romm/…` and returns only the relative
   * path; paired with the configured base URL we get the absolute URL
   * the browser can load directly.
   */
  private coverUrl(raw?: string | null): string | undefined {
    if (!raw) return undefined;
    if (/^https?:/i.test(raw)) return raw;
    const base = this.axios.defaults.baseURL ?? '';
    const origin = base.replace(/\/api\/?$/, '');
    const prefix = raw.startsWith('/') ? '' : '/';
    return `${origin}${prefix}${raw}`;
  }

  /**
   * List every collection defined in ROMM. Collections are user-
   * created groupings of ROMs; we surface them alongside IGDB metadata
   * so requests / search can show "this game is in collection X" the
   * same way book series do.
   */
  async listCollections(): Promise<RommCollectionSummary[]> {
    const key = 'collections:list';
    const hit = rommCache.get<RommCollectionSummary[]>(key);
    if (hit) return hit;
    try {
      const response = await this.axios.get<RommCollectionRaw[]>(
        '/collections'
      );
      const rows = response.data ?? [];
      const summaries: RommCollectionSummary[] = rows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        coverUrl: this.coverUrl(c.url_cover ?? c.path_cover_l ?? c.path_cover_s),
        romCount: c.rom_count ?? c.roms?.length ?? undefined,
      }));
      // 10 min TTL — collections change rarely but a longer window
      // would mask a newly-created collection for too long.
      rommCache.set(key, summaries, 600);
      return summaries;
    } catch (e) {
      logger.warn('ROMM listCollections failed', {
        label: 'romm',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Fetch a single collection with its full ROM id list. ROMM returns
   * the ids but not the ROM payload — callers that need per-rom
   * metadata batch-fetch via `getRomsByIds`.
   */
  async getCollection(id: number): Promise<RommCollectionDetail | null> {
    const key = `collection:${id}`;
    const hit = rommCache.get<RommCollectionDetail>(key);
    if (hit) return hit;
    try {
      const response = await this.axios.get<RommCollectionRaw>(
        `/collections/${id}`
      );
      const c = response.data;
      if (!c) return null;
      const detail: RommCollectionDetail = {
        id: c.id,
        name: c.name,
        description: c.description ?? undefined,
        coverUrl: this.coverUrl(c.url_cover ?? c.path_cover_l ?? c.path_cover_s),
        romCount: c.rom_count ?? c.roms?.length ?? 0,
        romIds: c.roms ?? [],
      };
      rommCache.set(key, detail, 600);
      return detail;
    } catch (e) {
      logger.warn('ROMM getCollection failed', {
        label: 'romm',
        id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Batch-fetch ROM metadata by id. ROMM doesn't expose a true bulk
   * endpoint so we issue one `/roms/{id}` request per id in parallel
   * — fine for collections in the 10–100-rom range, which is the
   * common case. Missing ROMs (deleted / private) drop silently.
   */
  async getRomsByIds(ids: number[]): Promise<RommRomSummary[]> {
    if (ids.length === 0) return [];
    const rows = await Promise.all(
      ids.map(async (id) => {
        try {
          const response = await this.axios.get<RommGame>(`/roms/${id}`);
          return response.data;
        } catch {
          return null;
        }
      })
    );
    return rows
      .filter((r): r is RommGame => !!r)
      .map((r) => ({
        id: r.id,
        igdbId: r.igdb_id,
        title: r.fs_name_no_tags || r.name,
        platformName: r.platform_display_name ?? r.platform_name,
        platformIgdbId: r.platform_igdb_id,
        coverUrl: this.coverUrl(
          r.url_cover ?? r.path_cover_l ?? r.path_cover_s
        ),
        releaseYear: r.first_release_date
          ? new Date(r.first_release_date * 1000).getFullYear()
          : undefined,
      }));
  }
}

export default RommAdapter;
