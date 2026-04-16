import { isMusicEnabled } from '@server/lib/musicFeatureFlag';
import { isAuthenticated } from '@server/middleware/auth';
import { Router } from 'express';

const musicRoutes = Router();

const NOT_IMPLEMENTED_RESPONSE = {
  status: 501,
  message: 'Music support is not yet implemented.',
};

/**
 * Music API routes — all return 501 Not Implemented (Phase 3).
 * Routes are only registered if ENABLE_MUSIC feature flag is true.
 * FR-012, FR-013, FR-014.
 */

musicRoutes.get('/search', isAuthenticated(), (_req, res) => {
  return res.status(501).json(NOT_IMPLEMENTED_RESPONSE);
});

musicRoutes.post('/request', isAuthenticated(), (_req, res) => {
  return res.status(501).json(NOT_IMPLEMENTED_RESPONSE);
});

musicRoutes.get('/request', isAuthenticated(), (_req, res) => {
  return res.status(501).json(NOT_IMPLEMENTED_RESPONSE);
});

musicRoutes.get('/request/:id', isAuthenticated(), (_req, res) => {
  return res.status(501).json(NOT_IMPLEMENTED_RESPONSE);
});

/**
 * Conditionally register music routes.
 * Returns the router only if ENABLE_MUSIC is true.
 */
export function getMusicRoutes(): Router | null {
  if (!isMusicEnabled()) {
    return null;
  }
  return musicRoutes;
}

export default musicRoutes;
