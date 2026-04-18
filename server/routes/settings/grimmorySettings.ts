import { GrimmoryAdapter } from '@server/lib/adapters/book/GrimmoryAdapter';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const grimmorySettingsRoutes = Router();

grimmorySettingsRoutes.get('/', (_req, res) => {
  const settings = getSettings();
  const g = settings.book.grimmory;

  return res.status(200).json({
    url: g.url,
    publicUrl: g.publicUrl,
    email: g.email,
    password: '',
    passwordSet: !!g.password,
    pollIntervalMinutes: g.pollIntervalMinutes,
    enabled: g.enabled,
  });
});

grimmorySettingsRoutes.put('/', async (req, res) => {
  const settings = getSettings();
  const body = req.body as {
    url?: string;
    publicUrl?: string;
    email?: string;
    password?: string;
    pollIntervalMinutes?: number;
    enabled?: boolean;
  };

  settings.book = {
    ...settings.book,
    grimmory: {
      url: body.url ?? settings.book.grimmory.url,
      publicUrl: body.publicUrl ?? settings.book.grimmory.publicUrl,
      email: body.email ?? settings.book.grimmory.email,
      password: body.password || settings.book.grimmory.password,
      pollIntervalMinutes:
        body.pollIntervalMinutes ??
        settings.book.grimmory.pollIntervalMinutes,
      enabled: body.enabled ?? settings.book.grimmory.enabled,
    },
  };

  await settings.save();

  return res.status(200).json({
    url: settings.book.grimmory.url,
    publicUrl: settings.book.grimmory.publicUrl,
    email: settings.book.grimmory.email,
    password: '',
    passwordSet: !!settings.book.grimmory.password,
    pollIntervalMinutes: settings.book.grimmory.pollIntervalMinutes,
    enabled: settings.book.grimmory.enabled,
  });
});

grimmorySettingsRoutes.post('/test', async (req, res) => {
  const settings = getSettings();
  const { url, email, password } = req.body as {
    url?: string;
    email?: string;
    password?: string;
  };

  try {
    const parsedUrl = new URL(url || settings.book.grimmory.url);
    const adapter = new GrimmoryAdapter({
      hostname: parsedUrl.hostname,
      port:
        parseInt(parsedUrl.port) ||
        (parsedUrl.protocol === 'https:' ? 443 : 80),
      useSsl: parsedUrl.protocol === 'https:',
      email: email || settings.book.grimmory.email,
      password: password || settings.book.grimmory.password,
    });

    const result = await adapter.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    logger.error('Grimmory test connection failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : 'Invalid Grimmory URL',
    });
  }
});

grimmorySettingsRoutes.post('/scan', async (_req, res) => {
  try {
    const { grimmoryScanner } = await import(
      '@server/lib/scanners/grimmory'
    );
    grimmoryScanner.run();
    return res.status(200).json({ success: true, message: 'Scan triggered.' });
  } catch (e) {
    logger.error('Grimmory scan failed', {
      label: 'API',
      errorMessage: e instanceof Error ? e.message : String(e),
    });
    return res.status(500).json({
      success: false,
      message: e instanceof Error ? e.message : 'Scan failed',
    });
  }
});

export default grimmorySettingsRoutes;
