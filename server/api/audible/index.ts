import logger from '@server/logger';
import axios from 'axios';

export type AudibleRegion =
  | 'us'
  | 'ca'
  | 'uk'
  | 'au'
  | 'fr'
  | 'de'
  | 'jp'
  | 'it'
  | 'in'
  | 'es'
  | 'br';

const AUDIBLE_REGIONS: Record<AudibleRegion, string> = {
  us: '.com',
  ca: '.ca',
  uk: '.co.uk',
  au: '.com.au',
  fr: '.fr',
  de: '.de',
  jp: '.co.jp',
  it: '.it',
  in: '.in',
  es: '.es',
  br: '.com.br',
};

interface AudibleAuthor {
  asin?: string;
  name: string;
}

interface AudibleProduct {
  asin: string;
  title: string;
  subtitle?: string;
  authors?: AudibleAuthor[];
  narrators?: AudibleAuthor[];
  product_images?: Record<string, string>;
  runtime_length_min?: number;
  release_date?: string;
  publisher_name?: string;
  publisher_summary?: string;
  merchandising_summary?: string;
  language?: string;
  format_type?: string;
  content_delivery_type?: string;
  content_type?: string;
}

interface AudibleSearchApiResponse {
  products: AudibleProduct[];
  total_results?: number;
}

interface AudibleSingleApiResponse {
  product: AudibleProduct;
}

export interface AudiobookResult {
  asin: string;
  title: string;
  subtitle?: string;
  authorName: string;
  narratorName?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  durationSeconds?: number;
  summary?: string;
  releaseDate?: string;
  language?: string;
}

const toResult = (p: AudibleProduct): AudiobookResult => {
  const cover =
    p.product_images?.['500'] ||
    p.product_images?.['1024'] ||
    Object.values(p.product_images ?? {})[0];

  const year = p.release_date
    ? parseInt(p.release_date.slice(0, 4), 10)
    : undefined;

  return {
    asin: p.asin,
    title: p.title,
    subtitle: p.subtitle,
    authorName: p.authors?.map((a) => a.name).join(', ') || 'Unknown',
    narratorName: p.narrators?.map((n) => n.name).join(', '),
    coverUrl: cover,
    year,
    publisher: p.publisher_name,
    durationSeconds: p.runtime_length_min
      ? p.runtime_length_min * 60
      : undefined,
    summary: p.publisher_summary || p.merchandising_summary,
    releaseDate: p.release_date,
    language: p.language,
  };
};

/**
 * Audible Catalog API client (free, no auth required).
 * Based on: https://audible.readthedocs.io/en/latest/misc/external_api.html
 */
class AudibleAPI {
  private region: AudibleRegion;

  constructor(region: AudibleRegion = 'us') {
    this.region = region;
  }

  private baseUrl(): string {
    return `https://api.audible${AUDIBLE_REGIONS[this.region]}/1.0`;
  }

  async search(
    query: string,
    numResults = 20,
    page = 0
  ): Promise<{ results: AudiobookResult[]; totalResults: number }> {
    try {
      const response = await axios.get<AudibleSearchApiResponse>(
        `${this.baseUrl()}/catalog/products`,
        {
          params: {
            num_results: numResults,
            products_sort_by: 'Relevance',
            keywords: query,
            page,
            response_groups:
              'media,product_attrs,product_desc,contributors,product_extended_attrs',
          },
          timeout: 10000,
        }
      );

      const products = response.data.products ?? [];
      // Filter out podcasts and other non-audiobook content
      const audiobooks = products.filter(
        (p) =>
          p.content_delivery_type !== 'PodcastEpisode' &&
          p.content_type !== 'Podcast'
      );

      return {
        results: audiobooks.map(toResult),
        totalResults: response.data.total_results ?? audiobooks.length,
      };
    } catch (e) {
      logger.error('Audible search failed', {
        label: 'audible',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
      return { results: [], totalResults: 0 };
    }
  }

  async getProduct(asin: string): Promise<AudiobookResult | null> {
    try {
      const response = await axios.get<AudibleSingleApiResponse>(
        `${this.baseUrl()}/catalog/products/${asin}`,
        {
          params: {
            response_groups:
              'media,product_attrs,product_desc,contributors,product_extended_attrs',
          },
          timeout: 10000,
        }
      );
      return response.data.product ? toResult(response.data.product) : null;
    } catch (e) {
      logger.error('Audible getProduct failed', {
        label: 'audible',
        asin,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }
}

export default AudibleAPI;
