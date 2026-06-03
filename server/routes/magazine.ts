import { isAuthenticated } from '@server/middleware/auth';
import {
  getMagazineById,
  searchMagazines,
} from '@server/api/googlebooks/magazines';
import PressarrAPI, {
  type PressarrIssnEntry,
  type PressarrMagazineIdentity,
  type PressarrMetadataSearchResult,
  type PressarrRelatedPublication,
} from '@server/api/servarr/pressarr';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import { MagazineMedia } from '@server/entity/MagazineMedia';
import { MediaRequest } from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import { Permission } from '@server/lib/permissions';
import { hasPermission } from '@server/lib/permissions';
import { getRepository } from '@server/datasource';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const magazineRoutes = Router();

/**
 * Returns the active Google Books API key (if any). Google Books is
 * the cover-of-last-resort and the only source we keep when pressarr
 * isn't configured — see ``cascadeOrFallback`` below.
 */
function googleBooksApiKey(): string | undefined {
  return getSettings().book?.metadataProviders?.googleBooksApiKey || undefined;
}

interface MagazineCard {
  source: 'pressarr' | 'googlebooks';
  id: string;
  title: string;
  publisher?: string;
  issn?: string;
  coverUrl?: string;
  year?: number;
  language?: string;
  description?: string;
  frequency?: string;
  country?: string;
  // Enrichment fields contributed by pressarr's ISSN-first cascade
  // (ZDB + Wikidata + BnF + ISSN Portal). Absent when the card was
  // sourced from Google Books only.
  categories?: string[];
  wikidataQid?: string;
  zdbId?: string;
  wikipediaUrl?: string;
  sources?: string[];
  firstIssued?: string;
  ceasedAt?: string;
  relatedPublications?: PressarrRelatedPublication[];
  issns?: PressarrIssnEntry[];
  // True when ``coverUrl`` is a brand logo (Wikidata P154) — the
  // card renderer switches to a contained layout with a neutral
  // background instead of zoom-cropping the image.
  coverIsLogo?: boolean;
}

function getDefaultPressarr() {
  return getSettings().pressarr.find(
    (p) => p.mediaType === 'magazine' && p.isDefault
  );
}

function pressarrClient(
  instance: NonNullable<ReturnType<typeof getDefaultPressarr>>
) {
  return new PressarrAPI({
    apiKey: instance.apiKey,
    url: PressarrAPI.buildUrl(instance, '/api/v1'),
  });
}

/**
 * Build the canonical card id for a cascade hit. ISSN-shaped keys
 * (``issn:0028-0836``) round-trip to the detail endpoint cleanly
 * because pressarr resolves them via its ``/magazine/identity``
 * endpoint. Cascade hits without an ISSN fall back to a title slug.
 */
function cascadeCardId(hit: PressarrMetadataSearchResult): string {
  if (hit.issn) return `issn:${hit.issn}`;
  if (hit.wikidataQid) return `wd:${hit.wikidataQid}`;
  return `pressarr:${hit.providerId}`;
}

function cascadeToCard(hit: PressarrMetadataSearchResult): MagazineCard {
  return {
    source: 'pressarr',
    id: cascadeCardId(hit),
    title: hit.title,
    publisher: hit.publisher ?? undefined,
    issn: hit.issn ?? undefined,
    coverUrl: hit.coverUrl ?? undefined,
    year: hit.firstIssued
      ? Number.parseInt(hit.firstIssued, 10) || undefined
      : undefined,
    language: hit.language ?? undefined,
    description: hit.description ?? undefined,
    frequency: hit.frequency ?? undefined,
    country: hit.country ?? undefined,
    categories: hit.categories ?? undefined,
    wikidataQid: hit.wikidataQid ?? undefined,
    zdbId: hit.zdbId ?? undefined,
    wikipediaUrl: hit.wikipediaUrl ?? undefined,
    sources: hit.sources?.map((s) => s.provider),
    firstIssued: hit.firstIssued ?? undefined,
    ceasedAt: hit.ceasedAt ?? undefined,
    issns: hit.issns ?? undefined,
    coverIsLogo: hit.coverIsLogo,
  };
}

