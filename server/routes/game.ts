import IgdbAPI from '@server/api/igdb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { GameMedia } from '@server/entity/GameMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { createRommAdapterFromSettings } from '@server/lib/adapters/game/RommAdapter';
import { Permission, hasPermission } from '@server/lib/permissions';
import { getRomarrSupportedPlatformIds } from '@server/lib/services/romarrDispatcher';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { isAuthenticated } from '@server/middleware/auth';
import { requireMediaType } from '@server/middleware/mediaTypeGuard';
import { Router } from 'express';

const gameRoutes = Router();

/**
 * Swap ROMM internal URL with configured public URL for external "Play" links.
 */
const remapRommPublicUrl = (
  storedUrl: string | null | undefined
): string | null => {
  if (!storedUrl) return null;
  const romm = getSettings().game.romm;
  if (!romm.publicUrl || !romm.url || romm.publicUrl === romm.url) {
    return storedUrl;
  }
  if (storedUrl.startsWith(romm.url)) {
    return romm.publicUrl + storedUrl.slice(romm.url.length);
  }
  return storedUrl;
};

/**
 * GET /api/v1/game/search
 * Search for games via IGDB.
 */
gameRoutes.get(
  '/search',
  isAuthenticated(),
  requireMediaType('game'),
  async (req, res) => {
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
    const igdbSettings = settings.game.igdb;

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

          // Check if available in ROMM for this game (match on igdbId only,
          // since ROMM and IGDB use different platform ID systems)
          const existingMedia = await gameMediaRepo.find({
            where: { igdbId: game.id },
          });

          const availabilityChecks = platforms.map((p) => {
            // ROMM availability: match by platform name (case-insensitive) —
            // IGDB and ROMM use different internal platform ID systems.
            const availableMatch = existingMedia.find(
              (m) =>
                m.status === MediaStatus.AVAILABLE &&
                m.platformName?.toLowerCase() === p.name.toLowerCase()
            );
            // Request status: match by exact platformIgdbId since user
            // requests are keyed on IGDB platform id.
            const requestedMatch = existingMedia.find(
              (m) =>
                m.platformIgdbId === p.id && m.status !== MediaStatus.AVAILABLE
            );
            const matchedMedia = availableMatch ?? requestedMatch;

            return {
              ...p,
              mediaStatus: availableMatch
                ? MediaStatus.AVAILABLE
                : (matchedMedia?.status ?? null),
              gameMediaId: matchedMedia?.id ?? null,
              rommUrl: remapRommPublicUrl(matchedMedia?.rommUrl),
            };
          });

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

      // ROMM collection cards at the top when the query matches a
      // collection name — same idea as book-series cards in book
      // search. ROMM has no free-text endpoint so we list all
      // collections (cached) and filter client-side by case-
      // insensitive substring.
      let collectionHits: {
        type: 'collection';
        id: string;
        name: string;
        description?: string;
        coverUrl?: string;
        romCount?: number;
        kind: 'user' | 'virtual';
      }[] = [];
      const romAdapter = createRommAdapterFromSettings();
      if (romAdapter) {
        try {
          const startedAt = Date.now();
          const all = await romAdapter.listCollections();
          const q = query.toLowerCase().trim();
          collectionHits = all
            .filter((c) => c.name.toLowerCase().includes(q))
            .slice(0, 3)
            .map((c) => ({
              type: 'collection' as const,
              id: c.id,
              name: c.name,
              description: c.description,
              coverUrl: c.coverUrl,
              romCount: c.romCount,
              kind: c.kind,
            }));
          logger.info('ROMM collection search match', {
            label: 'romm',
            query,
            totalCollections: all.length,
            matched: collectionHits.length,
            matchedNames: collectionHits.map((c) => c.name),
            ms: Date.now() - startedAt,
          });
        } catch (e) {
          logger.debug('ROMM collection match on game search failed', {
            label: 'game',
            query,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }

      const combined = [...collectionHits, ...enriched];
      return res.status(200).json({
        results: combined,
        totalResults: combined.length,
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
  }
);

/**
 * POST /api/v1/game/request
 * Submit a game request. No download manager — manual workflow.
 */
gameRoutes.post(
  '/request',
  isAuthenticated(),
  requireMediaType('game'),
  async (req, res) => {
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
      userId?: number;
    };

    if (
      !body.igdbId ||
      !body.platformIgdbId ||
      !body.title ||
      !body.platformName
    ) {
      return res.status(400).json({
        status: 400,
        message:
          'igdbId, platformIgdbId, platformName, and title are required.',
      });
    }

    const gameMediaRepo = getRepository(GameMedia);
    const requestRepo = getRepository(MediaRequest);
    const userRepo = getRepository(User);

    // Admin impersonation — see the mirror logic in server/routes/book.ts.
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

    // Duplicate detection (same game + platform)
    const existing = await gameMediaRepo.findOne({
      where: { igdbId: body.igdbId, platformIgdbId: body.platformIgdbId },
    });

    if (existing) {
      const existingRequest = await requestRepo.findOne({
        where: { gameMedia: { id: existing.id } },
      });

      if (
        existingRequest &&
        existingRequest.status !== MediaRequestStatus.DECLINED
      ) {
        return res.status(409).json({
          status: 409,
          message: 'This game on this platform has already been requested.',
          existingRequestId: existingRequest.id,
          existingStatus: existingRequest.status,
        });
      }
    }

    // Game quota — mirrors the movie path. MANAGE_USERS bypass is
    // already applied inside User.getQuota().
    try {
      const quotas = await requestUser.getQuota();
      if (quotas.game.restricted) {
        return res.status(403).json({
          status: 403,
          message: 'Game quota exceeded.',
          quota: quotas.game,
        });
      }
    } catch (e) {
      logger.warn('Quota check failed (proceeding without enforcement)', {
        label: 'game',
        error: e instanceof Error ? e.message : String(e),
      });
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
          // No automated dispatcher exists for games — ROMM is a
          // library scanner, not a download manager. Surface the
          // manual-workflow nature of the request up front so users
          // (and admins) understand why "Requested" doesn't trigger
          // a download.
          statusReason:
            'Game requests have no automated download manager. Once approved, add the ROM to your ROMM library manually — the scanner will mark it AVAILABLE on the next pass.',
        });
        await gameMediaRepo.save(gameMedia);
      } else if (gameMedia.status !== MediaStatus.AVAILABLE) {
        // Re-requesting a previously declined / removed game — reset
        // status so the badge + button reflect the new pending state.
        gameMedia.status = MediaStatus.PENDING;
        await gameMediaRepo.save(gameMedia);
      }

      // Create request
      const request = new MediaRequest();
      request.status = MediaRequestStatus.PENDING;
      request.type = MediaType.GAME;
      request.requestedBy = requestUser;
      request.gameMedia = gameMedia;

      await requestRepo.save(request);

      // Auto-approve: MANAGE_REQUESTS / AUTO_APPROVE (generic) / the
      // per-type AUTO_APPROVE_GAME all greenlight it. Same OR-shaped
      // check pattern as the book route above.
      if (
        req.user &&
        hasPermission(
          [
            Permission.MANAGE_REQUESTS,
            Permission.AUTO_APPROVE,
            Permission.AUTO_APPROVE_GAME,
          ],
          req.user.permissions,
          { type: 'or' }
        )
      ) {
        gameMedia.status = MediaStatus.PROCESSING;
        await gameMediaRepo.save(gameMedia);
        request.status = MediaRequestStatus.APPROVED;
        await requestRepo.save(request);
      }

      logger.info(
        `Game request created: ${body.title} (${body.platformName})`,
        {
          label: 'game',
          requestId: request.id,
        }
      );

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
  }
);

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
      relations: ['requestedBy', 'gameMedia'],
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

    // Promote GameMedia to PROCESSING on approval (manual ROM addition
    // workflow — no download manager dispatch). Done BEFORE saving the
    // request so any downstream subscriber sees the updated status.
    if (body.status === MediaRequestStatus.APPROVED && request.gameMedia) {
      const gameMediaRepo = getRepository(GameMedia);
      const gm = await gameMediaRepo.findOne({
        where: { id: request.gameMedia.id },
      });
      if (gm) {
        gm.status = MediaStatus.PROCESSING;
        await gameMediaRepo.save(gm);
      }
    }

    request.status = body.status;
    request.modifiedBy = req.user;
    await requestRepo.save(request);

    return res.status(200).json(request);
  }
);

