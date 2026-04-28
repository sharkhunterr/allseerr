import {
  getSettings,
  type RequestNoticeEntry,
  type RequestNoticeSeverity,
  type RequestNotices,
} from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';

const requestNoticesRoutes = Router();

const VALID_SEVERITIES: RequestNoticeSeverity[] = ['info', 'warning', 'error'];

/** Parse + sanitise one notice block from the PUT body. Falls back
 *  to the existing entry when the body is malformed so a partial
 *  update never wipes a stored notice. */
function coerceEntry(
  raw: unknown,
  fallback: RequestNoticeEntry
): RequestNoticeEntry {
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as { message?: unknown; severity?: unknown };
  const message =
    typeof r.message === 'string' ? r.message.trim() : fallback.message;
  const severity = VALID_SEVERITIES.includes(
    r.severity as RequestNoticeSeverity
  )
    ? (r.severity as RequestNoticeSeverity)
    : fallback.severity;
  return { message, severity };
}

requestNoticesRoutes.get('/', (_req, res) => {
  try {
    return res.status(200).json(getSettings().requestNotices);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read request notices', {
      label: 'request-notices',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

requestNoticesRoutes.put('/', async (req, res) => {
  try {
    const settings = getSettings();
    const body = req.body as Partial<RequestNotices>;
    const current = settings.requestNotices;

    const next: RequestNotices = {
      global: coerceEntry(body.global, current.global),
      movie: coerceEntry(body.movie, current.movie),
      tv: coerceEntry(body.tv, current.tv),
      book: coerceEntry(body.book, current.book),
      audiobook: coerceEntry(body.audiobook, current.audiobook),
      game: coerceEntry(body.game, current.game),
      manga: coerceEntry(body.manga, current.manga),
      comic: coerceEntry(body.comic, current.comic),
    };

    settings.requestNotices = next;
    await settings.save();
    return res.status(200).json(settings.requestNotices);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to save request notices', {
      label: 'request-notices',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

export default requestNoticesRoutes;
