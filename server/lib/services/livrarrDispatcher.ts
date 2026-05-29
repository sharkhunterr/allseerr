import LivrarrAPI, {
  type LivrarrAddWorkPayload,
} from '@server/api/livrarr';
import { MediaType } from '@server/constants/media';
import type { AudiobookMedia } from '@server/entity/AudiobookMedia';
import type { BookMedia } from '@server/entity/BookMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface LivrarrDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Strip our internal ``hardcover:NNN`` / ``hcab:NNN`` prefixes and
 * the OpenLibrary path prefix so what's left is the raw OL work
 * key Livrarr understands (``OL12345W``). Returns ``undefined``
 * when the input doesn't look like an OpenLibrary id.
 */
function toOpenLibraryWorkKey(
  id: string | null | undefined
): string | undefined {
  if (!id) return undefined;
  // Hardcover / Audible-sourced rows use prefixed ids that Livrarr
  // can't resolve — fall through to ``undefined`` so the caller
  // can pass title+author instead.
  if (id.startsWith('hardcover:') || id.startsWith('hcab:')) return undefined;
  if (/^[A-Z0-9]{2,}$/i.test(id) && !id.startsWith('OL')) {
    // ASINs / arbitrary external ids — not OpenLibrary keys.
    return undefined;
  }
  const trimmed = id.replace(/^\/?works\//, '').replace(/^\/+/, '');
  return /^OL[0-9]+[WMA]$/i.test(trimmed) ? trimmed.toUpperCase() : undefined;
}

/**
 * Submit a book or audiobook to the default Livrarr instance for
 * the given media type. Mutates ``media.downloadManagerExternalId``
 * on success but does NOT persist — caller is responsible for
 * saving.
 *
 * Same shape + cascade contract as ``submitToBookshelf`` so the
 * subscriber can pick whichever downloader the operator made
 * default for the requested mediaType without branching.
 */
export async function submitToLivrarr(
  media: BookMedia | AudiobookMedia,
  mediaType: MediaType
): Promise<LivrarrDispatchResult> {
  const settings = getSettings();
  const targetType = mediaType === MediaType.AUDIOBOOK ? 'audiobook' : 'book';

  const instance = settings.livrarr.find(
    (l) => l.mediaType === targetType && l.isDefault
  );

  if (!instance) {
    return {
      success: false,
      noInstance: true,
      message: `No default Livrarr server configured for ${targetType}.`,
    };
  }

  try {
    const api = new LivrarrAPI({
      apiKey: instance.apiKey,
      url: LivrarrAPI.buildUrl(instance, '/api/v1'),
    });

    const olKey = toOpenLibraryWorkKey(media.foreignBookId);
    const authorOlKey = toOpenLibraryWorkKey(media.foreignAuthorId);
    const isbn13 =
      'isbn13' in media ? (media as { isbn13?: string }).isbn13 : undefined;
    const language =
      'language' in media
        ? (media as { language?: string }).language
        : undefined;
    const coverUrl =
      'coverUrl' in media
        ? (media as { coverUrl?: string }).coverUrl
        : undefined;
    const year =
      'releaseYear' in media
        ? (media as { releaseYear?: number }).releaseYear
        : undefined;

    const payload: LivrarrAddWorkPayload = {
      title: media.title,
      author_name: media.authorName ?? undefined,
      ol_key: olKey,
      author_ol_key: authorOlKey,
      isbn_13: isbn13 ?? undefined,
      language: language ?? undefined,
      cover_url: coverUrl ?? undefined,
      year,
    };

    const created = await api.addWork(payload);
    const workId = created.work?.id;
    if (typeof workId !== 'number') {
      logger.warn(
        'Livrarr addWork returned without an id; cannot continue dispatch',
        {
          label: 'livrarr',
          title: media.title,
          messages: created.messages,
        }
      );
      return {
        success: false,
        message: 'Livrarr accepted the work but did not return an id.',
      };
    }

    // Livrarr exposes per-format monitor flags (ebook vs audiobook).
    // The default after ``addWork`` is to monitor neither / both
    // depending on Livrarr's own preferences — explicitly set the
    // requested format on so the acquisition only fetches the
    // edition the user asked for.
    try {
      await api.updateWork(workId, {
        monitor_ebook: targetType === 'book',
        monitor_audiobook: targetType === 'audiobook',
      });
    } catch (e) {
      logger.warn(
        'Livrarr updateWork (monitor flag) failed; work created but flag may be off',
        {
          label: 'livrarr',
          workId,
          targetType,
          error: e instanceof Error ? e.message : String(e),
        }
      );
    }

    if (!instance.preventSearch) {
      // Fire-and-forget — refresh kicks off Livrarr's search cycle
      // for the work. Errors are logged inside the client.
      await api.refreshWork(workId);
    }

    media.downloadManagerExternalId = String(workId);

    logger.info(`Dispatched to Livrarr (${instance.name}): ${media.title}`, {
      label: 'livrarr',
      mediaType: targetType,
      livrarrWorkId: workId,
      authorCreated: created.author_created,
    });

    return { success: true, externalId: String(workId) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Livrarr submission failed for ${media.title}`, {
      label: 'livrarr',
      error: message,
    });
    return { success: false, message };
  }
}
