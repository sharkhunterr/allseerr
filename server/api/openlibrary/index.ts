import logger from '@server/logger';
import axios from 'axios';

const OPENLIBRARY_BASE = 'https://openlibrary.org';

// MARC country-of-publication codes (publish_country) → ISO-2, most common
// ones. Full list: https://www.loc.gov/marc/countries/cou_home.html
const MARC_TO_ISO2: Record<string, string> = {
  // United Kingdom / England / Scotland / Wales / NI
  enk: 'GB', stk: 'GB', wlk: 'GB', nik: 'GB', uik: 'GB', ukr: 'UA',
  // United States states — collapsed to US
  nyu: 'US', cau: 'US', mau: 'US', ilu: 'US', txu: 'US', pau: 'US',
  vau: 'US', flu: 'US', ohu: 'US', miu: 'US', gau: 'US', ncu: 'US',
  nju: 'US', mdu: 'US', wau: 'US', inu: 'US', mou: 'US', mnu: 'US',
  wiu: 'US', azu: 'US', cou: 'US', ctu: 'US', lau: 'US', oru: 'US',
  tnu: 'US', utu: 'US', alu: 'US', aru: 'US', hiu: 'US', idu: 'US',
  iau: 'US', ksu: 'US', kyu: 'US', meu: 'US', mpu: 'US', msu: 'US',
  mtu: 'US', nbu: 'US', ndu: 'US', nhu: 'US', nmu: 'US', nvu: 'US',
  oku: 'US', riu: 'US', scu: 'US', sdu: 'US', vtu: 'US', wvu: 'US',
  wyu: 'US', aku: 'US', dcu: 'US', xxu: 'US', xxc: 'CA', xxk: 'GB',
  // Canada
  abc: 'CA', bcc: 'CA', mbc: 'CA', nfc: 'CA', nkc: 'CA', nsc: 'CA',
  ntc: 'CA', nuc: 'CA', onc: 'CA', pic: 'CA', quc: 'CA', snc: 'CA',
  ykc: 'CA',
  // Europe
  fr: 'FR', gw: 'DE', it: 'IT', sp: 'ES', po: 'PT', sw: 'SE', fi: 'FI',
  dk: 'DK', ne: 'NL', be: 'BE', ci: 'CH', au: 'AT', hu: 'HU', pl: 'PL',
  rb: 'RS', ru: 'RU', gr: 'GR', ie: 'IE', no: 'NO',
  // Rest
  at: 'AU', xxa: 'AU', nz: 'NZ', ja: 'JP', cc: 'CN', ko: 'KR', is: 'IL',
  ti: 'TH', vm: 'VN', si: 'SG', ii: 'IN', ag: 'AR', bl: 'BR', mx: 'MX',
};

export interface OpenLibrarySearchResult {
  key: string;
  title: string;
  author_name?: string[];
  author_key?: string[];
  isbn?: string[];
  first_publish_year?: number;
  publisher?: string[];
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  language?: string[];
  edition_count?: number;
}

export interface OpenLibrarySearchResponse {
  numFound: number;
  start: number;
  docs: OpenLibrarySearchResult[];
}

export interface OpenLibraryWork {
  key: string;
  title: string;
  description?: string | { value: string };
  covers?: number[];
  subjects?: string[];
  authors?: Array<{ author: { key: string }; type?: { key: string } }>;
  series?: Array<{
    series: { key: string };
    position?: string;
  }>;
}

export interface OpenLibrarySeries {
  key: string; // e.g. "OL326110L"
  name: string;
  description?: string;
  seedCount: number;
}

export interface OpenLibrarySeriesMember {
  workKey: string; // e.g. "OL82563W"
  title: string;
  coverUrl?: string;
}

export interface BookResult {
  openLibraryId: string;
  title: string;
  authorName: string;
  authorKey?: string;
  isbn13?: string;
  isbn10?: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  pageCount?: number;
  subjects?: string[];
}

/**
 * OpenLibrary API client following the Libreseerr pattern.
 * Used as the sole user-facing search source for books and audiobooks.
 */
