import AudibleAPI, { type AudibleRegion } from '@server/api/audible';
import HardcoverAPI from '@server/api/hardcover';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const audiobookSettingsRoutes = Router();

const AUDIBLE_VALID_REGIONS: AudibleRegion[] = [
  'us',
  'ca',
  'uk',
  'au',
  'fr',
  'de',
  'jp',
  'it',
  'in',
  'es',
  'br',
];

// Hardcover uses a single account regardless of media type, so the key is
// stored on book.metadataProviders.hardcoverApiKey. We surface + accept it
// on the audiobook tab too so the user doesn't have to bounce between
// tabs, and sync writes through to the canonical book slot.
audiobookSettingsRoutes.get('/metadata-providers', (_req, res) => {
  try {
    const settings = getSettings();
    return res.status(200).json({
      ...settings.audiobook.metadataProviders,
      hardcoverApiKey: settings.book.metadataProviders.hardcoverApiKey ?? '',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read audiobook metadata settings', {
      label: 'audiobook-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

audiobookSettingsRoutes.put('/metadata-providers', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<
      typeof settings.audiobook.metadataProviders
    > & { hardcoverApiKey?: string };

    settings.audiobook = {
      ...settings.audiobook,
      metadataProviders: {
        ...settings.audiobook.metadataProviders,
        ...(body.primarySource === 'audible' ||
        body.primarySource === 'hardcover'
          ? { primarySource: body.primarySource }
          : {}),
        ...(typeof body.audible === 'boolean'
          ? { audible: body.audible }
          : {}),
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

    // Write-through: Hardcover uses a single account shared with the
    // book tab, so editing it here updates the canonical slot on
    // book.metadataProviders.hardcoverApiKey. Empty string means "clear
    // it" (the user actively wants to wipe the key).
    if (typeof body.hardcoverApiKey === 'string') {
      settings.book = {
        ...settings.book,
        metadataProviders: {
          ...settings.book.metadataProviders,
          hardcoverApiKey: body.hardcoverApiKey,
        },
      };
    }

    await settings.save();
    return res.status(200).json({
      ...settings.audiobook.metadataProviders,
      hardcoverApiKey: settings.book.metadataProviders.hardcoverApiKey ?? '',
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save audiobook metadata settings', {
      label: 'audiobook-settings',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

/**
 * Test an audiobook provider. Audible is free — we just hit the region's
 * storefront and report whether it responds. Hardcover uses the book-side
 * key (single account), but the caller may also pass a fresh apiKey in
 * the body so a user can test a newly-typed key BEFORE saving.
 */
audiobookSettingsRoutes.post('/metadata-providers/test', async (req, res) => {
  const body = req.body as {
    provider?: 'audible' | 'hardcover';
    audibleRegion?: string;
    apiKey?: string;
  };

  if (!body.provider) {
    return res
      .status(400)
      .json({ success: false, message: 'provider is required' });
  }

  try {
    if (body.provider === 'audible') {
      const raw = (body.audibleRegion || 'us').toLowerCase() as AudibleRegion;
      const region = AUDIBLE_VALID_REGIONS.includes(raw) ? raw : 'us';
      const client = new AudibleAPI(region);
      // Use a common English-language query so regions like .fr still
      // return hits — "sapiens" is a universally-indexed book title.
      // AudibleAPI.search catches internal errors and returns empty
      // arrays, so we infer reachability from whether anything came
      // back (reverted to explicit axios in that path would be a
      // bigger refactor for zero gain).
      const { totalResults, results } = await client.search('sapiens', 5, 0);
      if (totalResults === 0 && results.length === 0) {
        return res.status(200).json({
          success: false,
          message: `Audible (${region.toUpperCase()}) returned no results for a reachability probe. Region may be unreachable or rate-limited; check logs.`,
        });
      }
      return res.status(200).json({
        success: true,
        message: `Audible (${region.toUpperCase()}) reachable — ${totalResults} results for "sapiens"${
          results[0] ? `, first: "${results[0].title}"` : ''
        }`,
      });
    }

    if (body.provider === 'hardcover') {
      // Prefer the key the user just typed (not saved yet); fall back
      // to the currently-saved book-side key.
      const settings = getSettings();
      const apiKey =
        (typeof body.apiKey === 'string' && body.apiKey.trim().length > 0
          ? body.apiKey.trim()
          : undefined) ?? settings.book.metadataProviders.hardcoverApiKey;
      if (!apiKey) {
        return res.status(200).json({
          success: false,
          message:
            'Hardcover API token missing — type it in the field below and click Test again, or save first.',
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
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Audiobook metadata provider test crashed', {
      label: 'audiobook-settings',
      provider: body.provider,
      error: message,
    });
    return res.status(200).json({
      success: false,
      message,
    });
  }
});

export default audiobookSettingsRoutes;
