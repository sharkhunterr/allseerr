import cacheManager from '@server/lib/cache';
import logger from '@server/logger';
import type { QualityProfile } from './base';
import ServarrBase from './base';

const bookshelfCache = cacheManager.getCache('bookshelf').data;

function setCacheable<T>(key: string, value: T, ttl: number) {
  if (value === null || value === undefined) return;
  if (Array.isArray(value) && value.length === 0) return;
  bookshelfCache.set(key, value, ttl);
}

export interface BookshelfBookAddOptions {
  /** Free-text title used to look up the book in Bookshelf's metadata. */
  title: string;
  /** Free-text author name used for /author/lookup. */
  authorName: string;
  /**
   * Preferred lookup keys — Bookshelf's /book/lookup deterministically
   * matches by ISBN / ASIN when supplied, much more reliable than
   * title+author fuzzy search (which can pick the wrong edition /
   * translation, or fail entirely when the user requested a
   * localised title that the Goodreads / Hardcover index doesn't
   * carry under that name).
   */
  isbn13?: string;
  isbn10?: string;
  /**
   * Audible / Amazon Standard Identification Number. When present,
   * tried after ISBN and before falling back to free-text. Bookshelf
   * forwards `asin:<value>` to its upstream metadata source which
   * resolves it to a canonical edition.
   */
  asin?: string;
  /**
   * Optional English / canonical title. Used as a last-ditch
   * free-text retry when the localised title doesn't match — covers
   * the common case of an Audible audiobook requested in French
   * whose Hardcover record only exists under its English title
   * ("Alien — La mer des désolations" → "Alien: Sea of Sorrows").
   */
  englishTitle?: string;
  /**
   * Optional canonical author name to pair with `englishTitle` in
   * the retry. Helps when the Audible product credits multiple
   * people (e.g. narrator + screenwriter + author) but the
   * underlying Hardcover/Goodreads record is filed under the
   * primary writer alone — `"Alien: Sea of Sorrows" "James A.
   * Moore"` matches where `"Dirk Maggs, James A. Moore"` doesn't.
   */
  englishAuthor?: string;
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
      const response =
        await this.axios.get<QualityProfile[]>('/qualityprofile');
      return response.data;
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to retrieve profiles: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getMetadataProfiles = async (): Promise<QualityProfile[]> => {
    try {
      const response =
        await this.axios.get<QualityProfile[]>('/metadataprofile');
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
      throw new Error(`[Bookshelf] Failed to retrieve books: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getBook = async ({ id }: { id: number }): Promise<BookshelfBook> => {
    try {
      const response = await this.axios.get<BookshelfBook>(`/book/${id}`);
      return response.data;
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to retrieve book: ${e.message}`, {
        cause: e,
      });
    }
  };