function identityToCard(
  identity: PressarrMagazineIdentity,
  fallbackId?: string
): MagazineCard {
  return {
    source: 'pressarr',
    id:
      identity.issn != null
        ? `issn:${identity.issn}`
        : identity.wikidataQid
          ? `wd:${identity.wikidataQid}`
          : fallbackId ?? `slug:${identity.title.toLowerCase()}`,
    title: identity.title,
    publisher: identity.publisher ?? undefined,
    issn: identity.issn ?? undefined,
    coverUrl: identity.coverUrl ?? undefined,
    year: identity.firstIssued
      ? Number.parseInt(identity.firstIssued, 10) || undefined
      : undefined,
    language: identity.language ?? undefined,
    description: identity.description ?? undefined,
    frequency: identity.frequency ?? undefined,
    country: identity.country ?? undefined,
    categories: identity.categories ?? undefined,
    wikidataQid: identity.wikidataQid ?? undefined,
    zdbId: identity.zdbId ?? undefined,
    wikipediaUrl: identity.wikipediaUrl ?? undefined,
    sources: identity.sources,
    firstIssued: identity.firstIssued ?? undefined,
    ceasedAt: identity.ceasedAt ?? undefined,
    relatedPublications: identity.relatedPublications ?? undefined,
    issns: identity.issns ?? undefined,
    coverIsLogo: identity.coverIsLogo,
  };
}

/**
 * Free-text magazine search.
 *
 * Primary source: the operator's default pressarr instance — its
 * ``/magazine/lookup`` aggregates ZDB + Wikidata + BnF + Google
 * Books + Internet Archive into a single ISSN-merged list and
 * already does the relevance ranking, so we forward the response
 * shape directly.
 *
 * Fallback: when no pressarr instance is configured, we still hit
 * Google Books so a fresh install can render at least *something*
 * on the discover page. Once the operator wires pressarr the
 * cascade takes over.
 */
