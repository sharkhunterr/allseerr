import logger from '@server/logger';
import type { QualityProfile } from './base';
import ServarrBase from './base';

/**
 * Optional cascade enrichment fields the dispatcher forwards when
 * available. Pressarr also back-fills any missing pieces from its
 * own cascade by ISSN, so omitting these is fine — passing them
 * just avoids the extra roundtrip and guarantees the operator
 * sees the same identity allseerr's search showed.
 */
export interface PressarrMagazineIdentityForward {
  language?: string;
  wikidataQid?: string;
  zdbId?: string;
  wikipediaUrl?: string;
  categories?: string[];
  firstIssued?: string;
  ceasedAt?: string;
}

export interface PressarrMagazineCreateOptions
  extends PressarrMagazineIdentityForward {
  title: string;
  // Optional identification + enrichment fields. Pressarr's
  // POST /api/v1/magazine accepts all of these and uses them
  // for both deduplication (ISSN) and indexer query refinement
  // (search_terms).
  issn?: string;
  publisher?: string;
  country?: string;
  description?: string;
  frequency?: string;
  searchTerms?: string;
  metadataProvider?: string;
  metadataProviderId?: string;
  // Required by pressarr's schema. Set by the dispatcher from
  // the configured PressarrSettings instance (activeDirectory →
  // rootFolderId resolved via getRootFolders, activeProfileId →
  // qualityProfileId).
  rootFolderId: number;
  qualityProfileId: number;
  monitored?: boolean;
  searchForMissingIssues?: boolean;
}

export interface PressarrMagazine {
  id: number;
  title: string;
  titleSlug?: string;
  issn?: string | null;
  publisher?: string | null;
  frequency?: string;
  monitored: boolean;
  qualityProfileId?: number;
  rootFolderId?: number;
  coverUrl?: string | null;
  statistics?: {
    issueCount?: number;
    haveIssueCount?: number;
    sizeOnDisk?: number;
  };
}

export interface PressarrMetadataSearchResult {
  provider: string;
  providerId: string;
  title: string;
  publisher?: string | null;
  country?: string | null;
  description?: string | null;
  coverUrl?: string | null;
  issn?: string | null;
  frequency?: string | null;
  // ISSN-first cascade enrichment fields. Surfaced by pressarr's
  // ZDB / Wikidata / BnF providers; older Google Books / Internet
  // Archive hits leave them blank.
  language?: string | null;
  wikidataQid?: string | null;
  zdbId?: string | null;
  wikipediaUrl?: string | null;
  categories?: string[] | null;
  firstIssued?: string | null;
  ceasedAt?: string | null;
  sources?: { provider: string; providerId: string; count?: number }[];
}

/**
 * Authoritative single-magazine identity from pressarr's
 * ``GET /magazine/identity?issn=…`` endpoint. Used when the operator
 * pastes an ISSN or when a discovery card needs the full record.
 */
export interface PressarrRelatedPublication {
  wikidataQid?: string | null;
  title: string;
  issn?: string | null;
  relation?: string | null;
}

export interface PressarrIssnEntry {
  issn: string;
  format?: string | null;
}

export interface PressarrMagazineIdentity {
  title: string;
  issn?: string | null;
  publisher?: string | null;
  country?: string | null;
  language?: string | null;
  frequency?: string | null;
  coverUrl?: string | null;
  description?: string | null;
  firstIssued?: string | null;
  ceasedAt?: string | null;
  wikidataQid?: string | null;
  zdbId?: string | null;
  wikipediaUrl?: string | null;
  categories?: string[];
  sources?: string[];
  relatedPublications?: PressarrRelatedPublication[];
  issns?: PressarrIssnEntry[];
}

export interface PressarrRootFolder {
  id: number;
  path: string;
}

/**
 * Pressarr — kkodecs/pressarr is an *arr-style periodical
 * manager. API shape mirrors Readarr/Sonarr conventions:
 *   - auth: ``X-Api-Key`` header
 *   - quality profiles: ``/api/v1/qualityprofile``
 *   - root folders: ``/api/v1/rootfolder``
 *   - create magazine: ``POST /api/v1/magazine``
 *   - metadata search: ``GET /api/v1/magazine/lookup?query=…``
 *
 * Pressarr's base path is ``/api/v1`` so we initialise
 * ``ServarrBase`` with that suffix and swap servarr's
 * query-param auth for the header convention pressarr uses.
 */
