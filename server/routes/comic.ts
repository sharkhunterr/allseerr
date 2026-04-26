import ComicVineAPI, {
  comicVineCoverUrl,
  comicVineYear,
  type ComicVinePersonCredit,
} from '@server/api/comicvine';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { getRepository } from '@server/datasource';
import { ComicMedia } from '@server/entity/ComicMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { hasPermission, Permission } from '@server/lib/permissions';
import { isAuthenticated } from '@server/middleware/auth';
import { requireMediaType } from '@server/middleware/mediaTypeGuard';
import logger from '@server/logger';
import { Router } from 'express';

const comicRoutes = Router();

/**
 * Heuristic: drop volumes whose deck / description / publisher screams
 * "adult" when the user has hideAdult on. ComicVine doesn't expose a
 * dedicated isAdult flag so this is intentionally conservative — the
 * publisher list is the most reliable signal.
 */
const ADULT_PUBLISHER_KEYWORDS = ['eros', 'fantagraphics adult'];
function looksAdult(volume: {
  description?: string | null;
  deck?: string | null;
  publisher?: { name?: string } | null;
}): boolean {
  const pub = volume.publisher?.name?.toLowerCase() ?? '';
  if (ADULT_PUBLISHER_KEYWORDS.some((k) => pub.includes(k))) return true;
  const text = `${volume.deck ?? ''} ${volume.description ?? ''}`.toLowerCase();
  return /\b(adult|explicit|nsfw)\b/.test(text);
}

/**
 * Pull the primary creator for a volume (writer first, then artist,
 * then first credit). ComicVine returns `people` as a flat list with
 * a `role` string like "writer", "artist", "cover" — not a structured
 * enum, so we string-match.
 */
function pickPrimaryCreator(
  people?: ComicVinePersonCredit[]
): ComicVinePersonCredit | undefined {
  if (!people || people.length === 0) return undefined;
  return (
    people.find((p) => /writer/i.test(p.role ?? '')) ??
    people.find((p) => /artist/i.test(p.role ?? '')) ??
    people[0]
  );
}

function getApiKey(): string | null {
  const settings = require('@server/lib/settings').getSettings();
  const cfg = settings.comic?.metadataProviders;
  if (!cfg?.comicvine || !cfg.apiKey) return null;
  return cfg.apiKey;
}

/**
 * GET /api/v1/comic/search
 * Free-text volume search via ComicVine. Mirrors /manga/search shape
 * so the existing Search component can render the results.
 */
comicRoutes.get('/search', isAuthenticated(), requireMediaType('comic'), async (req, res) => {
  const query = req.query.query as string;
  const limit = parseInt((req.query.limit as string) || '20', 10);

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'Search query is required.',
    });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      status: 503,
      message:
        'ComicVine is not enabled or missing an API key. Configure it in Settings → Metadata Providers → Comic.',
    });
  }

  const { getSettings } = await import('@server/lib/settings');
  const cfg = getSettings().comic.metadataProviders;

  try {
    const cv = new ComicVineAPI({ apiKey });
    const raw = await cv.searchVolumes(query, limit);
    const filtered = cfg.hideAdult ? raw.filter((v) => !looksAdult(v)) : raw;

    const results = filtered.map((v) => ({
      comicVineId: v.id,
      title: v.name,
      year: comicVineYear(v.start_year),
      coverUrl: comicVineCoverUrl(v.image),
      issueCount: v.count_of_issues,
      publisher: v.publisher?.name,
      deck: v.deck ?? undefined,
      mediaType: MediaType.COMIC,
    }));

    return res.status(200).json({
      results,
      totalResults: results.length,
    });
  } catch (e) {
    logger.error('Comic search failed', {
      label: 'comic',
      query,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Comic search failed. Please try again.',
    });
  }
});

/**
 * GET /api/v1/comic/person/:id
 * Creator detail — bio, credited volumes. Parallel to /manga/staff/:id
 * for the manga flow.
 *
 * MUST be registered before /:id so the literal segment "person" isn't
 * caught by the catch-all id route.
 */
