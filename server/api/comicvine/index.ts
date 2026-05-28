import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

const COMICVINE_BASE = 'https://comicvine.gamespot.com/api';
const cache = cacheManager.getCache('comicvine').data;

interface ComicVineConfig {
  apiKey: string;
  userAgent?: string;
}

async function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlSeconds?: number
): Promise<T> {
  const hit = cache.get<T>(key);
  if (hit !== undefined) return hit;
  const value = await fetcher();
  if (isCacheable(value)) {
    cache.set(key, value, ttlSeconds ?? 0);
  }
  return value;
}

function isCacheable(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.keys(value).length === 0
  ) {
    return false;
  }
  return true;
}

export interface ComicVineImage {
  icon_url?: string;
  medium_url?: string;
  screen_url?: string;
  small_url?: string;
  super_url?: string;
  thumb_url?: string;
  tiny_url?: string;
  original_url?: string;
}

export interface ComicVinePublisher {
  id: number;
  name: string;
  api_detail_url?: string;
}

export interface ComicVinePersonCredit {
  id: number;
  name: string;
  api_detail_url?: string;
  role?: string;
  site_detail_url?: string;
}

export interface ComicVineCharacter {
  id: number;
  name: string;
  api_detail_url?: string;
}

export interface ComicVineIssueRef {
  id: number;
  name?: string | null;
  issue_number?: string | null;
  cover_date?: string | null;
  api_detail_url?: string;
}

export interface ComicVineVolumeSummary {
  id: number;
  name: string;
  start_year?: string | null;
  count_of_issues?: number;
  publisher?: ComicVinePublisher | null;
  image?: ComicVineImage | null;
  description?: string | null;
  deck?: string | null;
  api_detail_url?: string;
  site_detail_url?: string;
  date_added?: string;
  date_last_updated?: string;
  resource_type?: string;
}

export interface ComicVineVolume extends ComicVineVolumeSummary {
  first_issue?: ComicVineIssueRef | null;
  last_issue?: ComicVineIssueRef | null;
  issues?: ComicVineIssueRef[];
  characters?: ComicVineCharacter[];
  people?: ComicVinePersonCredit[];
  aliases?: string | null;
}

export interface ComicVinePerson {
  id: number;
  name: string;
  aliases?: string | null;
  birth?: string | null;
  death?: string | null;
  hometown?: string | null;
  country?: string | null;
  description?: string | null;
  deck?: string | null;
  image?: ComicVineImage | null;
  count_of_issue_appearances?: number;
  site_detail_url?: string;
  created_volumes?: ComicVineVolumeSummary[];
}

interface ComicVineEnvelope<T> {
  status_code: number;
  error: string;
  number_of_total_results: number;
  number_of_page_results: number;
  results: T;
}

/**
 * ComicVine REST client.
 *
 * The API is read-only, requires an API key (free, request via
 * comicvine.gamespot.com), and is throttled per-resource at 200
 * req/hour. Every endpoint is `?api_key=…&format=json`; we let
 * the axios instance carry that for us.
 *
 * The "request unit" we expose to the rest of the app is the
 * *volume* (a series — e.g. "Saga"), not the issue. That mirrors
 * how Mylar3 manages subscriptions and how users actually think
 * about requesting comics.
 */
class ComicVineAPI {
  private config: ComicVineConfig;
  private http: AxiosInstance;

  constructor(config: ComicVineConfig) {
    if (!config.apiKey) {
      throw new Error(
        'ComicVine API key is required. Get one at comicvine.gamespot.com.'
      );
    }
    this.config = config;
    this.http = axios.create({
      baseURL: COMICVINE_BASE,
      params: {
        api_key: config.apiKey,
        format: 'json',
      },
      headers: {
        // ComicVine asks API consumers to identify themselves and
        // will throttle / block default UA strings.
        'User-Agent': config.userAgent ?? 'allseerr/comics-integration',
      },
      timeout: 15000,
    });
  }

