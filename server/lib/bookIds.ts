/**
 * Canonical OpenLibrary work-key helpers.
 *
 * Every metadata provider hands us the OL ID in a slightly different
 * shape — Hardcover's `book_mappings.external_id` is sometimes
 * `OLnnnnW`, sometimes `/works/OLnnnnW`; Bookshelf returns
 * `works/OLnnnnW` (no leading slash); OL itself emits `/works/OLnnnnW`.
 * Centralise all parsing here so the search aggregator, series page,
 * detail handler and cross-reference dedupe all use the same key shape.
 */

const OL_WORK_KEY_RE = /^\/works\/OL\d+W$/i;
const OL_WORK_ID_RE = /OL\d+W/i;

export const isOLWorkKey = (key?: string | null): boolean =>
  !!key && OL_WORK_KEY_RE.test(key);

/**
 * Extract the canonical `/works/OLnnnnW` key from arbitrary input.
 * Accepts raw IDs (`OL123W`), already-wrapped keys, and junk like
 * `works/OL123W`, `books/OL123W`, `/works/OL123W/anything`.
 * Returns undefined when no OL id is present.
 */
export const toOLWorkKey = (raw?: string | null): string | undefined => {
  if (!raw) return undefined;
  const m = String(raw).match(OL_WORK_ID_RE);
  return m ? `/works/${m[0].toUpperCase()}` : undefined;
};

/** Extract just the bare `OLnnnnW` id (no prefix). */
export const toOLWorkId = (raw?: string | null): string | undefined => {
  const m = raw ? String(raw).match(OL_WORK_ID_RE) : null;
  return m ? m[0].toUpperCase() : undefined;
};