comicRoutes.get('/person/:id', isAuthenticated(), requireMediaType('comic'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res
      .status(400)
      .json({ status: 400, message: 'Invalid creator id.' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      status: 503,
      message: 'ComicVine is not enabled.',
    });
  }

  try {
    const cv = new ComicVineAPI({ apiKey });
    const person = await cv.getPerson(id);
    if (!person) {
      return res
        .status(404)
        .json({ status: 404, message: 'Creator not found.' });
    }

    const works =
      person.created_volumes?.map((v) => ({
        comicVineId: v.id,
        title: v.name,
        year: comicVineYear(v.start_year),
        coverUrl: comicVineCoverUrl(v.image),
        issueCount: v.count_of_issues,
        publisher: v.publisher?.name,
      })) ?? [];

    return res.status(200).json({
      key: id,
      name: person.name,
      aliases: person.aliases ?? undefined,
      photoUrl: comicVineCoverUrl(person.image),
      bio: person.description ?? person.deck ?? undefined,
      birthDate: person.birth ?? undefined,
      deathDate: person.death ?? undefined,
      hometown: person.hometown ?? undefined,
      country: person.country ?? undefined,
      issueAppearances: person.count_of_issue_appearances ?? undefined,
      siteDetailUrl: person.site_detail_url ?? undefined,
      totalWorks: works.length,
      works,
    });
  } catch (e) {
    logger.error('Comic creator fetch failed', {
      label: 'comic',
      personId: id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch creator details.',
    });
  }
});

/**
 * GET /api/v1/comic/:id
 * Volume (series) detail by ComicVine numeric id. Returns the full
 * record including issue list + creator credits + characters so the
 * detail page can render without follow-up calls.
 */
comicRoutes.get('/:id', isAuthenticated(), requireMediaType('comic'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res
      .status(400)
      .json({ status: 400, message: 'Invalid comic id.' });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return res.status(503).json({
      status: 503,
      message: 'ComicVine is not enabled.',
    });
  }

  const { getSettings } = await import('@server/lib/settings');
  const cfg = getSettings().comic.metadataProviders;

  try {
    const cv = new ComicVineAPI({ apiKey });
    const volume = await cv.getVolume(id);
    if (!volume) {
      return res
        .status(404)
        .json({ status: 404, message: 'Comic not found.' });
    }
    if (cfg.hideAdult && looksAdult(volume)) {
      return res
        .status(404)
        .json({ status: 404, message: 'Comic not available.' });
    }

    const primaryCreator = pickPrimaryCreator(volume.people);

    const issues = (volume.issues ?? []).slice(0, 50).map((i) => ({
      comicVineId: i.id,
      name: i.name ?? undefined,
      issueNumber: i.issue_number ?? undefined,
      coverDate: i.cover_date ?? undefined,
    }));

    return res.status(200).json({
      key: volume.id,
      comicVineId: volume.id,
      title: volume.name,
      year: comicVineYear(volume.start_year),
      coverUrl: comicVineCoverUrl(volume.image),
      issueCount: volume.count_of_issues,
      publisher: volume.publisher?.name,
      publisherId: volume.publisher?.id,
      description: volume.description ?? volume.deck ?? undefined,
      siteDetailUrl: volume.site_detail_url ?? undefined,
      aliases: volume.aliases ?? undefined,
      firstIssue: volume.first_issue
        ? {
            id: volume.first_issue.id,
            name: volume.first_issue.name ?? undefined,
            issueNumber: volume.first_issue.issue_number ?? undefined,
            coverDate: volume.first_issue.cover_date ?? undefined,
          }
        : undefined,
      lastIssue: volume.last_issue
        ? {
            id: volume.last_issue.id,
            name: volume.last_issue.name ?? undefined,
            issueNumber: volume.last_issue.issue_number ?? undefined,
            coverDate: volume.last_issue.cover_date ?? undefined,
          }
        : undefined,
      issues,
      characters:
        volume.characters?.map((c) => c.name).filter(Boolean).slice(0, 20) ??
        [],
      // Creator block — same shape as the manga staff block so the UI
      // can reuse its "About the creator" component.
      creatorName: primaryCreator?.name,
      creatorKey: primaryCreator?.id,
      creatorRole: primaryCreator?.role ?? undefined,
      // Full credit list (de-duplicated by id) for the credits panel.
      credits:
        volume.people?.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role,
        })) ?? [],
      mediaType: MediaType.COMIC,
    });
  } catch (e) {
    logger.error('Comic detail fetch failed', {
      label: 'comic',
      comicId: id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch comic details.',
    });
  }
});

