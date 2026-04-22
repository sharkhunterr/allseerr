import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import HardcoverAPI from '@server/api/hardcover';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const audiobookSettingsRoutes = Router();

// Hardcover uses a single account regardless of media type, so the key
// lives on book.metadataProviders.hardcoverApiKey. We surface it as
// read-only on the audiobook tab's GET response so the UI can show the
// enablement hint ("configure in Book tab"), but never accept it on PUT.
audiobookSettingsRoutes.get('/metadata-providers', (_req, res) => {
  const settings = getSettings();
  return res.status(200).json({
    ...settings.audiobook.metadataProviders,
    hardcoverApiKey: settings.book.metadataProviders.hardcoverApiKey ?? '',
  });
});

audiobookSettingsRoutes.put('/metadata-providers', async (req, res) => {
  const settings = getSettings();
  const body = req.body as Partial<
    typeof settings.audiobook.metadataProviders
  >;

  settings.audiobook = {
    ...settings.audiobook,
    metadataProviders: {
      ...settings.audiobook.metadataProviders,
      ...(body.primarySource === 'audible' ||
      body.primarySource === 'hardcover'
        ? { primarySource: body.primarySource }
        : {}),
      ...(typeof body.audible === 'boolean' ? { audible: body.audible } : {}),
      ...(typeof body.audibleRegion === 'string'
        ? { audibleRegion: body.audibleRegion.toLowerCase().trim() }
        : {}),
      ...(typeof body.hardcover === 'boolean'
        ? { hardcover: body.hardcover }
        : {}),
      ...(typeof body.preferredLanguage === 'string'
        ? { preferredLanguage: body.preferredLanguage.trim().toLowerCase() }
        : {}),
      ...(body.languagePolicy === 'prefer' ||
      body.languagePolicy === 'strict'
        ? { languagePolicy: body.languagePolicy }
        : {}),
    },
  };
  await settings.save();
  return res.status(200).json(settings.audiobook.metadataProviders);
});

/**
 * Test an audiobook provider. Audible is a free API; we only need to
 * verify the region resolves to a reachable storefront. Hardcover reuses
 * the book-side API key (single account), so the request body doesn't
 * carry it — we read the currently-saved key from settings.
 */
audiobookSettingsRoutes.post('/metadata-providers/test', async (req, res) => {
  const body = req.body as {
    provider?: 'audible' | 'hardcover';
    audibleRegion?: string;
  };

  if (!body.provider) {
    return res
      .status(400)
      .json({ success: false, message: 'provider is required' });
  }

  try {
    if (body.provider === 'audible') {
      const region = (body.audibleRegion?.toLowerCase() || 'us') as AudibleRegion;
      const client = new AudibleAPI(region);
      const { results, totalResults } = await client.search('test', 1, 0);
      return res.status(200).json({
        success: true,
        message: `Audible (${region.toUpperCase()}) reachable (${totalResults} results for "test"${
          results[0] ? `, first: "${results[0].title}"` : ''
        })`,
      });
    }

    if (body.provider === 'hardcover') {
      const settings = getSettings();
      const apiKey = settings.book.metadataProviders.hardcoverApiKey;
      if (!apiKey) {
        return res.status(400).json({
          success: false,
          message:
            'Hardcover API token missing — configure it on the Book Metadata tab first.',
        });
      }
      const hc = new HardcoverAPI(apiKey);
      const result = await hc.testConnection();
      return res.status(200).json(result);
    }

    return res
      .status(400)
      .json({ success: false, message: `Unknown provider: ${body.provider}` });
  } catch (e) {
    logger.error('Audiobook metadata provider test failed', {
      label: 'audiobook-settings',
      provider: body.provider,
      error: e instanceof Error ? e.message : String(e),
    });
    return res.status(200).json({
      success: false,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default audiobookSettingsRoutes;
