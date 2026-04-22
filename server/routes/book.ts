import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import GoogleBooksAPI from '@server/api/googlebooks';
import HardcoverAPI, {
  hardcoverCountryIso2,
  hardcoverPrimaryAuthor,
  hardcoverPrimaryAuthorId,
} from '@server/api/hardcover';
import OpenLibraryAPI, { cleanOpenLibraryText } from '@server/api/openlibrary';
import BinderyAPI from '@server/api/servarr/bindery';
import BookshelfAPI from '@server/api/servarr/bookshelf';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { AudiobookMedia } from '@server/entity/AudiobookMedia';
import { BookMedia } from '@server/entity/BookMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { toOLWorkKey } from '@server/lib/bookIds';
import { Permission, hasPermission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
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
  // Prefer the audiobook-scoped region so the audiobook metadata tab is
  // the single source of truth going forward. Fall back to the legacy
  // metadataSettings.audibleRegion for unmigrated configs, then to the
  // user's discover region, then 'us'.
  const configured =
    settings.audiobook?.metadataProviders?.audibleRegion?.toLowerCase() ??
    settings.metadataSettings.audibleRegion?.toLowerCase();
  const fallback = settings.main.discoverRegion?.toLowerCase();
  const region = (configured || fallback || 'us') as AudibleRegion;
  return new AudibleAPI(AUDIBLE_VALID_REGIONS.includes(region) ? region : 'us');
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

    // Single-primary model: all book/series/author IDENTITY comes from
    // one source. Other enabled providers never appear in the results.
    // The user's choice lives in settings.book.metadataProviders.primarySource.
    const settings = getSettings();
    const providerCfg = settings.book.metadataProviders;
    const preferredLanguage =
      providerCfg.preferredLanguage?.toLowerCase().trim() ?? '';
    const languagePolicy = providerCfg.languagePolicy ?? 'prefer';
    const hardcoverReady =
      providerCfg.hardcover && !!providerCfg.hardcoverApiKey;
    const effectivePrimary =
      providerCfg.primarySource === 'hardcover' && hardcoverReady
        ? 'hardcover'
        : 'openlibrary';

    type BookResultItem = {
      type: 'book';
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
      mediaType: MediaType;
      mediaStatus: MediaStatus | null;
      bookMediaId: number | null;
    };

    type SeriesHit = {
      type: 'series';
      key: string;
      name: string;
      authorName?: string;
      coverUrl?: string;
      memberCount?: number;
      description?: string;
      aggregateStatus?: MediaStatus;
    };

    type AuthorHit = {
      type: 'author';
      key: string;
      name: string;
      photoUrl?: string;
      bio?: string;
      booksCount?: number;
    };

    // Series + author cards are Hardcover-only features in this codebase
    // (OL has no usable free-text search for those). Only surface them
    // when Hardcover is the effective primary.
    let seriesPromise: Promise<SeriesHit[]> = Promise.resolve([]);
    let authorsPromise: Promise<AuthorHit[]> = Promise.resolve([]);
    if (effectivePrimary === 'hardcover') {
      const hcForAuthors = new HardcoverAPI(providerCfg.hardcoverApiKey);
      authorsPromise = hcForAuthors
        .searchAuthors(query, 3)
        .then((hits) =>
          hits.map(
            (a): AuthorHit => ({
              type: 'author',
              key: `hardcover:${a.id}`,
              name: a.name,
              photoUrl: a.photoUrl,
              bio: a.bio,
              booksCount: a.booksCount,
            })
          )
        )
        .catch(() => [] as AuthorHit[]);
    }
    if (effectivePrimary === 'hardcover') {
      const hcForSeries = new HardcoverAPI(providerCfg.hardcoverApiKey);
      seriesPromise = hcForSeries
        .searchSeries(query, 5)
        .then(async (hits) => {
          const topHits = hits
            .filter((s) => (s.booksCount ?? 0) > 0)
            .slice(0, 3);
          if (topHits.length === 0) return [] as SeriesHit[];
          const bookMediaRepo = getRepository(BookMedia);
          return Promise.all(
            topHits.map(async (s): Promise<SeriesHit> => {
              const base: SeriesHit = {
                type: 'series',
                key: `hardcover:${s.id}`,
                name: s.name,
                authorName: s.authorName,
                coverUrl: s.coverUrl,
                memberCount: s.booksCount,
                description: s.description,
              };
              try {
                const detail = await hcForSeries.getSeries(s.id);
                const memberKeys = (detail?.book_series ?? [])
                  .map(
                    (m) =>
                      toOLWorkKey(
                        m.book?.book_mappings?.find(
                          (bm) =>
                            bm.platform?.name?.toLowerCase() === 'openlibrary'
                        )?.external_id
                      ) ?? (m.book?.id ? `hardcover:${m.book.id}` : undefined)
                  )
                  .filter((k): k is string => !!k);
                if (memberKeys.length === 0) return base;
                const uniqueKeys = Array.from(new Set(memberKeys));
                const medias = await bookMediaRepo.find({
                  where: uniqueKeys.map((k) => ({ openLibraryId: k })),
                });
                const available = medias.filter(
                  (m) => m.status === MediaStatus.AVAILABLE
                ).length;
                const activeRequests = medias.filter(
                  (m) =>
                    m.status === MediaStatus.PENDING ||
                    m.status === MediaStatus.PROCESSING
                ).length;
                if (available >= uniqueKeys.length && available > 0) {
                  base.aggregateStatus = MediaStatus.AVAILABLE;
                } else if (available > 0) {
                  base.aggregateStatus = MediaStatus.PARTIALLY_AVAILABLE;
                } else if (activeRequests > 0) {
                  base.aggregateStatus = MediaStatus.PROCESSING;
                }
              } catch {
                /* best-effort */
              }
              return base;
            })
          );
        })
        .catch(() => [] as SeriesHit[]);
    }

    // Fetch books from the primary source only.
    let rawBooks: BookResultItem[] = [];
    let totalResults = 0;
    if (effectivePrimary === 'hardcover') {
      try {
        const hc = new HardcoverAPI(providerCfg.hardcoverApiKey);
        const hits = await hc.searchBooks(query, limit);
        rawBooks = hits.map((h): BookResultItem => {
          const topEdition = h.editions?.[0];
          return {
            type: 'book',
            openLibraryId: `hardcover:${h.id}`,
            title: h.title,
            authorName:
              hardcoverPrimaryAuthor(h.contributions) ?? 'Unknown Author',
            isbn13: topEdition?.isbn_13 ?? undefined,
            isbn10: topEdition?.isbn_10 ?? undefined,
            coverUrl: h.image?.url?.startsWith('http')
              ? h.image.url
              : undefined,
            year: h.release_date
              ? parseInt(h.release_date.slice(0, 4), 10) || undefined
              : undefined,
            publisher: topEdition?.publisher?.name ?? undefined,
            pageCount: h.pages ?? undefined,
            language: topEdition?.language?.code2 ?? undefined,
            description: h.description ?? undefined,
            mediaType: MediaType.BOOK,
            mediaStatus: null,
            bookMediaId: null,
          };
        });
        totalResults = hits.length;
      } catch (e) {
        logger.error('Hardcover search failed', {
          label: 'book',
          query,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    } else {
      try {
        const { results, totalResults: ol } = await openLibrary.search(
          query,
          page,
          limit,
          preferredLanguage || undefined
        );
        totalResults = ol;
        rawBooks = results.map(
          (r): BookResultItem => ({
            type: 'book',
            openLibraryId: r.openLibraryId,
            title: r.title,
            authorName: r.authorName,
            authorKey: r.authorKey,
            isbn13: r.isbn13,
            isbn10: r.isbn10,
            coverUrl: r.coverUrl,
            year: r.year,
            publisher: r.publisher,
            pageCount: r.pageCount,
            subjects: r.subjects,
            language: r.language,
            mediaType: MediaType.BOOK,
            mediaStatus: null,
            bookMediaId: null,
          })
        );
      } catch (e) {
        logger.error('OpenLibrary search failed', {
          label: 'book',
          query,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    // Apply language policy — "strict" drops mismatches, "prefer"
    // floats matches to the top. Keep entries with unknown language
    // in either mode (the language field is patchy on both providers).
    let merged = rawBooks;
    if (preferredLanguage) {
      if (languagePolicy === 'strict') {
        merged = merged.filter(
          (r) => !r.language || r.language.toLowerCase() === preferredLanguage
        );
      } else {
        const rank = (lang?: string): number =>
          !lang ? 1 : lang.toLowerCase() === preferredLanguage ? 0 : 2;
        merged.sort((a, b) => rank(a.language) - rank(b.language));
      }
    }

    // Overlay BookMedia availability — single-key lookup (the primary
    // source's key) is enough now that identity no longer flips
    // between sources.
    const [seriesHits, authorHits] = await Promise.all([
      seriesPromise,
      authorsPromise,
    ]);
    const bookMediaRepo = getRepository(BookMedia);
    const enrichedBooks = await Promise.all(
      merged.map(async (result) => {
        const existing = await bookMediaRepo.findOne({
          where: { openLibraryId: result.openLibraryId },
        });
        return {
          ...result,
          mediaStatus: existing?.status ?? null,
          bookMediaId: existing?.id ?? null,
        };
      })
    );
    const olTotal = totalResults;

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
    // Author cards take precedence over everything when the query
    // looks like an author name: if any hit's full name contains the
    // query, float it to the very top. Otherwise they trail at the
    // bottom like weak series matches.
    const strongAuthorMatches: AuthorHit[] = [];
    const weakAuthorMatches: AuthorHit[] = [];
    for (const a of authorHits) {
      const nameLc = a.name.toLowerCase();
      if (nameLc === queryLc || nameLc.includes(queryLc)) {
        strongAuthorMatches.push(a);
      } else {
        weakAuthorMatches.push(a);
      }
    }
    const finalResults = [
      ...strongAuthorMatches,
      ...strongSeriesMatches,
      ...enrichedBooks,
      ...weakSeriesMatches,
      ...weakAuthorMatches,
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
      const byPosition = new Map<number, (typeof rawMembers)[number]>();
      const looseByTitle = new Map<string, (typeof rawMembers)[number]>();
      const pickBetter = (
        current: (typeof rawMembers)[number] | undefined,
        next: (typeof rawMembers)[number]
      ): (typeof rawMembers)[number] => {
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
      const deduped = [...byPosition.values(), ...looseByTitle.values()].sort(
        (a, b) => (a.position ?? 1e9) - (b.position ?? 1e9)
      );

      const bookMediaRepo = getRepository(BookMedia);
      const enrichedRaw = await Promise.all(
        deduped.map(async (m) => {
          const olMapping = m.book?.book_mappings?.find(
            (bm) => bm.platform?.name?.toLowerCase() === 'openlibrary'
          );
          const normalisedOL = toOLWorkKey(olMapping?.external_id);
          const hardcoverKey = `hardcover:${m.book?.id ?? ''}`;
          const openLibraryId = normalisedOL ?? hardcoverKey;
          // Check BookMedia under every key we know for this book — if
          // the user previously requested it via one id we don't want
          // the badge to go missing just because another provider
          // wins identity in the current aggregation.
          const candidateKeys = Array.from(
            new Set(
              [normalisedOL, hardcoverKey].filter((k): k is string => !!k)
            )
          );
          const existing = candidateKeys.length
            ? await bookMediaRepo.findOne({
                where: candidateKeys.map((k) => ({ openLibraryId: k })),
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
      const enriched = [...byOLKey.values()].map(({ _usersCount, ...rest }) => {
        void _usersCount;
        return rest;
      });

      // Author enrichment — pick the primary author from the most-read
      // member's contributions, then fetch their full record so the
      // series page can render the same "About the author" card the
      // book detail already uses. Best-effort: if we can't resolve an
      // id, we skip.
      let seriesAuthorName: string | undefined;
      let seriesAuthorKey: string | undefined;
      let seriesAuthorPhotoUrl: string | undefined;
      let seriesAuthorBio: string | undefined;
      let seriesAuthorBirthDate: string | undefined;
      let seriesAuthorDeathDate: string | undefined;
      const mostReadMember = [...(detail.book_series ?? [])].sort(
        (a, b) => (b.book?.users_count ?? 0) - (a.book?.users_count ?? 0)
      )[0];
      const seriesAuthorId = hardcoverPrimaryAuthorId(
        mostReadMember?.book?.contributions
      );
      seriesAuthorName = hardcoverPrimaryAuthor(
        mostReadMember?.book?.contributions
      );
      if (seriesAuthorId !== undefined) {
        seriesAuthorKey = `hardcover:${seriesAuthorId}`;
        try {
          const author = await hc.getAuthor(seriesAuthorId);
          if (author) {
            seriesAuthorName = seriesAuthorName ?? author.name;
            seriesAuthorPhotoUrl = author.cached_image_url;
            seriesAuthorBio = author.bio;
            seriesAuthorBirthDate = author.birth_date;
            seriesAuthorDeathDate = author.death_date;
          }
        } catch {
          /* best-effort */
        }
      }

      return res.status(200).json({
        key: `hardcover:${detail.id}`,
        name: detail.name,
        description: detail.description ?? undefined,
        seedCount: enriched.length,
        members: enriched,
        authorName: seriesAuthorName,
        authorKey: seriesAuthorKey,
        authorPhotoUrl: seriesAuthorPhotoUrl,
        authorBio: seriesAuthorBio,
        authorBirthDate: seriesAuthorBirthDate,
        authorDeathDate: seriesAuthorDeathDate,
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
  const bookMediaRepo = getRepository(BookMedia);

  try {
    // Hardcover-keyed author page: the primary-source flow in the rest
    // of the app emits `hardcover:<authorId>` links on book detail
    // cards when Hardcover is primary, so the author route must know
    // how to resolve them. Returns the same shape as the OL variant
    // so the existing author page component doesn't have to branch.
    if (/^hardcover:\d+$/i.test(rawKey)) {
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
      const author = await hc.getAuthor(
        Number(rawKey.slice('hardcover:'.length))
      );
      if (!author) {
        return res
          .status(404)
          .json({ status: 404, message: 'Author not found.' });
      }
      const works = await Promise.all(
        author.works.map(async (w) => {
          const openLibraryId = `hardcover:${w.id}`;
          const existing = await bookMediaRepo.findOne({
            where: { openLibraryId },
          });
          return {
            openLibraryId,
            title: w.title,
            authorName: author.name,
            coverUrl: w.image_url,
            mediaStatus: existing?.status ?? null,
            bookMediaId: existing?.id ?? null,
            mediaType: MediaType.BOOK,
          };
        })
      );
      return res.status(200).json({
        key: rawKey,
        name: author.name,
        photoUrl: author.cached_image_url,
        bio: author.bio,
        birthDate: author.birth_date,
        deathDate: author.death_date,
        totalWorks: author.books_count ?? works.length,
        uniqueWorks: works.length,
        works,
        series: author.series.map((s) => ({
          key: `hardcover:${s.id}`,
          name: s.name,
          coverUrl: s.coverUrl,
        })),
      });
    }

    const key = rawKey.replace(/^\/authors\//, '').replace(/^\//, '');
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
      // OpenLibrary doesn't expose a clean author→series listing, so
      // the Series tab is empty for OL-keyed authors. We still emit
      // the field so the frontend doesn't have to guard.
      series: [],
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
  const isHardcoverId = /^hardcover:\d+$/i.test(id);

  // Reject non-OL, non-Audible, non-Hardcover keys early — e.g.
  // "gbooks:..." synthetic IDs from Google Books search results that
  // would otherwise trigger a noisy 404 fetch against OpenLibrary.
  if (!isAudibleAsin && !isOpenLibraryId && !isHardcoverId) {
    return res.status(404).json({
      status: 404,
      message: 'Book not found.',
    });
  }

  try {
    // Hardcover-only books (no OL mapping). Common in series detail
    // pages when Hardcover hasn't yet pushed an OL mapping for every
    // member — serve a detail response directly from Hardcover data so
    // the user can at least view + request the book instead of hitting
    // a 404.
    if (isHardcoverId) {
      const settings = getSettings();
      const cfg = settings.book.metadataProviders;
      if (!cfg.hardcover || !cfg.hardcoverApiKey) {
        return res.status(400).json({
          status: 400,
          message:
            'Hardcover is not enabled. Turn it on in Settings → Metadata Providers → Books.',
        });
      }
      const hcId = Number(id.slice('hardcover:'.length));
      const hc = new HardcoverAPI(cfg.hardcoverApiKey);
      // Filter editions server-side to the configured metadata
      // language — avoids pulling 50 editions in other languages and
      // then discarding them client-side, so books with dozens of
      // French editions actually show them all.
      const prefLang = cfg.preferredLanguage?.toLowerCase().trim() || undefined;
      const hit = await hc.getBookById(hcId, { editionLanguage: prefLang });
      if (!hit) {
        return res.status(404).json({
          status: 404,
          message: 'Book not found.',
        });
      }
      const bookMediaRepo = getRepository(BookMedia);
      const existing = await bookMediaRepo.findOne({
        where: { openLibraryId: `hardcover:${hcId}` },
      });
      const genres =
        hit.cached_tags?.Genre?.map((t) => t.tag).filter(
          (t): t is string => !!t
        ) ?? [];
      // Editions are now server-filtered to prefLang (when set) and
      // sorted desc by release_date, so editions[0] is the most
      // recent edition in the user's language. Country comes from a
      // separate call so it stays locked to the book's first
      // publication country (independent of which translation the
      // user is browsing) — matches the user's "le pays du livre
      // s'affiche dans l'encadré auteur" brief.
      const editions = hit.editions ?? [];
      const displayEdition = editions[0];
      const hcIsbn13 = displayEdition?.isbn_13 ?? undefined;
      const hcIsbn10 = displayEdition?.isbn_10 ?? undefined;
      const hcPublisher = displayEdition?.publisher?.name ?? undefined;
      const hcLang = displayEdition?.language?.code2 ?? undefined;
      // Fetch origin country in parallel with the author data below.
      const originalCountry = await hc
        .getBookOriginalCountry(hcId)
        .catch(() => null);
      const hcCountry = hardcoverCountryIso2(originalCountry ?? undefined);
      const primaryAuthorId = hardcoverPrimaryAuthorId(hit.contributions);
      // Photo + bio + dates come from the authors table, not the book
      // row. Best-effort: if we can resolve a primary author id, fetch
      // the author detail so the "About the author" card renders the
      // full shape (photo, bio, lifespan) the OpenLibrary path
      // produces.
      let authorPhotoUrl: string | undefined;
      let authorBio: string | undefined;
      let authorBirthDate: string | undefined;
      let authorDeathDate: string | undefined;
      if (primaryAuthorId !== undefined) {
        try {
          const authorDetail = await hc.getAuthor(primaryAuthorId);
          if (authorDetail) {
            authorPhotoUrl = authorDetail.cached_image_url;
            authorBio = authorDetail.bio;
            authorBirthDate = authorDetail.birth_date;
            authorDeathDate = authorDetail.death_date;
          }
        } catch {
          /* best-effort */
        }
      }
      // Full edition list for the detail page's edition selector.
      // Each entry drops any null fields on the frontend side, so we
      // keep them all here and let the UI hide whatever's empty.
      const exposedEditions = editions
        .filter((e) => e.id !== undefined)
        .map((e) => ({
          id: e.id,
          title: e.title ?? undefined,
          subtitle: e.subtitle ?? undefined,
          isbn13: e.isbn_13 ?? undefined,
          isbn10: e.isbn_10 ?? undefined,
          year: e.release_date
            ? parseInt(e.release_date.slice(0, 4), 10) || undefined
            : undefined,
          releaseDate: e.release_date ?? undefined,
          pageCount: e.pages ?? undefined,
          format: e.edition_format ?? undefined,
          coverUrl: e.image?.url?.startsWith('http') ? e.image.url : undefined,
          publisher: e.publisher?.name ?? undefined,
          country: hardcoverCountryIso2(e.country),
          language: e.language?.code2 ?? undefined,
        }));
      return res.status(200).json({
        key: `hardcover:${hcId}`,
        title: hit.title,
        subtitle: hit.subtitle ?? undefined,
        description: hit.description ?? undefined,
        coverUrl: hit.image?.url?.startsWith('http')
          ? hit.image.url
          : undefined,
        authorName:
          hardcoverPrimaryAuthor(hit.contributions) ?? 'Unknown Author',
        authorKey:
          primaryAuthorId !== undefined
            ? `hardcover:${primaryAuthorId}`
            : undefined,
        authorPhotoUrl,
        authorBio,
        authorBirthDate,
        authorDeathDate,
        year: hit.release_date
          ? parseInt(hit.release_date.slice(0, 4), 10) || undefined
          : undefined,
        pageCount: hit.pages ?? undefined,
        publisher: hcPublisher,
        isbn13: hcIsbn13,
        isbn10: hcIsbn10,
        // ISO-2 code so the book detail page renders the flag emoji;
        // hardcoverCountryIso2 falls back to a name → code lookup
        // when Hardcover's edition doesn't carry code2.
        country: hcCountry,
        language: hcLang,
        rating: hit.rating ?? undefined,
        ratingsCount: hit.ratings_count ?? undefined,
        readersCount: hit.users_count ?? undefined,
        readCount: hit.users_read_count ?? undefined,
        subjects: genres.slice(0, 15),
        moods:
          hit.cached_tags?.Mood?.map((t) => t.tag)
            .filter((t): t is string => !!t)
            .slice(0, 15) ?? [],
        contentWarnings:
          hit.cached_tags?.ContentWarning?.filter((t) => !t.spoiler)
            .map((t) => t.tag)
            .filter((t): t is string => !!t)
            .slice(0, 15) ?? [],
        characters:
          hit.book_characters
            ?.filter((c) => !c.spoiler && c.character?.name)
            .map((c) => c.character!.name!)
            .slice(0, 12) ?? [],
        series: (hit.book_series ?? [])
          .filter((s) => !!s.series?.name)
          .map((s) => ({
            key: `hardcover:${s.series!.id}`,
            name: s.series!.name,
            position: s.position?.toString(),
            seedCount: 0,
            linkable: true,
          })),
        mediaType: MediaType.BOOK,
        mediaStatus: existing?.status ?? null,
        bookMediaId: existing?.id ?? null,
        libraryServerUrl: remapToPublicUrl(existing?.libraryServerUrl),
        editions: exposedEditions,
        // Let the UI group / sort editions by language with the
        // configured language in front of the separator line.
        preferredLanguage: prefLang || undefined,
      });
    }

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
    const authorInfo = authorKey
      ? await openLibrary.getAuthor(authorKey)
      : null;
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
                match.description.length > (enrichedDescription?.length ?? 0)
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

    // Series membership. We collect candidates from each enabled source
    // in parallel and pick ONE source at the end — Hardcover >
    // Bookshelf > OpenLibrary — so series links land on the same
    // provider the aggregated search surfaced. This avoids the
    // situation where clicking "Harry Potter" from a search result
    // opens the Hardcover series page while clicking it from a book
    // detail opens the (often sparser) OL series page.
    type SeriesEntry = {
      key: string;
      name: string;
      position?: string;
      seedCount: number;
      linkable: boolean;
    };
    const seriesCandidates: {
      openlibrary: SeriesEntry[];
      bookshelf: SeriesEntry[];
      hardcover: SeriesEntry[];
    } = { openlibrary: [], bookshelf: [], hardcover: [] };
    if (work.series?.length) {
      const seriesLookups = work.series.slice(0, 3).map(async (ref) => {
        const info = await openLibrary.getSeries(ref.series.key);
        if (info) {
          seriesCandidates.openlibrary.push({
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

            // Bookshelf encodes multi-series memberships as "Wool #2;
            // Silo #1B" in the `seriesTitle` field. Always collect —
            // the source-priority pick at the end decides whether to
            // use them.
            if (
              typeof match.seriesTitle === 'string' &&
              match.seriesTitle.trim()
            ) {
              for (const part of match.seriesTitle
                .split(';')
                .map((s) => s.trim())) {
                const m = part.match(/^(.+?)\s*(?:#(\S+))?\s*$/);
                if (m?.[1]) {
                  seriesCandidates.bookshelf.push({
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
    let hardcoverDescription: string | undefined;
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
          if (hit.description && !hardcoverDescription) {
            hardcoverDescription = hit.description;
          }
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
          if (hit.book_series?.length) {
            for (const bs of hit.book_series) {
              if (bs.series?.name) {
                seriesCandidates.hardcover.push({
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

    // Series always come from the user's primary source — all in-app
    // series links have uniform URLs. If the primary has nothing for
    // this book, fall back to Bookshelf (which can still hold a series
    // ref). Never mix sources.
    const seriesPrimary =
      cfg.primarySource === 'hardcover' && cfg.hardcover && cfg.hardcoverApiKey
        ? 'hardcover'
        : 'openlibrary';
    const seriesEntries =
      seriesCandidates[seriesPrimary].length > 0
        ? seriesCandidates[seriesPrimary]
        : seriesCandidates.bookshelf;

    // Merge genres into subjects for display
    mergedGenres.forEach((g) => mergedSubjects.add(g));

    return res.status(200).json({
      ...work,
      // Prefer Hardcover's cover when available so the detail-page
      // image matches what the search / series pages displayed — the
      // search aggregator already picks Hardcover as the winning
      // source when enabled, so the user's "poster" would otherwise
      // flip between click-throughs. Falls back to OL's `covers`
      // array (resolved client-side) when Hardcover has nothing.
      ...(fallbackCoverUrl ? { coverUrl: fallbackCoverUrl } : {}),
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
        // Source priority: Hardcover → Bindery → OpenLibrary.
        // OL descriptions are crowd-sourced and frequently land in the
        // editor's native language (Chinese, Polish, …) which is
        // jarring when the rest of the allseerr instance is in a
        // different tongue. Hardcover is curated English-first so we
        // prefer it whenever available. Bindery tends to be
        // English-flavoured too; OL stays as the last-resort fallback.
        // Clean OL cruft (source refs, link defs, "Also contained in"
        // edition lists) regardless of origin.
        const olDescRaw =
          typeof work.description === 'string'
            ? work.description
            : work.description?.value;
        const best =
          hardcoverDescription ?? enrichedDescription ?? olDescRaw ?? undefined;
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
    userId?: number;
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
  const userRepo = getRepository(User);

  // Admin-attributed request — mirrors server/entity/MediaRequest.ts
  // where MANAGE_USERS / MANAGE_REQUESTS lets a caller attribute the
  // request to someone else. Silently fall back to req.user when the
  // caller lacks the permission so older clients that always send
  // their own id keep working.
  let requestUser = req.user!;
  if (
    body.userId &&
    body.userId !== req.user?.id &&
    hasPermission(
      [Permission.MANAGE_USERS, Permission.MANAGE_REQUESTS],
      req.user?.permissions ?? 0,
      { type: 'or' }
    )
  ) {
    const target = await userRepo.findOne({ where: { id: body.userId } });
    if (target) {
      requestUser = target;
    }
  }

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

  // Quota enforcement — same pattern as the movie / TV request path
  // (see server/entity/MediaRequest.ts). Bypasses for MANAGE_USERS are
  // applied inside User.getQuota().
  try {
    const quotas = await requestUser.getQuota();
    const slot = isBook ? quotas.book : quotas.audiobook;
    if (slot.restricted) {
      return res.status(403).json({
        status: 403,
        message: isBook ? 'Book quota exceeded.' : 'Audiobook quota exceeded.',
        quota: slot,
      });
    }
  } catch (e) {
    logger.warn('Quota check failed (proceeding without enforcement)', {
      label: 'book',
      error: e instanceof Error ? e.message : String(e),
    });
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
    request.requestedBy = requestUser;

    if (isBook) {
      request.bookMedia = media as BookMedia;
    } else {
      request.audiobookMedia = media as AudiobookMedia;
    }

    await requestRepo.save(request);

    // Auto-approval check — MANAGE_REQUESTS and the generic
    // AUTO_APPROVE still green-light everything, otherwise we look at
    // the per-media-type flags that mirror AUTO_APPROVE_MOVIE /
    // AUTO_APPROVE_TV on the movie/TV side.
    const autoApprovePermissions = [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      isBook ? Permission.AUTO_APPROVE_BOOK : Permission.AUTO_APPROVE_AUDIOBOOK,
    ];
    if (
      req.user &&
      hasPermission(autoApprovePermissions, req.user.permissions, {
        type: 'or',
      })
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
