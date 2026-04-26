import AniListAPI, {
  aniListIsoDate,
  aniListPrimaryTitle,
  aniListYear,
} from '@server/api/anilist';
import { MediaType } from '@server/constants/media';
import { isAuthenticated } from '@server/middleware/auth';
import logger from '@server/logger';
import { Router } from 'express';

const mangaRoutes = Router();

/**
 * Should the search / detail responses honour the per-tab
 * preferredLanguage? Manga sources differ by countryOfOrigin code:
 * jp = manga, kr = manhwa, cn = manhua. AniList exposes the field
 * directly so the filter is server-side cheap.
 */
function applyLanguageFilter<T extends { countryOfOrigin?: string | null }>(
  rows: T[],
  prefLang: string,
  policy: 'prefer' | 'strict'
): T[] {
  if (!prefLang) return rows;
  const lower = prefLang.toLowerCase();
  if (policy === 'strict') {
    return rows.filter(
      (r) => !r.countryOfOrigin || r.countryOfOrigin.toLowerCase() === lower
    );
  }
  // "prefer" → matches first, then unknown, then non-matches.
  const rank = (c?: string | null) =>
    !c ? 1 : c.toLowerCase() === lower ? 0 : 2;
  return [...rows].sort(
    (a, b) => rank(a.countryOfOrigin) - rank(b.countryOfOrigin)
  );
}

/**
 * GET /api/v1/manga/search
 * Free-text manga search via AniList. Mirrors /book/search shape so
 * the existing Search component can render the results with minimal
 * adaptation.
 */
mangaRoutes.get('/search', isAuthenticated(), async (req, res) => {
  const query = req.query.query as string;
  const limit = parseInt((req.query.limit as string) || '20', 10);

  if (!query || query.trim().length === 0) {
    return res.status(400).json({
      status: 400,
      message: 'Search query is required.',
    });
  }

  const { getSettings } = await import('@server/lib/settings');
  const settings = getSettings();
  const cfg = settings.manga?.metadataProviders;
  if (!cfg?.anilist) {
    return res.status(503).json({
      status: 503,
      message:
        'AniList is not enabled. Turn it on in Settings → Metadata Providers → Manga.',
    });
  }

  try {
    const anilist = new AniListAPI();
    const raw = await anilist.searchManga(query, limit);

    // Optionally drop adult-tagged hits.
    const filteredAdult = cfg.hideAdult
      ? raw.filter((r) => !r.isAdult)
      : raw;

    // Apply language preference (jp / kr / cn).
    const filtered = applyLanguageFilter(
      filteredAdult,
      cfg.preferredLanguage ?? '',
      cfg.languagePolicy ?? 'prefer'
    );

    const results = filtered.map((m) => ({
      anilistId: m.id,
      malId: m.idMal ?? undefined,
      title: aniListPrimaryTitle(m.title),
      titleNative: m.title?.native ?? undefined,
      coverUrl: m.coverImage?.large ?? m.coverImage?.medium ?? undefined,
      bannerUrl: m.bannerImage ?? undefined,
      year: aniListYear(m.startDate),
      status: m.status ?? undefined,
      format: m.format ?? undefined,
      chapters: m.chapters ?? undefined,
      volumes: m.volumes ?? undefined,
      averageScore: m.averageScore ?? undefined,
      countryOfOrigin: m.countryOfOrigin ?? undefined,
      isAdult: m.isAdult ?? undefined,
      mediaType: MediaType.MANGA,
    }));

    return res.status(200).json({
      results,
      totalResults: results.length,
    });
  } catch (e) {
    logger.error('Manga search failed', {
      label: 'manga',
      query,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Manga search failed. Please try again.',
    });
  }
});

/**
 * GET /api/v1/manga/staff/:id
 * Mangaka / illustrator detail page with their manga credits.
 * Parallel to /book/author/:id for the books flow.
 *
 * MUST be registered before /:id so the literal segment "staff" isn't
 * caught by the catch-all id route.
 */
mangaRoutes.get('/staff/:id', isAuthenticated(), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ status: 400, message: 'Invalid staff id.' });
  }

  const { getSettings } = await import('@server/lib/settings');
  const cfg = getSettings().manga?.metadataProviders;
  if (!cfg?.anilist) {
    return res
      .status(503)
      .json({ status: 503, message: 'AniList is not enabled.' });
  }

  try {
    const anilist = new AniListAPI();
    const staff = await anilist.getStaff(id);
    if (!staff) {
      return res
        .status(404)
        .json({ status: 404, message: 'Staff member not found.' });
    }

    const works =
      staff.staffMedia?.edges
        ?.map((edge) => {
          const node = edge.node;
          if (!node) return null;
          return {
            anilistId: node.id,
            title: aniListPrimaryTitle(node.title),
            coverUrl:
              node.coverImage?.large ?? node.coverImage?.medium ?? undefined,
            year: aniListYear(node.startDate),
            status: node.status ?? undefined,
            format: node.format ?? undefined,
            averageScore: node.averageScore ?? undefined,
            staffRole: edge.staffRole ?? undefined,
          };
        })
        .filter((w): w is NonNullable<typeof w> => w !== null) ?? [];

    return res.status(200).json({
      key: id,
      name: staff.name?.full ?? staff.name?.userPreferred ?? 'Unknown',
      nameNative: staff.name?.native ?? undefined,
      photoUrl: staff.image?.large ?? staff.image?.medium ?? undefined,
      bio: staff.description ?? undefined,
      birthDate: aniListIsoDate(staff.dateOfBirth),
      deathDate: aniListIsoDate(staff.dateOfDeath),
      homeTown: staff.homeTown ?? undefined,
      yearsActive: staff.yearsActive ?? undefined,
      occupations: staff.primaryOccupations ?? undefined,
      totalWorks: works.length,
      works,
    });
  } catch (e) {
    logger.error('Staff fetch failed', {
      label: 'manga',
      staffId: id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch staff details.',
    });
  }
});

