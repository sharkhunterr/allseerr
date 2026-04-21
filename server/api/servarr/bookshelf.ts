import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import type { QualityProfile } from './base';
import ServarrBase from './base';

const bookshelfCache = cacheManager.getCache('bookshelf').data;

export interface BookshelfBookAddOptions {
  /** Free-text title used to look up the book in Bookshelf's metadata. */
  title: string;
  /** Free-text author name used for /author/lookup. */
  authorName: string;
  /**
   * Preferred lookup keys — Bookshelf's /book/lookup deterministically
   * matches by ISBN when supplied, much more reliable than title+author
   * fuzzy search (which can pick the wrong edition / translation).
   */
  isbn13?: string;
  isbn10?: string;
  /**
   * OpenLibrary work key kept for logging/troubleshooting only — Bookshelf
   * uses Goodreads/Hardcover numeric IDs internally and won't recognise OL
   * keys, so we resolve the actual Bookshelf foreign IDs via lookup.
   */
  foreignBookId?: string;
  foreignAuthorId?: string;
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath: string;
  tags?: number[];
  monitored?: boolean;
  searchNow?: boolean;
}

export interface BookshelfBook {
  id: number;
  title: string;
  foreignBookId: string;
  authorId?: number;
  monitored: boolean;
  qualityProfileId?: number;
  added?: string;
  tags?: number[];
  statistics?: {
    bookFileCount: number;
    bookCount: number;
    sizeOnDisk: number;
  };
}

/**
 * Bookshelf is a revival/fork of Readarr that kept the Readarr.Api.V1
 * namespace unchanged, so its HTTP API is byte-for-byte Readarr's:
 *   - auth: X-Api-Key header
 *   - profiles: /qualityprofile (lowercase, .NET route-case-insensitive)
 *   - add book: POST /book with a nested `author` payload (Readarr's flow)
 *   - search: via POST /command { name: "BookSearch", bookIds: [id] }
 */
