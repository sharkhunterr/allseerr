import { getSettings, type MediaTypeToggles } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const mediaTypeSettingsRoutes = Router();

mediaTypeSettingsRoutes.get('/', (_req, res) => {
  try {
    return res.status(200).json(getSettings().mediaTypes);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read mediaTypes settings', {
      label: 'media-type-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

mediaTypeSettingsRoutes.put('/', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<MediaTypeToggles>;
    const current = settings.mediaTypes;

    const next: MediaTypeToggles = {
      book: typeof body.book === 'boolean' ? body.book : current.book,
      audiobook:
        typeof body.audiobook === 'boolean'
          ? body.audiobook
          : current.audiobook,
      game: typeof body.game === 'boolean' ? body.game : current.game,
      manga: typeof body.manga === 'boolean' ? body.manga : current.manga,
      comic: typeof body.comic === 'boolean' ? body.comic : current.comic,
      magazine:
        typeof body.magazine === 'boolean' ? body.magazine : current.magazine,
    };

    settings.mediaTypes = next;
    await settings.save();
    return res.status(200).json(settings.mediaTypes);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save mediaTypes settings', {
      label: 'media-type-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

export default mediaTypeSettingsRoutes;
