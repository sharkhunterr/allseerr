import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import axios from 'axios';

const GOOGLE_BOOKS_BASE = 'https://www.googleapis.com/books/v1';
const cache = cacheManager.getCache('pressarr').data;

/**
 * Magazine-search helper for Google Books. Distinct file from
 * the existing googlebooks book helpers because:
 *   1. The Volumes API ``printType=magazines`` filter returns a
 *      different sub-genre (periodicals + ISSN-tagged titles)
 *      that allseerr's magazine pipeline cares about exclusively
 *   2. Caches go through the ``pressarr`` cache slot since
 *      this is a magazine-domain concern, keeping the
 *      ``googlebooks`` cache slot for the book pipeline
 *
 * Google Books requires an API key for high-volume access but
 * tolerates anonymous calls at a low quota — sufficient for an
 * operator-driven discover page. When a key is configured in
 * Settings → Book Metadata Providers we pass it through.
 */

export interface GoogleBooksMagazineHit {
  id: string;
  title: string;
  subtitle?: string;
  publisher?: string;
  publishedDate?: string;
  year?: number;
  description?: string;
  coverUrl?: string;
  issn?: string;
  language?: string;
  // Free-form info link from Google so the request modal can
  // deep-link to the source listing for the operator to verify.
  infoLink?: string;
}

interface GoogleBooksVolumeIdentifier {
  type: string;
  identifier: string;
}

interface GoogleBooksVolumeRaw {
  id: string;
  volumeInfo?: {
    title?: string;
    subtitle?: string;
    publisher?: string;
    publishedDate?: string;
    description?: string;
    language?: string;
    imageLinks?: {
      smallThumbnail?: string;
      thumbnail?: string;
    };
    industryIdentifiers?: GoogleBooksVolumeIdentifier[];
    infoLink?: string;
  };
}

interface GoogleBooksVolumesResponse {
  items?: GoogleBooksVolumeRaw[];
  totalItems?: number;
}

function mapVolume(v: GoogleBooksVolumeRaw): GoogleBooksMagazineHit {
  const info = v.volumeInfo ?? {};
  const issn = info.industryIdentifiers?.find(
    (id) => id.type === 'ISSN'
  )?.identifier;
  const year = info.publishedDate
    ? Number(info.publishedDate.slice(0, 4)) || undefined
    : undefined;
  return {
    id: v.id,
    title: info.title ?? 'Untitled',
    subtitle: info.subtitle,
    publisher: info.publisher,
    publishedDate: info.publishedDate,
    year,
    description: info.description,
    coverUrl:
      info.imageLinks?.thumbnail ?? info.imageLinks?.smallThumbnail,
    issn,
    language: info.language,
    infoLink: info.infoLink,
  };
}

/**
 * Free-text magazine search. ``maxResults`` capped at 40 by
 * Google. Cached 1h per query so repeated discover-page browses
 * don't burn the quota.
 */
export async function searchMagazines(
  query: string,
  opts: { apiKey?: string; maxResults?: number; startIndex?: number } = {}
): Promise<GoogleBooksMagazineHit[]> {
  const term = query.trim();
  if (!term) return [];
  const start = Math.max(0, opts.startIndex ?? 0);
  const max = Math.max(1, Math.min(40, opts.maxResults ?? 20));
  const key = `magsearch:${term.toLowerCase()}:${start}:${max}`;
  const hit = cache.get<GoogleBooksMagazineHit[]>(key);
  if (hit !== undefined) return hit;
  try {
    const response = await axios.get<GoogleBooksVolumesResponse>(
      `${GOOGLE_BOOKS_BASE}/volumes`,
      {
        params: {
          q: term,
          printType: 'magazines',
          maxResults: max,
          startIndex: start,
          key: opts.apiKey,
        },
        timeout: 15000,
      }
    );
    const results = (response.data.items ?? []).map(mapVolume);
    if (results.length > 0) {
      cache.set(key, results, 3600);
    }
    return results;
  } catch (e) {
    logger.warn('Google Books magazine search failed', {
      label: 'googlebooks-magazines',
      query: term,
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * Single-volume lookup by id — used to re-hydrate a magazine
 * on the detail page when an operator deep-links via the
 * Google Books id.
 */
export async function getMagazineById(
  volumeId: string,
  opts: { apiKey?: string } = {}
): Promise<GoogleBooksMagazineHit | null> {
  if (!volumeId?.trim()) return null;
  const key = `mag:${volumeId}`;
  const hit = cache.get<GoogleBooksMagazineHit | null>(key);
  if (hit !== undefined) return hit;
  try {
    const response = await axios.get<GoogleBooksVolumeRaw>(
      `${GOOGLE_BOOKS_BASE}/volumes/${volumeId}`,
      { params: { key: opts.apiKey }, timeout: 15000 }
    );
    const mapped = mapVolume(response.data);
    cache.set(key, mapped, 86400);
    return mapped;
  } catch (e) {
    logger.warn('Google Books magazine get-by-id failed', {
      label: 'googlebooks-magazines',
      volumeId,
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}
