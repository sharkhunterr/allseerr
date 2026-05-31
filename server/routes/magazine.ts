import { isAuthenticated } from '@server/middleware/auth';
import {
  getMagazineById,
  searchMagazines,
} from '@server/api/googlebooks/magazines';
import PressarrAPI, {
  type PressarrMagazineIdentity,
  type PressarrMetadataSearchResult,
} from '@server/api/servarr/pressarr';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const magazineRoutes = Router();

/**
 * Returns the active Google Books API key (if any). Google Books is
 * the cover-of-last-resort and the only source we keep when pressarr
 * isn't configured — see ``cascadeOrFallback`` below.
 */
function googleBooksApiKey(): string | undefined {
  return getSettings().book?.metadataProviders?.googleBooksApiKey || undefined;
}

interface MagazineCard {
  source: 'pressarr' | 'googlebooks';
  id: string;
  title: string;
  publisher?: string;
  issn?: string;
  coverUrl?: string;
  year?: number;
  language?: string;
  description?: string;
  frequency?: string;
  country?: string;
  // Enrichment fields contributed by pressarr's ISSN-first cascade
  // (ZDB + Wikidata + BnF). Absent when the card was sourced from
  // Google Books only.
  categories?: string[];
  wikidataQid?: string;
  zdbId?: string;
  wikipediaUrl?: string;
  sources?: string[];
}

function getDefaultPressarr() {
  return getSettings().pressarr.find(
    (p) => p.mediaType === 'magazine' && p.isDefault
  );
}

function pressarrClient(
  instance: NonNullable<ReturnType<typeof getDefaultPressarr>>
) {
  return new PressarrAPI({
    apiKey: instance.apiKey,
    url: PressarrAPI.buildUrl(instance, '/api/v1'),
  });
}

/**
 * Build the canonical card id for a cascade hit. ISSN-shaped keys
 * (``issn:0028-0836``) round-trip to the detail endpoint cleanly
 * because pressarr resolves them via its ``/magazine/identity``
 * endpoint. Cascade hits without an ISSN fall back to a title slug.
 */
function cascadeCardId(hit: PressarrMetadataSearchResult): string {
  if (hit.issn) return `issn:${hit.issn}`;
  if (hit.wikidataQid) return `wd:${hit.wikidataQid}`;
  return `pressarr:${hit.providerId}`;
}

function cascadeToCard(hit: PressarrMetadataSearchResult): MagazineCard {
  return {
    source: 'pressarr',
    id: cascadeCardId(hit),
    title: hit.title,
    publisher: hit.publisher ?? undefined,
    issn: hit.issn ?? undefined,
    coverUrl: hit.coverUrl ?? undefined,
    year: hit.firstIssued
      ? Number.parseInt(hit.firstIssued, 10) || undefined
      : undefined,
    language: hit.language ?? undefined,
    description: hit.description ?? undefined,
    frequency: hit.frequency ?? undefined,
    country: hit.country ?? undefined,
    categories: hit.categories ?? undefined,
    wikidataQid: hit.wikidataQid ?? undefined,
    zdbId: hit.zdbId ?? undefined,
    wikipediaUrl: hit.wikipediaUrl ?? undefined,
    sources: hit.sources?.map((s) => s.provider),
  };
}

function identityToCard(
  identity: PressarrMagazineIdentity,
  fallbackId?: string
): MagazineCard {
  return {
    source: 'pressarr',
    id:
      identity.issn != null
        ? `issn:${identity.issn}`
        : identity.wikidataQid
          ? `wd:${identity.wikidataQid}`
          : fallbackId ?? `slug:${identity.title.toLowerCase()}`,
    title: identity.title,
    publisher: identity.publisher ?? undefined,
    issn: identity.issn ?? undefined,
    coverUrl: identity.coverUrl ?? undefined,
    year: identity.firstIssued
      ? Number.parseInt(identity.firstIssued, 10) || undefined
      : undefined,
    language: identity.language ?? undefined,
    description: identity.description ?? undefined,
    frequency: identity.frequency ?? undefined,
    country: identity.country ?? undefined,
    categories: identity.categories ?? undefined,
    wikidataQid: identity.wikidataQid ?? undefined,
    zdbId: identity.zdbId ?? undefined,
    wikipediaUrl: identity.wikipediaUrl ?? undefined,
    sources: identity.sources,
  };
}