/**
 * GET /api/v1/manga/:id
 * Manga detail by AniList numeric id. Returns the full Media record
 * including relations (PREQUEL / SEQUEL / SIDE_STORY / SPIN_OFF) which
 * the frontend renders as the "series" cluster.
 */
mangaRoutes.get('/:id', isAuthenticated(), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({ status: 400, message: 'Invalid manga id.' });
  }

  const { getSettings } = await import('@server/lib/settings');
  const cfg = getSettings().manga?.metadataProviders;
  if (!cfg?.anilist) {
    return res.status(503).json({
      status: 503,
      message: 'AniList is not enabled.',
    });
  }

  try {
    const anilist = new AniListAPI();
    const media = await anilist.getManga(id);
    if (!media) {
      return res
        .status(404)
        .json({ status: 404, message: 'Manga not found.' });
    }

    if (cfg.hideAdult && media.isAdult) {
      return res
        .status(404)
        .json({ status: 404, message: 'Manga not available.' });
    }

    // Pick the primary author / illustrator. AniList orders staff by
    // "popularity" inside the edge; we look for a Story / Story & Art
    // role first, falling back to the first node when none matches.
    const staffEdges = media.staff?.edges ?? [];
    const primaryStaffEdge =
      staffEdges.find((e) => /story/i.test(e.role ?? '')) ?? staffEdges[0];
    const primaryStaff = primaryStaffEdge?.node;

    const relations = (media.relations?.edges ?? [])
      .filter((edge) => edge.node?.type === 'MANGA')
      .map((edge) => ({
        relationType: edge.relationType ?? undefined,
        anilistId: edge.node!.id,
        title: aniListPrimaryTitle(edge.node!.title),
        coverUrl:
          edge.node!.coverImage?.large ??
          edge.node!.coverImage?.medium ??
          undefined,
        year: aniListYear(edge.node!.startDate),
        format: edge.node!.format ?? undefined,
        status: edge.node!.status ?? undefined,
      }));

    return res.status(200).json({
      key: media.id,
      anilistId: media.id,
      malId: media.idMal ?? undefined,
      title: aniListPrimaryTitle(media.title),
      titleNative: media.title?.native ?? undefined,
      titleRomaji: media.title?.romaji ?? undefined,
      synonyms: media.synonyms ?? undefined,
      description: media.description ?? undefined,
      coverUrl:
        media.coverImage?.extraLarge ??
        media.coverImage?.large ??
        media.coverImage?.medium ??
        undefined,
      bannerUrl: media.bannerImage ?? undefined,
      colorAccent: media.coverImage?.color ?? undefined,
      year: aniListYear(media.startDate),
      releaseDate: aniListIsoDate(media.startDate),
      endDate: aniListIsoDate(media.endDate),
      status: media.status ?? undefined,
      format: media.format ?? undefined,
      chapters: media.chapters ?? undefined,
      volumes: media.volumes ?? undefined,
      averageScore: media.averageScore ?? undefined,
      meanScore: media.meanScore ?? undefined,
      popularity: media.popularity ?? undefined,
      favourites: media.favourites ?? undefined,
      countryOfOrigin: media.countryOfOrigin ?? undefined,
      source: media.source ?? undefined,
      isAdult: media.isAdult ?? undefined,
      genres: media.genres ?? [],
      tags:
        media.tags
          ?.filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler)
          .map((t) => t.name)
          .filter((n): n is string => !!n)
          .slice(0, 15) ?? [],
      characters:
        media.characters?.edges
          ?.map((e) => e.node?.name?.full)
          .filter((n): n is string => !!n)
          .slice(0, 12) ?? [],
      externalLinks:
        media.externalLinks
          ?.filter((l) => l.url && l.site)
          .map((l) => ({
            site: l.site!,
            url: l.url!,
            type: l.type ?? undefined,
          })) ?? [],
      // Author block — same shape as the book detail page so the UI
      // can reuse its "About the author" component.
      authorName: primaryStaff?.name?.full ?? undefined,
      authorKey: primaryStaff?.id,
      authorPhotoUrl:
        primaryStaff?.image?.large ?? primaryStaff?.image?.medium ?? undefined,
      authorRole: primaryStaffEdge?.role ?? undefined,
      relations,
      mediaType: MediaType.MANGA,
    });
  } catch (e) {
    logger.error('Manga detail fetch failed', {
      label: 'manga',
      mangaId: id,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      status: 500,
      message: 'Failed to fetch manga details.',
    });
  }
});

export default mangaRoutes;
