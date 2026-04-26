import AniListAPI from '@server/api/anilist';
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

export default mangaSettingsRoutes;