  private async get<T>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    const response = await this.http.get<ComicVineEnvelope<T>>(path, {
      params,
    });
    if (response.data.status_code !== 1) {
      throw new Error(
        `ComicVine error (${response.data.status_code}): ${response.data.error}`
      );
    }
    return response.data.results;
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      // /publishers is cheap and confirms both auth + reachability.
      await this.get<ComicVinePublisher[]>('/publishers/', {
        limit: 1,
        field_list: 'id,name',
      });
      return { success: true, message: 'ComicVine reachable.' };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.warn('ComicVine test connection failed', {
        label: 'comicvine',
        error: message,
      });
      return { success: false, message };
    }
  }

  /**
   * Free-text search across every resource type, narrowed to volumes.
   * The /search endpoint takes a `resources` filter and returns a
   * heterogenous list — we ask for `volume` only so the caller doesn't
   * have to filter client-side.
   */
  async searchVolumes(
    query: string,
    limit = 20
  ): Promise<ComicVineVolumeSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const key = `search:vol:${trimmed.toLowerCase()}:${limit}`;
    return cached(
      key,
      async () => {
        const results = await this.get<ComicVineVolumeSummary[]>('/search/', {
          query: trimmed,
          resources: 'volume',
          limit,
          field_list:
            'id,name,start_year,count_of_issues,publisher,image,deck,description,api_detail_url,site_detail_url,resource_type',
        });
        return results ?? [];
      },
      // Search results shift more often than detail; 1h is a sane TTL.
      3600
    );
  }

  /**
   * Recent / "popular" volumes — ComicVine doesn't expose a
   * trending feed, so we fall back to ``/volumes`` sorted by
   * ``date_last_updated desc`` (volumes whose latest issue was
   * indexed most recently). Stable proxy for "actively-running
   * series" which is closer to what a user browsing comics
   * wants than alphabetical-by-id.
   *
   * Cached 1h — the list barely changes within an hour, and
   * ComicVine's rate limit is aggressive (200 req/hr per key).
   */
  async getRecentVolumes(
    page = 1,
    limit = 20,
    opts?: {
      // ComicVine's ``filter`` query param chains constraints:
      //   filter=publisher:DC|start_year:>=2010
      // We expose a curated subset (publisher name match,
      // start_year window) — adequate for the discover-page
      // filter slideover without exposing ComicVine's full
      // filter syntax to operators.
      publisher?: string;
      startYearGte?: number;
      startYearLte?: number;
      sort?: 'recent' | 'name';
    }
  ): Promise<ComicVineVolumeSummary[]> {
    const offset = (Math.max(1, page) - 1) * limit;
    const filterParts: string[] = [];
    if (opts?.publisher) {
      // Publisher matches on substring within ComicVine, so we
      // pass the name verbatim. ComicVine returns volumes whose
      // publisher name contains the provided string (case-
      // insensitive on its side).
      filterParts.push(`publisher:${opts.publisher}`);
    }
    if (opts?.startYearGte && opts?.startYearLte) {
      filterParts.push(
        `start_year:${opts.startYearGte}|${opts.startYearLte}`
      );
    } else if (opts?.startYearGte) {
      filterParts.push(`start_year:${opts.startYearGte}|2100`);
    } else if (opts?.startYearLte) {
      filterParts.push(`start_year:1900|${opts.startYearLte}`);
    }
    const sortClause =
      opts?.sort === 'name' ? 'name:asc' : 'date_last_updated:desc';
    const key = `recent:vol:${page}:${limit}:${filterParts.join('|')}:${sortClause}`;
    return cached(
      key,
      async () => {
        try {
          const params: Record<string, string | number> = {
            sort: sortClause,
            limit,
            offset,
            field_list:
              'id,name,start_year,count_of_issues,publisher,image,deck,description,api_detail_url,site_detail_url',
          };
          if (filterParts.length > 0) {
            params.filter = filterParts.join(',');
          }
          const results = await this.get<ComicVineVolumeSummary[]>(
            '/volumes/',
            params
          );
          return results ?? [];
        } catch (e) {
          logger.warn('ComicVine getRecentVolumes failed', {
            label: 'comicvine',
            page,
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        }
      },
      3600
    );
  }

  /**
   * Fetch a volume (series) by id, with the issue list and people
   * credits. ComicVine returns big payloads here; pinning the
   * field_list keeps the response under a few hundred KB.
   */
  async getVolume(volumeId: number): Promise<ComicVineVolume | null> {
    const key = `volume:${volumeId}`;
    return cached(key, async () => {
      try {
        const result = await this.get<ComicVineVolume>(
          `/volume/4050-${volumeId}/`,
          {
            field_list:
              'id,name,start_year,count_of_issues,publisher,image,description,deck,api_detail_url,site_detail_url,first_issue,last_issue,issues,characters,people,aliases,date_added,date_last_updated',
          }
        );
        return result ?? null;
      } catch (e) {
        logger.warn('ComicVine getVolume failed', {
          label: 'comicvine',
          volumeId,
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    });
  }

  /**
   * Enrich a list of volume ids into full volume records by fanning
   * out parallel /volume/4050-<id> calls. Used by the creator
   * detail page to turn /person/<id>'s sparse `created_volumes`
   * references (only `{id, name}`) into proper ComicCards with
   * covers, years and publishers.
   *
   * NB: the `/volumes?filter=people:<id>` endpoint is NOT a viable
   * shortcut — `/volumes` filter only supports id / name /
   * count_of_issues / date_*. Passing `filter=people:…` is
   * silently ignored, returning the default (unrelated) volume
   * list. So the per-id fan-out is the only accurate path.
   *
   * Per-volume responses are cached at 12h, so this is effectively
   * free after the first hit — but we still keep the input list
   * bounded by the caller (default 12) to avoid burning the 200/h
   * per-resource ComicVine quota on cold-cache page views.
   */
  async getVolumesByIds(ids: number[]): Promise<ComicVineVolume[]> {
    if (ids.length === 0) return [];
    const settled = await Promise.all(
      ids.map((id) => this.getVolume(id).catch(() => null))
    );
    return settled.filter((v): v is ComicVineVolume => v !== null);
  }

  /**
   * Fetch a creator (writer / artist / cover artist) by id, including
   * the volumes they're credited on. Used for the comic creator detail
   * page (parallel to the manga staff page).
   */
  async getPerson(personId: number): Promise<ComicVinePerson | null> {
    const key = `person:${personId}`;
    return cached(key, async () => {
      try {
        const result = await this.get<ComicVinePerson>(
          `/person/4040-${personId}/`,
          {
            field_list:
              'id,name,aliases,birth,death,hometown,country,description,deck,image,count_of_issue_appearances,site_detail_url,created_volumes',
          }
        );
        return result ?? null;
      } catch (e) {
        logger.warn('ComicVine getPerson failed', {
          label: 'comicvine',
          personId,
          error: e instanceof Error ? e.message : String(e),
        });
        return null;
      }
    });
  }
}

export default ComicVineAPI;

/**
 * Pull the best image URL ComicVine offers, with sensible fallbacks.
 * The "super" / "screen" / "medium" set are progressively smaller
 * crops; the original is occasionally missing.
 */
export function comicVineCoverUrl(
  image?: ComicVineImage | null
): string | undefined {
  if (!image) return undefined;
  return (
    image.original_url ??
    image.super_url ??
    image.screen_url ??
    image.medium_url ??
    image.small_url ??
    image.thumb_url ??
    undefined
  );
}

/**
 * ComicVine returns `start_year` as a string ("2018"). Coerce to a
 * number when possible — undefined when blank or unparseable.
 */
export function comicVineYear(start_year?: string | null): number | undefined {
  if (!start_year) return undefined;
  const n = parseInt(start_year, 10);
  return Number.isFinite(n) ? n : undefined;
}
