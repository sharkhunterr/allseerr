import ComicVineAPI from '@server/api/comicvine';
import MylarAPI from '@server/api/mylar';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const comicSettingsRoutes = Router();

comicSettingsRoutes.get('/metadata-providers', (_req, res) => {
  try {
    const settings = getSettings();
    // Mirror the manga settings shape — strip the apiKey on read
    // (sensitive). The UI uses a SensitiveInput so the "" placeholder
    // is interpreted as "keep current".
    const cfg = settings.comic.metadataProviders;
    return res.status(200).json({ ...cfg, apiKey: cfg.apiKey ? '' : '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read comic metadata settings', {
      label: 'comic-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

comicSettingsRoutes.put('/metadata-providers', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<typeof settings.comic.metadataProviders>;
    const current = settings.comic.metadataProviders;

    settings.comic = {
      ...settings.comic,
      metadataProviders: {
        primarySource:
          body.primarySource === 'comicvine'
            ? body.primarySource
            : current.primarySource,
        comicvine:
          typeof body.comicvine === 'boolean'
            ? body.comicvine
            : current.comicvine,
        // Empty string = "keep current" (sensitive field).
        apiKey:
          typeof body.apiKey === 'string' && body.apiKey.length > 0
            ? body.apiKey
            : current.apiKey,
        hideAdult:
          typeof body.hideAdult === 'boolean'
            ? body.hideAdult
            : current.hideAdult,
      },
    };

    await settings.save();
    const fresh = settings.comic.metadataProviders;
    return res.status(200).json({ ...fresh, apiKey: fresh.apiKey ? '' : '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save comic metadata settings', {
      label: 'comic-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

comicSettingsRoutes.post('/metadata-providers/test', async (req, res) => {
  const body = req.body as { provider?: 'comicvine'; apiKey?: string };
  if (!body.provider) {
    return res
      .status(400)
      .json({ success: false, message: 'provider is required' });
  }

  try {
    if (body.provider === 'comicvine') {
      const settings = getSettings();
      const apiKey = body.apiKey || settings.comic.metadataProviders.apiKey;
      if (!apiKey) {
        return res.status(200).json({
          success: false,
          message: 'No ComicVine API key configured.',
        });
      }
      const cv = new ComicVineAPI({ apiKey });
      const result = await cv.testConnection();
      return res.status(200).json(result);
    }

    return res
      .status(400)
      .json({ success: false, message: `Unknown provider: ${body.provider}` });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Comic metadata provider test crashed', {
      label: 'comic-settings',
      provider: body.provider,
      error: message,
    });
    return res.status(200).json({ success: false, message });
  }
});

/**
 * Mylar3 — optional download manager. Same read / write / test
 * triplet as the Suwayomi endpoints; not configured = manual
 * workflow.
 */
comicSettingsRoutes.get('/mylar', (_req, res) => {
  try {
    const settings = getSettings();
    const mylar = settings.comic?.mylar ?? {
      url: '',
      publicUrl: '',
      apiKey: '',
      pollIntervalMinutes: 15,
      enabled: false,
    };
    return res.status(200).json({ ...mylar, apiKey: '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read Mylar settings', {
      label: 'comic-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

comicSettingsRoutes.put('/mylar', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<typeof settings.comic.mylar>;
    const current = settings.comic?.mylar ?? {
      url: '',
      publicUrl: '',
      apiKey: '',
      pollIntervalMinutes: 15,
      enabled: false,
    };

    settings.comic = {
      ...settings.comic,
      mylar: {
        url: typeof body.url === 'string' ? body.url.trim() : current.url,
        publicUrl:
          typeof body.publicUrl === 'string'
            ? body.publicUrl.trim()
            : current.publicUrl,
        apiKey:
          typeof body.apiKey === 'string' && body.apiKey.length > 0
            ? body.apiKey
            : current.apiKey,
        pollIntervalMinutes:
          typeof body.pollIntervalMinutes === 'number' &&
          body.pollIntervalMinutes > 0
            ? body.pollIntervalMinutes
            : current.pollIntervalMinutes,
        enabled:
          typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
      },
    };

    await settings.save();
    return res.status(200).json({ ...settings.comic.mylar, apiKey: '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save Mylar settings', {
      label: 'comic-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

comicSettingsRoutes.post('/mylar/test', async (req, res) => {
  const body = req.body as { url?: string; apiKey?: string };
  if (!body.url || !body.apiKey) {
    return res.status(400).json({
      success: false,
      message: 'url and apiKey are required for the test',
    });
  }

  try {
    const api = new MylarAPI({ url: body.url, apiKey: body.apiKey });
    const result = await api.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Mylar test crashed', {
      label: 'comic-settings',
      error: message,
    });
    return res.status(200).json({ success: false, message });
  }
});

export default comicSettingsRoutes;
