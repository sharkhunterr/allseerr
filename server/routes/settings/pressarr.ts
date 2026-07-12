import PressarrAPI from '@server/api/servarr/pressarr';
import type { PressarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const pressarrRoutes = Router();

/**
 * Settings CRUD for Pressarr instances. Same shape as the
 * Bookshelf / Bindery routes so the frontend modal can reuse
 * the same plumbing — only difference is the mediaType is
 * hard-pinned to ``magazine`` (pressarr only handles
 * periodicals).
 */

pressarrRoutes.get('/', (_req, res) => {
  res.status(200).json(getSettings().pressarr);
});

pressarrRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newPressarr = req.body as PressarrSettings;
  // Force the mediaType in case the modal forgot to send it —
  // pressarr only handles magazines, no per-instance choice.
  newPressarr.mediaType = 'magazine';
  const lastItem = settings.pressarr[settings.pressarr.length - 1];
  newPressarr.id = lastItem ? lastItem.id + 1 : 0;

  if (req.body.isDefault) {
    settings.pressarr
      .filter((p) => p.mediaType === 'magazine')
      .forEach((p) => {
        p.isDefault = false;
      });
  }

  settings.pressarr = [...settings.pressarr, newPressarr];
  await settings.save();

  return res.status(201).json(newPressarr);
});

pressarrRoutes.post<undefined, Record<string, unknown>, PressarrSettings>(
  '/test',
  async (req, res, next) => {
    try {
      const pressarr = new PressarrAPI({
        apiKey: req.body.apiKey,
        url: PressarrAPI.buildUrl(req.body, '/api/v1'),
      });
      const urlBase = await pressarr
        .getSystemStatus()
        .then((value) => value.urlBase)
        .catch(() => req.body.baseUrl);
      const profiles = await pressarr.getProfiles();
      const folders = await pressarr.getPressarrRootFolders();

      return res.status(200).json({
        profiles,
        rootFolders: folders.map((folder) => ({
          id: folder.id,
          path: folder.path,
        })),
        urlBase,
      });
    } catch (e) {
      logger.error('Failed to test Pressarr', {
        label: 'Pressarr',
        message: e instanceof Error ? e.message : String(e),
      });
      next({ status: 500, message: 'Failed to connect to Pressarr' });
    }
  }
);

pressarrRoutes.put<{ id: string }, PressarrSettings, PressarrSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const idx = settings.pressarr.findIndex(
      (p) => p.id === Number(req.params.id)
    );

    if (idx === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    if (req.body.isDefault) {
      settings.pressarr
        .filter((p) => p.mediaType === 'magazine')
        .forEach((p) => {
          p.isDefault = false;
        });
    }

    settings.pressarr[idx] = {
      ...req.body,
      mediaType: 'magazine',
      id: Number(req.params.id),
    } as PressarrSettings;
    await settings.save();

    return res.status(200).json(settings.pressarr[idx]);
  }
);

pressarrRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const idx = settings.pressarr.findIndex(
    (p) => p.id === Number(req.params.id)
  );

  if (idx === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.pressarr.splice(idx, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default pressarrRoutes;
