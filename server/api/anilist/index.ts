import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import axios from 'axios';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const cache = cacheManager.getCache('anilist').data;

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

export interface AniListTitle {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
  userPreferred?: string | null;
}

export interface AniListCoverImage {
  extraLarge?: string | null;
  large?: string | null;
  medium?: string | null;
  color?: string | null;
}

export interface AniListDate {
  year?: number | null;
  month?: number | null;
  day?: number | null;
}

export interface AniListTag {
  id?: number;
  name?: string;
  category?: string | null;
  rank?: number | null;
  isMediaSpoiler?: boolean | null;
  isGeneralSpoiler?: boolean | null;
}

export interface AniListExternalLink {
  id?: number;
  url?: string;
  site?: string;
  type?: string;
  language?: string | null;
}

export interface AniListStaffEdge {
  role?: string | null;
  node?: AniListStaff | null;
}

export interface AniListStaff {
  id: number;
  name?: {
    full?: string | null;
    native?: string | null;
    userPreferred?: string | null;
  } | null;
  image?: { large?: string | null; medium?: string | null } | null;
  description?: string | null;
  primaryOccupations?: string[] | null;
  dateOfBirth?: AniListDate | null;
  dateOfDeath?: AniListDate | null;
  homeTown?: string | null;
  yearsActive?: number[] | null;
  age?: number | null;
}

export interface AniListMediaRelation {
  relationType?: string | null;
  node?: AniListMediaSummary | null;
}

export interface AniListMediaSummary {
  id: number;
  idMal?: number | null;
  type?: 'ANIME' | 'MANGA' | null;
  format?: string | null;
  status?: string | null;
  title?: AniListTitle | null;
  coverImage?: AniListCoverImage | null;
  bannerImage?: string | null;
  startDate?: AniListDate | null;
  endDate?: AniListDate | null;
  chapters?: number | null;
  volumes?: number | null;
  averageScore?: number | null;
  popularity?: number | null;
  countryOfOrigin?: string | null;
  isAdult?: boolean | null;
}

export interface AniListMedia extends AniListMediaSummary {
  description?: string | null;
  genres?: string[] | null;
  synonyms?: string[] | null;
  tags?: AniListTag[] | null;
  externalLinks?: AniListExternalLink[] | null;
  staff?: { edges?: AniListStaffEdge[] | null } | null;
  relations?: { edges?: AniListMediaRelation[] | null } | null;
  characters?: {
    edges?:
      | {
          role?: string | null;
          node?: { id: number; name?: { full?: string | null } | null } | null;
        }[]
      | null;
  } | null;
  meanScore?: number | null;
  favourites?: number | null;
  source?: string | null;
}

/**
 * Compose a single display title from AniList's locale variants.
 * Order: english → romaji → native → userPreferred → empty.
 */
export const aniListPrimaryTitle = (t?: AniListTitle | null): string =>
  t?.english ?? t?.romaji ?? t?.userPreferred ?? t?.native ?? '';

/**
 * Compose a YYYY-MM-DD date string when AniList exposes one.
 */
export const aniListIsoDate = (d?: AniListDate | null): string | undefined => {
  if (!d?.year) return undefined;
  const mm = (d.month ?? 1).toString().padStart(2, '0');
  const dd = (d.day ?? 1).toString().padStart(2, '0');
  return `${d.year}-${mm}-${dd}`;
};

/**
 * Pull the year out of an AniList date — covers the common "we just
 * want the publication year" usage on cards / facts.
 */
export const aniListYear = (d?: AniListDate | null): number | undefined =>
  d?.year ?? undefined;

interface GqlEnvelope<T> {
  data?: T;
  errors?: { message: string; status?: number }[];
}

const MEDIA_FRAGMENT_SUMMARY = `
  id
  idMal
  type
  format
  status
  title { romaji english native userPreferred }
  coverImage { extraLarge large medium color }
  bannerImage
  startDate { year month day }
  endDate { year month day }
  chapters
  volumes
  averageScore
  popularity
  countryOfOrigin
  isAdult
`;

const MEDIA_FRAGMENT_FULL = `
  ${MEDIA_FRAGMENT_SUMMARY}
  description(asHtml: false)
  genres
  synonyms
  source
  meanScore
  favourites
  tags { id name category rank isMediaSpoiler isGeneralSpoiler }
  externalLinks { id url site type language }
  staff(perPage: 12) {
    edges {
      role
      node {
        id
        name { full native userPreferred }
        image { large medium }
        primaryOccupations
      }
    }
  }
  characters(perPage: 8, sort: ROLE) {
    edges {
      role
      node {
        id
        name { full }
      }
    }
  }
  relations {
    edges {
      relationType
      node {
        id
        type
        format
        status
        title { romaji english native userPreferred }
        coverImage { medium large }
        startDate { year month day }
      }
    }
  }
`;

