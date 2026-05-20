import RomarrAPI from '@server/api/romarr';
import type { ConnectionTestResult } from '@server/lib/adapters/interfaces';
import type { RomarrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const romarrRoutes = Router();

romarrRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  res.status(200).json(settings.romarr);
});

romarrRoutes.post('/', async (req, res) => {
  const settings = getSettings();

  const newRomarr = req.body as RomarrSettings;
  const lastItem = settings.romarr[settings.romarr.length - 1];
  newRomarr.id = lastItem ? lastItem.id + 1 : 0;

  // Only one default Romarr instance — the subscriber dispatches
  // approved game requests to whichever is marked default.
  if (newRomarr.isDefault) {
    settings.romarr.forEach((r) => {
      r.isDefault = false;
    });
  }

  settings.romarr = [...settings.romarr, newRomarr];
  await settings.save();

  return res.status(201).json(newRomarr);
});

romarrRoutes.post<undefined, ConnectionTestResult, RomarrSettings>(
  '/test',
  async (req, res, next) => {
    try {
      const romarr = new RomarrAPI({
        apiKey: req.body.apiKey,
        url: RomarrAPI.buildUrl(req.body),
      });

      const result = await romarr.testConnection();
      if (!result.success) {
        return next({ status: 500, message: result.message });
      }

      return res.status(200).json(result);
    } catch (e) {
      logger.error('Failed to test Romarr', {
        label: 'Romarr',
        message: e instanceof Error ? e.message : String(e),
      });

      next({ status: 500, message: 'Failed to connect to Romarr' });
    }
  }
);

romarrRoutes.put<{ id: string }, RomarrSettings, RomarrSettings>(
  '/:id',
  async (req, res, next) => {
    const settings = getSettings();

    const romarrIndex = settings.romarr.findIndex(
      (r) => r.id === Number(req.params.id)
    );

    if (romarrIndex === -1) {
      return next({ status: '404', message: 'Settings instance not found' });
    }

    if (req.body.isDefault) {
      settings.romarr.forEach((r) => {
        r.isDefault = false;
      });
    }

    settings.romarr[romarrIndex] = {
      ...req.body,
      id: Number(req.params.id),
    } as RomarrSettings;
    await settings.save();

    return res.status(200).json(settings.romarr[romarrIndex]);
  }
);

romarrRoutes.delete<{ id: string }>('/:id', async (req, res, next) => {
  const settings = getSettings();

  const romarrIndex = settings.romarr.findIndex(
    (r) => r.id === Number(req.params.id)
  );

  if (romarrIndex === -1) {
    return next({ status: '404', message: 'Settings instance not found' });
  }

  const removed = settings.romarr.splice(romarrIndex, 1);
  await settings.save();

  return res.status(200).json(removed[0]);
});

export default romarrRoutes;