class BookshelfAPI extends ServarrBase<{ bookId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'bookshelf', apiName: 'Bookshelf' });
    // Readarr/Bookshelf accept either query param or header, but we stick
    // with the header convention used by the Bindery integration.
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
        `[Bookshelf] Failed to retrieve profiles: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getMetadataProfiles = async (): Promise<QualityProfile[]> => {
    try {
      const response = await this.axios.get<QualityProfile[]>(
        '/metadataprofile'
      );
      return response.data;
    } catch (e) {
      throw new Error(
        `[Bookshelf] Failed to retrieve metadata profiles: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getBooks = async (): Promise<BookshelfBook[]> => {
    try {
      const response = await this.axios.get<BookshelfBook[]>('/book');
      return response.data;
    } catch (e) {
      throw new Error(
        `[Bookshelf] Failed to retrieve books: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getBook = async ({ id }: { id: number }): Promise<BookshelfBook> => {
    try {
      const response = await this.axios.get<BookshelfBook>(`/book/${id}`);
      return response.data;
    } catch (e) {
      throw new Error(
        `[Bookshelf] Failed to retrieve book: ${e.message}`,
        { cause: e }
      );
    }
  };

  public async lookupBook(term: string): Promise<BookshelfBook[]> {
    const cacheKey = `lookup-book:${term.toLowerCase()}`;
    const hit = bookshelfCache.get<BookshelfBook[]>(cacheKey);
    if (hit !== undefined) return hit;
    try {
      // Bookshelf proxies to Goodreads/Hardcover — allow up to 25s for
      // these upstream calls; the default 10s axios timeout is too tight.
      const response = await this.axios.get<BookshelfBook[]>('/book/lookup', {
        params: { term },
        timeout: 25000,
      });
      const value = response.data ?? [];
      // Cache 1h — same lookup during a session is a common flow
      // (book detail opens it twice: once for metadata, once for dispatch).
      bookshelfCache.set(cacheKey, value, 3600);
      return value;
    } catch (e) {
      logger.error('Bookshelf book lookup failed', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        term,
      });
      return [];
    }
  }

  /**
   * Locate a book already in Bookshelf's catalogue by its Goodreads-style
   * foreignBookId or foreignEditionId — Bookshelf eagerly fetches the
   * whole author's metadata when the author is created, so sibling books
   * end up in the DB as unmonitored metadata records. Posting them again
   * via POST /book triggers a 409 UNIQUE constraint on Editions.
   */
  /**
   * Fetch the full Bookshelf catalogue once and cache for 2 minutes.
   * Multiple callers (findExistingBook, findSeriesMembers) hit this —
   * the 2-min TTL still gives fresh data after an add without flooding
   * the Bookshelf process on every book detail page load.
   */
  private async getAllBooksCached(): Promise<BookshelfBook[]> {
    const cacheKey = 'all-books';
    const hit = bookshelfCache.get<BookshelfBook[]>(cacheKey);
    if (hit !== undefined) return hit;
    try {
      const response = await this.axios.get<BookshelfBook[]>('/book', {
        timeout: 25000,
      });
      const value = response.data ?? [];
      bookshelfCache.set(cacheKey, value, 120);
      return value;
    } catch {
      return [];
    }
  }

  /**
   * List all books whose `seriesTitle` matches the given series name.
   * Bookshelf's /series endpoint is rarely populated, but every /book
   * row carries `seriesTitle` strings like "Silo #3" or multi-series
   * "Wool #2; Silo #1B". We iterate /book once, split on `;`, and
   * extract matching entries with their position.
   *
   * Only matches books already in Bookshelf's DB — which is every book
   * Bookshelf has imported for an author we've touched before.
   */
  public async findSeriesMembers(
    seriesName: string
  ): Promise<
    {
      id: number;
      title: string;
      authorId?: number;
      position?: string;
      monitored: boolean;
      foreignBookId?: string;
    }[]
  > {
    try {
      const all = (await this.getAllBooksCached()) as (BookshelfBook & {
        seriesTitle?: string;
        foreignBookId?: string;
        authorId?: number;
      })[];
      const needle = seriesName.toLowerCase().trim();
      const matches: {
        id: number;
        title: string;
        authorId?: number;
        position?: string;
        monitored: boolean;
        foreignBookId?: string;
      }[] = [];
      for (const b of all) {
        const st = (b.seriesTitle ?? '').trim();
        if (!st) continue;
        // Split multi-series strings like "Wool #2; Silo #1B"
        for (const part of st.split(';').map((s) => s.trim())) {
          const m = part.match(/^(.+?)\s*(?:#(\S+))?\s*$/);
          if (!m?.[1]) continue;
          if (m[1].toLowerCase() === needle) {
            matches.push({
              id: b.id,
              title: b.title,
              authorId: b.authorId,
              position: m[2],
              monitored: b.monitored,
              foreignBookId: b.foreignBookId,
            });
            break;
          }
        }
      }
      // Sort by numeric prefix of position (handles "1", "1A", "2B")
      matches.sort((a, b) => {
        const pa = parseFloat(a.position ?? '999');
        const pb = parseFloat(b.position ?? '999');
        return pa - pb;
      });
      return matches;
    } catch {
      return [];
    }
  }

  public async findExistingBook(
    foreignBookId?: string,
    foreignEditionId?: string
  ): Promise<BookshelfBook | null> {
    try {
      const all = await this.getAllBooksCached();
      const loose = all as unknown as Record<string, unknown>[];
      const byBook = foreignBookId
        ? loose.find((b) => b.foreignBookId === foreignBookId)
        : undefined;
      if (byBook) return byBook as unknown as BookshelfBook;
      const byEdition = foreignEditionId
        ? loose.find((b) => b.foreignEditionId === foreignEditionId)
        : undefined;
      return (byEdition as unknown as BookshelfBook) ?? null;
    } catch {
      return null;
    }
  }

  public async lookupAuthor(
    term: string
  ): Promise<Record<string, unknown>[]> {
    const cacheKey = `lookup-author:${term.toLowerCase()}`;
    const hit = bookshelfCache.get<Record<string, unknown>[]>(cacheKey);
    if (hit !== undefined) return hit;
    try {
      const response = await this.axios.get<Record<string, unknown>[]>(
        '/author/lookup',
        { params: { term }, timeout: 25000 }
      );
      const value = response.data ?? [];
      bookshelfCache.set(cacheKey, value, 3600);
      return value;
    } catch (e) {
      logger.error('Bookshelf author lookup failed', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        term,
      });
      return [];
    }
  }

  /**
   * Find an author already persisted in Bookshelf's DB, or create one.
   * Mirrors Libreseerr's `_ensure_author`:
   *   1. GET /author → match by foreignAuthorId (most reliable)
   *   2. else match by authorName (case-insensitive)
   *   3. else /author/lookup + POST /author with quality/root folder
   *
   * Returns the persisted author record (with numeric `id`), ready to be
   * embedded as-is in a POST /book payload.
   */
  public async ensureAuthor(options: {
    authorName: string;
    foreignAuthorId?: string;
    qualityProfileId: number;
    metadataProfileId: number;
    rootFolderPath: string;
  }): Promise<Record<string, unknown>> {
    const existingList = await this.axios
      .get<Record<string, unknown>[]>('/author', { timeout: 25000 })
      .then((r) => r.data ?? [])
      .catch(() => [] as Record<string, unknown>[]);

    if (options.foreignAuthorId) {
      const byId = existingList.find(
        (a) => a.foreignAuthorId === options.foreignAuthorId
      );
      if (byId) return byId;
    }

    const nameLc = options.authorName.toLowerCase();
    const byName = existingList.find(
      (a) =>
        typeof a.authorName === 'string' &&
        a.authorName.toLowerCase() === nameLc
    );
    if (byName) return byName;

    // Not persisted — lookup metadata and POST /author
    const candidates = await this.lookupAuthor(options.authorName);
    const candidate =
      candidates.find(
        (a) =>
          typeof a.authorName === 'string' &&
          a.authorName.toLowerCase() === nameLc
      ) ?? candidates[0];
    if (!candidate) {
      throw new Error(
        `Bookshelf ensureAuthor: no lookup result for "${options.authorName}"`
      );
    }

    const authorPayload = {
      ...candidate,
      qualityProfileId: options.qualityProfileId,
      metadataProfileId: options.metadataProfileId,
      rootFolderPath: options.rootFolderPath,
      monitored: false,
      monitorNewItems: 'none',
      addOptions: {
        monitor: 'none',
        searchForMissingBooks: false,
      },
    };

    try {
      const response = await this.axios.post<Record<string, unknown>>(
        '/author',
        authorPayload,
        { timeout: 30000 }
      );
      return response.data;
    } catch (e) {
      // If POST fails with a conflict, fall back to re-reading the author
      // list (something created it concurrently).
      if (e?.response?.status === 409) {
        const again = await this.axios
          .get<Record<string, unknown>[]>('/author', { timeout: 25000 })
          .then((r) => r.data ?? [])
          .catch(() => [] as Record<string, unknown>[]);
        const match =
          again.find(
            (a) =>
              a.foreignAuthorId === (candidate.foreignAuthorId as string)
          ) ??
          again.find(
            (a) =>
              typeof a.authorName === 'string' &&
              a.authorName.toLowerCase() === nameLc
          );
        if (match) return match;
      }
      throw e;
    }
  }

  /**
   * Add a book to Bookshelf. Bookshelf's metadata providers (Goodreads /
   * Hardcover) use their own numeric foreign IDs, NOT OpenLibrary work
   * keys, so we can't pass allseerr's stored OL IDs directly. Flow:
   *   1. /author/lookup?term=<authorName> → resolve Bookshelf's
   *      foreignAuthorId + full author payload.
   *   2. /book/lookup?term="<title> <author>" → find the matching book
   *      and pull its foreignBookId + foreignEditionId.
   *   3. POST /book with a payload built around those, overriding
   *      monitored/profiles/rootFolder per the user's instance config.
   */
  public addBook = async (
    options: BookshelfBookAddOptions
  ): Promise<BookshelfBook> => {
    try {
      // Step 1 — Book lookup. Per Libreseerr's reference implementation,
      // Readarr/Bookshelf accepts ISBN with the `isbn:` prefix; ISBN is by
      // far the most reliable key (one ISBN = one specific edition).
      // Fall back to free text "<title> <author>" when ISBN isn't available.
      let bookMatches: BookshelfBook[] = [];
      let lookupKey: string | undefined;
      if (options.isbn13) {
        bookMatches = await this.lookupBook(`isbn:${options.isbn13}`);
        lookupKey = `isbn:${options.isbn13}`;
      }
      if (bookMatches.length === 0 && options.isbn10) {
        bookMatches = await this.lookupBook(`isbn:${options.isbn10}`);
        lookupKey = `isbn:${options.isbn10}`;
      }
      if (bookMatches.length === 0) {
        bookMatches = await this.lookupBook(
          `${options.title} ${options.authorName}`
        );
        lookupKey = `text:"${options.title}" "${options.authorName}"`;
      }

      const looseBooks = bookMatches as unknown as Record<string, unknown>[];
      const targetTitle = options.title.toLowerCase().trim();
      const bookMatch =
        looseBooks.find(
          (b) =>
            typeof b.title === 'string' &&
            b.title.toLowerCase().trim() === targetTitle
        ) ?? looseBooks[0];

      if (!bookMatch || !bookMatch.foreignBookId) {
        throw new Error(
          `Bookshelf book lookup returned no result via ${lookupKey ?? 'no key'}`
        );
      }

      // Step 2 — Ensure the author is PERSISTED in Bookshelf's DB. This
      // mirrors Libreseerr's `_ensure_author`: prefer an existing
      // persisted author (matched by foreignAuthorId then by name),
      // otherwise /author/lookup + POST /author with rootFolderPath.
      const persistedAuthor = await this.ensureAuthor({
        authorName: options.authorName,
        foreignAuthorId:
          (bookMatch.author as { foreignAuthorId?: string } | undefined)
            ?.foreignAuthorId ?? undefined,
        qualityProfileId: options.qualityProfileId,
        metadataProfileId: options.metadataProfileId,
        rootFolderPath: options.rootFolderPath,
      });

      // Step 3 — Short-circuit: if the book already exists in Bookshelf
      // (auto-imported as unmonitored metadata during a sibling book's
      // author-sync), skip POST /book and just flip the monitored flag.
      const existingBook = await this.findExistingBook(
        bookMatch.foreignBookId as string,
        bookMatch.foreignEditionId as string
      );
      if (existingBook && typeof existingBook.id === 'number') {
        logger.info(
          `Book already in Bookshelf catalogue; monitoring existing record ${existingBook.id}`,
          {
            label: 'Bookshelf API',
            title: existingBook.title,
            foreignBookId: bookMatch.foreignBookId,
          }
        );
        if (options.monitored ?? true) {
          await this.ensureBookMonitored(existingBook.id, true);
        }
        if (options.searchNow) {
          await this.searchBook(existingBook.id);
        }
        return existingBook;
      }

      // Step 4 — POST /book with Libreseerr's minimal payload. Key points:
      //   - rootFolderPath is set at BOOK level (Readarr needs it there)
      //   - author is the PERSISTED author from ensureAuthor (with real
      //     numeric id), not a raw lookup resource
      //   - only a small fixed set of optional fields copied into the
      //     edition entry (full spread confuses Readarr's mapper)
      //   - addType: "manual" + searchForMissingBooks: false; we trigger
      //     the search explicitly via /command after POST succeeds
      const looseBook = bookMatch as Record<string, unknown>;
      const edition: Record<string, unknown> = {
        foreignEditionId: bookMatch.foreignEditionId,
        title: bookMatch.title,
        monitored: true,
      };
      for (const key of [
        'images',
        'links',
        'ratings',
        'disambiguation',
        'remoteCover',
        'grabbed',
        'titleSlug',
      ] as const) {
        if (key in looseBook) edition[key] = looseBook[key];
      }

      const payload = {
        foreignBookId: bookMatch.foreignBookId,
        foreignEditionId: bookMatch.foreignEditionId,
        title: bookMatch.title,
        authorId: persistedAuthor.id,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath: options.rootFolderPath,
        monitored: options.monitored ?? true,
        anyEditionOk: true,
        editions: bookMatch.foreignEditionId ? [edition] : [],
        author: persistedAuthor,
        addOptions: {
          addType: 'manual',
          searchForMissingBooks: false,
        },
      };

      let response;
      try {
        response = await this.axios.post<BookshelfBook>('/book', payload, {
          timeout: 30000,
        });
      } catch (e) {
        // Libreseerr pattern: on POST error, re-check the catalogue —
        // the book may have materialised anyway (race or duplicate edit).
        const existingAfter = await this.findExistingBook(
          bookMatch.foreignBookId as string,
          bookMatch.foreignEditionId as string
        );
        if (existingAfter && typeof existingAfter.id === 'number') {
          logger.info(
            `Book materialised after POST error; monitoring existing record ${existingAfter.id}`,
            { label: 'Bookshelf API' }
          );
          if (options.monitored ?? true) {
            await this.ensureBookMonitored(existingAfter.id, true);
          }
          if (options.searchNow) {
            await this.searchBook(existingAfter.id);
          }
          return existingAfter;
        }
        throw e;
      }

      logger.info('Bookshelf accepted book add', {
        label: 'Bookshelf',
        bookId: response.data.id,
        title: response.data.title,
        resolvedForeignBookId: bookMatch.foreignBookId,
        resolvedForeignAuthorId: persistedAuthor.foreignAuthorId,
      });

      // Defensive: confirm the monitored flag sticks even after Bookshelf's
      // post-add async sync. Readarr's sync can briefly reset the flag.
      if (
        (options.monitored ?? true) &&
        typeof response.data.id === 'number'
      ) {
        await this.ensureBookMonitored(response.data.id, true);
      }

      // Trigger the search explicitly — Libreseerr does this too and it
      // makes the behaviour deterministic regardless of addOptions.
      if (options.searchNow && typeof response.data.id === 'number') {
        await this.searchBook(response.data.id);
      }

      return response.data;
    } catch (e) {
      const status = e?.response?.status;
      const body = e?.response?.data;
      logger.error('Failed to add book to Bookshelf', {
        label: 'Bookshelf',
        status,
        errorMessage: e.message,
        options,
        response: body,
      });
      throw new Error(
        `Failed to add book to Bookshelf${status ? ` (${status})` : ''}: ${
          typeof body?.message === 'string' ? body.message : e.message
        }`,
        { cause: e }
      );
    }
  };

  public async searchBook(bookId: number): Promise<void> {
    try {
      await this.runCommand('BookSearch', { bookIds: [bookId] });
    } catch (e) {
      logger.error('Bookshelf search command failed', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        bookId,
      });
    }
  }

  /**
   * Force a book to monitored=true. POST /book ignores the monitored flag
   * we send in the body (book always lands as unmonitored), so we follow
   * up with this bulk-monitor endpoint to actually make Bookshelf search
   * for the title.
   */
  public async setBookMonitored(
    bookIds: number[],
    monitored: boolean
  ): Promise<void> {
    try {
      const response = await this.axios.put('/book/monitor', {
        bookIds,
        monitored,
      });
      logger.info('Bookshelf set-monitored OK', {
        label: 'Bookshelf API',
        bookIds,
        monitored,
        status: response.status,
      });
    } catch (e) {
      logger.error('Bookshelf set-monitored failed', {
        label: 'Bookshelf API',
        errorMessage: e.message,
        status: e?.response?.status,
        bookIds,
        monitored,
      });
    }
  }

  /**
   * Set a book's monitored flag and keep verifying it stuck. Bookshelf's
   * post-add async metadata sync can overwrite an immediate PUT with the
   * pre-sync state, so we retry with backoff and re-read the record.
   */
  public async ensureBookMonitored(
    bookId: number,
    monitored: boolean
  ): Promise<boolean> {
    const backoffMs = [0, 2000, 3000, 5000];
    for (let attempt = 0; attempt < backoffMs.length; attempt++) {
      if (backoffMs[attempt] > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, backoffMs[attempt])
        );
      }
      await this.setBookMonitored([bookId], monitored);
      try {
        const check = await this.getBook({ id: bookId });
        if (check.monitored === monitored) {
          if (attempt > 0) {
            logger.info('Bookshelf monitored flag settled', {
              label: 'Bookshelf API',
              bookId,
              attempt: attempt + 1,
            });
          }
          return true;
        }
      } catch {
        // read failed — retry
      }
    }
    logger.warn(
      `Bookshelf book ${bookId} monitored=${monitored} did not stick after ${backoffMs.length} attempts`,
      { label: 'Bookshelf API' }
    );
    return false;
  }

  public removeBook = async (bookId: number): Promise<void> => {
    try {
      await this.axios.delete(`/book/${bookId}`, {
        params: { deleteFiles: true, addImportListExclusion: false },
      });
      logger.info(`[Bookshelf] Removed book ${bookId}`);
    } catch (e) {
      throw new Error(
        `[Bookshelf] Failed to remove book: ${e.message}`,
        { cause: e }
      );
    }
  };
}

export default BookshelfAPI;
