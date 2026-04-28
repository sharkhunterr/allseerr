import SuwayomiAPI from '@server/api/suwayomi';
import type { MangaMedia } from '@server/entity/MangaMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface SuwayomiDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a manga request to the configured Suwayomi (Tachidesk)
 * instance. Mirrors binderyDispatcher.ts shape so the subscriber can
 * call us with the same try / fallback pattern.
 *
 * Mutates `media.downloadManagerExternalId` on success but does NOT
 * persist — caller is responsible for saving.
 *
 * Strategy:
 *   1. Search every Suwayomi-enabled source for the manga title and
 *      pick the first hit. AniList ids don't translate directly to
 *      source-specific ids so a title search is the lowest-friction
 *      option for a first iteration.
 *   2. Add the matched manga to the Suwayomi library — that's the
 *      trigger that makes Suwayomi start downloading chapters.
 *   3. Stash the Suwayomi numeric id back on the MangaMedia row as
 *      the externalId so the scanner / detail page can show
 *      progress.
 */
export async function submitToSuwayomi(
  media: MangaMedia
): Promise<SuwayomiDispatchResult> {
  const settings = getSettings();
  const cfg = settings.manga?.suwayomi;

  if (!cfg?.enabled || !cfg.url) {
    return {
      success: false,
      noInstance: true,
      message: 'Suwayomi is not configured. Manga request stays manual.',
    };
  }

  try {
    const api = new SuwayomiAPI({
      url: cfg.url,
      apiKey: cfg.apiKey || undefined,
      username: cfg.username || undefined,
      password: cfg.password || undefined,
    });

    // 1. Title-based source search. We use the native title when
    // available — Japanese / Korean / Chinese titles match the
    // source catalogues more reliably than the romanised English
    // one for non-jp manga.
    const query = media.titleNative || media.title;
    if (!query) {
      return {
        success: false,
        message: 'Manga has no title to search Suwayomi with.',
      };
    }

    const hits = await api.searchSources(query, 5);
    if (hits.length === 0) {
      logger.info('Suwayomi: no source hit for manga', {
        label: 'suwayomi',
        title: query,
      });
      return {
        success: false,
        message: `No Suwayomi source returned a hit for "${query}".`,
      };
    }

    // Heuristic match: exact title (case-insensitive) wins, then
    // first hit. We don't have any structured rerank signal here —
    // covers / years aren't part of the source search payload.
    const lower = query.toLowerCase();
    const match = hits.find((h) => h.title.toLowerCase() === lower) ?? hits[0];

    // 2. Add to library → triggers chapter discovery + download.
    const ok = await api.addToLibrary(match.id);
    if (!ok) {
      return {
        success: false,
        message: 'Suwayomi rejected the addToLibrary mutation.',
      };
    }

    // Best-effort chapter refresh — not fatal if Suwayomi rejects it.
    await api.fetchChapters(match.id);

    // 3. Stash the external id on the entity. Caller saves.
    media.downloadManagerExternalId = String(match.id);
    if (match.url) {
      media.libraryServerUrl = `${cfg.publicUrl || cfg.url}${match.url}`;
    }

    logger.info(`Manga dispatched to Suwayomi: ${query} → id ${match.id}`, {
      label: 'suwayomi',
      mangaMediaId: media.id,
      suwayomiId: match.id,
      sourceId: match.source?.id,
    });

    return {
      success: true,
      externalId: String(match.id),
      message: `Added "${match.title}" to Suwayomi library.`,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Suwayomi dispatch failed', {
      label: 'suwayomi',
      mangaMediaId: media.id,
      error: message,
    });
    return { success: false, message };
  }
}
