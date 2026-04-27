import HardcoverAPI from '@server/api/hardcover';
import BookshelfAPI from '@server/api/servarr/bookshelf';
import { MediaType } from '@server/constants/media';
import type { AudiobookMedia } from '@server/entity/AudiobookMedia';
import type { BookMedia } from '@server/entity/BookMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface BookshelfDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a book/audiobook to the default Bookshelf instance (if configured)
 * for the given media type. Mutates `media.downloadManagerExternalId` on
 * success but does NOT persist — caller is responsible for saving.
 */
export async function submitToBookshelf(
  media: BookMedia | AudiobookMedia,
  mediaType: MediaType
): Promise<BookshelfDispatchResult> {
  const settings = getSettings();
  const targetType = mediaType === MediaType.AUDIOBOOK ? 'audiobook' : 'book';

  const instance = settings.bookshelf.find(
    (b) => b.mediaType === targetType && b.isDefault
  );

  if (!instance) {
    return {
      success: false,
      noInstance: true,
      message: `No default Bookshelf server configured for ${targetType}.`,
    };
  }

  if (!media.authorName || media.authorName.toLowerCase() === 'unknown') {
    // Bookshelf resolves author via free-text /author/lookup, so we need a
    // real author name. OpenLibrary work keys can't help here because
    // Bookshelf uses Goodreads/Hardcover IDs internally.
    logger.warn('Cannot dispatch to Bookshelf: missing or unknown authorName', {
      label: 'bookshelf',
      title: media.title,
      authorName: media.authorName,
    });
    return {
      success: false,
      message: 'Media has no author name; Bookshelf requires one.',
    };
  }

  try {
    const api = new BookshelfAPI({
      apiKey: instance.apiKey,
      url: BookshelfAPI.buildUrl(instance, '/api/v1'),
    });

    // Pass through every identifier we have — Bookshelf will pick the
    // most reliable one (ISBN > ASIN > title+author > englishTitle+author).
    const mediaIsbn13 =
      'isbn13' in media ? (media as { isbn13?: string }).isbn13 : undefined;
    const mediaIsbn10 =
      'isbn10' in media ? (media as { isbn10?: string }).isbn10 : undefined;
    const mediaAsin =
      'asin' in media ? (media as { asin?: string }).asin : undefined;

    // For audiobooks with an ASIN, ask Hardcover for the canonical
    // English title before dispatching. Bookshelf's underlying
    // metadata source frequently doesn't index the localised title
    // the user requested under (e.g. an Audible French audiobook
    // whose Hardcover record only exists as the original English
    // edition), so an English-title retry rescues the dispatch.
    // Best-effort — failures don't block the dispatch.
    let englishTitle: string | undefined;
    if (mediaAsin && mediaType === MediaType.AUDIOBOOK) {
      const bookCfg = settings.book?.metadataProviders;
      if (bookCfg?.hardcoverApiKey) {
        try {
          const hc = new HardcoverAPI(bookCfg.hardcoverApiKey);
          const hit = await hc.searchAudiobookByAsin(mediaAsin);
          if (
            hit?.title &&
            hit.title.toLowerCase().trim() !== media.title.toLowerCase().trim()
          ) {
            englishTitle = hit.title;
            logger.info('Bookshelf dispatch: resolved English title fallback', {
              label: 'bookshelf',
              asin: mediaAsin,
              localised: media.title,
              english: englishTitle,
            });
          }
        } catch (e) {
          logger.debug('Bookshelf dispatch: Hardcover ASIN lookup skipped', {
            label: 'bookshelf',
            asin: mediaAsin,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }

    const book = await api.addBook({
      title: media.title,
      authorName: media.authorName,
      isbn13: mediaIsbn13 ?? undefined,
      isbn10: mediaIsbn10 ?? undefined,
      asin: mediaAsin ?? undefined,
      englishTitle,
      foreignBookId: media.foreignBookId,
      foreignAuthorId: media.foreignAuthorId ?? undefined,
      qualityProfileId: instance.activeProfileId,
      metadataProfileId: instance.metadataProfileId ?? 1,
      rootFolderPath: instance.activeDirectory,
      tags: instance.tags ?? [],
      monitored: true,
      searchNow: !instance.preventSearch,
    });

    media.downloadManagerExternalId = String(book.id);

    logger.info(
      `Dispatched to Bookshelf (${instance.name}): ${media.title}`,
      {
        label: 'bookshelf',
        mediaType: targetType,
        bookshelfBookId: book.id,
      }
    );

    return { success: true, externalId: String(book.id) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Bookshelf submission failed for ${media.title}`, {
      label: 'bookshelf',
      error: message,
    });
    return { success: false, message };
  }
}
