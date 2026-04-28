import MylarAPI from '@server/api/mylar';
import type { ComicMedia } from '@server/entity/ComicMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface MylarDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a comic request to the configured Mylar3 instance. Mirrors
 * suwayomiDispatcher.ts: the subscriber calls us with the same
 * try / fallback pattern, we mutate `media.downloadManagerExternalId`
 * on success but the caller is responsible for saving.
 *
 * Strategy:
 *   1. Mylar3's `addComic` command takes a ComicVine id directly,
 *      so there's no source-search dance required (unlike Suwayomi).
 *      Just call addComic with the cached comicVineId.
 *   2. Stash the ComicVine id back on the row as the externalId so
 *      the scanner can poll Mylar's getComic for progress.
 *   3. Best-effort refreshComic to kick off the first scan.
 */
export async function submitToMylar(
  media: ComicMedia
): Promise<MylarDispatchResult> {
  const settings = getSettings();
  const cfg = settings.comic?.mylar;

  if (!cfg?.enabled || !cfg.url || !cfg.apiKey) {
    return {
      success: false,
      noInstance: true,
      message: 'Mylar3 is not configured. Comic request stays manual.',
    };
  }

  if (!media.comicVineId) {
    return {
      success: false,
      message: 'Comic has no ComicVine id to submit to Mylar.',
    };
  }

  try {
    const api = new MylarAPI({
      url: cfg.url,
      apiKey: cfg.apiKey,
    });

    const ok = await api.addComic(media.comicVineId);
    if (!ok) {
      return {
        success: false,
        message: 'Mylar rejected the addComic command.',
      };
    }

    // Best-effort refresh — not fatal if Mylar is busy.
    await api.refreshComic(media.comicVineId);

    media.downloadManagerExternalId = String(media.comicVineId);
    if (cfg.publicUrl || cfg.url) {
      // Mylar's series detail URL pattern is /comicDetails/<id>; the
      // public URL is what we expose for the "Open in Mylar" link.
      const base = (cfg.publicUrl || cfg.url).replace(/\/$/, '');
      media.libraryServerUrl = `${base}/comicDetails/${media.comicVineId}`;
    }

    logger.info(
      `Comic dispatched to Mylar: ${media.title} → comicvine:${media.comicVineId}`,
      {
        label: 'mylar',
        comicMediaId: media.id,
        comicVineId: media.comicVineId,
      }
    );

    return {
      success: true,
      externalId: String(media.comicVineId),
      message: `Added "${media.title}" to Mylar.`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Mylar dispatch failed', {
      label: 'mylar',
      comicMediaId: media.id,
      error: message,
    });
    return { success: false, message };
  }
}
