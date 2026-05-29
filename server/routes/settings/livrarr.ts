import LivrarrAPI from '@server/api/livrarr';
import type { LivrarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const livrarrRoutes = Router();

/**
 * Settings CRUD for Livrarr instances. Mirrors the Bookshelf
 * settings router shape (GET / POST / PUT / DELETE + a /test
 * endpoint) so the frontend modal can reuse the same plumbing.
 *
 * Multi-default guard: only one downloader per mediaType. When
 * the operator marks a Livrarr instance as default for "book" we
 * clear the default flag on any other Livrarr / Bookshelf /
 * Bindery instance for that same mediaType — same mutual-
 * exclusion rule the Bookshelf route enforces against Bindery.
 */

function clearOtherDefaults(
  mediaType: 'book' | 'audiobook',
  excludeLivrarrId?: number
): void {
  const settings = getSettings();
  let touched = false;

  settings.livrarr
    .filter((l) => l.mediaType === mediaType && l.id !== excludeLivrarrId)
    .forEach((l) => {
      if (l.isDefault) {
        l.isDefault = false;
        touched = true;
      }
    });
  if (touched) settings.livrarr = [...settings.livrarr];

  const bookshelfCleared = settings.bookshelf.filter(
    (b) => b.mediaType === mediaType && b.isDefault
  );
  if (bookshelfCleared.length > 0) {
    bookshelfCleared.forEach((b) => {
      b.isDefault = false;
    });
    settings.bookshelf = [...settings.bookshelf];
    logger.info(
      `Cleared Bookshelf default(s) for ${mediaType} (Livrarr is now default)`,
      { label: 'livrarr-settings' }
    );
  }

  const binderyCleared = settings.bindery.filter(
    (b) => b.mediaType === mediaType && b.isDefault
  );
  if (binderyCleared.length > 0) {
    binderyCleared.forEach((b) => {
      b.isDefault = false;
    });
    settings.bindery = [...settings.bindery];
    logger.info(
      `Cleared Bindery default(s) for ${mediaType} (Livrarr is now default)`,
      { label: 'livrarr-settings' }
    );
  }
}

livrarrRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  res.status(200).json(settings.livrarr);
});

livrarrRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newLivrarr = req.body as LivrarrSettings;
  const lastItem = settings.livrarr[settings.livrarr.length - 1];
  newLivrarr.id = lastItem ? lastItem.id + 1 : 0;

  if (req.body.isDefault) {
    clearOtherDefaults(newLivrarr.mediaType);
  }

  settings.livrarr = [...settings.livrarr, newLivrarr];
  await settings.save();

  return res.status(201).json(newLivrarr);
});

livrarrRoutes.post<undefined, Record<string, unknown>, LivrarrSettings>(
  '/test',
  async (req, res, next) => {
    try {
      const api = new LivrarrAPI({
        apiKey: req.body.apiKey,
        url: LivrarrAPI.buildUrl(req.body, '/api/v1'),
      });

      // ``testConnection`` hits /system/status — confirms host
      // reachability + that the API key is accepted. The root
      // folder list is informational (so the modal can show the
      // operator where Livrarr will drop downloads) and falls
      // back to [] if the older Livrarr release predates the
      // endpoint.
      const status = await api.testConnection();
      const rootFolders = await api.getRootFolders().catch(() => []);

      return res.status(200).json({
        status,
        rootFolders: rootFolders.map((folder) => ({
          id: folder.id,
          path: folder.path,
        })),
      });
    } catch (e) {
      logger.error('Failed to test Livrarr', {
        label: 'Livrarr',
        message: e instanceof Error ? e.message : String(e),
      });
      next({ status: 500, message: 'Failed to connect to Livrarr' });
    }
  }
);

livrarrRoutes.put<{ id: string }, LivrarrSettings, LivrarrSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const idx = settings.livrarr.findIndex(
      (l) => l.id === Number(req.params.id)
    );

    if (idx === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    if (req.body.isDefault) {
      clearOtherDefaults(req.body.mediaType, Number(req.params.id));
    }

    settings.livrarr[idx] = {
      ...req.body,
      id: Number(req.params.id),
    } as LivrarrSettings;
    await settings.save();

    return res.status(200).json(settings.livrarr[idx]);
  }
);

livrarrRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const idx = settings.livrarr.findIndex(
    (l) => l.id === Number(req.params.id)
  );

  if (idx === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.livrarr.splice(idx, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default livrarrRoutes;