magazineRoutes.get('/search', isAuthenticated(), async (req, res, next) => {
  const query =
    typeof req.query.query === 'string' ? req.query.query : undefined;
  const locale =
    typeof req.query.locale === 'string' ? req.query.locale : undefined;
  // Optional publication-status filter forwarded to pressarr's
  // cascade. ``ongoing`` (default in the UI) hides ceased magazines;
  // ``all`` keeps everything.
  const statusRaw =
    typeof req.query.status === 'string' ? req.query.status : undefined;
  const status =
    statusRaw === 'ongoing' || statusRaw === 'ceased' || statusRaw === 'all'
      ? statusRaw
      : undefined;
  // Verified filter — when truthy hides BnF/ZDB-only catalogue
  // records that don't have a Wikidata QID. Cuts the long tail
  // of edition variants ("L'Equipe Feder (Montpellier)") so the
  // canonical title surfaces alone.
  const verified =
    req.query.verified === 'true' || req.query.verified === '1';
  const multiIssn =
    req.query.multi_issn === 'true' || req.query.multi_issn === '1';
  if (!query?.trim()) {
    return res.status(200).json({ results: [] });
  }
  try {
    const pressarr = getDefaultPressarr();
    if (pressarr) {
      const api = pressarrClient(pressarr);
      const hits = await api.lookupMagazine(query, {
        locale,
        status,
        verified,
        multiIssn,
      });
      // Empty cascade response → fall through to Google Books to
      // preserve discovery UX even when ZDB / Wikidata don't know
      // a niche local title.
      if (hits.length > 0) {
        return res
          .status(200)
          .json({ results: hits.map(cascadeToCard) });
      }
    }
    const googleResults = await searchMagazines(query, {
      apiKey: googleBooksApiKey(),
    });
    return res.status(200).json({
      results: googleResults.map<MagazineCard>((g) => ({
        source: 'googlebooks',
        id: g.id,
        title: g.title,
        publisher: g.publisher,
        issn: g.issn,
        coverUrl: g.coverUrl,
        year: g.year,
        language: g.language,
        description: g.description,
      })),
    });
  } catch (e) {
    return next({
      status: 500,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/**
 * Single-magazine detail.
 *
 * Routes by id shape:
 *   * ``issn:NNNN-NNNN`` — pressarr ``/magazine/identity?issn=…``,
 *     authoritative single record from the cascade. Returns 404
 *     when no source recognises the ISSN.
 *   * ``wd:Q123`` — fallback to pressarr search by the QID (rare —
 *     happens when the cascade returned a Wikidata-only hit with
 *     no ISSN). We rerun the search and pick the matching QID.
 *   * anything else — treated as a Google Books volume id and
 *     served from the old detail endpoint.
 */
magazineRoutes.get('/:id', isAuthenticated(), async (req, res) => {
  const id = req.params.id;
  const locale =
    typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const pressarr = getDefaultPressarr();

  if (id.startsWith('issn:') && pressarr) {
    const api = pressarrClient(pressarr);
    const issn = id.slice('issn:'.length);
    const identity = await api.lookupMagazineIdentity(issn, { locale });
    if (identity) {
      return res.status(200).json(identityToCard(identity, id));
    }
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }

  if (id.startsWith('wd:') && pressarr) {
    // No native /by-qid endpoint upstream — replay the title search
    // and pick the entry that matches the QID. Cheap because
    // pressarr caches its cascade per-query.
    const api = pressarrClient(pressarr);
    const qid = id.slice('wd:'.length);
    // Strip the QID prefix and search by title — we don't know the
    // title yet, so fall back to a degenerate "search by qid" that
    // hits Wikidata's wbsearchentities (it accepts QIDs literally).
    const hits = await api.lookupMagazine(qid, { locale });
    const match = hits.find((h) => h.wikidataQid === qid);
    if (match) {
      return res.status(200).json(cascadeToCard(match));
    }
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }

  // Fallback: Google Books volume id.
  const data = await getMagazineById(id, { apiKey: googleBooksApiKey() });
  if (!data) {
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }
  return res.status(200).json(data);
});

/**
 * POST /api/v1/magazine/request — create a MagazineMedia + a
 * MediaRequest, mirroring the comic.ts / book.ts request shape.
 *
 * ``externalKey`` deduplicates: ISSN when present (canonical for
 * the cascade), else slug of the title. A duplicate active
 * request returns 409 with the existing id; a declined request
 * is treated as "may re-request" and the same MagazineMedia row
 * gets re-used.
 */
magazineRoutes.post('/request', isAuthenticated(), async (req, res) => {
  const body = req.body as {
    id: string; // cascade id: ``issn:NNNN-NNNN`` | ``wd:Q123`` | ``googlebooks:VOL`` | ``pressarr:…``
    title: string;
    issn?: string;
    publisher?: string;
    coverUrl?: string;
    /**
     * Forwarded from the search/catalog hit so the card renders
     * its contained-logo treatment in the request list. Same
     * meaning as on the cascade response.
     */
    coverIsLogo?: boolean;
    year?: number;
    language?: string;
    description?: string;
    frequency?: string;
    googleBooksId?: string;
    userId?: number;
    /**
     * Operator-chosen "watch from" date (ISO ``YYYY-MM-DD``).
     * Forwarded to pressarr on dispatch — issues released
     * earlier are ignored. Omit for "monitor everything".
     */
    monitoringStartDate?: string;
    /**
     * 'subscription' (default) = recurring monitor on the
     * magazine; pressarr auto-grabs every new issue published
     * on/after ``monitoringStartDate``.
     * 'one_shot' = single back-issue. Pressarr resolves the
     * target identified by ``targetIssueLabel`` or
     * ``targetIssueDate`` and grabs only that one, no further
     * monitoring.
     */
    requestType?: 'subscription' | 'one_shot';
    targetIssueLabel?: string;
    targetIssueDate?: string;
  };

  if (!body.id || !body.title) {
    return res
      .status(400)
      .json({ status: 400, message: 'id and title are required.' });
  }

  if (
    !hasPermission(
      [Permission.REQUEST, Permission.REQUEST_MAGAZINE],
      req.user?.permissions ?? 0,
      { type: 'or' }
    )
  ) {
    return res.status(403).json({
      status: 403,
      message: 'You do not have permission to request magazines.',
    });
  }

  // Canonical externalKey: ISSN when known, else slug of title.
  const slug = body.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  const externalKey = body.issn ? `issn:${body.issn}` : `slug:${slug}`;

  const magazineMediaRepo = getRepository(MagazineMedia);
  const requestRepo = getRepository(MediaRequest);
  const userRepo = getRepository(User);

  // Admin "Request As" — same pattern as comic / book routes.
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

  // Duplicate detection — externalKey unique constraint already
  // prevents two MagazineMedia rows; we just need to surface the
  // existing in-flight request id to the caller.
  const existing = await magazineMediaRepo.findOne({ where: { externalKey } });
  if (existing) {
    const existingRequest = await requestRepo.findOne({
      where: { magazineMedia: { id: existing.id } },
    });
    if (
      existingRequest &&
      existingRequest.status !== MediaRequestStatus.DECLINED
    ) {
      return res.status(409).json({
        status: 409,
        message: 'This magazine has already been requested.',
        existingRequestId: existingRequest.id,
        existingStatus: existingRequest.status,
      });
    }
  }

  try {
    const quotas = await requestUser.getQuota();
    if (quotas.magazine?.restricted) {
      return res.status(403).json({
        status: 403,
        message: 'Magazine quota exceeded.',
        quota: quotas.magazine,
      });
    }
  } catch (e) {
    logger.warn('Magazine quota check failed (proceeding without)', {
      label: 'magazine',
      error: e instanceof Error ? e.message : String(e),
    });
  }

  try {
    let magazineMedia = existing;
    if (!magazineMedia) {
      magazineMedia = new MagazineMedia({
        title: body.title,
        externalKey,
        issn: body.issn ?? null,
        googleBooksId: body.googleBooksId ?? null,
        publisher: body.publisher ?? null,
        coverUrl: body.coverUrl ?? null,
        coverIsLogo: body.coverIsLogo ?? null,
        year: body.year ?? null,
        language: body.language ?? null,
        description: body.description ?? null,
        frequency: body.frequency ?? null,
        // Cheap sanity check — basic ISO date shape ("2026-06-01").
        // Anything else is dropped rather than rejected so the
        // overall request still goes through.
        monitoringStartDate:
          body.monitoringStartDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(body.monitoringStartDate)
            ? body.monitoringStartDate
            : null,
        requestType:
          body.requestType === 'one_shot' ? 'one_shot' : 'subscription',
        targetIssueLabel: body.targetIssueLabel?.trim() || null,
        targetIssueDate:
          body.targetIssueDate &&
          /^\d{4}-\d{2}-\d{2}$/.test(body.targetIssueDate)
            ? body.targetIssueDate
            : null,
        status: MediaStatus.PENDING,
      });
      await magazineMediaRepo.save(magazineMedia);
    } else if (magazineMedia.status !== MediaStatus.AVAILABLE) {
      magazineMedia.status = MediaStatus.PENDING;
      await magazineMediaRepo.save(magazineMedia);
    }

    const request = new MediaRequest();
    request.status = MediaRequestStatus.PENDING;
    request.type = MediaType.MAGAZINE;
    request.requestedBy = requestUser;
    request.magazineMedia = magazineMedia;
    await requestRepo.save(request);

    if (
      req.user &&
      hasPermission(
        [
          Permission.MANAGE_REQUESTS,
          Permission.AUTO_APPROVE,
          Permission.AUTO_APPROVE_MAGAZINE,
        ],
        req.user.permissions,
        { type: 'or' }
      )
    ) {
      magazineMedia.status = MediaStatus.PROCESSING;
      await magazineMediaRepo.save(magazineMedia);
      request.status = MediaRequestStatus.APPROVED;
      await requestRepo.save(request);
    }

    logger.info(`Magazine request created: ${body.title} (${externalKey})`, {
      label: 'magazine',
      requestId: request.id,
    });

    return res.status(201).json({ ...request, magazineMedia });
  } catch (e) {
    logger.error('Magazine request creation failed', {
      label: 'magazine',
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Magazine request creation failed. Please try again.',
    });
  }
});

logger.debug('Magazine routes wired (cascade-primary, Google Books fallback)');

export default magazineRoutes;
