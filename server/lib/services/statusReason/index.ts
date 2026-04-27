import RadarrAPI from '@server/api/servarr/radarr';
import SonarrAPI from '@server/api/servarr/sonarr';
import TheMovieDb from '@server/api/themoviedb';
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from '@server/constants/media';
import type Media from '@server/entity/Media';
import type { MediaRequest } from '@server/entity/MediaRequest';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import NodeCache from 'node-cache';

/**
 * Per-request reason cache. The explainer hits Radarr/Sonarr's queue
 * endpoint on every call, which is fine for individual page loads but
 * murders the queue API when the user opens /requests with 30 cards
 * each lazily fetching their own reason. 60s TTL is short enough to
 * still feel live (download progress updates) and long enough to
 * absorb a list-page render.
 */
const reasonCache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

/** Format a number-of-bytes-left into "X% — Y min remaining". */
function formatProgress(record: {
  size: number;
  sizeleft: number;
  timeleft?: string;
}): string {
  const pct =
    record.size > 0
      ? Math.max(
          0,
          Math.min(100, Math.round((1 - record.sizeleft / record.size) * 100))
        )
      : 0;
  const tail = record.timeleft ? ` — ${record.timeleft} remaining` : '';
  return `${pct}%${tail}`;
}

function isFutureDate(dateString?: string | null): boolean {
  if (!dateString) return false;
  const t = Date.parse(dateString);
  return Number.isFinite(t) && t > Date.now();
}

function fmtDate(dateString?: string | null): string {
  return (dateString ?? '').slice(0, 10);
}

/**
 * Decode a movie request's current state into a human-readable
 * reason. Returns null when there's nothing useful to say beyond
 * what the status badge already conveys.
 *
 * Order of precedence:
 *   1. Currently in Radarr's download queue → "Downloading X% — Y min remaining"
 *   2. Release date is in the future → "Not released yet (releases YYYY-MM-DD)"
 *   3. Radarr says monitored + no file → "Monitored — waiting for indexers to find a usable release"
 *   4. Radarr says not monitored → "Approved but Radarr is not monitoring this movie"
 *   5. Otherwise null (status badge says it all)
 */
