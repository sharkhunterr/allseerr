import OpenLibraryAPI from '@server/api/openlibrary';
import { MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { BookMedia } from '@server/entity/BookMedia';
import { isAuthenticated } from '@server/middleware/auth';
import logger from '@server/logger';
import { Router } from 'express';

const bookRoutes = Router();
const openLibrary = new OpenLibraryAPI();

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

  try {
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
          mediaType: type === 'audiobook' ? MediaType.AUDIOBOOK : MediaType.BOOK,
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
  const workKey = `/works/${req.params.id}`;

  try {
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
      workKey,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch book details.',
    });
  }
});

export default bookRoutes;
