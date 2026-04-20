import BookshelfAPI from '@server/api/servarr/bookshelf';
import type { BookshelfSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const bookshelfRoutes = Router();

bookshelfRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  res.status(200).json(settings.bookshelf);
});

bookshelfRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newBookshelf = req.body as BookshelfSettings;
  const lastItem = settings.bookshelf[settings.bookshelf.length - 1];
  newBookshelf.id = lastItem ? lastItem.id + 1 : 0;

  // Only one download-manager default per mediaType (Bindery and Bookshelf
  // are mutually exclusive for the same media type).
  if (req.body.isDefault) {
    settings.bookshelf
      .filter((b) => b.mediaType === req.body.mediaType)
      .forEach((b) => {
        b.isDefault = false;
      });
    const binderyCleared = settings.bindery.filter(
      (b) => b.mediaType === req.body.mediaType && b.isDefault
    );
    if (binderyCleared.length > 0) {
      binderyCleared.forEach((b) => {
        b.isDefault = false;
      });
      settings.bindery = [...settings.bindery];
      logger.info(
        `Cleared Bindery default(s) for ${req.body.mediaType} (Bookshelf is now default)`,
        { label: 'bookshelf-settings' }
      );
    }
  }

  settings.bookshelf = [...settings.bookshelf, newBookshelf];
  await settings.save();

  return res.status(201).json(newBookshelf);
});

bookshelfRoutes.post<
  undefined,
  Record<string, unknown>,
  BookshelfSettings & { tagLabel?: string }
>('/test', async (req, res, next) => {
  try {
    const bookshelf = new BookshelfAPI({
      apiKey: req.body.apiKey,
      url: BookshelfAPI.buildUrl(req.body, '/api/v1'),
    });

    const urlBase = await bookshelf
      .getSystemStatus()
      .then((value) => value.urlBase)
      .catch(() => req.body.baseUrl);
    const profiles = await bookshelf.getProfiles();
    const metadataProfiles = await bookshelf.getMetadataProfiles().catch(() => []);
    const folders = await bookshelf.getRootFolders();
    const tags = await bookshelf.getTags();

    return res.status(200).json({
      profiles,
      metadataProfiles,
      rootFolders: folders.map((folder) => ({
        id: folder.id,
        path: folder.path,
      })),
      tags,
      urlBase,
    });
  } catch (e) {
    logger.error('Failed to test Bookshelf', {
      label: 'Bookshelf',
      message: e.message,
    });

    next({ status: 500, message: 'Failed to connect to Bookshelf' });
  }
});

bookshelfRoutes.put<{ id: string }, BookshelfSettings, BookshelfSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const idx = settings.bookshelf.findIndex(
      (b) => b.id === Number(req.params.id)
    );

    if (idx === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    if (req.body.isDefault) {
      settings.bookshelf
        .filter((b) => b.mediaType === req.body.mediaType)
        .forEach((b) => {
          b.isDefault = false;
        });
      const binderyCleared = settings.bindery.filter(
        (b) => b.mediaType === req.body.mediaType && b.isDefault
      );
      if (binderyCleared.length > 0) {
        binderyCleared.forEach((b) => {
          b.isDefault = false;
        });
        settings.bindery = [...settings.bindery];
        logger.info(
          `Cleared Bindery default(s) for ${req.body.mediaType} (Bookshelf is now default)`,
          { label: 'bookshelf-settings' }
        );
      }
    }

    settings.bookshelf[idx] = {
      ...req.body,
      id: Number(req.params.id),
    } as BookshelfSettings;
    await settings.save();

    return res.status(200).json(settings.bookshelf[idx]);
  }
);

bookshelfRoutes.get<{ id: string }>('/:id/profiles', async (req, res, next) => {
  const settings = getSettings();

  const s = settings.bookshelf.find((b) => b.id === Number(req.params.id));

  if (!s) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const bookshelf = new BookshelfAPI({
    apiKey: s.apiKey,
    url: BookshelfAPI.buildUrl(s, '/api/v1'),
  });

  const profiles = await bookshelf.getProfiles();

  return res.status(200).json(
    profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
    }))
  );
});

bookshelfRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const idx = settings.bookshelf.findIndex(
    (b) => b.id === Number(req.params.id)
  );

  if (idx === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.bookshelf.splice(idx, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default bookshelfRoutes;