class PressarrAPI extends ServarrBase<{ magazineId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'pressarr', apiName: 'Pressarr' });
    if (this.axios.defaults.params) {
      delete (this.axios.defaults.params as Record<string, unknown>).apikey;
    }
    this.axios.defaults.headers.common['X-Api-Key'] = apiKey;
  }

  public getProfiles = async (): Promise<QualityProfile[]> => {
    try {
      const response = await this.axios.get<QualityProfile[]>(
        '/qualityprofile'
      );
      return response.data;
    } catch (e) {
      throw new Error(
        `[Pressarr] Failed to retrieve quality profiles: ${e.message}`,
        { cause: e }
      );
    }
  };

  /**
   * Root folders allseerr uses to populate the modal dropdown
   * + resolve the operator's ``activeDirectory`` choice back to
   * the numeric ``root_folder_id`` pressarr's POST /magazine
   * requires.
   *
   * Overrides the parent ``getRootFolders`` so we hit pressarr's
   * specific ``rootfolder`` path even if ServarrBase ever drifts.
   */
  public getPressarrRootFolders = async (): Promise<PressarrRootFolder[]> => {
    try {
      const response = await this.axios.get<PressarrRootFolder[]>(
        '/rootfolder'
      );
      return response.data ?? [];
    } catch (e) {
      logger.warn('Pressarr root folder fetch failed', {
        label: 'pressarr',
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  };

  /**
   * Free-text search across pressarr's metadata providers —
   * surfaces candidate magazines so the operator can pick the
   * exact title (with ISSN when available) before dispatching.
   */
  public lookupMagazine = async (
    query: string,
    opts?: {
      locale?: string;
      status?: 'ongoing' | 'ceased' | 'all';
      verified?: boolean;
    }
  ): Promise<PressarrMetadataSearchResult[]> => {
    if (!query?.trim()) return [];
    try {
      const response = await this.axios.get<PressarrMetadataSearchResult[]>(
        '/magazine/lookup',
        {
          params: {
            query,
            locale: opts?.locale,
            // Forwarded straight to pressarr's ``?status`` filter
            // — server-side filtering keeps the response payload
            // small.
            status: opts?.status,
            verified: opts?.verified ? true : undefined,
          },
        }
      );
      return response.data ?? [];
    } catch (e) {
      logger.warn('Pressarr magazine lookup failed', {
        label: 'pressarr',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  };

  /**
   * Authoritative ISSN → identity. Returns null when no source in
   * pressarr's cascade recognises the ISSN. Used by the manual-add
   * flow (paste ISSN) and to enrich a discovery hit before dispatch.
   */
  public lookupMagazineIdentity = async (
    issn: string,
    opts?: { locale?: string }
  ): Promise<PressarrMagazineIdentity | null> => {
    if (!issn?.trim()) return null;
    try {
      const response = await this.axios.get<PressarrMagazineIdentity>(
        '/magazine/identity',
        { params: { issn, locale: opts?.locale } }
      );
      return response.data ?? null;
    } catch (e) {
      // 404 is the expected "no ISSN match" — log at debug to avoid
      // false-alarm noise when the operator types ISSNs that don't
      // resolve. Other statuses surface as warn.
      const status = (e as { response?: { status?: number } })?.response?.status;
      const level = status === 404 ? 'debug' : 'warn';
      logger[level]('Pressarr magazine identity lookup failed', {
        label: 'pressarr',
        issn,
        status,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };

  /**
   * Create a magazine — equivalent of Bookshelf's POST /book.
   * Pressarr returns the new row with its numeric id which we
   * stash on MagazineMedia.downloadManagerExternalId for the
   * availability scanner to poll later.
   */
  public createMagazine = async (
    options: PressarrMagazineCreateOptions
  ): Promise<PressarrMagazine> => {
    try {
      // Pressarr's CamelModel base accepts both snake_case and
      // camelCase — we use camelCase so it lines up with the
      // rest of allseerr's wire format.
      const response = await this.axios.post<PressarrMagazine>(
        '/magazine',
        {
          title: options.title,
          issn: options.issn,
          publisher: options.publisher,
          country: options.country,
          description: options.description,
          frequency: options.frequency ?? 'monthly',
          monitored: options.monitored ?? true,
          searchTerms: options.searchTerms,
          rootFolderId: options.rootFolderId,
          qualityProfileId: options.qualityProfileId,
          metadataProvider: options.metadataProvider,
          metadataProviderId: options.metadataProviderId,
          searchForMissingIssues: options.searchForMissingIssues ?? true,
          // Cascade enrichment forwarded when allseerr's search
          // already resolved them. Omitting is safe — pressarr
          // back-fills from its own cascade by ISSN.
          language: options.language,
          wikidataQid: options.wikidataQid,
          zdbId: options.zdbId,
          wikipediaUrl: options.wikipediaUrl,
          categories: options.categories,
          firstIssued: options.firstIssued,
          ceasedAt: options.ceasedAt,
        },
        { timeout: 20000 }
      );
      logger.info('Pressarr accepted magazine create', {
        label: 'Pressarr',
        magazineId: response.data.id,
        title: response.data.title,
      });
      return response.data;
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      logger.error('Failed to create magazine on Pressarr', {
        label: 'Pressarr',
        status,
        errorMessage: e.message,
        options,
        response: body,
      });
      throw new Error(
        `Failed to create magazine on Pressarr${status ? ` (${status})` : ''}: ${
          typeof body?.message === 'string' ? body.message : e.message
        }`,
        { cause: e }
      );
    }
  };

  public getMagazine = async (id: number): Promise<PressarrMagazine | null> => {
    try {
      const response = await this.axios.get<PressarrMagazine>(
        `/magazine/${id}`
      );
      return response.data ?? null;
    } catch (e) {
      logger.warn('Pressarr getMagazine failed', {
        label: 'pressarr',
        id,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  };
}

export default PressarrAPI;
