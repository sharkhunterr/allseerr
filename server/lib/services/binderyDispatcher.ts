import BinderyAPI from '@server/api/servarr/bindery';
import { MediaStatus, MediaType } from '@server/constants/media';
import type { AudiobookMedia } from '@server/entity/AudiobookMedia';
import type { BookMedia } from '@server/entity/BookMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface BinderyDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a book/audiobook to the default Bindery instance (if configured)
 * for the given media type. Mutates `media.downloadManagerExternalId` on
 * success but does NOT persist — caller is responsible for saving.
 */
export async function submitToBindery(
  media: BookMedia | AudiobookMedia,
  mediaType: MediaType
): Promise<BinderyDispatchResult> {
  const settings = getSettings();
  const targetType = mediaType === MediaType.AUDIOBOOK ? 'audiobook' : 'book';

  const instance = settings.bindery.find(
    (b) => b.mediaType === targetType && b.isDefault
  );

  if (!instance) {
    return {
      success: false,
      noInstance: true,
      message: `No default Bindery server configured for ${targetType}.`,
    };
  }

  try {
    const api = new BinderyAPI({
      apiKey: instance.apiKey,
      url: BinderyAPI.buildUrl(instance, '/api/v1'),
    });

    // Bindery's /author/book endpoint requires foreignAuthorId. If the
    // media entity doesn't have one stored (e.g. pre-existing requests
    // created before we plumbed author_key through OpenLibrary), resolve
    // via Bindery's author search as a best-effort fallback.
    let foreignAuthorId = media.foreignAuthorId ?? undefined;
    if (
      !foreignAuthorId &&
      media.authorName &&
      media.authorName.toLowerCase() !== 'unknown' &&
      media.authorName.toLowerCase() !== 'unknown author'
    ) {
      const matches = await api.searchAuthor(media.authorName);
      foreignAuthorId = matches[0]?.foreignAuthorId;
      if (foreignAuthorId) {
        logger.info(
          `Resolved foreignAuthorId via Bindery author search: ${media.authorName} → ${foreignAuthorId}`,
          { label: 'bindery' }
        );
      }
    }

    if (!foreignAuthorId) {
      logger.warn(`Cannot dispatch to Bindery: no foreignAuthorId resolvable`, {
        label: 'bindery',
        title: media.title,
        authorName: media.authorName,
        foreignBookId: media.foreignBookId,
      });
      return {
        success: false,
        message: 'Unable to resolve Bindery foreignAuthorId for this media.',
      };
    }

    let binderyBookId: number;
    try {
      const book = await api.addBook({
        foreignBookId: media.foreignBookId,
        foreignAuthorId,
        authorName: media.authorName,
        searchNow: !instance.preventSearch,
      });
      binderyBookId = book.id;
    } catch (e) {
      // Fallback for 404 "book not found after author sync": Bindery dedups
      // author catalogues by title and may drop the canonical OpenLibrary
      // Work. Look up the author's catalogue in Bindery and monitor the
      // closest title match instead. The axios response may be one or two
      // levels deep depending on whether addBook re-wraps the error.
      const axErr = (e?.cause as { response?: { status?: number } }) ?? e;
      const status = axErr?.response?.status;
      if (status !== 404) {
        throw e;
      }

      logger.info(
        `Bindery returned 404 for ${media.title}; trying title-match fallback`,
        { label: 'bindery' }
      );

      const author = await api.findAuthorByForeignId(foreignAuthorId);
      if (!author) {
        logger.warn('Bindery fallback: author not found after 404', {
          label: 'bindery',
          foreignAuthorId,
        });
        throw e;
      }

      const match = await api.findAuthorBookByTitle(author.id, media.title);
      if (!match) {
        logger.warn('Bindery fallback: no title match in author catalogue', {
          label: 'bindery',
          authorId: author.id,
          title: media.title,
        });
        throw e;
      }

      if (!match.monitored) {
        await api.setBookMonitored(match.id, true);
      }
      if (!instance.preventSearch) {
        await api.searchBook(match.id);
      }
      binderyBookId = match.id;
      logger.info(
        `Bindery fallback matched '${media.title}' → Bindery book ${match.id} '${match.title}'`,
        { label: 'bindery' }
      );
    }

    media.downloadManagerExternalId = String(binderyBookId);
    if (
      media.status === MediaStatus.UNKNOWN ||
      media.status === MediaStatus.PENDING
    ) {
      media.status = MediaStatus.PROCESSING;
    }

    logger.info(
      `Dispatched to Bindery (${instance.name}): ${media.title}`,
      {
        label: 'bindery',
        mediaType: targetType,
        binderyBookId,
      }
    );

    return { success: true, externalId: String(binderyBookId) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Bindery submission failed for ${media.title}`, {
      label: 'bindery',
      error: message,
    });
    return { success: false, message };
  }
}
