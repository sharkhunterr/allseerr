import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import GoogleBooksAPI from '@server/api/googlebooks';
import OpenLibraryAPI from '@server/api/openlibrary';
import BinderyAPI from '@server/api/servarr/bindery';
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
import { BookDownloadService } from '@server/lib/services/BookDownloadService';
import { submitToBindery } from '@server/lib/services/binderyDispatcher';
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

/**
 * Dispatch a book/audiobook to a configured download service.
 * Priority: dedicated Bindery settings → generic DownloadManagerInstance.
 * If neither is configured, silently no-op (request stays APPROVED without
 * a download handler — users can still pick it up manually).
 */
async function dispatchBookMedia(
  media: BookMedia | AudiobookMedia,
  mediaType: MediaType
): Promise<void> {
  const binderyResult = await submitToBindery(media, mediaType);

  if (binderyResult.success) {
    await saveBookMedia(media, mediaType);
    return;
  }

  if (!binderyResult.noInstance) {
    // Bindery was configured but failed — do not fall through to the
    // generic cascade (that'd submit the same request twice if the user
    // also has a generic DM configured).
    return;
  }

  // No Bindery instance — try generic download managers
  const downloadService = new BookDownloadService();
  const genericResult = await downloadService.dispatch(media, mediaType);

  if (genericResult.success) {
    await saveBookMedia(media, mediaType);
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
      source: 'openlibrary' | 'bindery' | 'googlebooks';
    };

    const normalizeKey = (title: string, author: string) =>
      `${title}|${author}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

    const sources: Promise<AggregatedBook[]>[] = [];
    let olTotal = 0;

    sources.push(
      openLibrary
        .search(query, page, limit)
        .then(({ results, totalResults }) => {
          olTotal = totalResults;
          return results.map((r) => ({ ...r, source: 'openlibrary' as const }));
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
                (b): AggregatedBook => ({
                  openLibraryId: b.foreignBookId.startsWith('OL')
                    ? `/works/${b.foreignBookId}`
                    : b.foreignBookId,
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
                })
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
          .search(query, page, limit)
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
              })
            )
          )
          .catch(() => [] as AggregatedBook[])
      );
    }

    const allResults = (await Promise.all(sources)).flat();

    // Dedupe + merge: prefer bindery > openlibrary > googlebooks for the
    // requestable identity fields (openLibraryId, source), and UNION
    // enrichment fields from all providers so the richest description,
    // ISBN, cover, subjects, etc. end up on the final record.
    const priority: Record<AggregatedBook['source'], number> = {
      bindery: 3,
      openlibrary: 2,
      googlebooks: 1,
    };
    const byKey = new Map<string, AggregatedBook>();
    const mergeInto = (
      winner: AggregatedBook,
      loser: AggregatedBook
    ): AggregatedBook => ({
      ...winner,
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
        winner.description && winner.description.length >=
        (loser.description?.length ?? 0)
          ? winner.description
          : loser.description,
      subjects: Array.from(
        new Set([...(winner.subjects ?? []), ...(loser.subjects ?? [])])
      ).slice(0, 20),
    });

    for (const item of allResults) {
      const key = normalizeKey(item.title, item.authorName);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
      } else if (priority[item.source] > priority[existing.source]) {
        byKey.set(key, mergeInto(item, existing));
      } else {
        byKey.set(key, mergeInto(existing, item));
      }
    }
    const merged = Array.from(byKey.values());

    // Overlay availability from local database
    const bookMediaRepo = getRepository(BookMedia);
    const enrichedResults = await Promise.all(
      merged.map(async (result) => {
        const existing = await bookMediaRepo.findOne({
          where: { openLibraryId: result.openLibraryId },
        });

        return {
          ...result,
          mediaType: MediaType.BOOK,
          mediaStatus: existing?.status ?? null,
          bookMediaId: existing?.id ?? null,
        };
      })
    );

    return res.status(200).json({
      page,
      totalPages: Math.max(1, Math.ceil(olTotal / limit)),
      totalResults: enrichedResults.length,
      results: enrichedResults,
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
  const seriesId = req.params.seriesId;
  try {
    const [series, members] = await Promise.all([
      openLibrary.getSeries(seriesId),
      openLibrary.getSeriesMembers(seriesId),
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
      key: series.key,
      name: series.name,
      description: series.description,
      seedCount: series.seedCount,
      members: enriched,
    });
  } catch (e) {
    logger.error('Book series fetch failed', {
      label: 'book',
      seriesId,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch series details.',
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
    // and fetch the author's display name (Work itself doesn't carry it).
    const authorKey = work.authors?.[0]?.author?.key?.split('/').pop();
    const authorName = authorKey
      ? await openLibrary.getAuthorName(authorKey)
      : null;

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

    // Always fetch ISBNs from OpenLibrary editions — OL Works don't carry
    // ISBN, but downstream services (Bookshelf, Bindery) match much more
    // reliably on ISBN than on title/author free-text search.
    enrichmentCalls.push(
      openLibrary.getWorkIsbns(workKey).then((isbns) => {
        isbn13 = isbn13 ?? isbns.isbn13;
        isbn10 = isbn10 ?? isbns.isbn10;
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

    await Promise.all(enrichmentCalls);

    // Series membership (from OpenLibrary's canonical series data).
    const seriesEntries: {
      key: string;
      name: string;
      position?: string;
      seedCount: number;
    }[] = [];
    if (work.series?.length) {
      const seriesLookups = work.series.slice(0, 3).map(async (ref) => {
        const info = await openLibrary.getSeries(ref.series.key);
        if (info) {
          seriesEntries.push({
            key: info.key,
            name: info.name,
            position: ref.position,
            seedCount: info.seedCount,
          });
        }
      });
      await Promise.all(seriesLookups);
    }

    return res.status(200).json({
      ...work,
      authorKey,
      authorName,
      isbn13,
      isbn10,
      pageCount,
      publisher,
      language,
      subjects: Array.from(mergedSubjects).slice(0, 30),
      series: seriesEntries,
      description:
        (enrichedDescription &&
        enrichedDescription.length >
          (typeof work.description === 'string'
            ? work.description.length
            : (work.description?.value?.length ?? 0))
          ? enrichedDescription
          : work.description) ?? enrichedDescription,
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
          // PROCESSING so the card shows the blue clock badge like
          // movies/TV requests awaiting download.
          status: MediaStatus.PROCESSING,
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
          // PROCESSING so the card shows the blue clock badge like
          // movies/TV requests awaiting download.
          status: MediaStatus.PROCESSING,
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
      request.status = MediaRequestStatus.APPROVED;
      await requestRepo.save(request);

      // Dispatch to Bindery (dedicated settings) or fall back to generic
      // DownloadManagerInstance cascade.
      await dispatchBookMedia(
        media as BookMedia & AudiobookMedia,
        body.mediaType
      );
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
    request.status = body.status;
    request.modifiedBy = req.user;
    await requestRepo.save(request);

    const media = request.bookMedia || request.audiobookMedia;
    const mediaType = request.bookMedia ? MediaType.BOOK : MediaType.AUDIOBOOK;
    // Handle status-specific actions
    if (body.status === MediaRequestStatus.APPROVED) {
      if (media) {
        await dispatchBookMedia(media, mediaType);
      }
    }

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
    relations: ['requestedBy'],
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

  await requestRepo.remove(request);
  return res.status(204).send();
});

export default bookRoutes;
