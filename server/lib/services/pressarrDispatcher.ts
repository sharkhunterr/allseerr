import PressarrAPI from '@server/api/servarr/pressarr';
import type { MagazineMedia } from '@server/entity/MagazineMedia';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

export interface PressarrDispatchResult {
  success: boolean;
  externalId?: string;
  message?: string;
  noInstance?: boolean;
}

/**
 * Submit a magazine request to the default Pressarr instance
 * (if configured). Mutates ``media.downloadManagerExternalId``
 * on success but does NOT persist — caller is responsible for
 * saving.
 *
 * Same contract as the other DM dispatchers (Bindery / Bookshelf
 * / Livrarr) so MediaRequestSubscriber can wire it into the
 * same cascade without per-type branching.
 */
export async function submitToPressarr(
  media: MagazineMedia
): Promise<PressarrDispatchResult> {
  const settings = getSettings();

  const instance = settings.pressarr.find(
    (p) => p.mediaType === 'magazine' && p.isDefault
  );

  if (!instance) {
    return {
      success: false,
      noInstance: true,
      message: 'No default Pressarr server configured for magazines.',
    };
  }

  try {
    const api = new PressarrAPI({
      apiKey: instance.apiKey,
      url: PressarrAPI.buildUrl(instance, '/api/v1'),
    });

    // Pressarr stores root folders as a numeric id, but the
    // settings UI persists ``activeDirectory`` as the operator's
    // chosen path string (to stay consistent with the Bindery /
    // Bookshelf modal shape). Resolve the path → id at dispatch
    // time so we don't have to migrate settings every time the
    // operator changes folders.
    const rootFolders = await api.getPressarrRootFolders();
    const matchedRoot = rootFolders.find(
      (f) => f.path === instance.activeDirectory
    );
    const rootFolderId = matchedRoot?.id ?? rootFolders[0]?.id;

    if (rootFolderId == null) {
      logger.warn(
        'Pressarr dispatch: no root folder available on instance',
        {
          label: 'pressarr',
          configuredPath: instance.activeDirectory,
          instanceName: instance.name,
        }
      );
      return {
        success: false,
        message:
          'Pressarr returned no root folders. Add one inside Pressarr first.',
      };
    }

    const magazine = await api.createMagazine({
      title: media.title,
      issn: media.issn ?? undefined,
      publisher: media.publisher ?? undefined,
      description: media.description ?? undefined,
      frequency: media.frequency ?? undefined,
      metadataProvider: media.googleBooksId ? 'googlebooks' : undefined,
      metadataProviderId: media.googleBooksId ?? undefined,
      rootFolderId,
      qualityProfileId: instance.activeProfileId,
      monitored: true,
      searchForMissingIssues: !instance.preventSearch,
    });

    media.downloadManagerExternalId = String(magazine.id);

    logger.info(
      `Dispatched to Pressarr (${instance.name}): ${media.title}`,
      {
        label: 'pressarr',
        pressarrMagazineId: magazine.id,
      }
    );

    return { success: true, externalId: String(magazine.id) };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Pressarr submission failed for ${media.title}`, {
      label: 'pressarr',
      error: message,
    });
    return { success: false, message };
  }
}
