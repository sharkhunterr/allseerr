/**
 * Strip `/works/` (with or without leading slash) off an OpenLibrary
 * work key, returning the bare `OLnnnnW` id suitable for
 * /book/[bookId] routing. Used by every card that renders a book link
 * so a single helper owns the normalisation.
 */
export const stripOLWorkPrefix = (key: string): string =>
  key.replace(/^\/?works\//, '');