/**
 * Minimal AniList GraphQL client. AniList is a free public manga +
 * anime metadata service; we only ever query MANGA on the read side.
 * Anonymous access is allowed for read operations (rate-limited to
 * ~90 req/min server-wide). Mutations would require an OAuth token
 * but we don't write back.
 */
class AniListAPI {
  private async gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data: T | null; error?: string }> {
    try {
      const response = await axios.post<GqlEnvelope<T>>(
        ANILIST_ENDPOINT,
        { query, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'allseerr',
          },
          timeout: 15000,
        }
      );
      if (response.data.errors?.length) {
        const message = response.data.errors.map((e) => e.message).join('; ');
        logger.warn('AniList GraphQL returned errors', {
          label: 'anilist',
          errors: message,
        });
        return { data: null, error: message };
      }
      return { data: response.data.data ?? null };
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      const message = e instanceof Error ? e.message : String(e);
      logger.error('AniList GraphQL call failed', {
        label: 'anilist',
        status,
        error: message,
      });
      return { data: null, error: message };
    }
  }

  /**
   * Free-text manga search via Page.media. AniList's search is built
   * on a fuzzy index that handles transliterations well (typing "kimetsu"
   * finds Demon Slayer). Results are ordered by AniList's own search
   * relevance score.
   */
  async searchManga(query: string, limit = 20): Promise<AniListMediaSummary[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return cached(
      `manga:search:${trimmed.toLowerCase()}:${limit}`,
      async () => {
        const gqlQuery = `
          query SearchManga($q: String!, $perPage: Int!) {
            Page(perPage: $perPage) {
              media(search: $q, type: MANGA, sort: SEARCH_MATCH) {
                ${MEDIA_FRAGMENT_SUMMARY}
              }
            }
          }
        `;
        const { data } = await this.gql<{
          Page: { media: AniListMediaSummary[] };
        }>(gqlQuery, { q: trimmed, perPage: limit });
        return data?.Page?.media ?? [];
      },
      3600
    );
  }

  /**
   * Detail fetch — returns the full media record (description, tags,
   * staff, characters, relations) needed by the manga detail page.
   */
  async getManga(id: number): Promise<AniListMedia | null> {
    return cached(`manga:${id}`, async () => {
      const gqlQuery = `
        query MangaById($id: Int!) {
          Media(id: $id, type: MANGA) {
            ${MEDIA_FRAGMENT_FULL}
          }
        }
      `;
      const { data } = await this.gql<{ Media: AniListMedia }>(gqlQuery, {
        id,
      });
      return data?.Media ?? null;
    });
  }

  /**
   * AniList doesn't have a "series" entity separate from media — but
   * each Media row carries a `relations` graph that includes
   * SIDE_STORY / PREQUEL / SEQUEL / SPIN_OFF. The "series" view in our
   * UI is just the relation cluster anchored on a chosen media id.
   */
  async getMangaRelations(id: number): Promise<AniListMediaRelation[]> {
    const media = await this.getManga(id);
    return media?.relations?.edges ?? [];
  }

  /**
   * Free-text staff (mangaka, illustrator, scenarist) search. Used to
   * surface author cards on top of the manga search grid the same way
   * Hardcover does for books.
   */
  async searchStaff(query: string, limit = 5): Promise<AniListStaff[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];
    return cached(
      `staff:search:${trimmed.toLowerCase()}:${limit}`,
      async () => {
        const gqlQuery = `
          query SearchStaff($q: String!, $perPage: Int!) {
            Page(perPage: $perPage) {
              staff(search: $q, sort: SEARCH_MATCH) {
                id
                name { full native userPreferred }
                image { large medium }
                primaryOccupations
              }
            }
          }
        `;
        const { data } = await this.gql<{ Page: { staff: AniListStaff[] } }>(
          gqlQuery,
          { q: trimmed, perPage: limit }
        );
        return data?.Page?.staff ?? [];
      },
      3600
    );
  }

  /**
   * Staff detail with their media credits (manga only). Drives the
   * /manga/staff/:id author page.
   */
  async getStaff(id: number): Promise<
    | (AniListStaff & {
        staffMedia?: {
          edges?:
            | {
                staffRole?: string | null;
                node?: AniListMediaSummary | null;
              }[]
            | null;
        } | null;
      })
    | null
  > {
    return cached(`staff:${id}`, async () => {
      const gqlQuery = `
        query StaffById($id: Int!) {
          Staff(id: $id) {
            id
            name { full native userPreferred }
            image { large medium }
            description(asHtml: false)
            primaryOccupations
            dateOfBirth { year month day }
            dateOfDeath { year month day }
            homeTown
            yearsActive
            age
            staffMedia(type: MANGA, perPage: 50, sort: POPULARITY_DESC) {
              edges {
                staffRole
                node {
                  id
                  type
                  format
                  status
                  title { romaji english native userPreferred }
                  coverImage { large medium }
                  startDate { year month day }
                  averageScore
                  popularity
                }
              }
            }
          }
        }
      `;
      const { data } = await this.gql<{
        Staff: AniListStaff & {
          staffMedia?: {
            edges?:
              | {
                  staffRole?: string | null;
                  node?: AniListMediaSummary | null;
                }[]
              | null;
          } | null;
        };
      }>(gqlQuery, { id });
      return data?.Staff ?? null;
    });
  }

  /**
   * Trending manga for the home page. AniList exposes a sort=TRENDING_DESC
   * that ranks by activity in the last few days (reads, list adds,
   * forum posts) — much more useful than POPULARITY_DESC which is
   * lifetime cumulative.
   */
  async getTrendingManga(
    limit = 20,
    genre?: string
  ): Promise<AniListMediaSummary[]> {
    // Genre is folded into the cache key so a ``?genre=Action``
    // narrow request doesn't share a cache slot with the
    // unfiltered trending feed.
    const cacheKey = `manga:trending:${limit}:${genre ?? ''}`;
    return cached(
      cacheKey,
      async () => {
        // AniList's GraphQL ``media`` field accepts an optional
        // ``genre_in: [String!]`` argument we drop in only when
        // the caller specified one. Filtering by genre still
        // sorts by trending desc.
        const gqlQuery = `
          query Trending($perPage: Int!, $genres: [String]) {
            Page(perPage: $perPage) {
              media(type: MANGA, sort: TRENDING_DESC, isAdult: false, genre_in: $genres) {
                ${MEDIA_FRAGMENT_SUMMARY}
              }
            }
          }
        `;
        const { data } = await this.gql<{
          Page: { media: AniListMediaSummary[] };
        }>(gqlQuery, {
          perPage: limit,
          genres: genre ? [genre] : null,
        });
        return data?.Page?.media ?? [];
      },
      // Trending changes faster than the per-id detail; refresh every
      // 30 minutes so the home page doesn't go stale.
      30 * 60
    );
  }

  /**
   * Variant of ``getTrendingManga`` that also pulls the
   * ``genres`` field per item — used by the genre-slider
   * endpoint to bucket popular covers per genre in a single
   * GraphQL call rather than N (one per genre).
   *
   * Kept separate from ``getTrendingManga`` because the regular
   * trending feed (used by the Popular Manga slider) doesn't
   * need the genres payload, and AniList's complexity budget
   * adds up when ``genres`` is selected at high ``perPage``.
   */
  async getTrendingMangaWithGenres(
    limit = 100
  ): Promise<(AniListMediaSummary & { genres?: string[] | null })[]> {
    return cached(
      `manga:trending-with-genres:${limit}`,
      async () => {
        const gqlQuery = `
          query TrendingWithGenres($perPage: Int!) {
            Page(perPage: $perPage) {
              media(type: MANGA, sort: TRENDING_DESC, isAdult: false) {
                ${MEDIA_FRAGMENT_SUMMARY}
                genres
              }
            }
          }
        `;
        const { data } = await this.gql<{
          Page: {
            media: (AniListMediaSummary & { genres?: string[] | null })[];
          };
        }>(gqlQuery, { perPage: limit });
        return data?.Page?.media ?? [];
      },
      30 * 60
    );
  }

  /**
   * Available manga genres for the dashboard genre slider.
   * AniList exposes them via the ``GenreCollection`` root
   * query — small, stable, cheap. ``Hentai`` is filtered out
   * so the dashboard doesn't surface an adult bucket; the
   * detail-page + search-config ``hideAdult`` toggle handles
   * per-title adult filtering separately.
   */
  async getGenres(): Promise<string[]> {
    return cached(
      'manga:genres',
      async () => {
        const { data } = await this.gql<{ GenreCollection: string[] }>(
          'query { GenreCollection }'
        );
        const ADULT_GENRES = new Set(['Hentai']);
        return (data?.GenreCollection ?? []).filter(
          (g) => !ADULT_GENRES.has(g)
        );
      },
      24 * 60 * 60
    );
  }

  /**
   * Lightweight reachability probe used by the metadata-provider
   * test button in the settings UI.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const { data, error } = await this.gql<{
      Page: { media: { id: number }[] };
    }>('query { Page(perPage: 1) { media(type: MANGA) { id } } }');
    if (error) return { success: false, message: error };
    if (!data) {
      return {
        success: false,
        message: 'AniList returned no data (unexpected)',
      };
    }
    return {
      success: true,
      message: `Connected to AniList (${data.Page.media.length} sample manga returned)`,
    };
  }
}

export default AniListAPI;
