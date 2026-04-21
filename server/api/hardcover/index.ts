import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import axios from 'axios';

const HARDCOVER_ENDPOINT = 'https://api.hardcover.app/v1/graphql';
const cache = cacheManager.getCache('hardcover').data;

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

export interface HardcoverCachedTag {
  tag: string;
  tagSlug?: string;
  count?: number;
  spoiler?: boolean;
}

export interface HardcoverCachedTags {
  Genre?: HardcoverCachedTag[];
  Mood?: HardcoverCachedTag[];
  ContentWarning?: HardcoverCachedTag[];
}

export interface HardcoverCharacter {
  character?: { name?: string; slug?: string } | null;
  only_mentioned?: boolean;
  spoiler?: boolean;
}

export interface HardcoverBookMapping {
  external_id?: string;
  platform?: { name?: string };
}

export interface HardcoverSearchHit {
  id: number;
  title: string;
  slug?: string;
  rating?: number | null;
  ratings_count?: number | null;
  users_count?: number | null;
  users_read_count?: number | null;
  pages?: number | null;
  release_date?: string | null;
  image?: { url?: string } | null;
  cached_tags?: HardcoverCachedTags | null;
  contributions?: {
    contribution?: string | null;
    author?: { name?: string } | null;
  }[];
  book_series?: { series?: { id: number; name: string } | null; position?: number }[];
  book_characters?: HardcoverCharacter[];
  book_mappings?: HardcoverBookMapping[];
}

/**
 * Extract the primary author name from a Hardcover contributions list.
 * Some books (translations, anthologies) have multiple contribution
 * roles; we prefer "Author" / "Co-Author" and fall back to the first
 * contributor with a name.
 */
export const hardcoverPrimaryAuthor = (
  contribs?: HardcoverSearchHit['contributions']
): string | undefined => {
  if (!contribs?.length) return undefined;
  const byRole = (roles: string[]) =>
    contribs.find((c) => {
      const r = c.contribution?.toLowerCase() ?? '';
      return roles.some((want) => r === want || r.includes(want));
    })?.author?.name;
  return (
    byRole(['author']) ??
    byRole(['co-author', 'coauthor']) ??
    contribs.find((c) => c.author?.name)?.author?.name
  );
};

export interface HardcoverSeriesMember {
  position?: number | null;
  book?: {
    id: number;
    title: string;
    users_count?: number | null;
    image?: { url?: string } | null;
    contributions?: {
      contribution?: string | null;
      author?: { name?: string } | null;
    }[];
    book_mappings?: HardcoverBookMapping[];
  } | null;
}

export interface HardcoverSeriesDetail {
  id: number;
  name: string;
  description?: string | null;
  book_series?: HardcoverSeriesMember[];
}

export interface HardcoverSeriesSearchHit {
  id: number;
  name: string;
  description?: string;
  booksCount?: number;
  authorName?: string;
  coverUrl?: string;
}

interface TypesenseSearchResponse {
  results?: {
    hits?: { document?: { id?: number | string } }[];
  };
}

/**
 * Minimal Hardcover GraphQL client. Hardcover is a free public book
 * metadata service (aggregated + community-moderated); we use it as an
 * optional secondary enrichment source for ratings, series, and tags.
 * Rate-limited to 60 req/min; token comes from the user's Hardcover
 * account settings page.
 */
