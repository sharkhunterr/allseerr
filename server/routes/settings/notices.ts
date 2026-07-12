import {
  getSettings,
  type NoticeContext,
  type NoticeEntry,
  type NoticeMediaScope,
  type RequestNoticeSeverity,
} from '@server/lib/settings';
import logger from '@server/logger';
import { randomBytes } from 'crypto';
import { Router } from 'express';

const noticesRoutes = Router();

const VALID_SEVERITIES: RequestNoticeSeverity[] = ['info', 'warning', 'error'];
const VALID_SCOPES: NoticeMediaScope[] = [
  'global',
  'movie',
  'tv',
  'book',
  'audiobook',
  'game',
  'manga',
  'comic',
  'magazine',
];
const VALID_CONTEXTS: NoticeContext[] = ['detail', 'search', 'discover'];

interface NoticePatch {
  message?: unknown;
  severity?: unknown;
  mediaScope?: unknown;
  contexts?: unknown;
  enabled?: unknown;
  label?: unknown;
}

/** Apply a partial body onto an existing entry, dropping any
 *  field that doesn't pass the per-field validator. Used by both
 *  POST (where ``base`` is the empty draft) and PUT. */
function applyPatch(base: NoticeEntry, body: NoticePatch): NoticeEntry {
  const next = { ...base };
  if (typeof body.message === 'string') next.message = body.message;
  if (
    typeof body.severity === 'string' &&
    VALID_SEVERITIES.includes(body.severity as RequestNoticeSeverity)
  ) {
    next.severity = body.severity as RequestNoticeSeverity;
  }
  if (
    typeof body.mediaScope === 'string' &&
    VALID_SCOPES.includes(body.mediaScope as NoticeMediaScope)
  ) {
    next.mediaScope = body.mediaScope as NoticeMediaScope;
  }
  if (Array.isArray(body.contexts)) {
    next.contexts = body.contexts.filter((c): c is NoticeContext =>
      VALID_CONTEXTS.includes(c as NoticeContext)
    );
  }
  if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
  if (typeof body.label === 'string') {
    next.label = body.label.trim() || undefined;
  }
  return next;
}

noticesRoutes.get('/', (_req, res) => {
  try {
    return res.status(200).json(getSettings().notices);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to read notices', { label: 'notices', error: message });
    return res.status(500).json({ status: 500, message });
  }
});

noticesRoutes.post('/', async (req, res) => {
  try {
    const settings = getSettings();
    const current = settings.notices;
    const draft: NoticeEntry = {
      id: randomBytes(8).toString('hex'),
      message: '',
      severity: 'info',
      mediaScope: 'global',
      contexts: ['detail'],
      enabled: true,
    };
    const entry = applyPatch(draft, (req.body ?? {}) as NoticePatch);
    settings.notices = [...current, entry];
    await settings.save();
    return res.status(201).json(entry);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to create notice', {
      label: 'notices',
      error: message,
    });
    return res.status(500).json({ status: 500, message });
  }
});

noticesRoutes.put('/:id', async (req, res) => {
  try {
    const settings = getSettings();
    const current = settings.notices;
    const idx = current.findIndex((e) => e.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ status: 404, message: 'Notice not found' });
    }
    const updated = applyPatch(current[idx], (req.body ?? {}) as NoticePatch);
    const next = current.slice();
    next[idx] = updated;
    settings.notices = next;
    await settings.save();
    return res.status(200).json(updated);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to update notice', {
      label: 'notices',
      error: message,
      id: req.params.id,
    });
    return res.status(500).json({ status: 500, message });
  }
});

noticesRoutes.delete('/:id', async (req, res) => {
  try {
    const settings = getSettings();
    const current = settings.notices;
    const next = current.filter((e) => e.id !== req.params.id);
    if (next.length === current.length) {
      return res.status(404).json({ status: 404, message: 'Notice not found' });
    }
    settings.notices = next;
    await settings.save();
    return res.status(204).end();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('Failed to delete notice', {
      label: 'notices',
      error: message,
      id: req.params.id,
    });
    return res.status(500).json({ status: 500, message });
  }
});

export default noticesRoutes;
