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

  return (
    <div className="media-page-bg-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        className={
          isCover ? 'scale-110 transform-gpu blur-lg' : undefined
        }
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%)',
        }}
      />
    </div>
  );
};

export default MediaPageBackdrop;
