import logger from '@server/logger';
import axios from 'axios';

const HARDCOVER_ENDPOINT = 'https://api.hardcover.app/v1/graphql';

export interface HardcoverSearchHit {
  id: number;
  title: string;
  slug?: string;
  rating?: number | null;
  ratings_count?: number | null;
  pages?: number | null;
  release_date?: string | null;
  language?: { language?: string } | null;
  image?: { url?: string } | null;
  contributions?: { author?: { name?: string } | null }[];
  book_series?: { series?: { id: number; name: string } | null; position?: number }[];
  book_mappings?: { external_id?: string; platform?: { name?: string } }[];
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

  /**
   * Look up a book by free-text title or ISBN. Hardcover's books table is
   * keyed on its own numeric id; we return the first match.
   */
  async searchBook(
    query: string
  ): Promise<HardcoverSearchHit | null> {
    const gqlQuery = `
      query Search($q: String!) {
        books(
          where: { title: { _ilike: $q } }
          order_by: { rating: desc_nulls_last }
          limit: 5
        ) {
          id
          title
          slug
          rating
          ratings_count
          pages
          release_date
          language { language }
          image { url }
          contributions(where: { contribution: { _eq: "Author" } }, limit: 1) {
            author { name }
          }
          book_series(limit: 3) {
            position
            series { id name }
          }
        }
      }
    `;
    const { data } = await this.gql<{ books: HardcoverSearchHit[] }>(
      gqlQuery,
      { q: `%${query}%` }
    );
    return data?.books?.[0] ?? null;
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
  async searchByIsbn(isbn: string): Promise<HardcoverSearchHit | null> {
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
            id
            title
            slug
            rating
            ratings_count
            pages
            release_date
            language { language }
            image { url }
            contributions(where: { contribution: { _eq: "Author" } }, limit: 1) {
              author { name }
            }
            book_series(limit: 3) {
              position
              series { id name }
            }
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
