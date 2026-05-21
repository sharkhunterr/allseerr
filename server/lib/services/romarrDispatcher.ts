import RomarrAPI from '@server/api/romarr';
import type { GameMedia } from '@server/entity/GameMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import axios from 'axios';

export interface RomarrDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a game request to the default Romarr instance. Mirrors
 * mylarDispatcher.ts: the subscriber calls us with the try / fallback
 * pattern, we mutate `media.romarrId` / `media.romarrUrl` on success
 * but the caller is responsible for saving.
 *
 * Romarr is a standalone acquisition service (the Radarr role for
 * ROMs), configured as a service instance in Settings → Services →
 * Game. It exposes an IGDB-native integration endpoint, so allseerr
 * only needs the IGDB game + platform ids it already cached on the
 * GameMedia row — Romarr resolves its own platform and library. The
 * call is idempotent on Romarr's side.
 */
export async function submitToRomarr(
  media: GameMedia
): Promise<RomarrDispatchResult> {
  const settings = getSettings();
  const instance =
    settings.romarr.find((r) => r.isDefault) ?? settings.romarr[0];

  if (!instance) {
    return {
      success: false,
      noInstance: true,
      message: 'No Romarr instance is configured. Game request stays manual.',
    };
  }

  if (!media.igdbId || !media.platformIgdbId) {
    return {
      success: false,
      message: 'Game has no IGDB game/platform id to submit to Romarr.',
    };
  }

  try {
    const api = new RomarrAPI({
      url: RomarrAPI.buildUrl(instance),
      apiKey: instance.apiKey,
    });

    const result = await api.requestGame({
      igdbId: media.igdbId,
      igdbPlatformId: media.platformIgdbId,
      title: media.title,
      monitored: true,
    });

    media.romarrId = result.game.id;
    const base = (instance.externalUrl || RomarrAPI.buildUrl(instance)).replace(
      /\/$/,
      ''
    );
    media.romarrUrl = `${base}/game/${result.game.id}`;

    const verb =
      result.status === 'already_present' ? 'already in' : 'added to';
    logger.info(
      `Game ${verb} Romarr: ${media.title} → romarr:${result.game.id}`,
      {
        label: 'romarr',
        gameMediaId: media.id,
        igdbId: media.igdbId,
        romarrId: result.game.id,
      }
    );

    return {
      success: true,
      externalId: String(result.game.id),
      message:
        result.status === 'already_present'
          ? `"${media.title}" is already tracked by Romarr.`
          : `Added "${media.title}" to Romarr.`,
    };
  } catch (e) {
    let message = e instanceof Error ? e.message : String(e);
    if (axios.isAxiosError(e) && e.response) {
      const data = e.response.data as
        | { errorCode?: string; errorMessage?: string }
        | undefined;
      if (data?.errorCode === 'platform_not_supported') {
        message = `Romarr does not support this game's platform (IGDB ${media.platformIgdbId}).`;
      } else if (data?.errorMessage) {
        message = data.errorMessage;
      } else if (e.response.status === 401 || e.response.status === 403) {
        message = 'Romarr rejected the API key (admin scope required).';
      }
    }
    logger.error('Romarr dispatch failed', {
      label: 'romarr',
      gameMediaId: media.id,
      error: message,
    });
    return { success: false, message };
  }
}

// In-memory cache for Romarr's supported IGDB platform ids. The list
// only changes when platforms are added in Romarr, so a short TTL
// keeps the game-detail path cheap without a stale UI for long.
let platformCache: { ids: number[]; at: number } | null = null;
const PLATFORM_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * The IGDB platform ids the default Romarr instance can acquire
 * games for. Returns `null` when no Romarr instance is configured,
 * or the list can't be fetched and nothing is cached — callers treat
 * null as "restriction not applicable" (fail open) so a transient
 * Romarr outage never hides every request button.
 */
export async function getRomarrSupportedPlatformIds(): Promise<
  number[] | null
> {
  const settings = getSettings();
  const instance =
    settings.romarr.find((r) => r.isDefault) ?? settings.romarr[0];
  if (!instance) {
    return null;
  }

  if (platformCache && Date.now() - platformCache.at < PLATFORM_CACHE_TTL_MS) {
    return platformCache.ids;
  }

  try {
    const api = new RomarrAPI({
      url: RomarrAPI.buildUrl(instance),
      apiKey: instance.apiKey,
    });
    const platforms = await api.getSupportedPlatforms();
    const ids = platforms
      .map((p) => p.igdb_id)
      .filter((n): n is number => typeof n === 'number');
    platformCache = { ids, at: Date.now() };
    return ids;
  } catch (e) {
    logger.warn('Failed to fetch Romarr supported platforms', {
      label: 'romarr',
      error: e instanceof Error ? e.message : String(e),
    });
    return platformCache?.ids ?? null;
  }
}
