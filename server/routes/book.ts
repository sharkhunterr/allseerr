import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import OpenLibraryAPI from '@server/api/openlibrary';
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
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const bookRoutes = Router();
const openLibrary = new OpenLibraryAPI();

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

    const { results, totalResults } = await openLibrary.search(
      query,
      page,
      limit
    );

    // Overlay availability from local database
    const bookMediaRepo = getRepository(BookMedia);
    const enrichedResults = await Promise.all(
      results.map(async (result) => {
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
      totalPages: Math.ceil(totalResults / limit),
      totalResults,
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
        libraryServerUrl: existing?.libraryServerUrl ?? null,
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

    return res.status(200).json({
      ...work,
      mediaStatus: existing?.status ?? null,
      bookMediaId: existing?.id ?? null,
      libraryServerUrl: existing?.libraryServerUrl ?? null,
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
    // Create or reuse media entity
    let media = existingMedia;
    if (!media) {
      if (isBook) {
        media = new BookMedia({
          title: body.title,
          authorName: body.authorName,
          foreignBookId: body.foreignBookId,
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
      request.status = MediaRequestStatus.APPROVED;
      await requestRepo.save(request);

      // Dispatch to download manager
      const downloadService = new BookDownloadService();
      await downloadService.dispatch(
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
        const downloadService = new BookDownloadService();
        await downloadService.dispatch(media, mediaType);
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