  public async lookupBook(term: string): Promise<BookshelfBook[]> {
    const cacheKey = `lookup-book:${term.toLowerCase()}`;
    const hit = bookshelfCache.get<BookshelfBook[]>(cacheKey);
    if (hit !== undefined) return hit;
    // Bookshelf proxies to Goodreads/Hardcover. Use a 60s timeout
    // (Hardcover is intermittently slow and 25s wasn't enough on the
    // user's instance) and retry once on timeout — many timeouts win
    // on a quick second attempt because the upstream cache warmed up.
    const callOnce = async (timeoutMs: number) => {
      const response = await this.axios.get<BookshelfBook[]>('/book/lookup', {
        params: { term },
        timeout: timeoutMs,
      });
      return response.data ?? [];
    };
    try {
      const value = await callOnce(60000);
      // Cache 1h — same lookup during a session is a common flow
      // (book detail opens it twice: once for metadata, once for dispatch).
      setCacheable(cacheKey, value, 3600);
      return value;
    } catch (e) {
      const isTimeout =
        e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '');
      if (isTimeout) {
        logger.warn('Bookshelf book lookup timed out — retrying once', {
          label: 'Bookshelf API',
          term,
        });
        try {
          const value = await callOnce(60000);
          setCacheable(cacheKey, value, 3600);
          return value;
        } catch (e2) {
          logger.error('Bookshelf book lookup failed (after retry)', {
            label: 'Bookshelf API',
            errorMessage: e2 instanceof Error ? e2.message : String(e2),
            term,
          });
          return [];
        }
      }
      logger.error('Bookshelf book lookup failed', {
        label: 'Bookshelf API',
        errorMessage: e instanceof Error ? e.message : String(e),
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
      setCacheable(cacheKey, value, 120);
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
  public async findSeriesMembers(seriesName: string): Promise<
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
      // Edition IDs live in the nested `editions[]` array on each book
      // row — look there, not on the book object itself, otherwise we'd
      // always miss and trigger a duplicate-POST / UNIQUE constraint 409.
      if (foreignEditionId) {
        const byEdition = loose.find((b) => {
          const editions = (b as { editions?: unknown[] }).editions;
          return (
            Array.isArray(editions) &&
            editions.some(
              (e) =>
                (e as { foreignEditionId?: string }).foreignEditionId ===
                foreignEditionId
            )
          );
        });
        if (byEdition) return byEdition as unknown as BookshelfBook;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async lookupAuthor(term: string): Promise<Record<string, unknown>[]> {
    const cacheKey = `lookup-author:${term.toLowerCase()}`;
    const hit = bookshelfCache.get<Record<string, unknown>[]>(cacheKey);
    if (hit !== undefined) return hit;
    // /author/lookup forwards to Hardcover and is consistently
    // slower than /book/lookup. Bump the timeout to 60s and retry
    // once on timeout — Hardcover is intermittently slow and a
    // simple retry typically wins on the second try.
    const callOnce = async (timeoutMs: number) => {
      const response = await this.axios.get<Record<string, unknown>[]>(
        '/author/lookup',
        { params: { term }, timeout: timeoutMs }
      );
      return response.data ?? [];
    };
    try {
      const value = await callOnce(60000);
      setCacheable(cacheKey, value, 3600);
      return value;
    } catch (e) {
      const isTimeout =
        e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '');
      if (isTimeout) {
        logger.warn('Bookshelf author lookup timed out — retrying once', {
          label: 'Bookshelf API',
          term,
        });
        try {
          const value = await callOnce(60000);
          setCacheable(cacheKey, value, 3600);
          return value;
        } catch (e2) {
          logger.error('Bookshelf author lookup failed (after retry)', {
            label: 'Bookshelf API',
            errorMessage: e2 instanceof Error ? e2.message : String(e2),
            term,
          });
          return [];
        }
      }
      logger.error('Bookshelf author lookup failed', {
        label: 'Bookshelf API',
        errorMessage: e instanceof Error ? e.message : String(e),
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
    /**
     * Optional author resource already resolved upstream (e.g. the
     * `author` object embedded in a `/book/lookup` result). When
     * present, it replaces the `/author/lookup?term=…` round-trip in
     * the not-yet-persisted branch — Bookshelf's author lookup
     * endpoint forwards to Hardcover and frequently times out at
     * 25s when Hardcover is slow, so reusing the candidate we
     * already pulled (and which carries the same shape) avoids a
     * gratuitous failure when only the name is the bottleneck.
     */
    preResolvedCandidate?: Record<string, unknown>;
  }): Promise<{ author: Record<string, unknown>; wasExisting: boolean }> {
    const existingList = await this.axios
      .get<Record<string, unknown>[]>('/author', { timeout: 25000 })
      .then((r) => r.data ?? [])
      .catch(() => [] as Record<string, unknown>[]);

    if (options.foreignAuthorId) {
      const byId = existingList.find(
        (a) => a.foreignAuthorId === options.foreignAuthorId
      );
      if (byId) return { author: byId, wasExisting: true };
    }

    const nameLc = options.authorName.toLowerCase();
    const byName = existingList.find(
      (a) =>
        typeof a.authorName === 'string' &&
        a.authorName.toLowerCase() === nameLc
    );
    if (byName) return { author: byName, wasExisting: true };

    // Not persisted — POST /author. Use the upstream-supplied
    // candidate when the caller already has one (saves a
    // /author/lookup round-trip), otherwise fall back to the
    // network lookup.
    let candidate: Record<string, unknown> | undefined =
      options.preResolvedCandidate;
    if (candidate) {
      logger.debug('Bookshelf ensureAuthor: using pre-resolved candidate', {
        label: 'Bookshelf API',
        keys: Object.keys(candidate).slice(0, 12),
        foreignAuthorId: (candidate as { foreignAuthorId?: string })
          .foreignAuthorId,
      });
    }
    if (!candidate) {
      const candidates = await this.lookupAuthor(options.authorName);
      candidate =
        candidates.find(
          (a) =>
            typeof a.authorName === 'string' &&
            a.authorName.toLowerCase() === nameLc
        ) ?? candidates[0];
    }
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
      // POST /author needs metadata from Hardcover too (Bookshelf
      // populates the new author's overview / images / etc. as part
      // of the create call). Bump to 60s to match the lookup
      // timeouts above — Hardcover is slow but eventually responds.
      const response = await this.axios.post<Record<string, unknown>>(
        '/author',
        authorPayload,
        { timeout: 60000 }
      );
      return { author: response.data, wasExisting: false };
    } catch (e) {
      // Bookshelf returns 400 with errorCode "AuthorExistsValidator" (or
      // 409) when the author was added concurrently — typically by its own
      // metadata sync after a sibling book was imported. Re-read /author
      // and return the now-existing record instead of bubbling the error.
      const status = e?.response?.status;
      const body = e?.response?.data;
      const isAuthorExists =
        status === 409 ||
        (status === 400 &&
          Array.isArray(body) &&
          body.some(
            (v: { errorCode?: string }) =>
              v?.errorCode === 'AuthorExistsValidator'
          ));
      if (isAuthorExists) {
        const again = await this.axios
          .get<Record<string, unknown>[]>('/author', { timeout: 25000 })
          .then((r) => r.data ?? [])
          .catch(() => [] as Record<string, unknown>[]);
        const match =
          again.find(
            (a) => a.foreignAuthorId === (candidate.foreignAuthorId as string)
          ) ??
          again.find(
            (a) =>
              typeof a.authorName === 'string' &&
              a.authorName.toLowerCase() === nameLc
          );
        if (match) return { author: match, wasExisting: true };
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
      // Step 1 — Book lookup. Try every identifier we have, in order
      // of decreasing reliability. Bookshelf (a Readarr-Audiobook
      // fork) accepts the same prefix vocabulary Readarr does:
      //   isbn:<value>     — print ISBN-13/-10
      //   audible:<asin>   — Audible product ASIN (Readarr's
      //                      canonical audiobook key)
      //   goodreads:<id>   — Goodreads work id (we don't track one)
      // ASIN gets two attempts (`audible:` + `asin:`) because some
      // forks accept the bare prefix; cheap to try both.
      // English-title text retry rescues the "user requested a
      // localisation that Hardcover only indexed under its original
      // English title" case (e.g. "Alien — La mer des désolations"
      // → "Alien: Sea of Sorrows").
      let bookMatches: BookshelfBook[] = [];
      const attemptedKeys: string[] = [];
      let lookupKey: string | undefined;
      const tryLookup = async (term: string, label: string) => {
        if (bookMatches.length > 0) return;
        attemptedKeys.push(label);
        bookMatches = await this.lookupBook(term);
        if (bookMatches.length > 0) {
          lookupKey = label;
          logger.debug('Bookshelf book lookup matched', {
            label: 'Bookshelf API',
            via: lookupKey,
            matches: bookMatches.length,
          });
        }
      };
      if (options.isbn13) {
        await tryLookup(`isbn:${options.isbn13}`, `isbn:${options.isbn13}`);
      }
      if (options.isbn10) {
        await tryLookup(`isbn:${options.isbn10}`, `isbn:${options.isbn10}`);
      }
      if (options.asin) {
        await tryLookup(`audible:${options.asin}`, `audible:${options.asin}`);
        await tryLookup(`asin:${options.asin}`, `asin:${options.asin}`);
      }
      await tryLookup(
        `${options.title} ${options.authorName}`,
        `text:"${options.title}" "${options.authorName}"`
      );
      if (
        options.englishTitle &&
        options.englishTitle.toLowerCase().trim() !==
          options.title.toLowerCase().trim()
      ) {
        // Prefer the canonical Hardcover/Goodreads author when one
        // was passed (single primary writer), then fall back to the
        // local authorName which may include credits like narrators
        // or adaptation directors that confuse the upstream index.
        const retryAuthor = options.englishAuthor ?? options.authorName;
        logger.info('Bookshelf book lookup retrying with English title', {
          label: 'Bookshelf API',
          localised: options.title,
          english: options.englishTitle,
          retryAuthor,
        });
        await tryLookup(
          `${options.englishTitle} ${retryAuthor}`,
          `text:"${options.englishTitle}" "${retryAuthor}"`
        );
        // Final ditch — title alone. Goodreads' fuzzy match is good
        // enough that "Alien: Sea of Sorrows" will land on the
        // right work even without an author hint, and we've
        // already verified identity client-side via Hardcover's
        // ASIN/title cross-match.
        await tryLookup(options.englishTitle, `text:"${options.englishTitle}"`);
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
        const tried = attemptedKeys.length
          ? attemptedKeys.join(' / ')
          : 'no key';
        throw new Error(
          `Bookshelf book lookup returned no result. Tried: ${tried}`
        );
      }

      // Step 2 — Ensure the author is PERSISTED in Bookshelf's DB. This
      // mirrors Libreseerr's `_ensure_author`: prefer an existing
      // persisted author (matched by foreignAuthorId then by name),
      // otherwise /author/lookup + POST /author with rootFolderPath.
      //
      // Author-name resolution priority:
      //   1. matched book's author.authorName — the canonical name
      //      Bookshelf returned for the lookup we just resolved.
      //      Always single-author and always indexed (otherwise the
      //      book lookup wouldn't have matched), so /author/lookup
      //      will hit cleanly when this falls through to step 4.
      //   2. options.englishAuthor — explicit override from the
      //      dispatcher (Hardcover-resolved primary writer for the
      //      audiobook English-title retry).
      //   3. options.authorName — the original (potentially
      //      multi-credit) request payload. Last resort because
      //      forms like "Dirk Maggs, James A. Moore" timeout
      //      Bookshelf's /author/lookup, which has nothing indexed
      //      for the concatenation.
      const matchedAuthor = bookMatch.author as
        | (Record<string, unknown> & {
            authorName?: string;
            foreignAuthorId?: string;
          })
        | undefined;
      const matchedAuthorName = matchedAuthor?.authorName;
      const ensureAuthorName =
        matchedAuthorName ?? options.englishAuthor ?? options.authorName;
      const { author: persistedAuthor, wasExisting: authorWasExisting } =
        await this.ensureAuthor({
          authorName: ensureAuthorName,
          foreignAuthorId: matchedAuthor?.foreignAuthorId ?? undefined,
          qualityProfileId: options.qualityProfileId,
          metadataProfileId: options.metadataProfileId,
          rootFolderPath: options.rootFolderPath,
          // Reuse the author resource already attached to the
          // matched book — bypasses /author/lookup which forwards
          // to Hardcover and times out at 25s when Hardcover is
          // slow. The shape is the same (Bookshelf returns a full
          // author resource embedded inside each /book/lookup
          // result), so POST /author below accepts it as-is.
          preResolvedCandidate: matchedAuthor,
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

      // When the author ALREADY existed in Bookshelf's DB, re-posting its
      // foreignAuthorId re-triggers AuthorExistsValidator and 400s. Strip
      // the field in that case — authorId still references the existing
      // record. When the author was freshly created via POST /author,
      // Bookshelf's NotEmptyValidator requires foreignAuthorId, so we
      // keep the embed intact.
      const authorEmbed = { ...persistedAuthor };
      if (authorWasExisting) {
        delete (authorEmbed as Record<string, unknown>).foreignAuthorId;
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
        author: authorEmbed,
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
        // Force-refresh the book cache first: Bookshelf's own metadata
        // sync may have added this title as a sibling of an already-known
        // author's bibliography, so the 2-min TTL snapshot is out of date.
        bookshelfCache.del('all-books');
        let existingAfter = await this.findExistingBook(
          bookMatch.foreignBookId as string,
          bookMatch.foreignEditionId as string
        );
        // UNIQUE constraint on Editions.ForeignEditionId means the edition
        // is already attached to SOME book (often with a different
        // foreignBookId than our lookup returned, because Bookshelf's
        // metadata sync can use a different provider). Fall back to a
        // title+author match on the fresh /book list.
        if (!existingAfter) {
          const all = await this.getAllBooksCached();
          const loose = all as unknown as Record<string, unknown>[];
          const targetLc = options.title.toLowerCase().trim();
          const authorLc = options.authorName.toLowerCase().trim();
          const hit = loose.find((b) => {
            const t = (b.title as string | undefined)?.toLowerCase().trim();
            const a = (
              (b.author as { authorName?: string })?.authorName ??
              (b.authorName as string | undefined)
            )
              ?.toLowerCase()
              .trim();
            return t === targetLc && (!a || a === authorLc);
          });
          if (hit) existingAfter = hit as unknown as BookshelfBook;
        }
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
      if ((options.monitored ?? true) && typeof response.data.id === 'number') {
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
   * Set a book's monitored flag and keep re-applying it. Bookshelf's
   * post-add async metadata sync can overwrite an immediate PUT
   * several seconds AFTER the initial call settled — a simple
   * "PUT + GET → success" loop exits after the first pass with
   * monitored=true (because our PUT won the race against the
   * sync), then the sync resets the flag and we're left with an
   * unmonitored book in the catalogue.
   *
   * Fix: always run the full PUT + GET cycle at every step (no
   * early return). The last step runs ~5–8 s after the initial PUT,
   * which covers Bookshelf's async sync window, so the final PUT
   * wins over the reset.
   */
  public async ensureBookMonitored(
    bookId: number,
    monitored: boolean
  ): Promise<boolean> {
    const backoffMs = [0, 3000, 5000];
    let lastChecked = false;
    for (let attempt = 0; attempt < backoffMs.length; attempt++) {
      if (backoffMs[attempt] > 0) {
        await new Promise((resolve) => setTimeout(resolve, backoffMs[attempt]));
      }
      await this.setBookMonitored([bookId], monitored);
      try {
        const check = await this.getBook({ id: bookId });
        lastChecked = check.monitored === monitored;
      } catch {
        lastChecked = false;
      }
    }
    if (lastChecked) {
      logger.info('Bookshelf monitored flag settled', {
        label: 'Bookshelf API',
        bookId,
        monitored,
        passes: backoffMs.length,
      });
    } else {
      logger.warn(
        `Bookshelf book ${bookId} monitored=${monitored} did not stick after ${backoffMs.length} passes`,
        { label: 'Bookshelf API' }
      );
    }
    return lastChecked;
  }

  public removeBook = async (bookId: number): Promise<void> => {
    try {
      await this.axios.delete(`/book/${bookId}`, {
        params: { deleteFiles: true, addImportListExclusion: false },
      });
      logger.info(`[Bookshelf] Removed book ${bookId}`);
    } catch (e) {
      throw new Error(`[Bookshelf] Failed to remove book: ${e.message}`, {
        cause: e,
      });
    }
  };
}

export default BookshelfAPI;
