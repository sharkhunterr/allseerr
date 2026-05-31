import BinderyAPI from '@server/api/servarr/bindery';
import { MediaType } from '@server/constants/media';
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

    // Bindery's only supported primary metadata providers are openlibrary
    // and dnb — both keyed by OpenLibrary-shaped IDs (OL...W, OL...A).
    // When allseerr's book metadata provider is anything else (e.g.
    // Hardcover), media.foreignBookId is in that other provider's
    // dialect (e.g. "hardcover:428506") which Bindery's primary
    // pipeline can't resolve. Bridge through ISBN → Bindery's own
    // /book/lookup so we hand it the OpenLibrary IDs it expects.
    let foreignBookId = media.foreignBookId;
    let foreignAuthorId = media.foreignAuthorId ?? undefined;
    let resolvedAuthorName = media.authorName;

    const looksLikeOpenLibraryWork = (id?: string | null) =>
      !!id && /^OL\d+W$/i.test(id.replace(/^\/works\//, ''));

    if (!looksLikeOpenLibraryWork(foreignBookId) && media.isbn13) {
      const looked = await api.lookupBookByIsbn(media.isbn13);
      if (looked?.foreignBookId) {
        logger.info(
          `Bridged Bindery IDs via ISBN ${media.isbn13}: ${media.foreignBookId} → ${looked.foreignBookId}`,
          { label: 'bindery' }
        );
        foreignBookId = looked.foreignBookId;
        foreignAuthorId = looked.foreignAuthorId ?? foreignAuthorId;
        resolvedAuthorName = looked.authorName ?? resolvedAuthorName;
      } else {
        logger.warn(
          `Bindery ISBN lookup returned nothing for ${media.title}; will try authorName fallback`,
          { label: 'bindery', isbn13: media.isbn13 }
        );
      }
    }

    // Fallback for authorId still unresolved: try Bindery's author search.
    if (
      !foreignAuthorId &&
      resolvedAuthorName &&
      resolvedAuthorName.toLowerCase() !== 'unknown' &&
      resolvedAuthorName.toLowerCase() !== 'unknown author'
    ) {
      const matches = await api.searchAuthor(resolvedAuthorName);
      foreignAuthorId = matches[0]?.foreignAuthorId;
      if (foreignAuthorId) {
        logger.info(
          `Resolved foreignAuthorId via Bindery author search: ${resolvedAuthorName} → ${foreignAuthorId}`,
          { label: 'bindery' }
        );
      }
    }

    if (!foreignAuthorId) {
      logger.warn(`Cannot dispatch to Bindery: no foreignAuthorId resolvable`, {
        label: 'bindery',
        title: media.title,
        authorName: resolvedAuthorName,
        foreignBookId,
      });
      return {
        success: false,
        message: 'Unable to resolve Bindery foreignAuthorId for this media.',
      };
    }

    let binderyBookId: number;
    const addBookOnce = () =>
      api.addBook({
        foreignBookId,
        foreignAuthorId,
        authorName: resolvedAuthorName,
        searchNow: !instance.preventSearch,
      });

    const is404 = (err: unknown) => {
      const axErr =
        ((err as { cause?: { response?: { status?: number } } })?.cause as {
          response?: { status?: number };
        }) ??
        (err as { response?: { status?: number } });
      return axErr?.response?.status === 404;
    };

    try {
      // Bindery's internal author-then-book sync can outlast its own poll
      // window for slow upstream metadata sources. When it 404s with
      // "try again shortly", retry a few times before falling back —
      // by then the author + book records have usually landed.
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let added;
      try {
        added = await addBookOnce();
      } catch (e1) {
        if (!is404(e1)) throw e1;
        logger.info(
          `Bindery sync incomplete for ${media.title}; retrying after 10s`,
          { label: 'bindery' }
        );
        await sleep(10_000);
        try {
          added = await addBookOnce();
        } catch (e2) {
          if (!is404(e2)) throw e2;
          logger.info(
            `Bindery sync still incomplete for ${media.title}; final retry after 20s`,
            { label: 'bindery' }
          );
          await sleep(20_000);
          added = await addBookOnce();
        }
      }
      binderyBookId = added.id;
    } catch (e) {
      if (!is404(e)) {
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
