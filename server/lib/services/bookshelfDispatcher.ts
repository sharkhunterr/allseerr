import BookshelfAPI from '@server/api/servarr/bookshelf';
import { MediaStatus, MediaType } from '@server/constants/media';
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
    // most reliable one (ISBN > title+author).
    const mediaIsbn13 =
      'isbn13' in media ? (media as { isbn13?: string }).isbn13 : undefined;
    const mediaIsbn10 =
      'isbn10' in media ? (media as { isbn10?: string }).isbn10 : undefined;

    const book = await api.addBook({
      title: media.title,
      authorName: media.authorName,
      isbn13: mediaIsbn13 ?? undefined,
      isbn10: mediaIsbn10 ?? undefined,
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
    // Flip to PROCESSING so the book detail / search UI shows the blue
    // "requested" badge. Skip if already AVAILABLE (library scanner
    // might have marked it between request creation and dispatch).
    if (
      media.status === MediaStatus.UNKNOWN ||
      media.status === MediaStatus.PENDING
    ) {
      media.status = MediaStatus.PROCESSING;
    }

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
