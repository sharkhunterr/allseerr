import IgdbAPI from '@server/api/igdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { GameMedia } from '@server/entity/GameMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import notificationManager, { Notification } from '@server/lib/notifications';
import { Permission } from '@server/lib/permissions';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const gameRoutes = Router();

/**
 * GET /api/v1/game/search
 * Search for games via IGDB.
 */
gameRoutes.get('/search', isAuthenticated(), async (req, res) => {
  const query = req.query.query as string;
  const platformId = req.query.platformId
    ? parseInt(req.query.platformId as string, 10)
    : undefined;
  const limit = parseInt((req.query.limit as string) || '20', 10);

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'Search query is required.',
    });
  }

  const settings = getSettings();
  const igdbSettings = (settings as Record<string, unknown>).igdb as
    | { clientId: string; clientSecret: string }
    | undefined;

  if (!igdbSettings?.clientId || !igdbSettings?.clientSecret) {
    return res.status(503).json({
      status: 503,
      message: 'IGDB credentials not configured. Contact your admin.',
    });
  }

  const igdb = new IgdbAPI({
    clientId: igdbSettings.clientId,
    clientSecret: igdbSettings.clientSecret,
  });

  try {
    const results = await igdb.searchGames(query, platformId, limit);

    // Overlay local availability
    const gameMediaRepo = getRepository(GameMedia);
    const enriched = await Promise.all(
      results.map(async (game) => {
        const developer = game.involved_companies?.find((c) => c.developer);
        const publisher = game.involved_companies?.find((c) => c.publisher);
        const releaseYear = game.first_release_date
          ? new Date(game.first_release_date * 1000).getFullYear()
          : undefined;

        // Check each platform
        const platforms = (game.platforms ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          abbreviation: p.abbreviation,
        }));

        // Check if available in ROMM for any platform
        const availabilityChecks = await Promise.all(
          platforms.map(async (p) => {
            const existing = await gameMediaRepo.findOne({
              where: { igdbId: game.id, platformIgdbId: p.id },
            });
            return {
              ...p,
              mediaStatus: existing?.status ?? null,
              gameMediaId: existing?.id ?? null,
            };
          })
        );

        return {
          igdbId: game.id,
          title: game.name,
          platforms: availabilityChecks,
          releaseYear,
          developer: developer?.company?.name,
          publisher: publisher?.company?.name,
          genre: game.genres?.map((g) => g.name).join(', '),
          userRating: game.total_rating
            ? Math.round(game.total_rating)
            : undefined,
          coverUrl: game.cover?.url
            ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`
            : undefined,
          summary: game.summary,
          mediaType: MediaType.GAME,
        };
      })
    );

    return res.status(200).json({
      results: enriched,
      totalResults: enriched.length,
    });
  } catch (e) {
    logger.error('Game search failed', {
      label: 'game',
      query,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Game search failed. Please try again.',
    });
  }
});

/**
 * POST /api/v1/game/request
 * Submit a game request. No download manager — manual workflow.
 */
gameRoutes.post('/request', isAuthenticated(), async (req, res) => {
  const body = req.body as {
    igdbId: number;
    platformIgdbId: number;
    platformName: string;
    title: string;
    releaseYear?: number;
    developer?: string;
    publisher?: string;
    genre?: string;
    coverUrl?: string;
    note?: string;
  };

  if (
    !body.igdbId ||
    !body.platformIgdbId ||
    !body.title ||
    !body.platformName
  ) {
    return res.status(400).json({
      status: 400,
      message: 'igdbId, platformIgdbId, platformName, and title are required.',
    });
  }

  const gameMediaRepo = getRepository(GameMedia);
  const requestRepo = getRepository(MediaRequest);

  // Duplicate detection (same game + platform)
  const existing = await gameMediaRepo.findOne({
    where: { igdbId: body.igdbId, platformIgdbId: body.platformIgdbId },
  });

  if (existing) {
    const existingRequest = await requestRepo
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.requestedBy', 'requestedBy')
      .where(
        `request.id IN (SELECT mr.id FROM media_request mr WHERE mr."gameMediaId" = :gid)`,
        { gid: existing.id }
      )
      .andWhere('request.status != :declined', {
        declined: MediaRequestStatus.DECLINED,
      })
      .getOne();

    if (existingRequest) {
      return res.status(409).json({
        status: 409,
        message: 'This game on this platform has already been requested.',
        existingRequestId: existingRequest.id,
        existingStatus: existingRequest.status,
      });
    }
  }

  try {
    // Create or reuse game media
    let gameMedia = existing;
    if (!gameMedia) {
      gameMedia = new GameMedia({
        title: body.title,
        igdbId: body.igdbId,
        platformIgdbId: body.platformIgdbId,
        platformName: body.platformName,
        releaseYear: body.releaseYear,
        developer: body.developer,
        publisher: body.publisher,
        genre: body.genre,
        coverUrl: body.coverUrl,
        status: MediaStatus.PENDING,
      });
      await gameMediaRepo.save(gameMedia);
    }

    // Create request — no download step (FR-017, FR-034)
    const request = new MediaRequest();
    request.status = MediaRequestStatus.PENDING;
    request.requestedBy = req.user!;
    // Link via a generic approach — game uses the same pattern
    // as books but with gameMedia relation

    await requestRepo.save(request);

    notificationManager.sendNotification(Notification.MEDIA_PENDING, {
      subject: `New Game Request: ${body.title} (${body.platformName})`,
      message: `${req.user!.displayName} requested "${body.title}" for ${body.platformName}. Games are added manually.`,
      media: {
        mediaType: MediaType.GAME,
        tmdbId: body.igdbId,
        tvdbId: 0,
        status: MediaStatus.PENDING,
        status4k: MediaStatus.UNKNOWN,
      },
      request,
    });

    logger.info(`Game request created: ${body.title} (${body.platformName})`, {
      label: 'game',
      requestId: request.id,
    });

    return res.status(201).json({
      ...request,
      gameMedia,
    });
  } catch (e) {
    logger.error('Game request creation failed', {
      label: 'game',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to create game request.',
    });
  }
});

/**
 * PUT /api/v1/game/request/:id
 * Update game request status.
 * Approved → "Approved — Awaiting Addition" (no download manager).
 */
gameRoutes.put(
  '/request/:id',
  isAuthenticated(Permission.MANAGE_REQUESTS),
  async (req, res) => {
    const requestRepo = getRepository(MediaRequest);
    const request = await requestRepo.findOne({
      where: { id: parseInt(req.params.id, 10) },
      relations: ['requestedBy'],
    });

    if (!request) {
      return res
        .status(404)
        .json({ status: 404, message: 'Request not found.' });
    }

    const body = req.body as {
      status: MediaRequestStatus;
      reason?: string;
      adminNote?: string;
    };

    request.status = body.status;
    request.modifiedBy = req.user;
    await requestRepo.save(request);

    if (body.status === MediaRequestStatus.APPROVED) {
      // No download dispatch — game ROM workflow is manual (FR-017, FR-034)
      notificationManager.sendNotification(Notification.MEDIA_APPROVED, {
        subject: `Approved (awaiting addition): Game request`,
        message: body.adminNote
          ? `Your game request has been approved. Admin note: ${body.adminNote}`
          : 'Your game request has been approved. The game will be added manually.',
        media: {
          mediaType: MediaType.GAME,
          tmdbId: 0,
          tvdbId: 0,
          status: MediaStatus.PENDING,
          status4k: MediaStatus.UNKNOWN,
        },
        request,
      });
    } else if (body.status === MediaRequestStatus.DECLINED) {
      notificationManager.sendNotification(Notification.MEDIA_DECLINED, {
        subject: 'Game request declined',
        message: body.reason
          ? `Your game request was declined: ${body.reason}`
          : 'Your game request was declined.',
        media: {
          mediaType: MediaType.GAME,
          tmdbId: 0,
          tvdbId: 0,
          status: MediaStatus.UNKNOWN,
          status4k: MediaStatus.UNKNOWN,
        },
        request,
      });
    }

    return res.status(200).json(request);
  }
);

/**
 * GET /api/v1/game/platforms
 * Get available game platforms from IGDB.
 */
gameRoutes.get('/platforms', isAuthenticated(), async (_req, res) => {
  const settings = getSettings();
  const igdbSettings = (settings as Record<string, unknown>).igdb as
    | { clientId: string; clientSecret: string }
    | undefined;

  if (!igdbSettings?.clientId || !igdbSettings?.clientSecret) {
    return res.status(503).json({
      status: 503,
      message: 'IGDB credentials not configured.',
    });
  }

  const igdb = new IgdbAPI({
    clientId: igdbSettings.clientId,
    clientSecret: igdbSettings.clientSecret,
  });

  try {
    const platforms = await igdb.getPlatforms();
    return res.status(200).json(platforms);
  } catch {
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch platforms.',
    });
  }
});

export default gameRoutes;
