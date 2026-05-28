/**
 * Gradient-or-backdrop genre tile for non-TMDB media types.
 *
 * Two render modes:
 *  * ``backdrops`` provided → render ONE cover (randomly picked
 *    per mount) as the background. Reloading the dashboard
 *    re-rolls the pick, but the tile doesn't animate between
 *    images. Mirrors the "best of the moment" feel of TMDB
 *    genre tiles without flickering on the user.
 *  * ``backdrops`` empty → fall back to a deterministic
 *    gradient derived from the genre name (so two browsers
 *    see the same colour for the same genre, no flicker).
 *
 * Same visual chrome (rounded card, hover scale, 32-36px tall)
 * as ``GenreCard`` so the dashboard rows for "Game Genres" /
 * "Manga Genres" sit identically with the existing "Movie
 * Genres" / "TV Genres" rows.
 */

import { withProperties } from '@app/utils/typeHelpers';
import Link from 'next/link';
import { useMemo, useState, type ReactElement } from 'react';

interface GradientGenreCardProps {
  name: string;
  url: string;
  canExpand?: boolean;
  /** Optional pool of background covers. The tile picks one at
   * random per mount (so the choice changes on a page reload
   * but doesn't animate). Falls back to gradient when empty. */
  backdrops?: string[];
}

// FNV-1a-ish hash → hue in [0, 360). Stable across reloads;
// browsers without crypto can still render colourful tiles.
function hueFor(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % 360;
}

const GradientGenreCard = ({
  name,
  url,
  canExpand = false,
  backdrops,
}: GradientGenreCardProps): ReactElement => {
  const [isHovered, setHovered] = useState(false);
  const hue = hueFor(name);
  const background = `linear-gradient(135deg, hsl(${hue}, 55%, 35%) 0%, hsl(${(hue + 30) % 360}, 60%, 18%) 100%)`;

  // Pick a single random backdrop per mount. ``useMemo`` keyed
  // on the URL list means the choice survives re-renders of
  // the same tile but a page reload picks a fresh one.
  const list = backdrops?.filter(Boolean) ?? [];
  const hasBackdrop = list.length > 0;
  const activeBackdrop = useMemo(
    () =>
      hasBackdrop ? list[Math.floor(Math.random() * list.length)] : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [list.join('|')]
  );

  return (
    <Link
      href={url}
      className={[
        'relative flex h-32 items-center justify-center sm:h-36',
        canExpand ? 'w-full' : 'w-56 sm:w-72',
        'transform-gpu cursor-pointer p-8 shadow ring-1 transition duration-300 ease-in-out',
        isHovered ? 'scale-105 ring-gray-500' : 'scale-100 ring-gray-700',
        'overflow-hidden rounded-xl',
      ].join(' ')}
      style={{ background }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setHovered(true);
      }}
      role="link"
      tabIndex={0}
    >
      {hasBackdrop && (
        <div
          className="absolute inset-0 z-0 h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${activeBackdrop})` }}
        />
      )}
      <div
        className={[
          'absolute inset-0 z-10 h-full w-full transition duration-300',
          // Darker scrim over backdrop so the genre name reads;
          // lighter scrim over the gradient (which is already
          // darker on its own).
          hasBackdrop
            ? isHovered
              ? 'bg-gray-900/50'
              : 'bg-gray-900/70'
            : isHovered
              ? 'bg-gray-800/10'
              : 'bg-gray-800/20',
        ].join(' ')}
      />
      <div className="relative z-20 w-full truncate whitespace-normal text-center text-2xl font-bold text-white drop-shadow sm:text-3xl">
        {name}
      </div>
    </Link>
  );
};

const GradientGenreCardPlaceholder = (): ReactElement => (
  <div className="relative h-32 w-56 animate-pulse rounded-xl bg-gray-700 sm:h-40 sm:w-72" />
);

export default withProperties(GradientGenreCard, {
  Placeholder: GradientGenreCardPlaceholder,
});
