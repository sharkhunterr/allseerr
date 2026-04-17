import { AudiobookshelfAdapter } from '@server/lib/adapters/audiobook/AudiobookshelfAdapter';
import type { AudiobookshelfLibraryMapping } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const audiobookshelfSettingsRoutes = Router();

audiobookshelfSettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  const abs = settings.book.audiobookshelf;

  return res.status(200).json({
    url: abs.url,
    publicUrl: abs.publicUrl,
    apiKey: '',
    apiKeySet: !!abs.apiKey,
    pollIntervalMinutes: abs.pollIntervalMinutes,
    enabled: abs.enabled,
    libraries: abs.libraries,
  });
});

audiobookshelfSettingsRoutes.put('/', async (req, res) => {
  const settings = getSettings();
  const body = req.body as {
    url?: string;
    publicUrl?: string;
    apiKey?: string;
    pollIntervalMinutes?: number;
    enabled?: boolean;
    libraries?: AudiobookshelfLibraryMapping[];
  };

  settings.book = {
    ...settings.book,
    audiobookshelf: {
      url: body.url ?? settings.book.audiobookshelf.url,
      publicUrl: body.publicUrl ?? settings.book.audiobookshelf.publicUrl,
      apiKey: body.apiKey || settings.book.audiobookshelf.apiKey,
      pollIntervalMinutes:
        body.pollIntervalMinutes ??
        settings.book.audiobookshelf.pollIntervalMinutes,
      enabled: body.enabled ?? settings.book.audiobookshelf.enabled,
      libraries: body.libraries ?? settings.book.audiobookshelf.libraries,
    },
  };

  await settings.save();

  return res.status(200).json({
    url: settings.book.audiobookshelf.url,
    publicUrl: settings.book.audiobookshelf.publicUrl,
    apiKey: '',
    apiKeySet: !!settings.book.audiobookshelf.apiKey,
    pollIntervalMinutes: settings.book.audiobookshelf.pollIntervalMinutes,
    enabled: settings.book.audiobookshelf.enabled,
    libraries: settings.book.audiobookshelf.libraries,
  });
});

audiobookshelfSettingsRoutes.post('/test', async (req, res) => {
  const settings = getSettings();
  const { url, apiKey } = req.body as { url?: string; apiKey?: string };

  try {
    const parsedUrl = new URL(url || settings.book.audiobookshelf.url);
    const adapter = new AudiobookshelfAdapter({
      hostname: parsedUrl.hostname,
      port:
        parseInt(parsedUrl.port) ||
        (parsedUrl.protocol === 'https:' ? 443 : 80),
      apiKey: apiKey || settings.book.audiobookshelf.apiKey,
      useSsl: parsedUrl.protocol === 'https:',
    });

    const result = await adapter.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    logger.error('Audiobookshelf test connection failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : 'Invalid Audiobookshelf URL',
    });
  }
});

audiobookshelfSettingsRoutes.get('/libraries', async (_req, res) => {
  const settings = getSettings();
  const abs = settings.book.audiobookshelf;

  if (!abs.url || !abs.apiKey) {
    return res.status(400).json({
      status: 400,
      message: 'Audiobookshelf is not configured.',
    });
  }

  try {
    const parsedUrl = new URL(abs.url);
    const adapter = new AudiobookshelfAdapter({
      hostname: parsedUrl.hostname,
      port:
        parseInt(parsedUrl.port) ||
        (parsedUrl.protocol === 'https:' ? 443 : 80),
      apiKey: abs.apiKey,
      useSsl: parsedUrl.protocol === 'https:',
    });

    const libraries = await adapter.getLibrariesList();
    return res.status(200).json({ libraries });
  } catch (e) {
    logger.error('Audiobookshelf libraries fetch failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Failed to fetch libraries',
    });
  }
});

audiobookshelfSettingsRoutes.post('/scan', async (_req, res) => {
  try {
    const { audiobookshelfScanner } = await import(
      '@server/lib/scanners/audiobookshelf'
    );
    audiobookshelfScanner.run();
    return res.status(200).json({ success: true, message: 'Scan triggered.' });
  } catch (e) {
    logger.error('Audiobookshelf scan failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Scan failed',
    });
  }
});

export default audiobookshelfSettingsRoutes;