class HardcoverAPI {
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || undefined;
  }

  private normalisedAuth(): string | null {
    if (!this.apiKey) return null;
    // Accept tokens pasted with or without the "Bearer " prefix — Hardcover's
    // docs page shows it prefixed, which trips up users who copy the whole
    // line and end up double-prefixed.
    const trimmed = this.apiKey.trim();
    return trimmed.toLowerCase().startsWith('bearer ')
      ? trimmed
      : `Bearer ${trimmed}`;
  }

  private async gql<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<{ data: T | null; error?: string }> {
    const auth = this.normalisedAuth();
    if (!auth) return { data: null, error: 'missing api key' };
    try {
      const response = await axios.post<{
        data?: T;
        errors?: { message: string }[];
      }>(
        HARDCOVER_ENDPOINT,
        { query, variables },
        {
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
            'User-Agent': 'allseerr',
          },
          timeout: 15000,
        }
      );
      if (response.data.errors?.length) {
        const errorMessage = response.data.errors
          .map((e) => e.message)
          .join('; ');
        logger.warn('Hardcover GraphQL returned errors', {
          label: 'hardcover',
          errors: errorMessage,
        });
        return { data: null, error: errorMessage };
      }
      return { data: response.data.data ?? null };
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      const body = (e as { response?: { data?: unknown } })?.response?.data;
      const bodyStr =
        typeof body === 'string'
          ? body.slice(0, 300)
          : body
            ? JSON.stringify(body).slice(0, 300)
            : undefined;
      const message =
        status === 401 || status === 403
          ? `${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'} — token rejected by Hardcover${bodyStr ? ` (${bodyStr})` : ''}`
          : e instanceof Error
            ? e.message
            : String(e);
      logger.error('Hardcover GraphQL call failed', {
        label: 'hardcover',
        status,
        error: message,
        body: bodyStr,
      });
      return { data: null, error: message };
    }
  }

  // Full book fields we want back from the follow-up books(where: id) query.
  // Kept here so searchBook / searchByIsbn stay small and identical.
  private static BOOK_FIELDS = `
    id
    title
    slug
    rating
    ratings_count
    users_count
    users_read_count
    pages
    release_date
    image { url }
    cached_tags
    contributions(limit: 5) {
      contribution
      author { name }
    }
    book_series(limit: 3) {
      position
      series { id name }
    }
    book_characters(limit: 8, order_by: { position: asc_nulls_last }) {
      only_mentioned
      spoiler
      character { name slug }
    }
    book_mappings {
      external_id
      platform { name }
    }
  `;

  /**
   * Fetch a book's full record by Hardcover numeric id (equality, allowed
   * on Hardcover's Hasura instance unlike `_ilike`).
   */
  private async getBookById(id: number): Promise<HardcoverSearchHit | null> {
    return cached(`book:${id}`, async () => {
      const gqlQuery = `
        query BookById($id: Int!) {
          books(where: { id: { _eq: $id } }, limit: 1) {
            ${HardcoverAPI.BOOK_FIELDS}
          }
        }
      `;
      const { data } = await this.gql<{ books: HardcoverSearchHit[] }>(
        gqlQuery,
        { id }
      );
      return data?.books?.[0] ?? null;
    });
  }

  /**
   * Look up a book by free-text title or ISBN. Hardcover exposes a
   * Typesense-backed `search` query (public API blocks Hasura `_ilike`);
   * we take the first hit and then fetch the full book by id.
   */
  async searchBook(
    query: string
  ): Promise<HardcoverSearchHit | null> {
    // Typesense search cached shorter (1h) since results evolve; the
    // subsequent getBookById is cached at the default 12h TTL.
    return cached(
      `search:${query.toLowerCase()}`,
      async () => {
        const gqlQuery = `
          query Search($q: String!) {
            search(
              query: $q,
              query_type: "books",
              per_page: 5,
              page: 1
            ) {
              results
            }
          }
        `;
        const { data } = await this.gql<{ search: TypesenseSearchResponse }>(
          gqlQuery,
          { q: query }
        );
        const firstId = data?.search?.results?.hits?.[0]?.document?.id;
        if (firstId == null) return null;
        return this.getBookById(Number(firstId));
      },
      3600
    );
  }

  /**
   * Multi-hit variant used by the aggregated book search. One Typesense
   * query → follow-up `books(where: {id: {_in}})` batch → full metadata
   * (incl. OpenLibrary mapping) for every hit in a single GraphQL call.
   */
  async searchBooks(
    query: string,
    limit = 10
  ): Promise<HardcoverSearchHit[]> {
    return cached(
      `search-books:${query.toLowerCase()}:${limit}`,
      async () => {
        const searchGql = `
          query Search($q: String!, $per: Int!) {
            search(
              query: $q,
              query_type: "books",
              per_page: $per,
              page: 1
            ) {
              results
            }
          }
        `;
        const { data: searchData } = await this.gql<{
          search: TypesenseSearchResponse;
        }>(searchGql, { q: query, per: limit });
        const ids = (searchData?.search?.results?.hits ?? [])
          .map((h) => h.document?.id)
          .filter((v): v is number | string => v != null)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v));
        if (ids.length === 0) return [];
        const batchGql = `
          query BooksByIds($ids: [Int!]!) {
            books(where: { id: { _in: $ids } }, limit: ${ids.length}) {
              ${HardcoverAPI.BOOK_FIELDS}
            }
          }
        `;
        const { data: batch } = await this.gql<{
          books: HardcoverSearchHit[];
        }>(batchGql, { ids });
        // Preserve Typesense score ordering (books(where:_in) returns by id).
        const byId = new Map(
          (batch?.books ?? []).map((b) => [b.id, b])
        );
        return ids
          .map((id) => byId.get(id))
          .filter((b): b is HardcoverSearchHit => !!b);
      },
      3600
    );
  }

  /**
   * Find series by free-text name (e.g. "The Witcher"). Typesense search
   * → one batched `series(where: {id: {_in}})` for metadata.
   */
  async searchSeries(
    query: string,
    limit = 5
  ): Promise<HardcoverSeriesSearchHit[]> {
    return cached(
      `search-series:${query.toLowerCase()}:${limit}`,
      async () => {
        const searchGql = `
          query SearchSeries($q: String!, $per: Int!) {
            search(
              query: $q,
              query_type: "series",
              per_page: $per,
              page: 1
            ) {
              results
            }
          }
        `;
        const { data: searchData } = await this.gql<{
          search: TypesenseSearchResponse;
        }>(searchGql, { q: query, per: limit });
        const ids = (searchData?.search?.results?.hits ?? [])
          .map((h) => h.document?.id)
          .filter((v): v is number | string => v != null)
          .map((v) => Number(v))
          .filter((v) => Number.isFinite(v));
        if (ids.length === 0) return [];
        const batchGql = `
          query SeriesByIds($ids: [Int!]!) {
            series(where: { id: { _in: $ids } }, limit: ${ids.length}) {
              id
              name
              description
              books_count
              author { name }
              book_series(order_by: { position: asc_nulls_last }, limit: 1) {
                book { image { url } }
              }
            }
          }
        `;
        const { data: batch } = await this.gql<{
          series: Array<{
            id: number;
            name: string;
            description?: string | null;
            books_count?: number | null;
            author?: { name?: string } | null;
            book_series?: {
              book?: { image?: { url?: string } | null } | null;
            }[];
          }>;
        }>(batchGql, { ids });
        const byId = new Map(
          (batch?.series ?? []).map((s) => [s.id, s])
        );
        return ids
          .map((id) => byId.get(id))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({
            id: s.id,
            name: s.name,
            description: s.description ?? undefined,
            booksCount: s.books_count ?? undefined,
            authorName: s.author?.name ?? undefined,
            coverUrl:
              s.book_series?.[0]?.book?.image?.url ?? undefined,
          }));
      },
      3600
    );
  }

  /**
   * Minimal connectivity check — returns a descriptive error message on
   * failure so the settings UI can tell the user exactly what went wrong.
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    const { data, error } = await this.gql<{ books: { id: number }[] }>(
      'query { books(limit: 1) { id } }'
    );
    if (error) {
      return { success: false, message: error };
    }
    if (!data) {
      return {
        success: false,
        message: 'Hardcover returned no data (unexpected)',
      };
    }
    return {
      success: true,
      message: `Connected to Hardcover (${data.books.length} sample book returned)`,
    };
  }

  /**
   * Look up a book by ISBN-13 / ISBN-10 through the editions table.
   */
  /**
   * Fetch a series and its members. Returns null on auth/network failure.
   */
  async getSeries(id: number): Promise<HardcoverSeriesDetail | null> {
    return cached(`series:${id}`, async () => this._getSeries(id));
  }

  private async _getSeries(
    id: number
  ): Promise<HardcoverSeriesDetail | null> {
    const gqlQuery = `
      query SeriesById($id: Int!) {
        series(where: { id: { _eq: $id } }, limit: 1) {
          id
          name
          description
          book_series(order_by: { position: asc_nulls_last }) {
            position
            book {
              id
              title
              users_count
              image { url }
              contributions(limit: 5) {
                contribution
                author { name }
              }
              book_mappings {
                external_id
                platform { name }
              }
            }
          }
        }
      }
    `;
    const { data } = await this.gql<{ series: HardcoverSeriesDetail[] }>(
      gqlQuery,
      { id }
    );
    return data?.series?.[0] ?? null;
  }

  async searchByIsbn(isbn: string): Promise<HardcoverSearchHit | null> {
    return cached(`isbn:${isbn}`, async () => this._searchByIsbn(isbn));
  }

  private async _searchByIsbn(
    isbn: string
  ): Promise<HardcoverSearchHit | null> {
    // editions(_eq) is allowed on Hardcover's public Hasura; _ilike is not.
    const gqlQuery = `
      query ByIsbn($isbn: String!) {
        editions(
          where: {
            _or: [
              { isbn_13: { _eq: $isbn } }
              { isbn_10: { _eq: $isbn } }
            ]
          }
          limit: 1
        ) {
          book {
            ${HardcoverAPI.BOOK_FIELDS}
          }
        }
      }
    `;
    const { data } = await this.gql<{
      editions: { book: HardcoverSearchHit }[];
    }>(gqlQuery, { isbn });
    return data?.editions?.[0]?.book ?? null;
  }
}

export default HardcoverAPI;
