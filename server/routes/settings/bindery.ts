import BinderyAPI from '@server/api/servarr/bindery';
import type { BinderySettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const binderyRoutes = Router();

binderyRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  res.status(200).json(settings.bindery);
});

binderyRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newBindery = req.body as BinderySettings;
  const lastItem = settings.bindery[settings.bindery.length - 1];
  newBindery.id = lastItem ? lastItem.id + 1 : 0;

  // Only one default per mediaType
  if (req.body.isDefault) {
    settings.bindery
      .filter((b) => b.mediaType === req.body.mediaType)
      .forEach((b) => {
        b.isDefault = false;
      });
  }

  settings.bindery = [...settings.bindery, newBindery];
  await settings.save();

  return res.status(201).json(newBindery);
});

binderyRoutes.post<
  undefined,
  Record<string, unknown>,
  BinderySettings & { tagLabel?: string }
>('/test', async (req, res, next) => {
  try {
    const bindery = new BinderyAPI({
      apiKey: req.body.apiKey,
      url: BinderyAPI.buildUrl(req.body, '/api/v1'),
    });

    const urlBase = await bindery
      .getSystemStatus()
      .then((value) => value.urlBase)
      .catch(() => req.body.baseUrl);
    const profiles = await bindery.getProfiles();
    const folders = await bindery.getRootFolders();
    const tags = await bindery.getTags();

    return res.status(200).json({
      profiles,
      rootFolders: folders.map((folder) => ({
        id: folder.id,
        path: folder.path,
      })),
      tags,
      urlBase,
    });
  } catch (e) {
    logger.error('Failed to test Bindery', {
      label: 'Bindery',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Bindery' });
  }
});

binderyRoutes.put<{ id: string }, BinderySettings, BinderySettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const binderyIndex = settings.bindery.findIndex(
      (b) => b.id === Number(req.params.id)
    );

    if (binderyIndex === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    if (req.body.isDefault) {
      settings.bindery
        .filter((b) => b.mediaType === req.body.mediaType)
        .forEach((b) => {
          b.isDefault = false;
        });
    }

    settings.bindery[binderyIndex] = {
      ...req.body,
      id: Number(req.params.id),
    } as BinderySettings;
    await settings.save();

    return res.status(200).json(settings.bindery[binderyIndex]);
  }
);

binderyRoutes.get<{ id: string }>('/:id/profiles', async (req, res, next) => {
  const settings = getSettings();

  const binderySettings = settings.bindery.find(
    (b) => b.id === Number(req.params.id)
  );

  if (!binderySettings) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const bindery = new BinderyAPI({
    apiKey: binderySettings.apiKey,
    url: BinderyAPI.buildUrl(binderySettings, '/api/v1'),
  });

  const profiles = await bindery.getProfiles();

  return res.status(200).json(
    profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }))
  );
});

binderyRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const binderyIndex = settings.bindery.findIndex(
    (b) => b.id === Number(req.params.id)
  );

  if (binderyIndex === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.bindery.splice(binderyIndex, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default binderyRoutes;
