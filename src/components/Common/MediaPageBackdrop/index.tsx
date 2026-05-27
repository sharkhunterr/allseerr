/**
 * Shared backdrop block for media detail pages.
 *
 * Reproduces the visual pattern Movie/TV detail pages use
 * (`.media-page-bg-image` + image + dark vertical gradient)
 * so non-TMDB detail pages (Game, Book, Audiobook, Comic,
 * Manga) get the same rich header look instead of falling
 * back to a flat charcoal page.
 *
 * Renders nothing when ``src`` is empty/undefined — caller
 * doesn't have to guard around it.
 *
 * Why an `<img>` instead of `CachedImage`: CachedImage's
 * image-proxy is hard-coded for TMDB / TVDB URL shapes
 * (`/imageproxy/tmdb/...`), so IGDB / Open Library / Comic
 * Vine / MangaDex CDN URLs would be silently dropped. The
 * fallback pattern is the same `<img>` Next.js renders
 * unoptimised anyway when ``src`` is an external HTTPS URL
 * we don't pre-process.
 *
 * Two visual modes:
 *   * ``mode="banner"`` (default) — render the image as-is,
 *     no blur. For when caller passes a wide hero / banner
 *     URL (Manga's ``bannerUrl``).
 *   * ``mode="cover"`` — blur + scale the image so a tall
 *     portrait cover (Game / Book / Comic IGDB-shape cover)
 *     reads as a backdrop rather than a stretched poster.
 *
 * Two operator-visible issues fixed in the second pass:
 *
 *   1. **Mobile horizontal scroll** — the cover-mode ``scale-110``
 *      overflowed the container horizontally (10% wider than
 *      ``.media-page``), so on a phone the page became
 *      side-scrollable into an empty area. Movies/TV/Manga
 *      didn't have it because their banner-mode images don't
 *      scale. Fixed by clipping the wrapper with
 *      ``overflow-hidden``.
 *   2. **Cover visible at the bottom of the header**, behind
 *      the overview text on mobile (where the stacked header
 *      pushes the overview close to the 493px backdrop boundary).
 *      The old gradient went 0.47 → 1.0; in cover mode we now
 *      ramp 0.7 → 1.0 AND end the visible portion at ~85%, so
 *      the bottom 15% is solid charcoal — enough headroom for
 *      the overview to never overlap the source image regardless
 *      of how tall the responsive header gets.
 */

import type { ReactElement } from 'react';

interface MediaPageBackdropProps {
  src?: string | null;
  mode?: 'banner' | 'cover';
  alt?: string;
}

const MediaPageBackdrop = ({
  src,
  mode = 'banner',
  alt = '',
}: MediaPageBackdropProps): ReactElement | null => {
  if (!src) return null;

  const isCover = mode === 'cover';

  // Gradient ramp. Cover mode goes darker faster (0.7 start)
  // and reaches 1.0 by 85% so the last 15% is solid charcoal —
  // overview text on mobile lands there cleanly. Banner mode
  // keeps the original Movie/TV ramp (0.47 → 1.0 across the
  // full height) since real backdrops are designed for that
  // long fade.
  const gradient = isCover
    ? 'linear-gradient(180deg, rgba(17, 24, 39, 0.70) 0%, rgba(17, 24, 39, 1) 85%, rgba(17, 24, 39, 1) 100%)'
    : 'linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)';

  return (
    // ``overflow-hidden`` is critical: in cover mode the inner
    // ``<img>`` is ``scale-110``, which without clipping bleeds
    // 5% past every container edge — including the right edge
    // of the viewport on mobile.
    <div className="media-page-bg-image overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          // Anchor the visible portion of a portrait cover to its
          // top edge — that's where the artwork sits on a book
          // / game / comic cover. ``center`` (the default) would
          // show the middle of the cover, which on tall portraits
          // is often a blank stripe of paper / dark spine.
          objectPosition: isCover ? 'center top' : 'center center',
        }}
        className={
          isCover ? 'scale-110 transform-gpu blur-lg' : undefined
        }
      />
      <div
        className="absolute inset-0"
        style={{ backgroundImage: gradient }}
      />
    </div>
  );
};

export default MediaPageBackdrop;
