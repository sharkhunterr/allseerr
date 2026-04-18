import { KomgaAdapter } from '@server/lib/adapters/book/KomgaAdapter';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const komgaSettingsRoutes = Router();

komgaSettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  const k = settings.book.komga;

  return res.status(200).json({
    url: k.url,
    publicUrl: k.publicUrl,
    apiKey: '',
    apiKeySet: !!k.apiKey,
    pollIntervalMinutes: k.pollIntervalMinutes,
    enabled: k.enabled,
  });
});

komgaSettingsRoutes.put('/', async (req, res) => {
  const settings = getSettings();
  const body = req.body as {
    url?: string;
    publicUrl?: string;
    apiKey?: string;
    pollIntervalMinutes?: number;
    enabled?: boolean;
  };

  settings.book = {
    ...settings.book,
    komga: {
      url: body.url ?? settings.book.komga.url,
      publicUrl: body.publicUrl ?? settings.book.komga.publicUrl,
      apiKey: body.apiKey || settings.book.komga.apiKey,
      pollIntervalMinutes:
        body.pollIntervalMinutes ?? settings.book.komga.pollIntervalMinutes,
      enabled: body.enabled ?? settings.book.komga.enabled,
    },
  };

  await settings.save();

  return res.status(200).json({
    url: settings.book.komga.url,
    publicUrl: settings.book.komga.publicUrl,
    apiKey: '',
    apiKeySet: !!settings.book.komga.apiKey,
    pollIntervalMinutes: settings.book.komga.pollIntervalMinutes,
    enabled: settings.book.komga.enabled,
  });
});

komgaSettingsRoutes.post('/test', async (req, res) => {
  const settings = getSettings();
  const { url, apiKey } = req.body as { url?: string; apiKey?: string };

  try {
    const parsedUrl = new URL(url || settings.book.komga.url);
    const adapter = new KomgaAdapter({
      hostname: parsedUrl.hostname,
      port:
        parseInt(parsedUrl.port) ||
        (parsedUrl.protocol === 'https:' ? 443 : 80),
      apiKey: apiKey || settings.book.komga.apiKey,
      useSsl: parsedUrl.protocol === 'https:',
    });

    const result = await adapter.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    logger.error('Komga test connection failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : 'Invalid Komga URL',
    });
  }
});

komgaSettingsRoutes.post('/scan', async (_req, res) => {
  try {
    const { komgaScanner } = await import('@server/lib/scanners/komga');
    komgaScanner.run();
    return res.status(200).json({ success: true, message: 'Scan triggered.' });
  } catch (e) {
    logger.error('Komga scan failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Scan failed',
    });
  }
});

export default komgaSettingsRoutes;
