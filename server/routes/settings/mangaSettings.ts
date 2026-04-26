import AniListAPI from '@server/api/anilist';
import SuwayomiAPI from '@server/api/suwayomi';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const mangaSettingsRoutes = Router();

mangaSettingsRoutes.get('/metadata-providers', (_req, res) => {
  try {
    const settings = getSettings();
    return res.status(200).json(settings.manga.metadataProviders);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read manga metadata settings', {
      label: 'manga-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

mangaSettingsRoutes.put('/metadata-providers', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<
      typeof settings.manga.metadataProviders
    >;

    settings.manga = {
      ...settings.manga,
      metadataProviders: {
        ...settings.manga.metadataProviders,
        ...(body.primarySource === 'anilist'
          ? { primarySource: body.primarySource }
          : {}),
        ...(typeof body.anilist === 'boolean'
          ? { anilist: body.anilist }
          : {}),
        ...(typeof body.jikan === 'boolean' ? { jikan: body.jikan } : {}),
        ...(typeof body.preferredLanguage === 'string'
          ? { preferredLanguage: body.preferredLanguage.trim().toLowerCase() }
          : {}),
        ...(body.languagePolicy === 'prefer' ||
        body.languagePolicy === 'strict'
          ? { languagePolicy: body.languagePolicy }
          : {}),
        ...(typeof body.hideAdult === 'boolean'
          ? { hideAdult: body.hideAdult }
          : {}),
      },
    };

    await settings.save();
    return res.status(200).json(settings.manga.metadataProviders);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save manga metadata settings', {
      label: 'manga-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

/**
 * Test an enabled provider's reachability. AniList needs no key, so
 * we just hit the schema with a 1-row probe. Jikan would have its own
 * branch when we wire that adapter.
 */
mangaSettingsRoutes.post('/metadata-providers/test', async (req, res) => {
  const body = req.body as { provider?: 'anilist' | 'jikan' };
  if (!body.provider) {
    return res
      .status(400)
      .json({ success: false, message: 'provider is required' });
  }

  try {
    if (body.provider === 'anilist') {
      const anilist = new AniListAPI();
      const result = await anilist.testConnection();
      return res.status(200).json(result);
    }

    if (body.provider === 'jikan') {
      // Jikan adapter not wired yet — surface that honestly so the
      // settings UI button doesn't pretend to succeed.
      return res.status(200).json({
        success: false,
        message: 'Jikan adapter is not implemented yet.',
      });
    }

    return res
      .status(400)
      .json({ success: false, message: `Unknown provider: ${body.provider}` });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Manga metadata provider test crashed', {
      label: 'manga-settings',
      provider: body.provider,
      error: message,
    });
    return res.status(200).json({ success: false, message });
  }
});

/**
 * Suwayomi (a.k.a. Tachidesk) is the optional download manager. Same
 * read / write / test triplet as the Komga or ROMM endpoints — when
 * not configured, the manga request flow falls back to the manual
 * workflow.
 */
mangaSettingsRoutes.get('/suwayomi', (_req, res) => {
  try {
    const settings = getSettings();
    const suwayomi = settings.manga?.suwayomi ?? {
      url: '',
      publicUrl: '',
      apiKey: '',
      username: '',
      password: '',
      pollIntervalMinutes: 15,
      enabled: false,
    };
    // Strip the password before sending — the UI uses a SensitiveInput
    // and the user re-enters it on change. Same pattern as the ROMM
    // settings response.
    return res.status(200).json({ ...suwayomi, password: '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read Suwayomi settings', {
      label: 'manga-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

mangaSettingsRoutes.put('/suwayomi', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<typeof settings.manga.suwayomi>;
    const current = settings.manga?.suwayomi ?? {
      url: '',
      publicUrl: '',
      apiKey: '',
      username: '',
      password: '',
      pollIntervalMinutes: 15,
      enabled: false,
    };

    settings.manga = {
      ...settings.manga,
      suwayomi: {
        url: typeof body.url === 'string' ? body.url.trim() : current.url,
        publicUrl:
          typeof body.publicUrl === 'string'
            ? body.publicUrl.trim()
            : current.publicUrl,
        apiKey:
          typeof body.apiKey === 'string' ? body.apiKey.trim() : current.apiKey,
        username:
          typeof body.username === 'string'
            ? body.username.trim()
            : current.username,
        // Empty string from the form means "don't touch" (sensitive
        // field) — only overwrite when the caller actually sent
        // something non-empty.
        password:
          typeof body.password === 'string' && body.password.length > 0
            ? body.password
            : current.password,
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
    return res
      .status(200)
      .json({ ...settings.manga.suwayomi, password: '' });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save Suwayomi settings', {
      label: 'manga-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

mangaSettingsRoutes.post('/suwayomi/test', async (req, res) => {
  const body = req.body as {
    url?: string;
    apiKey?: string;
    username?: string;
    password?: string;
  };
  if (!body.url) {
    return res
      .status(400)
      .json({ success: false, message: 'url is required for the test' });
  }

  try {
    const api = new SuwayomiAPI({
      url: body.url,
      apiKey: body.apiKey || undefined,
      username: body.username || undefined,
      password: body.password || undefined,
    });
    const result = await api.testConnection();
    return res.status(200).json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Suwayomi test crashed', {
      label: 'manga-settings',
      error: message,
    });
    return res.status(200).json({ success: false, message });
  }
});

export default mangaSettingsRoutes;