/**
 * GET /api/v1/game/platforms
 * Get available game platforms from IGDB.
 */
gameRoutes.get('/platforms', isAuthenticated(), async (_req, res) => {
  const settings = getSettings();
  const igdbSettings = settings.game.igdb;

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

/**
 * GET /api/v1/game/romarr/platforms
 * Tells the game UI which IGDB platforms may show a request button.
 * `restrict` true → hide the button for platforms not in `platforms`
 * (the IGDB ids the default Romarr instance can acquire). `restrict`
 * is forced false when no Romarr instance is configured / reachable,
 * so the UI fails open rather than hiding every button.
 */
gameRoutes.get('/romarr/platforms', isAuthenticated(), async (_req, res) => {
  const settings = getSettings();
  const restrictSetting = settings.game.restrictToRomarrPlatforms ?? true;
  const ids = await getRomarrSupportedPlatformIds();

  return res.status(200).json({
    restrict: restrictSetting && ids !== null,
    platforms: ids ?? [],
  });
});

/**
 * GET /api/v1/game/collection/:id
 * Fetch a ROMM collection by id along with each member rom's metadata.
 * Mirrors the /book/series/:id shape so the frontend collection page
 * can reuse the series-page layout.
 */
gameRoutes.get('/collection/:id', isAuthenticated(), async (req, res) => {
  // Virtual collections use base64-JSON ids (e.g. the payload
  // {"name":"Castlevania","type":"franchise"}) alongside the numeric
  // ids of user-created ones, so we keep the parameter as a string
  // rather than forcing it through parseInt.
  const id = req.params.id;
  logger.info('ROMM collection detail request', {
    label: 'romm',
    id,
    idLength: id?.length,
  });
  if (!id) {
    return res
      .status(400)
      .json({ status: 400, message: 'Invalid collection id.' });
  }
  const adapter = createRommAdapterFromSettings();
  if (!adapter) {
    return res
      .status(503)
      .json({ status: 503, message: 'ROMM is not configured.' });
  }
  try {
    const detail = await adapter.getCollection(id);
    if (!detail) {
      return res
        .status(404)
        .json({ status: 404, message: 'Collection not found.' });
    }
    const roms = await adapter.getRomsByIds(detail.romIds);
    const gameMediaRepo = getRepository(GameMedia);
    const members = await Promise.all(
      roms.map(async (r) => {
        const existing = r.igdbId
          ? await gameMediaRepo.findOne({
              where: {
                igdbId: r.igdbId,
                platformIgdbId: r.platformIgdbId ?? 0,
              },
            })
          : null;
        return {
          igdbId: r.igdbId,
          rommId: r.id,
          title: r.title,
          platformName: r.platformName,
          platformIgdbId: r.platformIgdbId,
          coverUrl: r.coverUrl,
          releaseYear: r.releaseYear,
          mediaStatus: existing?.status ?? null,
          gameMediaId: existing?.id ?? null,
          rommUrl: remapRommPublicUrl(existing?.rommUrl),
        };
      })
    );
    return res.status(200).json({
      id: detail.id,
      name: detail.name,
      description: detail.description,
      coverUrl: detail.coverUrl,
      romCount: detail.romCount,
      members,
    });
  } catch (e) {
    logger.error('ROMM collection fetch failed', {
      label: 'game',
      id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res
      .status(500)
      .json({ status: 500, message: 'Failed to load collection.' });
  }
});

/**
 * GET /api/v1/game/:igdbId
 * Get game details by IGDB ID.
 * MUST be registered last to avoid catching /search, /request, /platforms.
 */
gameRoutes.get('/:igdbId', isAuthenticated(), async (req, res) => {
  const igdbId = parseInt(req.params.igdbId, 10);

  if (isNaN(igdbId)) {
    return res.status(400).json({
      status: 400,
      message: 'Invalid IGDB ID.',
    });
  }

  const settings = getSettings();
  const igdbSettings = settings.game.igdb;

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
    const game = await igdb.getGame(igdbId);

    if (!game) {
      return res.status(404).json({
        status: 404,
        message: 'Game not found.',
      });
    }

    const gameMediaRepo = getRepository(GameMedia);
    const developer = game.involved_companies?.find((c) => c.developer);
    const publisher = game.involved_companies?.find((c) => c.publisher);
    const releaseYear = game.first_release_date
      ? new Date(game.first_release_date * 1000).getFullYear()
      : undefined;

    const platforms = (game.platforms ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      abbreviation: p.abbreviation,
    }));

    const existingMedia = await gameMediaRepo.find({
      where: { igdbId: game.id },
    });

    const availabilityChecks = platforms.map((p) => {
      const availableMatch = existingMedia.find(
        (m) =>
          m.status === MediaStatus.AVAILABLE &&
          m.platformName?.toLowerCase() === p.name.toLowerCase()
      );
      const requestedMatch = existingMedia.find(
        (m) => m.platformIgdbId === p.id && m.status !== MediaStatus.AVAILABLE
      );
      const matchedMedia = availableMatch ?? requestedMatch;

      return {
        ...p,
        mediaStatus: availableMatch
          ? MediaStatus.AVAILABLE
          : (matchedMedia?.status ?? null),
        mediaStatusReason: matchedMedia?.statusReason ?? null,
        gameMediaId: matchedMedia?.id ?? null,
        rommUrl: remapRommPublicUrl(matchedMedia?.rommUrl),
      };
    });

    // ROMM collections that contain any of the ROM rows we already
    // matched for this IGDB id. Cheap when ROMM is disabled (adapter
    // factory returns null) and short-TTL cached inside the adapter
    // so repeat detail hits don't re-list 100 collections each time.
    let collections: {
      id: string;
      name: string;
      description?: string;
      coverUrl?: string;
      romCount?: number;
      kind: 'user' | 'virtual';
    }[] = [];
    const rommIds = existingMedia
      .map((m) => m.rommId)
      .filter((v): v is number => typeof v === 'number');
    if (rommIds.length > 0) {
      const romAdapter = createRommAdapterFromSettings();
      if (romAdapter) {
        try {
          const startedAt = Date.now();
          const summaries = await romAdapter.listCollections();
          // listCollections response lacks rom_ids on most ROMM
          // installs — we need the full getCollection for each to
          // run the intersection. Parallel but bounded: collections
          // are typically in the dozens, not thousands.
          const rommIdSet = new Set(rommIds);
          const matched = await Promise.all(
            summaries.map(async (s) => {
              const detail = await romAdapter.getCollection(s.id, s.kind);
              if (!detail) return null;
              const intersects = detail.romIds.some((r) => rommIdSet.has(r));
              return intersects
                ? {
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    coverUrl: s.coverUrl,
                    romCount: detail.romCount,
                    kind: s.kind,
                  }
                : null;
            })
          );
          collections = matched.filter(
            (c): c is NonNullable<typeof c> => c !== null
          );
          logger.info('ROMM collections resolved for game detail', {
            label: 'romm',
            igdbId,
            rommIds,
            totalCollections: summaries.length,
            matched: collections.length,
            matchedNames: collections.map((c) => c.name),
            ms: Date.now() - startedAt,
          });
        } catch (e) {
          logger.debug('ROMM collection enrichment failed on game detail', {
            label: 'game',
            igdbId,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    return res.status(200).json({
      igdbId: game.id,
      title: game.name,
      platforms: availabilityChecks,
      releaseYear,
      developer: developer?.company?.name,
      publisher: publisher?.company?.name,
      genre: game.genres?.map((g) => g.name).join(', '),
      userRating: game.total_rating ? Math.round(game.total_rating) : undefined,
      coverUrl: game.cover?.url
        ? `https:${game.cover.url.replace('t_thumb', 't_cover_big')}`
        : undefined,
      summary: game.summary,
      collections,
      mediaType: MediaType.GAME,
    });
  } catch (e) {
    logger.error('Game detail fetch failed', {
      label: 'game',
      igdbId,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch game details.',
    });
  }
});

export default gameRoutes;
