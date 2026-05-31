import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import axios, { type AxiosInstance } from 'axios';

const livrarrCache = cacheManager.getCache('livrarr').data;

/**
 * Minimal helper — Livrarr's responses change shape between
 * versions and we want to avoid burning a cache slot on a transient
 * error envelope.
 */
function setCacheable<T>(key: string, value: T, ttl: number) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value) && value.length === 0) return;
  livrarrCache.set(key, value, ttl);
}

export interface LivrarrInstance {
  hostname: string;
  port: number;
  useSsl: boolean;
  baseUrl?: string;
}

/**
 * Payload shipped to ``POST /api/v1/work``. Livrarr's handler
 * (see ``crates/livrarr-handlers/src/types/work.rs``) accepts a
 * single ``olKey`` identifier plus a few enrichment hints — no
 * quality / metadata profile selection (Livrarr resolves both
 * from its own config) and no rootFolder field (the operator
 * configures the root folder globally inside Livrarr).
 *
 * We populate as many hints as we have so Livrarr's matcher
 * does the right thing on first lookup: ``isbn13`` is the most
 * deterministic key when available (Hardcover-sourced books
 * carry it), with ``olKey`` / ``title`` + ``authorName`` as
 * fallbacks for Audible / OpenLibrary-sourced rows.
 *
 * NOTE: Livrarr's POST handler is strict camelCase — it rejects
 * snake_case keys with 422 "missing field". Keep this interface
 * camelCase to match the wire format directly.
 */
export interface LivrarrAddWorkPayload {
  olKey?: string;
  title: string;
  authorName?: string;
  authorOlKey?: string;
  year?: number;
  coverUrl?: string;
  language?: string;
  detailUrl?: string;
  coverManual?: boolean;
  isbn13?: string;
}

export interface LivrarrWorkDetail {
  id: number;
  title: string;
  olKey?: string | null;
  authorName?: string | null;
  monitorEbook?: boolean;
  monitorAudiobook?: boolean;
  // Livrarr returns a much richer payload (cover, identifiers,
  // libraryItems, …) — keep the shape open since we only
  // care about the id + monitor flags on the dispatch path.
  [k: string]: unknown;
}

export interface LivrarrAddWorkResponse {
  work: LivrarrWorkDetail;
  authorCreated: boolean;
  messages: string[];
}

export interface LivrarrLookupResult {
  olKey: string;
  title: string;
  authorName?: string;
  authorOlKey?: string;
  year?: number;
  coverUrl?: string;
  language?: string;
  isbn13?: string;
  detailUrl?: string;
  source?: string;
}

export interface LivrarrLookupResponse {
  results: LivrarrLookupResult[];
  filteredCount: number;
  rawCount: number;
  rawAvailable: boolean;
}

export interface LivrarrSystemStatus {
  // Livrarr's ``GET /api/v1/system/status`` returns a free-form
  // dict; we only use the fact that it responds 200 with valid
  // JSON to confirm auth + reachability on the settings test.
  [k: string]: unknown;
}

export interface LivrarrRootFolder {
  id: number;
  path: string;
  name?: string;
  // Other fields (free_space, used_space, …) ignored for now.
  [k: string]: unknown;
}

/**
 * Livrarr API client.
 *
 * Livrarr is a Rust-built *arr-style ebook + audiobook acquisition
 * service. It is NOT a Servarr (Readarr) fork — its API shape and
 * endpoint paths differ (work-based instead of book-based, no
 * quality / metadata profile dropdowns, root folder configured
 * globally inside Livrarr) — so this client stands on its own
 * rather than extending ``ServarrBase``.
 *
 * Auth: ``X-Api-Key`` header. Get the key from Livrarr
 *   Settings → Profile → Regenerate API Key, or via
 *   ``POST /api/v1/auth/apikey``.
 */
