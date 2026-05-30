import { isAuthenticated } from '@server/middleware/auth';
import {
  getMagazineById,
  searchMagazines,
} from '@server/api/googlebooks/magazines';
import PressarrAPI from '@server/api/servarr/pressarr';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const magazineRoutes = Router();

/**
 * Returns the active Google Books API key (if any) for the
 * magazine pipeline. We reuse the existing book metadata
 * settings (book.metadataProviders.googleBooksApiKey) because
 * Google Books is a single product — no point asking the
 * operator to register the same key twice.
 */
function googleBooksApiKey(): string | undefined {
  return getSettings().book?.metadataProviders?.googleBooksApiKey || undefined;
}

/**
 * Free-text magazine search. Cascades Google Books first
 * (because it has covers + ISSNs when registered), then
 * pressarr's own metadata aggregator when the operator has a
 * default pressarr instance configured. Skipping pressarr keeps
 * the search responsive even when pressarr's upstream
 * providers are slow.
 */
magazineRoutes.get('/search', isAuthenticated(), async (req, res, next) => {
  const query =
    typeof req.query.query === 'string' ? req.query.query : undefined;
  if (!query?.trim()) {
    return res.status(200).json({ results: [] });
  }
  try {
    const apiKey = googleBooksApiKey();
    const googleResults = await searchMagazines(query, { apiKey });

    // Pressarr's /magazine/lookup is opt-in — only consulted
    // when an instance is configured. Pressarr's suggestions
    // come from its own provider chain (DOAJ, OpenLibrary,
    // ISSN portal when keys are set) so a configured instance
    // dramatically widens the catalogue beyond what Google
    // Books indexes.
    const pressarr = getSettings().pressarr.find(
      (p) => p.mediaType === 'magazine' && p.isDefault
    );
    let pressarrResults: Awaited<ReturnType<typeof apiLookup>> = [];
    if (pressarr) {
      pressarrResults = await apiLookup(pressarr, query);
    }

    // Merge — Google Books hits first since they typically
    // carry richer covers; deduplicated by lowercased title +
    // optional ISSN so the same Le Monde from both sources
    // doesn't appear twice.
    const seen = new Set<string>();
    const merged: {
      source: 'googlebooks' | 'pressarr';
      id: string;
      title: string;
      publisher?: string;
      issn?: string;
      coverUrl?: string;
      year?: number;
      language?: string;
      description?: string;
      frequency?: string;
    }[] = [];
    const push = (
      source: 'googlebooks' | 'pressarr',
      key: string,
      payload: {
        id: string;
        title: string;
        publisher?: string;
        issn?: string;
        coverUrl?: string;
        year?: number;
        language?: string;
        description?: string;
        frequency?: string;
      }
    ) => {
      if (seen.has(key)) return;
      seen.add(key);
      merged.push({ source, ...payload });
    };
    for (const g of googleResults) {
      const k = g.issn ? `issn:${g.issn}` : `t:${g.title.toLowerCase()}`;
      push('googlebooks', k, {
        id: g.id,
        title: g.title,
        publisher: g.publisher,
        issn: g.issn,
        coverUrl: g.coverUrl,
        year: g.year,
        language: g.language,
        description: g.description,
      });
    }
    for (const p of pressarrResults) {
      const k = p.issn ? `issn:${p.issn}` : `t:${p.title.toLowerCase()}`;
      push('pressarr', k, {
        id: p.providerId,
        title: p.title,
        publisher: p.publisher ?? undefined,
        issn: p.issn ?? undefined,
        coverUrl: p.coverUrl ?? undefined,
        language: undefined,
        description: p.description ?? undefined,
        frequency: p.frequency ?? undefined,
      });
    }

    return res.status(200).json({ results: merged });
  } catch (e) {
    return next({
      status: 500,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/**
 * Single-magazine detail by Google Books volume id. The
 * /discover page links here from each MagazineCard.
 */
magazineRoutes.get('/:id', isAuthenticated(), async (req, res) => {
  const id = req.params.id;
  const apiKey = googleBooksApiKey();
  const data = await getMagazineById(id, { apiKey });
  if (!data) {
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }
  return res.status(200).json(data);
});

/**
 * Pressarr lookup helper — kept out of the API client because
 * the response shape we want to merge in /search is narrower
 * than PressarrMetadataSearchResult.
 */
async function apiLookup(
  instance: ReturnType<typeof getSettings>['pressarr'][number],
  query: string
) {
  try {
    const api = new PressarrAPI({
      apiKey: instance.apiKey,
      url: PressarrAPI.buildUrl(instance, '/api/v1'),
    });
    return await api.lookupMagazine(query);
  } catch (e) {
    logger.warn('Pressarr lookup failed during search merge', {
      label: 'magazine',
      error: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export default magazineRoutes;