class OpenLibraryAPI {
  /**
   * Search for books by free-text query (title, author, or ISBN).
   */
  async search(
    query: string,
    page = 1,
    limit = 20
  ): Promise<{ results: BookResult[]; totalResults: number }> {
    try {
      const response = await axios.get<OpenLibrarySearchResponse>(
        `${OPENLIBRARY_BASE}/search.json`,
        {
          params: {
            q: query,
            page,
            limit,
            fields:
              'key,title,author_name,author_key,isbn,first_publish_year,publisher,cover_i,number_of_pages_median,subject',
          },
          timeout: 10000,
        }
      );

      const results = response.data.docs.map((doc) =>
        this.mapSearchResult(doc)
      );

      return {
        results,
        totalResults: response.data.numFound,
      };
    } catch (e) {
      logger.error('OpenLibrary search failed', {
        label: 'openlibrary',
        query,
        error: e instanceof Error ? e.message : String(e),
      });
      throw new Error(
        `OpenLibrary search failed: ${
          e instanceof Error ? e.message : String(e)
        }`
      );
    }
  }

  /**
   * Search by ISBN specifically.
   */
  async searchByISBN(isbn: string): Promise<BookResult | null> {
    try {
      const response = await axios.get<OpenLibrarySearchResponse>(
        `${OPENLIBRARY_BASE}/search.json`,
        {
          params: {
            isbn,
            fields:
              'key,title,author_name,author_key,isbn,first_publish_year,publisher,cover_i,number_of_pages_median',
            limit: 1,
          },
          timeout: 10000,
        }
      );

      if (response.data.docs.length === 0) {
        return null;
      }

      return this.mapSearchResult(response.data.docs[0]);
    } catch (e) {
      logger.error('OpenLibrary ISBN search failed', {
        label: 'openlibrary',
        isbn,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Get work details by OpenLibrary work key (e.g., /works/OL12345W).
   */
  async getWork(workKey: string): Promise<OpenLibraryWork | null> {
    try {
      const response = await axios.get<OpenLibraryWork>(
        `${OPENLIBRARY_BASE}${workKey}.json`,
        { timeout: 10000 }
      );
      return response.data;
    } catch (e) {
      logger.error('OpenLibrary work fetch failed', {
        label: 'openlibrary',
        workKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * Fetch metadata for an OpenLibrary series (e.g. "OL326110L" or
   * "/series/OL326110L").
   */
  async getSeries(seriesKey: string): Promise<OpenLibrarySeries | null> {
    const key = seriesKey.replace(/^\/series\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        name?: string;
        description?: string | { value: string };
        seed_count?: number;
      }>(`${OPENLIBRARY_BASE}/series/${key}.json`, { timeout: 10000 });
      return {
        key,
        name: response.data.name ?? key,
        description:
          typeof response.data.description === 'string'
            ? response.data.description
            : response.data.description?.value,
        seedCount: response.data.seed_count ?? 0,
      };
    } catch (e) {
      logger.error('OpenLibrary series fetch failed', {
        label: 'openlibrary',
        seriesKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  /**
   * List the works that belong to an OpenLibrary series.
   */
  async getSeriesMembers(
    seriesKey: string
  ): Promise<OpenLibrarySeriesMember[]> {
    const key = seriesKey.replace(/^\/series\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        entries?: {
          url: string;
          type: string;
          title: string;
          picture?: { url?: string };
        }[];
      }>(`${OPENLIBRARY_BASE}/series/${key}/seeds.json`, { timeout: 10000 });
      return (response.data.entries ?? [])
        .filter((e) => e.type === 'work' && e.url.startsWith('/works/'))
        .map((e) => ({
          workKey: e.url.replace('/works/', ''),
          title: e.title,
          coverUrl: e.picture?.url
            ? e.picture.url.startsWith('//')
              ? `https:${e.picture.url.replace('-S.jpg', '-L.jpg')}`
              : e.picture.url
            : undefined,
        }));
    } catch (e) {
      logger.error('OpenLibrary series seeds fetch failed', {
        label: 'openlibrary',
        seriesKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return [];
    }
  }

  /**
   * Fetch editions for a work and pull a representative ISBN-13 / ISBN-10
   * and publish country. OpenLibrary work objects don't carry these
   * (they live on editions), so callers needing them must call this.
   * Country comes back as an ISO-3166 2-letter code (e.g. "us", "gb",
   * "fr") when an edition has it, `undefined` otherwise.
   */
  async getWorkEditionFacts(
    workKey: string
  ): Promise<{
    isbn13?: string;
    isbn10?: string;
    country?: string;
  }> {
    const key = workKey.replace(/^\/works\//, '').replace(/^\//, '');
    try {
      const response = await axios.get<{
        entries?: {
          isbn_13?: string[];
          isbn_10?: string[];
          publish_country?: string;
        }[];
      }>(`${OPENLIBRARY_BASE}/works/${key}/editions.json`, {
        params: { limit: 20 },
        timeout: 10000,
      });
      const entries = response.data.entries ?? [];
      const isbn13 = entries
        .flatMap((e) => e.isbn_13 ?? [])
        .find((v) => /^[0-9]{13}$/.test(v));
      const isbn10 = entries
        .flatMap((e) => e.isbn_10 ?? [])
        .find((v) => /^[0-9Xx]{10}$/.test(v));
      // MARC publish_country codes are 2-3 chars (e.g. "enk"=England,
      // "nyu"=NY USA). Map the most common ones to ISO-2 codes, fall
      // back to the raw value so the UI can still show something.
      const rawCountry = entries
        .map((e) => e.publish_country?.trim().toLowerCase())
        .find((v): v is string => !!v && v.length > 0);
      const country = rawCountry
        ? MARC_TO_ISO2[rawCountry] ?? rawCountry.slice(0, 2).toUpperCase()
        : undefined;
      return { isbn13, isbn10, country };
    } catch (e) {
      logger.error('OpenLibrary editions fetch failed', {
        label: 'openlibrary',
        workKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return {};
    }
  }

  /** @deprecated kept for back-compat, use getWorkEditionFacts */
  async getWorkIsbns(
    workKey: string
  ): Promise<{ isbn13?: string; isbn10?: string }> {
    const { isbn13, isbn10 } = await this.getWorkEditionFacts(workKey);
    return { isbn13, isbn10 };
  }

  /**
   * Get author name by OpenLibrary author key (e.g., "OL12345A" or
   * "/authors/OL12345A").
   */
  async getAuthorName(authorKey: string): Promise<string | null> {
    const info = await this.getAuthor(authorKey);
    return info?.name ?? null;
  }

  /**
   * Get full author details by OpenLibrary author key. Returns name,
   * photo URL (if available), bio, birth/death dates.
   */
  async getAuthor(authorKey: string): Promise<{
    name?: string;
    photoUrl?: string;
    bio?: string;
    birthDate?: string;
    deathDate?: string;
  } | null> {
    const path = authorKey.startsWith('/')
      ? authorKey
      : `/authors/${authorKey}`;
    try {
      const response = await axios.get<{
        name?: string;
        bio?: string | { value?: string };
        photos?: number[];
        birth_date?: string;
        death_date?: string;
      }>(`${OPENLIBRARY_BASE}${path}.json`, { timeout: 10000 });
      const photoId = response.data.photos?.find(
        (id) => typeof id === 'number' && id > 0
      );
      const photoUrl = photoId
        ? `https://covers.openlibrary.org/a/id/${photoId}-L.jpg`
        : undefined;
      const bioRaw = response.data.bio;
      const bio =
        typeof bioRaw === 'string'
          ? bioRaw
          : bioRaw?.value ?? undefined;
      return {
        name: response.data.name,
        photoUrl,
        bio,
        birthDate: response.data.birth_date,
        deathDate: response.data.death_date,
      };
    } catch (e) {
      logger.error('OpenLibrary author fetch failed', {
        label: 'openlibrary',
        authorKey,
        error: e instanceof Error ? e.message : String(e),
      });
      return null;
    }
  }

  private mapSearchResult(doc: OpenLibrarySearchResult): BookResult {
    const isbns = doc.isbn ?? [];
    const isbn13 = isbns.find((i) => i.length === 13);
    const isbn10 = isbns.find((i) => i.length === 10);

    return {
      openLibraryId: doc.key,
      title: doc.title,
      authorName: doc.author_name?.[0] ?? 'Unknown Author',
      authorKey: doc.author_key?.[0],
      isbn13,
      isbn10,
      coverUrl: doc.cover_i
        ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`
        : undefined,
      year: doc.first_publish_year,
      publisher: doc.publisher?.[0],
      pageCount: doc.number_of_pages_median,
      subjects: doc.subject?.slice(0, 10),
    };
  }
}

export default OpenLibraryAPI;
