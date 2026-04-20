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

  private async gql<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
    if (!this.apiKey) {
      return null;
    }
    try {
      const response = await axios.post<{
        data?: T;
        errors?: { message: string }[];
      }>(
        HARDCOVER_ENDPOINT,
        { query, variables },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );
      if (response.data.errors?.length) {
        logger.warn('Hardcover GraphQL returned errors', {
          label: 'hardcover',
          errors: response.data.errors.map((e) => e.message).join('; '),
        });
        return null;
      }
      return response.data.data ?? null;
    } catch (e) {
      logger.error('Hardcover GraphQL call failed', {
        label: 'hardcover',
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
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
    const result = await this.gql<{ books: HardcoverSearchHit[] }>(
      gqlQuery,
      { q: `%${query}%` }
    );
    return result?.books?.[0] ?? null;
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
    const result = await this.gql<{
      editions: { book: HardcoverSearchHit }[];
    }>(gqlQuery, { isbn });
    return result?.editions?.[0]?.book ?? null;
  }
}

export default HardcoverAPI;
