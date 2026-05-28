/**
 * Shared rating pill for media cards.
 *
 * Before this component lived here, each card type rolled its
 * own rating chip: GameCard used a yellow-filled square with
 * black text, MangaCard used a black pill with yellow text.
 * Two different palettes for the same semantic — "this title
 * scored X%". Operators reading the catalogue grid couldn't
 * mentally map "the yellow thing" to "the rating" the same way
 * across types.
 *
 * One pill style applied to all media cards: rounded-full,
 * semi-opaque black background, yellow-300 text. Matches the
 * Manga look (which is closer to TMDB rating chips on the
 * Movie/TV grid) so the catalogue reads as one product.
 *
 * Renders nothing when ``score`` is missing or ≤ 0 — callers
 * can pass the value straight through without a guard.
 */

import type { ReactElement } from 'react';

interface RatingBadgeProps {
  /** Score in 0-100. Game uses IGDB's ``total_rating`` directly
   * (already 0-100); manga uses AniList's ``averageScore`` (also
   * 0-100). Caller is responsible for any 0-10 → 0-100 scaling. */
  score?: number | null;
  /** Where to position the pill relative to its parent. Defaults
   * to ``bottom-2 right-2`` (the dominant card-corner pattern). */
  className?: string;
}

const RatingBadge = ({
  score,
  className,
}: RatingBadgeProps): ReactElement | null => {
  if (typeof score !== 'number' || score <= 0) return null;

  return (
    <div
      className={[
        'pointer-events-none z-40 rounded-full bg-black/70 px-2 py-0.5',
        'text-xs font-bold text-yellow-300',
        className ?? 'absolute bottom-2 right-2',
      ].join(' ')}
    >
      {Math.round(score)}%
    </div>
  );
};

export default RatingBadge;
