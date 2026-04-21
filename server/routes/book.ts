import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import GoogleBooksAPI from '@server/api/googlebooks';
import HardcoverAPI, {
  hardcoverPrimaryAuthor,
} from '@server/api/hardcover';
import { isOLWorkKey, toOLWorkKey } from '@server/lib/bookIds';
import OpenLibraryAPI, { cleanOpenLibraryText } from '@server/api/openlibrary';
import BinderyAPI from '@server/api/servarr/bindery';
import BookshelfAPI from '@server/api/servarr/bookshelf';
import { getSettings } from '@server/lib/settings';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import { Permission, hasPermission } from '@server/lib/permissions';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const bookRoutes = Router();
const openLibrary = new OpenLibraryAPI();

async function saveBookMedia(
  media: BookMedia | AudiobookMedia,
  mediaType: MediaType
): Promise<void> {
  if (mediaType === MediaType.BOOK) {
    await getRepository(BookMedia).save(media as BookMedia);
  } else {
    await getRepository(AudiobookMedia).save(media as AudiobookMedia);
  }
}

const AUDIBLE_VALID_REGIONS: AudibleRegion[] = [
  'us',
  'ca',
  'uk',
  'au',
  'fr',
  'de',
  'jp',
  'it',
  'in',
  'es',
  'br',
];

const getAudibleClient = (): AudibleAPI => {
  const settings = getSettings();
  const configured = settings.metadataSettings.audibleRegion?.toLowerCase();
  const fallback = settings.main.discoverRegion?.toLowerCase();
  const region = (configured || fallback || 'us') as AudibleRegion;
  return new AudibleAPI(
    AUDIBLE_VALID_REGIONS.includes(region) ? region : 'us'
  );
};

/**
 * Swap Audiobookshelf internal URL with the configured public URL for
 * "Open in Library" external links.
 */
const remapToPublicUrl = (
  storedUrl: string | null | undefined
): string | null | undefined => {
  if (!storedUrl) return storedUrl;
  const abs = getSettings().book.audiobookshelf;
  if (!abs.publicUrl || !abs.url || abs.publicUrl === abs.url) {
    return storedUrl;
  }
  if (storedUrl.startsWith(abs.url)) {
    return abs.publicUrl + storedUrl.slice(abs.url.length);
  }
  return storedUrl;
};

/**
 * GET /api/v1/book/search
 * Search for books or audiobooks via OpenLibrary.
 * Overlays local availability status from BookMedia/AudiobookMedia.
 */