/**
 * POST /api/v1/comic/request
 * Submit a comic request. The request unit is the *volume* (a series),
 * not a single issue — Mylar3 manages subscriptions at the series
 * level and that matches user mental model. No download manager wired
 * here yet; Phase 7 (Mylar3) plugs in after.
 */
comicRoutes.post('/request', isAuthenticated(), requireMediaType('comic'), async (req, res) => {
  const body = req.body as {
    comicVineId: number;
    title: string;
    year?: number;
    coverUrl?: string;
    issueCount?: number;
    publisher?: string;
    publisherId?: number;
    creatorName?: string;
    creatorKey?: number;
    userId?: number;
  };

  if (!body.comicVineId || !body.title) {
    return res.status(400).json({
      status: 400,
      message: 'comicVineId and title are required.',
    });
  }

  if (
    !hasPermission(
      [Permission.REQUEST, Permission.REQUEST_COMIC],
      req.user?.permissions ?? 0,
      { type: 'or' }
    )
  ) {
    return res.status(403).json({
      status: 403,
      message: 'You do not have permission to request comics.',
    });
  }

  const comicMediaRepo = getRepository(ComicMedia);
  const requestRepo = getRepository(MediaRequest);
  const userRepo = getRepository(User);

  // Admin "Request As" — same shape as the manga / game / book routes.
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

  // Duplicate detection — one row per ComicVine volume id (the unique
  // constraint on ComicMedia). Active duplicates return 409; declined
  // ones can be re-requested.
  const existing = await comicMediaRepo.findOne({
    where: { comicVineId: body.comicVineId },
  });

  if (existing) {
    const existingRequest = await requestRepo.findOne({
      where: { comicMedia: { id: existing.id } },
    });
    if (
      existingRequest &&
      existingRequest.status !== MediaRequestStatus.DECLINED
    ) {
      return res.status(409).json({
        status: 409,
        message: 'This comic has already been requested.',
        existingRequestId: existingRequest.id,
        existingStatus: existingRequest.status,
      });
    }
  }

  // Quota check — MANAGE_USERS bypass is handled inside getQuota().
  try {
    const quotas = await requestUser.getQuota();
    if (quotas.comic.restricted) {
      return res.status(403).json({
        status: 403,
        message: 'Comic quota exceeded.',
        quota: quotas.comic,
      });
    }
  } catch (e) {
    logger.warn('Quota check failed (proceeding without enforcement)', {
      label: 'comic',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    let comicMedia = existing;
    if (!comicMedia) {
      comicMedia = new ComicMedia({
        title: body.title,
        comicVineId: body.comicVineId,
        year: body.year ?? null,
        coverUrl: body.coverUrl ?? null,
        issueCount: body.issueCount ?? null,
        publisher: body.publisher ?? null,
        publisherId: body.publisherId ?? null,
        creatorName: body.creatorName ?? null,
        creatorKey: body.creatorKey ?? null,
        status: MediaStatus.PENDING,
      });
      await comicMediaRepo.save(comicMedia);
    } else if (comicMedia.status !== MediaStatus.AVAILABLE) {
      comicMedia.status = MediaStatus.PENDING;
      await comicMediaRepo.save(comicMedia);
    }

    const request = new MediaRequest();
    request.status = MediaRequestStatus.PENDING;
    request.type = MediaType.COMIC;
    request.requestedBy = requestUser;
    request.comicMedia = comicMedia;

    await requestRepo.save(request);

    if (
      req.user &&
      hasPermission(
        [
          Permission.MANAGE_REQUESTS,
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_COMIC,
        ],
        req.user.permissions,
        { type: 'or' }
      )
    ) {
      comicMedia.status = MediaStatus.PROCESSING;
      await comicMediaRepo.save(comicMedia);
      request.status = MediaRequestStatus.APPROVED;
      await requestRepo.save(request);
    }

    logger.info(
      `Comic request created: ${body.title} (comicvine:${body.comicVineId})`,
      {
        label: 'comic',
        requestId: request.id,
      }
    );

    return res.status(201).json({
      ...request,
      comicMedia,
    });
  } catch (e) {
    logger.error('Comic request creation failed', {
      label: 'comic',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Comic request creation failed. Please try again.',
    });
  }
});

export default comicRoutes;