/**
 * Free-text magazine search.
 *
 * Primary source: the operator's default pressarr instance — its
 * ``/magazine/lookup`` aggregates ZDB + Wikidata + BnF + Google
 * Books + Internet Archive into a single ISSN-merged list and
 * already does the relevance ranking, so we forward the response
 * shape directly.
 *
 * Fallback: when no pressarr instance is configured, we still hit
 * Google Books so a fresh install can render at least *something*
 * on the discover page. Once the operator wires pressarr the
 * cascade takes over.
 */
magazineRoutes.get('/search', isAuthenticated(), async (req, res, next) => {
  const query =
    typeof req.query.query === 'string' ? req.query.query : undefined;
  const locale =
    typeof req.query.locale === 'string' ? req.query.locale : undefined;
  if (!query?.trim()) {
    return res.status(200).json({ results: [] });
  }
  try {
    const pressarr = getDefaultPressarr();
    if (pressarr) {
      const api = pressarrClient(pressarr);
      const hits = await api.lookupMagazine(query, { locale });
      // Empty cascade response → fall through to Google Books to
      // preserve discovery UX even when ZDB / Wikidata don't know
      // a niche local title.
      if (hits.length > 0) {
        return res
          .status(200)
          .json({ results: hits.map(cascadeToCard) });
      }
    }
    const googleResults = await searchMagazines(query, {
      apiKey: googleBooksApiKey(),
    });
    return res.status(200).json({
      results: googleResults.map<MagazineCard>((g) => ({
        source: 'googlebooks',
        id: g.id,
        title: g.title,
        publisher: g.publisher,
        issn: g.issn,
        coverUrl: g.coverUrl,
        year: g.year,
        language: g.language,
        description: g.description,
      })),
    });
  } catch (e) {
    return next({
      status: 500,
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/**
 * Single-magazine detail.
 *
 * Routes by id shape:
 *   * ``issn:NNNN-NNNN`` — pressarr ``/magazine/identity?issn=…``,
 *     authoritative single record from the cascade. Returns 404
 *     when no source recognises the ISSN.
 *   * ``wd:Q123`` — fallback to pressarr search by the QID (rare —
 *     happens when the cascade returned a Wikidata-only hit with
 *     no ISSN). We rerun the search and pick the matching QID.
 *   * anything else — treated as a Google Books volume id and
 *     served from the old detail endpoint.
 */
magazineRoutes.get('/:id', isAuthenticated(), async (req, res) => {
  const id = req.params.id;
  const locale =
    typeof req.query.locale === 'string' ? req.query.locale : undefined;
  const pressarr = getDefaultPressarr();

  if (id.startsWith('issn:') && pressarr) {
    const api = pressarrClient(pressarr);
    const issn = id.slice('issn:'.length);
    const identity = await api.lookupMagazineIdentity(issn, { locale });
    if (identity) {
      return res.status(200).json(identityToCard(identity, id));
    }
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }

  if (id.startsWith('wd:') && pressarr) {
    // No native /by-qid endpoint upstream — replay the title search
    // and pick the entry that matches the QID. Cheap because
    // pressarr caches its cascade per-query.
    const api = pressarrClient(pressarr);
    const qid = id.slice('wd:'.length);
    // Strip the QID prefix and search by title — we don't know the
    // title yet, so fall back to a degenerate "search by qid" that
    // hits Wikidata's wbsearchentities (it accepts QIDs literally).
    const hits = await api.lookupMagazine(qid, { locale });
    const match = hits.find((h) => h.wikidataQid === qid);
    if (match) {
      return res.status(200).json(cascadeToCard(match));
    }
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }

  // Fallback: Google Books volume id.
  const data = await getMagazineById(id, { apiKey: googleBooksApiKey() });
  if (!data) {
    return res.status(404).json({ status: 404, message: 'Magazine not found' });
  }
  return res.status(200).json(data);
});

logger.debug('Magazine routes wired (cascade-primary, Google Books fallback)');

export default magazineRoutes;