bookRoutes.get('/search', isAuthenticated(), async (req, res) => {
  const query = req.query.query as string;
  const type = (req.query.type as string) || 'book';
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'Search query is required.',
    });
  }

  // OpenLibrary rejects queries < 3 chars with 422; return empty gracefully
  if (type === 'book' && query.trim().length < 3) {
    return res.status(200).json({
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    });
  }

  try {
    if (type === 'audiobook') {
      // Audible Catalog API (free, no auth) — same source as AudioBookRequest
      const { results, totalResults } = await getAudibleClient().search(
        query,
        limit,
        Math.max(0, page - 1)
      );

      const audiobookMediaRepo = getRepository(AudiobookMedia);
      const enrichedResults = await Promise.all(
        results.map(async (result) => {
          const existing = await audiobookMediaRepo.findOne({
            where: { asin: result.asin },
          });

          return {
            openLibraryId: result.asin,
            title: result.title,
            authorName: result.authorName,
            narratorName: result.narratorName,
            coverUrl: result.coverUrl,
            year: result.year,
            publisher: result.publisher,
            durationSeconds: result.durationSeconds,
            summary: result.summary,
            mediaType: MediaType.AUDIOBOOK,
            mediaStatus: existing?.status ?? null,
            bookMediaId: existing?.id ?? null,
          };
        })
      );

      return res.status(200).json({
        page,
        totalPages: Math.ceil(totalResults / limit),
        totalResults: enrichedResults.length,
        results: enrichedResults,
      });
    }

    // Aggregate sources: OpenLibrary (base) + optional Bindery + optional
    // Google Books. Each source normalizes to the allseerr BookResult shape.
    // We dedupe by normalized title+author.
    const settings = getSettings();
    const providerCfg = settings.book.metadataProviders;
    const preferredLanguage =
      providerCfg.preferredLanguage?.toLowerCase().trim() ?? '';
    const languagePolicy = providerCfg.languagePolicy ?? 'prefer';

    type ProviderId =
      | 'openlibrary'
      | 'bindery'
      | 'googlebooks'
      | 'hardcover'
      | 'bookshelf';

    type ProviderIds = {
      openlibrary?: string;
      bindery?: string;
      googlebooks?: string;
      hardcover?: number;
      bookshelf?: number;
    };

    type AggregatedBook = {
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
      description?: string;
      language?: string;
      source: ProviderId;
      providerIds: ProviderIds;
    };

    const isOLKey = isOLWorkKey;

    const normalizeKey = (title: string, author: string) =>
      `${title}|${author}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const sources: Promise<AggregatedBook[]>[] = [];
    let olTotal = 0;

    type SeriesHit = {
      type: 'series';
      key: string;
      name: string;
      authorName?: string;
      coverUrl?: string;
      memberCount?: number;
      description?: string;
    };
    let seriesPromise: Promise<SeriesHit[]> = Promise.resolve([]);
    if (providerCfg.hardcover && providerCfg.hardcoverApiKey) {
      const hcForSeries = new HardcoverAPI(providerCfg.hardcoverApiKey);
      seriesPromise = hcForSeries
        .searchSeries(query, 5)
        .then((hits) =>
          hits
            // Hardcover sometimes returns stub series with 0 books —
            // no use linking to an empty page, so drop them.
            .filter((s) => (s.booksCount ?? 0) > 0)
            .slice(0, 3)
            .map(
              (s): SeriesHit => ({
                type: 'series',
                key: `hardcover:${s.id}`,
                name: s.name,
                authorName: s.authorName,
                coverUrl: s.coverUrl,
                memberCount: s.booksCount,
                description: s.description,
              })
            )
        )
        .catch(() => [] as SeriesHit[]);
    }

    sources.push(
      openLibrary
        .search(query, page, limit, preferredLanguage || undefined)
        .then(({ results, totalResults }) => {
          olTotal = totalResults;
          return results.map(
            (r): AggregatedBook => ({
              ...r,
              source: 'openlibrary',
              providerIds: { openlibrary: r.openLibraryId },
            })
          );
        })
        .catch(() => [] as AggregatedBook[])
    );

    if (providerCfg.bindery) {
      const binderyInstance = settings.bindery.find(
        (b) => b.mediaType === 'book' && b.isDefault
      );
      if (binderyInstance) {
        const binderyApi = new BinderyAPI({
          apiKey: binderyInstance.apiKey,
          url: BinderyAPI.buildUrl(binderyInstance, '/api/v1'),
        });
        sources.push(
          binderyApi
            .searchBooks(query)
            .then((items) =>
              items.slice(0, limit).map(
                (b): AggregatedBook => {
                  const olId = toOLWorkKey(b.foreignBookId) ?? b.foreignBookId;
                  return {
                    openLibraryId: olId,
                    title: b.title,
                    authorName: b.authorName ?? 'Unknown Author',
                    authorKey: b.foreignAuthorId,
                    coverUrl: b.imageUrl?.startsWith('http')
                      ? b.imageUrl
                      : undefined,
                    year: b.releaseDate
                      ? parseInt(b.releaseDate.slice(0, 4), 10) || undefined
                      : undefined,
                    language: b.language,
                    source: 'bindery',
                    providerIds: {
                      bindery: b.foreignBookId,
                      ...(isOLKey(olId) ? { openlibrary: olId } : {}),
                    },
                  };
                }
              )
            )
            .catch(() => [] as AggregatedBook[])
        );
      }
    }

    if (providerCfg.googleBooks) {
      const gb = new GoogleBooksAPI(providerCfg.googleBooksApiKey);
      sources.push(
        gb
          .search(query, page, limit, preferredLanguage || undefined)
          .then(({ results }) =>
            results.map(
              (r): AggregatedBook => ({
                openLibraryId: `gbooks:${r.googleBookId}`,
                title: r.title,
                authorName: r.authorName,
                isbn13: r.isbn13,
                isbn10: r.isbn10,
                coverUrl: r.coverUrl,
                year: r.year,
                publisher: r.publisher,
                pageCount: r.pageCount,
                subjects: r.subjects,
                description: r.description,
                language: r.language,
                source: 'googlebooks',
                providerIds: { googlebooks: r.googleBookId },
              })
            )
          )
          .catch(() => [] as AggregatedBook[])
      );
    }

    if (providerCfg.hardcover && providerCfg.hardcoverApiKey) {
      const hc = new HardcoverAPI(providerCfg.hardcoverApiKey);
      sources.push(
        hc
          .searchBooks(query, limit)
          .then((hits) =>
            hits.map((h): AggregatedBook => {
              const olMap = h.book_mappings?.find(
                (m) => m.platform?.name?.toLowerCase() === 'openlibrary'
              );
              const olKey =
                toOLWorkKey(olMap?.external_id) ?? `hardcover:${h.id}`;
              const gbMap = h.book_mappings?.find((m) =>
                ['google books', 'googlebooks'].includes(
                  m.platform?.name?.toLowerCase() ?? ''
                )
              );
              return {
                openLibraryId: olKey,
                title: h.title,
                authorName:
                  hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
                coverUrl: h.image?.url?.startsWith('http')
                  ? h.image.url
                  : undefined,
                year: h.release_date
                  ? parseInt(h.release_date.slice(0, 4), 10) || undefined
                  : undefined,
                pageCount: h.pages ?? undefined,
                source: 'hardcover',
                providerIds: {
                  hardcover: h.id,
                  ...(isOLKey(olKey) ? { openlibrary: olKey } : {}),
                  ...(gbMap?.external_id
                    ? { googlebooks: gbMap.external_id }
                    : {}),
                },
              };
            })
          )
          .catch(() => [] as AggregatedBook[])
      );
    }

    if (providerCfg.bookshelf) {
      const bookshelfInstance = settings.bookshelf?.find(
        (b) => b.mediaType === 'book' && b.isDefault
      );
      if (bookshelfInstance) {
        const bs = new BookshelfAPI({
          apiKey: bookshelfInstance.apiKey,
          url: BookshelfAPI.buildUrl(bookshelfInstance, '/api/v1'),
        });
        sources.push(
          bs
            .lookupBook(query)
            .then((hits) =>
              hits.slice(0, limit).map((b): AggregatedBook => {
                const loose = b as unknown as Record<string, unknown>;
                const olMappings = (loose.book_mappings ?? loose.links) as
                  | Array<Record<string, unknown>>
                  | undefined;
                const olKeyRaw = olMappings
                  ?.map((m) => String(m.foreignId ?? m.external_id ?? ''))
                  .find((v) => /OL\d+W/i.test(v));
                const olKey =
                  toOLWorkKey(olKeyRaw) ?? `bookshelf:${b.id}`;
                return {
                  openLibraryId: olKey,
                  title: b.title,
                  authorName:
                    ((loose.author as { authorName?: string })?.authorName ??
                      (loose.authorName as string | undefined)) ??
                    'Unknown Author',
                  coverUrl: undefined,
                  year: (loose.releaseDate as string | undefined)
                    ? parseInt(
                        String(loose.releaseDate).slice(0, 4),
                        10
                      ) || undefined
                    : undefined,
                  source: 'bookshelf',
                  providerIds: {
                    bookshelf: b.id,
                    ...(isOLKey(olKey) ? { openlibrary: olKey } : {}),
                  },
                };
              })
            )
            .catch(() => [] as AggregatedBook[])
        );
      }
    }

    const [allResults, seriesHits] = await Promise.all([
      Promise.all(sources).then((arr) => arr.flat()),
      seriesPromise,
    ]);

    // Dedupe + merge. Priority decides identity (title, author) — higher
    // wins. Hardcover and Bookshelf sit above the rest when enabled
    // because their titles are better curated (canonical English vs OL's
    // mix of regional editions). But the dispatch path needs an OL work
    // key, so mergeInto always lifts an OL-shaped openLibraryId from any
    // contributor, regardless of who wins identity.
    const priority: Record<AggregatedBook['source'], number> = {
      hardcover: 5,
      bookshelf: 4,
      bindery: 3,
      openlibrary: 2,
      googlebooks: 1,
    };
    const mergeInto = (
      winner: AggregatedBook,
      loser: AggregatedBook
    ): AggregatedBook => ({
      ...winner,
      // Keep the dispatchable OL key whenever either side has one.
      openLibraryId: isOLKey(winner.openLibraryId)
        ? winner.openLibraryId
        : isOLKey(loser.openLibraryId)
          ? loser.openLibraryId
          : winner.openLibraryId,
      // Enrichment fields: pick whichever is present/longer
      isbn13: winner.isbn13 || loser.isbn13,
      isbn10: winner.isbn10 || loser.isbn10,
      coverUrl: winner.coverUrl || loser.coverUrl,
      year: winner.year || loser.year,
      publisher: winner.publisher || loser.publisher,
      pageCount: winner.pageCount || loser.pageCount,
      language: winner.language || loser.language,
      authorKey: winner.authorKey || loser.authorKey,
      description:
        winner.description &&
        winner.description.length >= (loser.description?.length ?? 0)
          ? winner.description
          : loser.description,
      subjects: Array.from(
        new Set([...(winner.subjects ?? []), ...(loser.subjects ?? [])])
      ).slice(0, 20),
      providerIds: { ...loser.providerIds, ...winner.providerIds },
    });

    // Multi-key grouping. Each record exposes several identity signals
    // (OL work key, ISBN-13, ISBN-10, normalised title+author). Two
    // records sharing ANY signal land in the same group, then the group
    // collapses into one AggregatedBook keeping the highest-priority
    // source's identity but unioning providerIds and enrichment fields.
    //
    // Matters because OL search rarely includes ISBN while Google Books /
    // Hardcover do — and Hardcover's OL mapping lets us cross-reference
    // with OL hits that share the same `/works/OLxxx` key but have a
    // different (localised) title.
    const itemKeys = (b: AggregatedBook): string[] => {
      const keys: string[] = [];
      if (isOLKey(b.openLibraryId)) keys.push(`ol:${b.openLibraryId}`);
      if (b.isbn13) keys.push(`i13:${b.isbn13}`);
      if (b.isbn10) keys.push(`i10:${b.isbn10}`);
      keys.push(`ta:${normalizeKey(b.title, b.authorName)}`);
      return keys;
    };

    const groupItems = new Map<number, AggregatedBook[]>();
    const keyToGroup = new Map<string, number>();
    let nextGid = 0;
    for (const item of allResults) {
      const keys = itemKeys(item);
      const touched = new Set<number>();
      for (const k of keys) {
        const gid = keyToGroup.get(k);
        if (gid !== undefined) touched.add(gid);
      }
      let gid: number;
      if (touched.size === 0) {
        gid = nextGid++;
        groupItems.set(gid, [item]);
      } else {
        const ids = [...touched];
        gid = ids[0];
        const primary = groupItems.get(gid) ?? [];
        // Collapse any extra groups this item bridges.
        for (const other of ids.slice(1)) {
          const extras = groupItems.get(other);
          if (extras) {
            primary.push(...extras);
            groupItems.delete(other);
            for (const [k, v] of keyToGroup) {
              if (v === other) keyToGroup.set(k, gid);
            }
          }
        }
        primary.push(item);
        groupItems.set(gid, primary);
      }
      for (const k of keys) keyToGroup.set(k, gid);
    }

    // Collapse each group into a single AggregatedBook. Sort group items
    // by source priority descending, then fold into one record.
    const byKey = new Map<number, AggregatedBook>();
    for (const [gid, items] of groupItems) {
      const sorted = [...items].sort(
        (a, b) => priority[b.source] - priority[a.source]
      );
      const folded = sorted.reduce(
        (acc: AggregatedBook | null, cur) =>
          acc ? mergeInto(acc, cur) : cur
      );
      if (folded) byKey.set(gid, folded);
    }
    // Drop results without an OL key — GET /book/:id expects OL or Audible
    // ASIN. Hardcover / Bookshelf hits without an OL mapping (rare) and
    // pure Google Books results fall in that bucket. Their metadata is
    // still used to enrich OL/Bindery winners through the merge pass.
    let merged = Array.from(byKey.values()).filter((r) =>
      isOLKey(r.openLibraryId)
    );

    // Apply the language preference:
    //   - "strict": drop every result that isn't in the preferred language.
    //     Books with unknown language are kept (OL's `language` field is
    //     patchy; dropping unknowns would be too aggressive).
    //   - "prefer" (default): keep everything, but float matching-language
    //     results to the top. Unknown-language entries sort between matches
    //     and mismatches.
    if (preferredLanguage) {
      if (languagePolicy === 'strict') {
        merged = merged.filter(
          (r) => !r.language || r.language.toLowerCase() === preferredLanguage
        );
      } else {
        const rank = (lang?: string): number => {
          if (!lang) return 1;
          return lang.toLowerCase() === preferredLanguage ? 0 : 2;
        };
        merged.sort((a, b) => rank(a.language) - rank(b.language));
      }
    }

    // Overlay availability from local database
    const bookMediaRepo = getRepository(BookMedia);
    const enrichedBooks = await Promise.all(
      merged.map(async (result) => {
        const existing = await bookMediaRepo.findOne({
          where: { openLibraryId: result.openLibraryId },
        });

        return {
          type: 'book' as const,
          ...result,
          mediaType: MediaType.BOOK,
          mediaStatus: existing?.status ?? null,
          bookMediaId: existing?.id ?? null,
        };
      })
    );

    // Series hits appear ahead of books when the query strongly matches a
    // series name (naive heuristic: case-insensitive substring match on
    // either side). Everything else still lands in the results list
    // unchanged so users searching for an individual title aren't buried
    // under series entries.
    const queryLc = query.toLowerCase().trim();
    const strongSeriesMatches: SeriesHit[] = [];
    const weakSeriesMatches: SeriesHit[] = [];
    for (const s of seriesHits) {
      const nameLc = s.name.toLowerCase();
      if (nameLc === queryLc || nameLc.includes(queryLc)) {
        strongSeriesMatches.push(s);
      } else {
        weakSeriesMatches.push(s);
      }
    }
    const finalResults = [
      ...strongSeriesMatches,
      ...enrichedBooks,
      ...weakSeriesMatches,
    ];

    return res.status(200).json({
      page,
      totalPages: Math.max(1, Math.ceil(olTotal / limit)),
      totalResults: finalResults.length,
      results: finalResults,
    });
  } catch (e) {
    logger.error('Book search failed', {
      label: 'book',
      query,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Book search failed. Please try again.',
    });
  }
});

/**
 * GET /api/v1/book/series/:seriesId
 * Return an OpenLibrary series definition plus its member books, enriched
 * with local availability (mediaStatus) per work.
 */
bookRoutes.get('/series/:seriesId', isAuthenticated(), async (req, res) => {
  // Key may be prefixed with its source (openlibrary:, hardcover:), or
  // bare (legacy OL keys). Strip a legacy "/works/" prefix for safety.
  const raw = decodeURIComponent(req.params.seriesId);
  const [prefix, ...rest] = raw.split(':');
  const hasPrefix = rest.length > 0 && /^[a-z]+$/.test(prefix);
  const source = hasPrefix ? prefix : 'openlibrary';
  const id = (hasPrefix ? rest.join(':') : raw).replace(/^\/(series\/)?/, '');

  try {
    if (source === 'bookshelf') {
      const settings = getSettings();
      const cfg = settings.book.metadataProviders;
      if (!cfg.bookshelf) {
        return res.status(400).json({
          status: 400,
          message:
            'Bookshelf metadata provider is not enabled. Turn it on in Settings → Metadata Providers → Books.',
        });
      }
      const bookshelfInstance = settings.bookshelf?.find(
        (b) => b.mediaType === 'book' && b.isDefault
      );
      if (!bookshelfInstance) {
        return res.status(400).json({
          status: 400,
          message:
            'Bookshelf is not configured. Set up an instance in Services → Books first.',
        });
      }
      const api = new BookshelfAPI({
        apiKey: bookshelfInstance.apiKey,
        url: BookshelfAPI.buildUrl(bookshelfInstance, '/api/v1'),
      });
      const name = decodeURIComponent(id);
      const members = await api.findSeriesMembers(name);
      if (members.length === 0) {
        return res.status(404).json({
          status: 404,
          message: `No Bookshelf books found in series "${name}".`,
        });
      }
      const bookMediaRepo = getRepository(BookMedia);
      const enriched = await Promise.all(
        members.map(async (m) => {
          // Bookshelf books are keyed by Goodreads numeric id; they
          // aren't directly navigable via /book/{olKey}. We still
          // render them with a synthetic openLibraryId so the BookCard
          // component renders — navigation stays non-OL-keyed for now.
          return {
            openLibraryId: `bookshelf:${m.id}`,
            title: `${m.title}${m.position ? ` (#${m.position})` : ''}`,
            authorName: '',
            coverUrl: undefined,
            mediaStatus: m.monitored ? 3 : null,
            bookMediaId: null,
            mediaType: MediaType.BOOK,
          };
        })
      );
      // Avoid "unused" warning until we wire per-book cover lookup
      void bookMediaRepo;
      return res.status(200).json({
        key: `bookshelf:${encodeURIComponent(name)}`,
        name,
        description: undefined,
        seedCount: members.length,
        members: enriched,
      });
    }

    if (source === 'hardcover') {
      const settings = getSettings();
      const cfg = settings.book.metadataProviders;
      if (!cfg.hardcover || !cfg.hardcoverApiKey) {
        return res.status(400).json({
          status: 400,
          message:
            'Hardcover is not enabled. Turn it on in Settings → Metadata Providers → Books.',
        });
      }
      const hc = new HardcoverAPI(cfg.hardcoverApiKey);
      const detail = await hc.getSeries(Number(id));
      if (!detail) {
        return res
          .status(404)
          .json({ status: 404, message: 'Series not found.' });
      }
      const rawMembers = detail.book_series ?? [];

      // Hardcover returns every translation as a separate book record
      // sharing the same series `position` (Harry Potter = position 1
      // covers English + French + Spanish + German + … → 50+ rows for
      // a 7-book series). Hardcover doesn't expose language at the
      // book level (only per edition), so we can't filter by language
      // directly. Heuristic: keep one book per position, picking the
      // highest `users_count` — that's the canonical / most-read
      // edition in the Hardcover community, typically the English
      // original for international series.
      //
      // Books without a `position` (rare — usually companion works)
      // fall back to a title-normalised dedupe so they don't get
      // collapsed into the wrong group.
      const normalise = (t: string) =>
        t
          .toLowerCase()
          .replace(/^(the|a|an|le|la|les|un|une)\s+/, '')
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
      const byPosition = new Map<number, typeof rawMembers[number]>();
      const looseByTitle = new Map<string, typeof rawMembers[number]>();
      const pickBetter = (
        current: typeof rawMembers[number] | undefined,
        next: typeof rawMembers[number]
      ): typeof rawMembers[number] => {
        if (!current) return next;
        const cu = current.book?.users_count ?? 0;
        const nu = next.book?.users_count ?? 0;
        return nu > cu ? next : current;
      };
      for (const m of rawMembers) {
        const title = m.book?.title ?? '';
        if (!title.trim()) continue;
        if (typeof m.position === 'number') {
          byPosition.set(m.position, pickBetter(byPosition.get(m.position), m));
        } else {
          const key = normalise(title);
          looseByTitle.set(key, pickBetter(looseByTitle.get(key), m));
        }
      }
      const deduped = [
        ...byPosition.values(),
        ...looseByTitle.values(),
      ].sort((a, b) => (a.position ?? 1e9) - (b.position ?? 1e9));

      const bookMediaRepo = getRepository(BookMedia);
      const enrichedRaw = await Promise.all(
        deduped.map(async (m) => {
          const olMapping = m.book?.book_mappings?.find(
            (bm) => bm.platform?.name?.toLowerCase() === 'openlibrary'
          );
          const normalisedOL = toOLWorkKey(olMapping?.external_id);
          const openLibraryId =
            normalisedOL ?? `hardcover:${m.book?.id ?? ''}`;
          const existing = normalisedOL
            ? await bookMediaRepo.findOne({
                where: { openLibraryId: normalisedOL },
              })
            : null;
          const imageUrl = m.book?.image?.url;
          return {
            openLibraryId,
            title: m.book?.title ?? '',
            authorName: hardcoverPrimaryAuthor(m.book?.contributions) ?? '',
            coverUrl: imageUrl?.startsWith('http') ? imageUrl : undefined,
            mediaStatus: existing?.status ?? null,
            bookMediaId: existing?.id ?? null,
            mediaType: MediaType.BOOK,
            // Keep users_count on the side so a second-pass dedupe can
            // pick the most-read edition when several translations
            // collapse onto the same OL work key.
            _usersCount: m.book?.users_count ?? 0,
          };
        })
      );
      // Final collapse by openLibraryId: translations that share the
      // same `/works/OLxxxW` mapping are the same underlying work, so
      // keep only the highest-readership entry (usually the canonical
      // / English edition). `hardcover:<id>` keys stay distinct by
      // construction. Fixes cases where Hardcover returns multiple
      // translated `book_series` rows whose mappings all point at the
      // same OL work but that had no / different `position` values.
      const byOLKey = new Map<string, (typeof enrichedRaw)[number]>();
      for (const m of enrichedRaw) {
        const existing = byOLKey.get(m.openLibraryId);
        if (!existing || m._usersCount > existing._usersCount) {
          byOLKey.set(m.openLibraryId, m);
        }
      }
      const enriched = [...byOLKey.values()].map(
        ({ _usersCount, ...rest }) => {
          void _usersCount;
          return rest;
        }
      );
      return res.status(200).json({
        key: `hardcover:${detail.id}`,
        name: detail.name,
        description: detail.description ?? undefined,
        seedCount: enriched.length,
        members: enriched,
      });
    }

    // Default / openlibrary
    const [series, members] = await Promise.all([
      openLibrary.getSeries(id),
      openLibrary.getSeriesMembers(id),
    ]);

    if (!series) {
      return res
        .status(404)
        .json({ status: 404, message: 'Series not found.' });
    }

    const bookMediaRepo = getRepository(BookMedia);
    const enriched = await Promise.all(
      members.map(async (m) => {
        const existing = await bookMediaRepo.findOne({
          where: { openLibraryId: `/works/${m.workKey}` },
        });
        return {
          openLibraryId: `/works/${m.workKey}`,
          title: m.title,
          authorName: '',
          coverUrl: m.coverUrl,
          mediaStatus: existing?.status ?? null,
          bookMediaId: existing?.id ?? null,
          mediaType: MediaType.BOOK,
        };
      })
    );

    return res.status(200).json({
      key: `openlibrary:${series.key}`,
      name: series.name,
      description: series.description,
      seedCount: series.seedCount,
      members: enriched,
    });
  } catch (e) {
    logger.error('Book series fetch failed', {
      label: 'book',
      seriesId: raw,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch series details.',
    });
  }
});

/**
 * GET /api/v1/book/author/:authorKey
 * Author details + their works list, keyed by OpenLibrary author key
 * (e.g. "OL19981A"). Each work is enriched with local availability so
 * the UI can show a "requested" / "available" badge per card.
 */
bookRoutes.get('/author/:authorKey', isAuthenticated(), async (req, res) => {
  const rawKey = decodeURIComponent(req.params.authorKey);
  const key = rawKey.replace(/^\/authors\//, '').replace(/^\//, '');
  try {
    const [info, worksResp] = await Promise.all([
      openLibrary.getAuthor(key),
      openLibrary.getAuthorWorks(key, 100),
    ]);
    if (!info) {
      return res
        .status(404)
        .json({ status: 404, message: 'Author not found.' });
    }

    // Dedup by normalized title. OpenLibrary's works list for a popular
    // author (e.g. Stephen King returns 608) is padded with translations,
    // short-story reissues, omnibus editions, etc. Collapsing them keeps
    // the UI readable without hiding anything the user requested.
    const seen = new Set<string>();
    const normalizeTitle = (t: string) =>
      t
        .toLowerCase()
        .replace(/^(the|a|an|le|la|les|un|une)\s+/, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const dedupedWorks = worksResp.works.filter((w) => {
      if (!w.title || w.title.trim().length < 2) return false;
      // Filter obvious noise: empty, single-word "untitled", or just the
      // author name (OL has a known bug where untitled entries fall back).
      if (
        info.name &&
        w.title.trim().toLowerCase() === info.name.toLowerCase()
      ) {
        return false;
      }
      const k = normalizeTitle(w.title);
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const bookMediaRepo = getRepository(BookMedia);
    const works = await Promise.all(
      dedupedWorks.map(async (w) => {
        const existing = await bookMediaRepo.findOne({
          where: { openLibraryId: `/works/${w.workKey}` },
        });
        return {
          openLibraryId: `/works/${w.workKey}`,
          title: w.title,
          authorName: info.name ?? '',
          coverUrl: w.coverUrl,
          mediaStatus: existing?.status ?? null,
          bookMediaId: existing?.id ?? null,
          mediaType: MediaType.BOOK,
        };
      })
    );

    return res.status(200).json({
      key,
      name: info.name,
      photoUrl: info.photoUrl,
      bio: info.bio,
      birthDate: info.birthDate,
      deathDate: info.deathDate,
      // Raw OL count (what the catalog claims) + deduped count we show.
      totalWorks: worksResp.size,
      uniqueWorks: works.length,
      works,
    });
  } catch (e) {
    logger.error('Author fetch failed', {
      label: 'book',
      authorKey: rawKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch author details.',
    });
  }
});

/**
 * GET /api/v1/book/:id
 * Get book detail by OpenLibrary work key.
 */
bookRoutes.get('/:id', isAuthenticated(), async (req, res) => {
  const id = req.params.id;
  // Audible ASINs are 10 chars starting with 'B'; OpenLibrary IDs look like "OL...W"
  const isAudibleAsin = /^B[0-9A-Z]{9}$/.test(id);
  const isOpenLibraryId = /^OL\d+W$/.test(id);

  // Reject non-OL, non-Audible keys early — e.g. "gbooks:..." synthetic
  // IDs from Google Books search results that would otherwise trigger a
  // noisy 404 fetch against OpenLibrary.
  if (!isAudibleAsin && !isOpenLibraryId) {
    return res.status(404).json({
      status: 404,
      message: 'Book not found.',
    });
  }

  try {
    if (isAudibleAsin) {
      const product = await getAudibleClient().getProduct(id);
      if (!product) {
        return res.status(404).json({
          status: 404,
          message: 'Audiobook not found.',
        });
      }

      const audiobookMediaRepo = getRepository(AudiobookMedia);
      const existing = await audiobookMediaRepo.findOne({
        where: { asin: product.asin },
      });

      return res.status(200).json({
        key: product.asin,
        title: product.title,
        subtitle: product.subtitle,
        authorName: product.authorName,
        narratorName: product.narratorName,
        description: product.summary,
        coverUrl: product.coverUrl,
        year: product.year,
        publisher: product.publisher,
        durationSeconds: product.durationSeconds,
        language: product.language,
        mediaType: MediaType.AUDIOBOOK,
        mediaStatus: existing?.status ?? null,
        bookMediaId: existing?.id ?? null,
        libraryServerUrl: remapToPublicUrl(existing?.libraryServerUrl),
      });
    }

    const workKey = `/works/${id}`;
    const work = await openLibrary.getWork(workKey);

    if (!work) {
      return res.status(404).json({
        status: 404,
        message: 'Book not found.',
      });
    }

    // Check local availability
    const bookMediaRepo = getRepository(BookMedia);
    const existing = await bookMediaRepo.findOne({
      where: { openLibraryId: workKey },
    });

    // Extract first author's OpenLibrary key (e.g. "OL12345A") from the Work
    // and fetch the author's display name, photo, and bio (Work itself
    // doesn't carry any of these).
    const authorKey = work.authors?.[0]?.author?.key?.split('/').pop();
    const authorInfo = authorKey ? await openLibrary.getAuthor(authorKey) : null;
    const authorName = authorInfo?.name ?? null;
    const authorPhotoUrl = authorInfo?.photoUrl;
    const authorBio = authorInfo?.bio;
    const authorBirthDate = authorInfo?.birthDate;
    const authorDeathDate = authorInfo?.deathDate;

    // Augment with enabled metadata providers (Bindery + Google Books) so the
    // detail page shows ISBN, page count, richer description/subjects, etc.
    const settings = getSettings();
    const cfg = settings.book.metadataProviders;

    let isbn13: string | undefined;
    let isbn10: string | undefined;
    let pageCount: number | undefined;
    let publisher: string | undefined;
    let language: string | undefined;
    let enrichedDescription: string | undefined;
    const mergedSubjects = new Set<string>(work.subjects ?? []);

    const enrichmentCalls: Promise<void>[] = [];

    let country: string | undefined;

    // Always fetch ISBNs + publish country from OpenLibrary editions —
    // OL Works don't carry these (editions do). Downstream services
    // (Bookshelf, Bindery) match much more reliably on ISBN than on
    // title/author free-text search; country powers the flag badge.
    enrichmentCalls.push(
      openLibrary.getWorkEditionFacts(workKey).then((facts) => {
        isbn13 = isbn13 ?? facts.isbn13;
        isbn10 = isbn10 ?? facts.isbn10;
        country = country ?? facts.country;
      })
    );

    if (cfg.googleBooks && authorName) {
      const gb = new GoogleBooksAPI(cfg.googleBooksApiKey);
      enrichmentCalls.push(
        gb
          .search(`${work.title} ${authorName}`, 1, 5)
          .then(({ results }) => {
            // Best match: exact-ish title
            const match =
              results.find(
                (r) =>
                  r.title.toLowerCase().trim() ===
                  work.title.toLowerCase().trim()
              ) ?? results[0];
            if (match) {
              isbn13 = isbn13 || match.isbn13;
              isbn10 = isbn10 || match.isbn10;
              pageCount = pageCount || match.pageCount;
              publisher = publisher || match.publisher;
              language = language || match.language;
              if (
                match.description &&
                match.description.length >
                  (enrichedDescription?.length ?? 0)
              ) {
                enrichedDescription = match.description;
              }
              (match.subjects ?? []).forEach((s) => mergedSubjects.add(s));
            }
          })
          .catch(() => {})
      );
    }

    if (cfg.bindery && authorKey) {
      const binderyInstance = settings.bindery.find(
        (b) => b.mediaType === 'book' && b.isDefault
      );
      if (binderyInstance) {
        const binderyApi = new BinderyAPI({
          apiKey: binderyInstance.apiKey,
          url: BinderyAPI.buildUrl(binderyInstance, '/api/v1'),
        });
        enrichmentCalls.push(
          binderyApi
            .searchBooks(`${work.title}`)
            .then((items) => {
              const match = items.find(
                (b) =>
                  b.title.toLowerCase().trim() ===
                    work.title.toLowerCase().trim() &&
                  b.foreignAuthorId === authorKey
              );
              if (match) {
                language = language || match.language;
              }
            })
            .catch(() => {})
        );
      }
    }

    // Series membership — start with OpenLibrary's canonical series data,
    // then fill in from Bookshelf/Hardcover below if OL had nothing.
    const seriesEntries: {
      key: string;
      name: string;
      position?: string;
      seedCount: number;
      /** Whether we can link to an in-app series page (requires OL key). */
      linkable: boolean;
    }[] = [];
    if (work.series?.length) {
      const seriesLookups = work.series.slice(0, 3).map(async (ref) => {
        const info = await openLibrary.getSeries(ref.series.key);
        if (info) {
          seriesEntries.push({
            // Source-prefixed key so the /book/series/:key handler can
            // dispatch to the right provider regardless of origin.
            key: `openlibrary:${info.key}`,
            name: info.name,
            position: ref.position,
            seedCount: info.seedCount,
            linkable: true,
          });
        }
      });
      await Promise.all(seriesLookups);
    }

    // Bookshelf enrichment — rating, genres, language, pageCount + series
    // fallback when OL didn't have one. Bookshelf's /book/lookup returns a
    // `seriesTitle` like "Silo #3" which we parse into name + position.
    let rating: number | undefined;
    let ratingsCount: number | undefined;
    const mergedGenres = new Set<string>();
    if (cfg.bookshelf) {
      const bookshelfInstance = settings.bookshelf?.find(
        (b) => b.mediaType === 'book' && b.isDefault
      );
      if (bookshelfInstance) {
        const bookshelfApi = new BookshelfAPI({
          apiKey: bookshelfInstance.apiKey,
          url: BookshelfAPI.buildUrl(bookshelfInstance, '/api/v1'),
        });
        enrichmentCalls.push(
          (async () => {
            let hits: unknown[] = [];
            if (isbn13) {
              hits = await bookshelfApi.lookupBook(`isbn:${isbn13}`);
            }
            if (hits.length === 0 && isbn10) {
              hits = await bookshelfApi.lookupBook(`isbn:${isbn10}`);
            }
            if (hits.length === 0 && authorName) {
              hits = await bookshelfApi.lookupBook(
                `${work.title} ${authorName}`
              );
            }
            const targetTitle = work.title.toLowerCase().trim();
            const match =
              (hits as Record<string, unknown>[]).find(
                (h) =>
                  typeof h.title === 'string' &&
                  h.title.toLowerCase().trim() === targetTitle
              ) ?? (hits as Record<string, unknown>[])[0];
            if (!match) return;

            const r = match.ratings as
              | { value?: number; votes?: number }
              | undefined;
            if (r?.value && !rating) {
              rating = r.value;
              ratingsCount = r.votes;
            }
            if (typeof match.pageCount === 'number' && !pageCount) {
              pageCount = match.pageCount;
            }
            if (typeof match.language === 'string' && !language) {
              language = match.language;
            }
            (match.genres as string[] | undefined)?.forEach((g) =>
              mergedGenres.add(g)
            );

            // Series fallback from "seriesTitle". Bookshelf encodes
            // multi-series memberships as "Wool #2; Silo #1B" — split
            // and emit one linkable entry per series.
            if (
              seriesEntries.length === 0 &&
              typeof match.seriesTitle === 'string' &&
              match.seriesTitle.trim()
            ) {
              for (const part of match.seriesTitle
                .split(';')
                .map((s) => s.trim())) {
                const m = part.match(/^(.+?)\s*(?:#(\S+))?\s*$/);
                if (m?.[1]) {
                  seriesEntries.push({
                    // URL-safe: encode the series name (can contain
                    // spaces / apostrophes). The handler decodes it back.
                    key: `bookshelf:${encodeURIComponent(m[1])}`,
                    name: m[1],
                    position: m[2],
                    seedCount: 0,
                    linkable: true,
                  });
                }
              }
            }
          })().catch(() => {})
        );
      }
    }

    // Hardcover enrichment — rating, genres, series, readers, characters,
    // moods, content warnings (free GraphQL API).
    let readersCount: number | undefined;
    let readCount: number | undefined;
    let fallbackCoverUrl: string | undefined;
    const moods: string[] = [];
    const contentWarnings: string[] = [];
    const characters: string[] = [];
    if (cfg.hardcover) {
      const hc = new HardcoverAPI(cfg.hardcoverApiKey);
      enrichmentCalls.push(
        (async () => {
          let hit =
            (isbn13 && (await hc.searchByIsbn(isbn13))) ||
            (isbn10 && (await hc.searchByIsbn(isbn10))) ||
            null;
          if (!hit) {
            hit = await hc.searchBook(work.title);
          }
          if (!hit) return;
          // Use Hardcover's cover when the OL work has no `covers` (happens
          // for newer / less-indexed works).
          if (!fallbackCoverUrl && hit.image?.url?.startsWith('http')) {
            fallbackCoverUrl = hit.image.url;
          }
          if (hit.rating && !rating) {
            rating = hit.rating;
            ratingsCount = hit.ratings_count ?? undefined;
          }
          if (hit.pages && !pageCount) pageCount = hit.pages;
          if (typeof hit.users_count === 'number') {
            readersCount = hit.users_count;
          }
          if (typeof hit.users_read_count === 'number') {
            readCount = hit.users_read_count;
          }
          // cached_tags is a JSON blob with Genre/Mood/ContentWarning arrays.
          if (hit.cached_tags) {
            hit.cached_tags.Genre?.forEach((t) => mergedGenres.add(t.tag));
            hit.cached_tags.Mood?.forEach((t) => moods.push(t.tag));
            hit.cached_tags.ContentWarning?.filter((t) => !t.spoiler).forEach(
              (t) => contentWarnings.push(t.tag)
            );
          }
          hit.book_characters
            ?.filter((c) => !c.spoiler && c.character?.name)
            .forEach((c) => {
              if (c.character?.name) characters.push(c.character.name);
            });
          if (seriesEntries.length === 0 && hit.book_series?.length) {
            for (const bs of hit.book_series) {
              if (bs.series?.name) {
                seriesEntries.push({
                  key: `hardcover:${bs.series.id}`,
                  name: bs.series.name,
                  position: bs.position?.toString(),
                  seedCount: 0,
                  // Linkable — the /book/series/:key handler knows how
                  // to fetch Hardcover series members.
                  linkable: true,
                });
              }
            }
          }
        })().catch(() => {})
      );
    }

    await Promise.all(enrichmentCalls);

    // Merge genres into subjects for display
    mergedGenres.forEach((g) => mergedSubjects.add(g));

    return res.status(200).json({
      ...work,
      // Fallback cover when OL's `covers` array is empty — frontend
      // prefers `coverUrl` over the OL-derived URL.
      ...(fallbackCoverUrl && (!work.covers || work.covers.length === 0)
        ? { coverUrl: fallbackCoverUrl }
        : {}),
      authorKey,
      authorName,
      authorPhotoUrl,
      authorBio,
      authorBirthDate,
      authorDeathDate,
      isbn13,
      isbn10,
      pageCount,
      publisher,
      language,
      country,
      rating,
      ratingsCount,
      readersCount,
      readCount,
      moods: Array.from(new Set(moods)).slice(0, 15),
      contentWarnings: Array.from(new Set(contentWarnings)).slice(0, 15),
      characters: Array.from(new Set(characters)).slice(0, 12),
      subjects: Array.from(mergedSubjects).slice(0, 30),
      series: seriesEntries,
      description: (() => {
        // Pick the longest available description, then clean OL cruft
        // (source refs, link defs, "Also contained in" edition lists).
        const olDescRaw =
          typeof work.description === 'string'
            ? work.description
            : work.description?.value;
        const best =
          enrichedDescription &&
          enrichedDescription.length > (olDescRaw?.length ?? 0)
            ? enrichedDescription
            : olDescRaw ?? enrichedDescription;
        return best ? cleanOpenLibraryText(best) : undefined;
      })(),
      mediaStatus: existing?.status ?? null,
      bookMediaId: existing?.id ?? null,
      libraryServerUrl: remapToPublicUrl(existing?.libraryServerUrl),
    });
  } catch (e) {
    logger.error('Book detail fetch failed', {
      label: 'book',
      id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch book details.',
    });
  }
});

/**
 * POST /api/v1/book/request
 * Submit a book or audiobook request.
 */
bookRoutes.post('/request', isAuthenticated(), async (req, res) => {
  const body = req.body as {
    mediaType: MediaType;
    openLibraryId: string;
    title: string;
    authorName: string;
    foreignBookId: string;
    foreignAuthorId?: string;
    isbn13?: string;
    isbn10?: string;
    asin?: string;
    note?: string;
    preferredFormat?: string;
    coverUrl?: string;
    year?: number;
    publisher?: string;
    narratorName?: string;
  };

  if (
    !body.mediaType ||
    !body.title ||
    !body.authorName ||
    !body.foreignBookId
  ) {
    return res.status(400).json({
      status: 400,
      message: 'mediaType, title, authorName, and foreignBookId are required.',
    });
  }

  if (
    body.mediaType !== MediaType.BOOK &&
    body.mediaType !== MediaType.AUDIOBOOK
  ) {
    return res.status(400).json({
      status: 400,
      message: 'mediaType must be "book" or "audiobook".',
    });
  }

  const isBook = body.mediaType === MediaType.BOOK;
  const bookMediaRepo = getRepository(BookMedia);
  const audiobookMediaRepo = getRepository(AudiobookMedia);
  const requestRepo = getRepository(MediaRequest);

  // Duplicate detection: check if already requested
  const existingMedia = isBook
    ? await bookMediaRepo.findOne({
        where: { foreignBookId: body.foreignBookId },
      })
    : await audiobookMediaRepo.findOne({
        where: { foreignBookId: body.foreignBookId },
      });

  if (existingMedia) {
    const existingRequest = await requestRepo.findOne({
      where: isBook
        ? { bookMedia: { id: existingMedia.id } }
        : { audiobookMedia: { id: existingMedia.id } },
    });

    if (
      existingRequest &&
      existingRequest.status !== MediaRequestStatus.DECLINED
    ) {
      return res.status(409).json({
        status: 409,
        message: 'This item has already been requested.',
        existingRequestId: existingRequest.id,
        existingStatus: existingRequest.status,
      });
    }
  }

  try {
    // Create or reuse media entity. When reusing, back-fill stale/empty
    // fields with fresh metadata from the request body so downstream
    // dispatchers (Bindery / Bookshelf) get a complete payload even when
    // the BookMedia was created before a particular field was plumbed
    // through the UI (e.g. legacy records with authorName="Unknown").
    let media = existingMedia;
    if (media) {
      const isEmpty = (v: string | number | null | undefined) =>
        v == null ||
        v === '' ||
        (typeof v === 'string' && v.toLowerCase().trim() === 'unknown');
      let changed = false;
      const assign = <T extends Record<string, unknown>>(
        target: T,
        key: keyof T,
        fresh: unknown
      ) => {
        if (isEmpty(target[key] as never) && fresh) {
          (target as Record<string, unknown>)[key as string] = fresh;
          changed = true;
        }
      };
      const m = media as unknown as Record<string, unknown>;
      assign(m, 'authorName', body.authorName);
      assign(m, 'foreignAuthorId', body.foreignAuthorId);
      assign(m, 'openLibraryId', body.openLibraryId);
      assign(m, 'coverUrl', body.coverUrl);
      assign(m, 'year', body.year);
      assign(m, 'publisher', body.publisher);
      if (isBook) {
        // BookMedia-only fields
        assign(m, 'isbn13', body.isbn13);
        assign(m, 'isbn10', body.isbn10);
      } else {
        // AudiobookMedia-only
        assign(m, 'asin', body.asin);
        assign(m, 'narratorName', body.narratorName);
      }
      // Reset to PENDING when re-requesting media that was previously
      // declined / had its request removed (leaving status UNKNOWN or
      // stale PROCESSING). Skip if it's actually AVAILABLE — no point
      // demoting a downloaded book back to pending.
      if (media.status !== MediaStatus.AVAILABLE) {
        media.status = MediaStatus.PENDING;
        changed = true;
      }
      if (changed) {
        if (isBook) {
          await bookMediaRepo.save(media as BookMedia);
        } else {
          await audiobookMediaRepo.save(media as AudiobookMedia);
        }
        logger.info(
          `Back-filled stale metadata on existing ${isBook ? 'BookMedia' : 'AudiobookMedia'} ${media.id}`,
          { label: 'book' }
        );
      }
    }
    if (!media) {
      if (isBook) {
        media = new BookMedia({
          title: body.title,
          authorName: body.authorName,
          foreignBookId: body.foreignBookId,
          foreignAuthorId: body.foreignAuthorId,
          isbn13: body.isbn13,
          isbn10: body.isbn10,
          openLibraryId: body.openLibraryId,
          coverUrl: body.coverUrl,
          year: body.year,
          publisher: body.publisher,
          status: MediaStatus.PENDING,
        });
      } else {
        // For audiobooks, foreignBookId is the Audible ASIN
        const asin =
          body.asin ||
          (/^B[0-9A-Z]{9}$/.test(body.foreignBookId)
            ? body.foreignBookId
            : undefined);
        media = new AudiobookMedia({
          title: body.title,
          authorName: body.authorName,
          foreignBookId: body.foreignBookId,
          foreignAuthorId: body.foreignAuthorId,
          openLibraryId: body.openLibraryId,
          asin,
          coverUrl: body.coverUrl,
          year: body.year,
          publisher: body.publisher,
          narratorName: body.narratorName,
          status: MediaStatus.PENDING,
        });
      }
      if (isBook && media) {
        await bookMediaRepo.save(media as BookMedia);
      } else if (media) {
        await audiobookMediaRepo.save(media as AudiobookMedia);
      }
    }

    // Create request
    const request = new MediaRequest();
    request.status = MediaRequestStatus.PENDING;
    request.type = body.mediaType;
    request.requestedBy = req.user!;

    if (isBook) {
      request.bookMedia = media as BookMedia;
    } else {
      request.audiobookMedia = media as AudiobookMedia;
    }

    await requestRepo.save(request);

    // Auto-approval check
    const autoApprovePermission = isBook
      ? Permission.AUTO_APPROVE
      : Permission.AUTO_APPROVE;
    if (
      req.user &&
      hasPermission(req.user.permissions, autoApprovePermission)
    ) {
      media.status = MediaStatus.PROCESSING;
      await saveBookMedia(media, body.mediaType);

      // Dispatch is handled by MediaRequestSubscriber.sendToBindery /
      // sendToBookshelf when the request transitions to APPROVED — the
      // save below triggers afterUpdate.
      request.status = MediaRequestStatus.APPROVED;
      await requestRepo.save(request);
    }

    logger.info(`Book request created: ${body.title}`, {
      label: 'book',
      mediaType: body.mediaType,
      requestId: request.id,
    });

    return res.status(201).json(request);
  } catch (e) {
    logger.error('Book request creation failed', {
      label: 'book',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to create book request.',
    });
  }
});

/**
 * GET /api/v1/book/request
 * List book/audiobook requests with filters.
 */
bookRoutes.get('/request', isAuthenticated(), async (req, res) => {
  const requestRepo = getRepository(MediaRequest);
  const page = parseInt((req.query.page as string) || '1', 10);
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const status = req.query.status
    ? parseInt(req.query.status as string, 10)
    : undefined;

  const qb = requestRepo
    .createQueryBuilder('request')
    .leftJoinAndSelect('request.bookMedia', 'bookMedia')
    .leftJoinAndSelect('request.audiobookMedia', 'audiobookMedia')
    .leftJoinAndSelect('request.requestedBy', 'requestedBy')
    .where(
      '(request.bookMedia IS NOT NULL OR request.audiobookMedia IS NOT NULL)'
    );

  // Non-admin users can only see their own requests
  if (
    !req.user ||
    !hasPermission(req.user.permissions, Permission.MANAGE_REQUESTS)
  ) {
    qb.andWhere('request.requestedBy = :userId', {
      userId: req.user?.id,
    });
  }

  if (status !== undefined) {
    qb.andWhere('request.status = :status', { status });
  }

  qb.orderBy('request.createdAt', 'DESC')
    .skip((page - 1) * limit)
    .take(limit);

  const [results, total] = await qb.getManyAndCount();

  return res.status(200).json({
    page,
    totalPages: Math.ceil(total / limit),
    totalResults: total,
    results,
  });
});

/**
 * PUT /api/v1/book/request/:id
 * Update request status (approve, decline, etc).
 */
bookRoutes.put(
  '/request/:id',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res) => {
    const requestRepo = getRepository(MediaRequest);
    const request = await requestRepo.findOne({
      where: { id: parseInt(req.params.id, 10) },
      relations: ['bookMedia', 'audiobookMedia', 'requestedBy'],
    });

    if (!request) {
      return res
        .status(404)
        .json({ status: 404, message: 'Request not found.' });
    }

    const body = req.body as { status: MediaRequestStatus; reason?: string };
    const previousStatus = request.status;

    const media = request.bookMedia || request.audiobookMedia;
    const mediaType = request.bookMedia ? MediaType.BOOK : MediaType.AUDIOBOOK;
    // Promote the BookMedia/AudiobookMedia to PROCESSING BEFORE saving the
    // request — that way the MediaRequestSubscriber.afterUpdate hook (which
    // triggers Bookshelf/Bindery dispatch) sees the correct media status,
    // and the dispatcher's own BookMedia.save inside the subscriber won't
    // race with a later status update from the route.
    if (body.status === MediaRequestStatus.APPROVED && media) {
      media.status = MediaStatus.PROCESSING;
      await saveBookMedia(media, mediaType);
    }

    request.status = body.status;
    request.modifiedBy = req.user;
    await requestRepo.save(request);

    logger.info(
      `Book request ${request.id} status changed: ${previousStatus} → ${body.status}`,
      { label: 'book' }
    );

    return res.status(200).json(request);
  }
);

/**
 * DELETE /api/v1/book/request/:id
 * Delete a book request.
 */
bookRoutes.delete('/request/:id', isAuthenticated(), async (req, res) => {
  const requestRepo = getRepository(MediaRequest);
  const request = await requestRepo.findOne({
    where: { id: parseInt(req.params.id, 10) },
    relations: ['requestedBy', 'bookMedia', 'audiobookMedia'],
  });

  if (!request) {
    return res.status(404).json({ status: 404, message: 'Request not found.' });
  }

  // Only admin or own pending request
  const isOwner = request.requestedBy?.id === req.user?.id;
  const canManage = hasPermission(
    req.user?.permissions ?? 0,
    Permission.MANAGE_REQUESTS
  );

  if (
    !canManage &&
    !(isOwner && request.status === MediaRequestStatus.PENDING)
  ) {
    return res.status(403).json({
      status: 403,
      message: 'You do not have permission to delete this request.',
    });
  }

  const bookMediaId = request.bookMedia?.id;
  const audiobookMediaId = request.audiobookMedia?.id;

  await requestRepo.remove(request);

  // If no request still points at this media, drop the media row too —
  // otherwise a later POST /book/request would reuse the stale record
  // with its old status / downloadManagerExternalId and the UI would
  // keep showing an out-of-date "requested" state.
  if (bookMediaId) {
    const remaining = await requestRepo.count({
      where: { bookMedia: { id: bookMediaId } },
    });
    if (remaining === 0) {
      await getRepository(BookMedia).delete({ id: bookMediaId });
      logger.info(
        `Removed orphaned BookMedia ${bookMediaId} after deleting last request`,
        { label: 'book' }
      );
    }
  }
  if (audiobookMediaId) {
    const remaining = await requestRepo.count({
      where: { audiobookMedia: { id: audiobookMediaId } },
    });
    if (remaining === 0) {
      await getRepository(AudiobookMedia).delete({ id: audiobookMediaId });
      logger.info(
        `Removed orphaned AudiobookMedia ${audiobookMediaId} after deleting last request`,
        { label: 'book' }
      );
    }
  }

  return res.status(204).send();
});

export default bookRoutes;
