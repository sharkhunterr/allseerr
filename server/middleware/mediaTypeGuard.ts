import { getSettings, type MediaTypeToggles } from '@server/lib/settings';
import type { NextFunction, Request, Response } from 'express';

export type GuardableMediaType = keyof MediaTypeToggles;

/**
 * Returns true when the given non-TMDB media type is currently
 * enabled in admin settings. Used by the request / search routes to
 * short-circuit with a 503 before hitting any provider — and by the
 * settings layer to AND the per-type Enabled flags exposed to the
 * frontend.
 *
 * Defaults to true on missing settings so upgrading installs don't
 * silently lose features.
 */
export function isMediaTypeEnabled(type: GuardableMediaType): boolean {
  const types = getSettings().mediaTypes;
  return types?.[type] !== false;
}

/**
 * Express middleware factory: short-circuits with 503 when the
 * given media type is disabled in admin settings. Plug into routes
 * that have a single fixed type, e.g.:
 *
 *   gameRoutes.post('/request', isAuthenticated(), requireMediaType('game'), …)
 *
 * For routes whose media type depends on a request param (book vs
 * audiobook share /book/* by `?type=`), call isMediaTypeEnabled()
 * inline inside the handler instead.
 */
export function requireMediaType(type: GuardableMediaType) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!isMediaTypeEnabled(type)) {
      return res.status(503).json({
        status: 503,
        message: `${type} requests are disabled by the administrator.`,
      });
    }
    next();
  };
}