async function explainMovieRequest(
  request: MediaRequest,
  media: Media
): Promise<string | null> {
  const is4k = request.is4k;
  const serviceId = is4k ? media.serviceId4k : media.serviceId;
  const externalId = is4k
    ? media.externalServiceId4k
    : media.externalServiceId;
  if (!serviceId && !externalId) {
    // No Radarr instance ever picked this up. Most common reason:
    // approved but no default Radarr was configured at the time of
    // dispatch. Surface this honestly.
    return 'Approved but no Radarr instance is wired to this request. Check that a default Radarr is configured in Settings → Services.';
  }

  const settings = getSettings();
  const radarrConfig = settings.radarr.find((r) => r.id === serviceId);
  if (!radarrConfig) {
    return 'Configured Radarr instance is missing from settings — the request can\'t be dispatched until it\'s re-added.';
  }

  const radarr = new RadarrAPI({
    url: RadarrAPI.buildUrl(radarrConfig, '/api/v3'),
    apiKey: radarrConfig.apiKey,
  });

  // 1. Active download? ServarrBase.getQueue returns the full queue;
  // we filter to this movie client-side (Radarr's 200-row default
  // page is plenty for any sane homelab queue).
  if (typeof externalId === 'number') {
    try {
      const queue = await radarr.getQueue();
      const item = queue.find((r) => r.movieId === externalId);
      if (item) {
        const progress = formatProgress(item);
        return `Downloading${item.status ? ` (${item.status.toLowerCase()})` : ''} — ${progress}`;
      }
    } catch (e) {
      logger.debug('Radarr queue fetch failed', {
        label: 'status-reason',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2. Release date in the future?
  try {
    const tmdb = new TheMovieDb();
    const movie = await tmdb.getMovie({ movieId: media.tmdbId });
    if (isFutureDate(movie.release_date)) {
      return `Not released yet — scheduled for ${fmtDate(movie.release_date)}. Radarr will pick it up once indexers list it.`;
    }
  } catch (e) {
    logger.debug('TMDB lookup for movie release-date check failed', {
      label: 'status-reason',
      tmdbId: media.tmdbId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3 + 4: ask Radarr for the movie record.
  if (typeof externalId === 'number') {
    try {
      const movie = await radarr.getMovie({ id: externalId });
      if (movie.hasFile) {
        // Already imported. The status badge says AVAILABLE / etc., so
        // no extra reason to surface.
        return null;
      }
      if (!movie.monitored) {
        return 'Approved but Radarr is not monitoring this movie. Toggle the monitor flag in Radarr or re-request to retrigger the dispatch.';
      }
      // Monitored but no file and not in queue — most likely indexers
      // have nothing usable yet.
      return 'Monitored by Radarr — waiting for indexers to return a usable release.';
    } catch (e) {
      logger.debug('Radarr movie lookup failed for status reason', {
        label: 'status-reason',
        movieId: externalId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return null;
}

/**
 * TV-equivalent of explainMovieRequest. Episode-level granularity is
 * deliberately skipped — surfacing per-episode queue state in a
 * tooltip would be noise. We only summarise: queued / monitored /
 * released-but-no-releases-yet / not-released-yet.
 */
async function explainTvRequest(
  request: MediaRequest,
  media: Media
): Promise<string | null> {
  const is4k = request.is4k;
  const serviceId = is4k ? media.serviceId4k : media.serviceId;
  const externalId = is4k
    ? media.externalServiceId4k
    : media.externalServiceId;
  if (!serviceId && !externalId) {
    return 'Approved but no Sonarr instance is wired to this request. Check that a default Sonarr is configured in Settings → Services.';
  }

  const settings = getSettings();
  const sonarrConfig = settings.sonarr.find((s) => s.id === serviceId);
  if (!sonarrConfig) {
    return "Configured Sonarr instance is missing from settings — the request can't be dispatched until it's re-added.";
  }

  const sonarr = new SonarrAPI({
    url: SonarrAPI.buildUrl(sonarrConfig, '/api/v3'),
    apiKey: sonarrConfig.apiKey,
  });

  // 1. Active episode in the queue?
  if (typeof externalId === 'number') {
    try {
      const queue = await sonarr.getQueue();
      const item = queue.find((r) => r.seriesId === externalId);
      if (item) {
        const progress = formatProgress(item);
        return `Episode downloading${item.status ? ` (${item.status.toLowerCase()})` : ''} — ${progress}`;
      }
    } catch (e) {
      logger.debug('Sonarr queue fetch failed', {
        label: 'status-reason',
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2. Series air-date check via TMDB.
  try {
    const tmdb = new TheMovieDb();
    const tv = await tmdb.getTvShow({ tvId: media.tmdbId });
    if (tv.first_air_date && isFutureDate(tv.first_air_date)) {
      return `Series hasn't aired yet — first episode scheduled for ${fmtDate(tv.first_air_date)}.`;
    }
    if (tv.next_episode_to_air?.air_date) {
      // Has aired but next episode is upcoming — still worth saying
      // when status is PROCESSING / partially available.
      if (isFutureDate(tv.next_episode_to_air.air_date)) {
        return `Waiting on next episode (S${tv.next_episode_to_air.season_number}E${tv.next_episode_to_air.episode_number}, airs ${fmtDate(tv.next_episode_to_air.air_date)}).`;
      }
    }
  } catch (e) {
    logger.debug('TMDB TV lookup for status reason failed', {
      label: 'status-reason',
      tmdbId: media.tmdbId,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  // 3. Sonarr monitored / not.
  if (typeof externalId === 'number') {
    try {
      const series = await sonarr.getSeriesById(externalId);
      if (!series.monitored) {
        return 'Approved but Sonarr is not monitoring this series. Toggle the monitor flag in Sonarr or re-request.';
      }
      return 'Monitored by Sonarr — waiting for indexers to return usable releases.';
    } catch (e) {
      logger.debug('Sonarr series lookup failed for status reason', {
        label: 'status-reason',
        seriesId: externalId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return null;
}

/**
 * Top-level entry point. Returns the persisted reason for non-TMDB
 * types (set by the dispatcher subscriber), and computes a live
 * reason for movie / TV by querying Radarr / Sonarr / TMDB. Result
 * is cached for 60s per request id to keep list-page renders cheap.
 */
export async function getRequestStatusReason(
  request: MediaRequest
): Promise<string | null> {
  const cacheKey = `req:${request.id}`;
  const hit = reasonCache.get<string | null>(cacheKey);
  if (hit !== undefined) return hit;

  let reason: string | null = null;

  // Non-TMDB types: the persisted reason already lives on the
  // matching *Media entity (set by the subscriber on each dispatch).
  // Just forward it.
  if (request.type === MediaType.BOOK) {
    reason = request.bookMedia?.statusReason ?? null;
  } else if (request.type === MediaType.AUDIOBOOK) {
    reason = request.audiobookMedia?.statusReason ?? null;
  } else if (request.type === MediaType.GAME) {
    reason = request.gameMedia?.statusReason ?? null;
  } else if (request.type === MediaType.MANGA) {
    reason = request.mangaMedia?.statusReason ?? null;
  } else if (request.type === MediaType.COMIC) {
    reason = request.comicMedia?.statusReason ?? null;
  } else if (
    request.type === MediaType.MOVIE &&
    request.media &&
    // Only worth computing when the request is past PENDING. PENDING
    // means it's still waiting on admin approval — no Radarr state
    // exists yet.
    request.status !== MediaRequestStatus.DECLINED &&
    request.media.status !== MediaStatus.AVAILABLE
  ) {
    try {
      reason = await explainMovieRequest(request, request.media);
    } catch (e) {
      logger.warn('Movie status-reason explain failed', {
        label: 'status-reason',
        requestId: request.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  } else if (
    request.type === MediaType.TV &&
    request.media &&
    request.status !== MediaRequestStatus.DECLINED &&
    request.media.status !== MediaStatus.AVAILABLE
  ) {
    try {
      reason = await explainTvRequest(request, request.media);
    } catch (e) {
      logger.warn('TV status-reason explain failed', {
        label: 'status-reason',
        requestId: request.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  reasonCache.set(cacheKey, reason);
  return reason;
}
