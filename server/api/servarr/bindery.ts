import logger from '@server/logger';
import type { QualityProfile } from './base';
import ServarrBase from './base';

export interface BinderyBookAddOptions {
  foreignBookId: string;
  foreignAuthorId: string;
  authorName?: string;
  searchNow?: boolean;
}

export interface BinderyBook {
  id: number;
  title: string;
  foreignBookId: string;
  authorId?: number;
  monitored: boolean;
  qualityProfileId?: number;
  added: string;
  tags?: number[];
  statistics?: {
    bookFileCount: number;
    bookCount: number;
    sizeOnDisk: number;
  };
}

/**
 * Bindery exposes a servarr-like API but differs from Radarr/Sonarr:
 *  - auth is `X-Api-Key` header (not `?apikey=` query param)
 *  - profiles endpoint is lowercase `/qualityprofile`
 *  - book search is `POST /book/{id}/search` (no `/command` endpoint)
 *  - no single-book create; books are added via `POST /author/book`
 *    (author is auto-created unmonitored if not present)
 */
class BinderyAPI extends ServarrBase<{ bookId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'bindery', apiName: 'Bindery' });
    // Swap servarr's query-param auth for Bindery's header auth.
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
        `[Bindery] Failed to retrieve profiles: ${e.message}`,
        { cause: e }
      );
    }
  };

  /**
   * Search Bindery's metadata providers for authors by free-text term.
   * Used as a fallback when a request has no stored foreignAuthorId.
   */
  public searchAuthor = async (
    term: string
  ): Promise<{ foreignAuthorId: string; authorName: string }[]> => {
    try {
      const response = await this.axios.get<
        { foreignAuthorId: string; authorName: string }[]
      >('/search/author', { params: { term } });
      return response.data ?? [];
    } catch (e) {
      logger.error('Bindery author search failed', {
        label: 'Bindery API',
        errorMessage: e.message,
        term,
      });
      return [];
    }
  };

  /**
   * Search Bindery's metadata aggregator for books (OpenLibrary + Google
   * Books + Hardcover + DNB, deduped). Results come with the foreignBookId
   * Bindery uses internally, so requesting them back via /author/book is
   * much more likely to succeed than raw OpenLibrary Work keys.
   */
  public searchBooks = async (
    term: string
  ): Promise<
    {
      foreignBookId: string;
      foreignAuthorId?: string;
      authorName?: string;
      title: string;
      imageUrl?: string;
      releaseDate?: string | null;
      language?: string;
    }[]
  > => {
    try {
      const response = await this.axios.get<
        {
          foreignBookId: string;
          title: string;
          authorId?: number;
          author?: { foreignAuthorId?: string; authorName?: string };
          imageUrl?: string;
          releaseDate?: string | null;
          language?: string;
        }[]
      >('/search/book', { params: { term } });
      return (response.data ?? []).map((b) => ({
        foreignBookId: b.foreignBookId,
        foreignAuthorId: b.author?.foreignAuthorId,
        authorName: b.author?.authorName,
        title: b.title,
        imageUrl: b.imageUrl,
        releaseDate: b.releaseDate,
        language: b.language,
      }));
    } catch (e) {
      logger.error('Bindery book search failed', {
        label: 'Bindery API',
        errorMessage: e.message,
        term,
      });
      return [];
    }
  };

  /**
   * Resolve a book through Bindery's metadata pipeline by ISBN. Returns the
   * foreignBookId / foreignAuthorId Bindery's currently-active primary
   * provider would use — i.e. always OpenLibrary `OL...W` / `OL...A` IDs.
   * Lets us bridge from a different upstream catalogue (e.g. Hardcover)
   * by funnelling an ISBN through this single call.
   */
  public lookupBookByIsbn = async (
    isbn: string
  ): Promise<{
    foreignBookId: string;
    foreignAuthorId?: string;
    authorName?: string;
    title: string;
  } | null> => {
    try {
      const response = await this.axios.get<{
        foreignBookId: string;
        title: string;
        author?: { foreignAuthorId?: string; authorName?: string };
      }>('/book/lookup', { params: { isbn } });
      return {
        foreignBookId: response.data.foreignBookId,
        foreignAuthorId: response.data.author?.foreignAuthorId,
        authorName: response.data.author?.authorName,
        title: response.data.title,
      };
    } catch (e) {
      logger.warn('Bindery ISBN lookup failed', {
        label: 'Bindery API',
        errorMessage: e.message,
        isbn,
      });
      return null;
    }
  };

  public getBooks = async (): Promise<BinderyBook[]> => {
    try {
      const response = await this.axios.get<BinderyBook[]>('/book');
      return response.data;
    } catch (e) {
      throw new Error(`[Bindery] Failed to retrieve books: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getBook = async ({ id }: { id: number }): Promise<BinderyBook> => {
    try {
      const response = await this.axios.get<BinderyBook>(`/book/${id}`);
      return response.data;
    } catch (e) {
      throw new Error(`[Bindery] Failed to retrieve book: ${e.message}`, {
        cause: e,
      });
    }
  };

  /**
   * Adds a book to Bindery by its foreign IDs. Bindery creates the author
   * automatically (unmonitored) if missing, polls its metadata sync up to 15s
   * for the book, marks it monitored, and triggers a search when requested.
   */
  public addBook = async (
    options: BinderyBookAddOptions
  ): Promise<BinderyBook> => {
    try {
      // Bindery stores foreign IDs without OpenLibrary path prefixes
      // (e.g. "OL123W" not "/works/OL123W"). Strip them so the 15s poll
      // loop finds the fetched book.
      const stripPrefix = (id: string) =>
        id.replace(/^\/(works|authors)\//, '');

      // Bindery polls for up to 15s after creating a new author (metadata
      // fetch + author-book sync), so the default 10s timeout is too tight.
      const response = await this.axios.post<BinderyBook>(
        '/author/book',
        {
          foreignBookId: stripPrefix(options.foreignBookId),
          foreignAuthorId: stripPrefix(options.foreignAuthorId),
          authorName: options.authorName,
          searchOnAdd: options.searchNow ?? false,
        },
        { timeout: 30000 }
      );

      logger.info('Bindery accepted book add', {
        label: 'Bindery',
        bookId: response.data.id,
        title: response.data.title,
      });

      return response.data;
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      logger.error('Failed to add book to Bindery', {
        label: 'Bindery',
        status,
        errorMessage: e.message,
        options,
        response: body,
      });
      throw new Error(
        `Failed to add book to Bindery${status ? ` (${status})` : ''}: ${
          typeof body?.message === 'string' ? body.message : e.message
        }`,
        { cause: e }
      );
    }
  };

  public async setAuthorMonitored(
    authorId: number,
    monitored: boolean
  ): Promise<void> {
    try {
      await this.axios.put(`/author/${authorId}`, { monitored });
    } catch (e) {
      logger.warn('Bindery author monitor update failed', {
        label: 'Bindery API',
        errorMessage: e.message,
        authorId,
        monitored,
      });
    }
  }

  public async setBookMonitored(
    bookId: number,
    monitored: boolean
  ): Promise<void> {
    await this.axios.put(`/book/${bookId}`, { monitored });
  }

  /**
   * Find the Bindery author record by its foreign ID (e.g. OpenLibrary
   * "OL23919A"). Returns null if not present.
   */
  public async findAuthorByForeignId(
    foreignAuthorId: string
  ): Promise<{ id: number; authorName: string } | null> {
    try {
      const response = await this.axios.get<
        { id: number; foreignAuthorId: string; authorName: string }[]
      >('/author');
      return (
        response.data.find((a) => a.foreignAuthorId === foreignAuthorId) ?? null
      );
    } catch {
      return null;
    }
  }

  /**
   * Find a book in Bindery's catalogue of a given author whose title best
   * matches the provided one. Used as a fallback when /author/book can't
   * find the exact foreignBookId (Bindery dedups by title so the canonical
   * OpenLibrary Work may be absent in favor of a sibling edition).
   */
  public async findAuthorBookByTitle(
    authorId: number,
    title: string
  ): Promise<{ id: number; title: string; monitored: boolean } | null> {
    try {
      const response = await this.axios.get<
        { id: number; title: string; authorId: number; monitored: boolean }[]
      >('/book');
      const candidates = response.data.filter((b) => b.authorId === authorId);

      // Normalize: strip parenthetical/bracket suffixes ("(SparkNotes Guide)",
      // "[1/2]", "(Volume 3)"), drop articles, collapse non-alphanumerics,
      // and apply known title equivalences (Sorcerer's ↔ Philosopher's, etc.)
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/\s*[([{].*?[)\]}]\s*/g, ' ') // strip (…) [...] {...}
          .replace(/\bsorcerer'?s?\b/g, 'philosophers') // US→UK Harry Potter
          .replace(/\bphilosopher'?s?\b/g, 'philosophers')
          .replace(/^(the|a|an|le|la|les|un|une|des|el|los|il|die|der|das)\s+/, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();

      const target = normalize(title);
      if (!target) return null;

      const tokens = (s: string) =>
        new Set(s.split(' ').filter((t) => t.length > 2));
      const targetTokens = tokens(target);

      // Exact match → prefix → contains → Jaccard token overlap (≥0.7)
      const exact = candidates.find((b) => normalize(b.title) === target);
      if (exact) return exact;

      const prefix = candidates.find((b) =>
        normalize(b.title).startsWith(target)
      );
      if (prefix) return prefix;

      const contains = candidates.find((b) =>
        normalize(b.title).includes(target)
      );
      if (contains) return contains;

      let best: { cand: (typeof candidates)[number]; score: number } | null =
        null;
      for (const c of candidates) {
        const candTokens = tokens(normalize(c.title));
        if (candTokens.size === 0) continue;
        const intersection = new Set(
          [...targetTokens].filter((t) => candTokens.has(t))
        );
        const union = new Set([...targetTokens, ...candTokens]);
        const score = intersection.size / union.size;
        if (score >= 0.7 && (!best || score > best.score)) {
          best = { cand: c, score };
        }
      }
      return best?.cand ?? null;
    } catch {
      return null;
    }
  }

  public async searchBook(bookId: number): Promise<void> {
    try {
      // Bindery: per-book search route, no `/command` endpoint
      await this.axios.post(`/book/${bookId}/search`);
    } catch (e) {
      logger.error('Bindery search command failed', {
        label: 'Bindery API',
        errorMessage: e.message,
        bookId,
      });
    }
  }

  public removeBook = async (bookId: number): Promise<void> => {
    try {
      await this.axios.delete(`/book/${bookId}`);
      logger.info(`[Bindery] Removed book ${bookId}`);
    } catch (e) {
      throw new Error(`[Bindery] Failed to remove book: ${e.message}`, {
        cause: e,
      });
    }
  };
}

export default BinderyAPI;