class LivrarrAPI {
  public readonly url: string;
  private apiKey: string;
  private axios: AxiosInstance;

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    if (!url) {
      throw new Error('Livrarr URL is required.');
    }
    if (!apiKey) {
      throw new Error('Livrarr API key is required.');
    }
    this.url = url.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.axios = axios.create({
      baseURL: this.url,
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'allseerr',
      },
      timeout: 15000,
    });
  }

  /**
   * Build a full URL from a stored instance + a relative path.
   * Used by the dispatcher / settings routes so they don't have
   * to know about the ``http(s)://host:port[/baseUrl]`` shape
   * themselves.
   */
  public static buildUrl(
    instance: LivrarrInstance,
    apiPath: string = '/api/v1'
  ): string {
    const protocol = instance.useSsl ? 'https' : 'http';
    const base = instance.baseUrl ? instance.baseUrl.replace(/\/$/, '') : '';
    // Defensive: operators routinely paste ``http://host`` into the
    // hostname field. Strip any leading scheme so we never end up
    // building ``http://http://host:18789…`` which DNS resolves as
    // a literal "http" hostname and fails with ENOTFOUND.
    const hostname = instance.hostname.replace(/^https?:\/\//, '');
    return `${protocol}://${hostname}:${instance.port}${base}${apiPath}`;
  }

  /**
   * Reachability + credentials probe. ``GET /api/v1/system/status``
   * is the cheapest endpoint that requires auth, so it tells us
   * both "host is up" and "API key works" in one call.
   */
  public async testConnection(): Promise<LivrarrSystemStatus> {
    try {
      const response = await this.axios.get<LivrarrSystemStatus>(
        '/system/status'
      );
      return response.data;
    } catch (e) {
      throw new Error(
        `[Livrarr] Connection test failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { cause: e }
      );
    }
  }

  /**
   * Root folders are configured inside Livrarr (one per media type
   * typically) — we expose the list so the settings UI can show
   * the operator where Livrarr will drop downloads, even though
   * the dispatcher doesn't pick one per request.
   */
  public async getRootFolders(): Promise<LivrarrRootFolder[]> {
    try {
      const response = await this.axios.get<LivrarrRootFolder[]>(
        '/rootfolder'
      );
      return response.data ?? [];
    } catch (e) {
      logger.warn('Livrarr getRootFolders failed', {
        label: 'livrarr',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Free-text lookup against Livrarr's metadata sources
   * (Hardcover + OpenLibrary + Audnexus, with optional AI-assisted
   * disambiguation). Used as a fallback by the dispatcher when
   * the requested book doesn't carry an OpenLibrary key allseerr
   * can pass straight through.
   */
  public async lookupWork(
    term: string,
    opts?: { language?: string; includeRaw?: boolean }
  ): Promise<LivrarrLookupResult[]> {
    if (!term?.trim()) return [];
    const cacheKey = `lookup:${term.toLowerCase()}:${opts?.language ?? ''}`;
    const hit = livrarrCache.get<LivrarrLookupResult[]>(cacheKey);
    if (hit !== undefined) return hit;
    try {
      const response = await this.axios.get<LivrarrLookupResponse>(
        '/work/lookup',
        {
          params: {
            term,
            lang: opts?.language,
            raw: opts?.includeRaw ? true : undefined,
          },
        }
      );
      const results = response.data?.results ?? [];
      setCacheable(cacheKey, results, 3600);
      return results;
    } catch (e) {
      logger.warn('Livrarr work lookup failed', {
        label: 'livrarr',
        term,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Add a work to Livrarr — equivalent of Bookshelf's
   * ``POST /book`` or Bindery's ``POST /author/book``. Livrarr
   * auto-creates the author when ``authorOlKey`` resolves a
   * record it doesn't already have (the response's
   * ``author_created`` boolean reports it).
   *
   * After ``addWork`` the caller typically calls ``updateWork``
   * to flip on the right ``monitorEbook`` / ``monitorAudiobook``
   * flag based on what the user requested.
   */
  public async addWork(
    payload: LivrarrAddWorkPayload
  ): Promise<LivrarrAddWorkResponse> {
    try {
      const response = await this.axios.post<LivrarrAddWorkResponse>(
        '/work',
        payload
      );
      return response.data;
    } catch (e) {
      throw new Error(
        `[Livrarr] addWork failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { cause: e }
      );
    }
  }

  /**
   * Update an existing work — used right after ``addWork`` to set
   * the per-media-type monitor flag (so Livrarr only acquires the
   * audiobook edition when the request was for an audiobook,
   * etc.).
   */
  public async updateWork(
    workId: number,
    patch: {
      monitorEbook?: boolean;
      monitorAudiobook?: boolean;
      title?: string;
      authorName?: string;
      seriesName?: string;
      seriesPosition?: number;
    }
  ): Promise<LivrarrWorkDetail> {
    try {
      const response = await this.axios.put<LivrarrWorkDetail>(
        `/work/${workId}`,
        patch
      );
      return response.data;
    } catch (e) {
      throw new Error(
        `[Livrarr] updateWork failed for ${workId}: ${
          e instanceof Error ? e.message : String(e)
        }`,
        { cause: e }
      );
    }
  }

  /**
   * Force Livrarr to re-pull metadata + trigger a search cycle for
   * the work — invoked when ``preventSearch`` is off, so the
   * download starts as soon as the operator approves.
   */
  public async refreshWork(workId: number): Promise<void> {
    try {
      await this.axios.post(`/work/${workId}/refresh`);
    } catch (e) {
      logger.warn('Livrarr refreshWork failed (best-effort)', {
        label: 'livrarr',
        workId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}

export default LivrarrAPI;
