/**
 * Canonical-layout title card for non-TMDB media types.
 *
 * Visually identical to ``src/components/TitleCard`` — same
 * fixed 2:3 aspect (``paddingBottom: '150%'``), same hover
 * gradient overlay, same status-badge top-row — so a row of
 * Game / Manga / Book / Audiobook / Comic cards sits on the
 * dashboard alongside Movie / Series rows without any
 * visible size or layout difference.
 *
 * Why a parallel component instead of re-using TitleCard:
 * TitleCard is hard-wired to TMDB ID routing, Plex-watchlist
 * state, blocklist modals, and CachedImage (which only knows
 * the TMDB / TVDB image-proxy URL shape). That wiring isn't
 * useful for IGDB / OpenLibrary / ComicVine cards, and trying
 * to retrofit all of it would balloon TitleCard. This
 * component handles the surface the extended-media types
 * actually need: link, cover, status, type-label, optional
 * rating + year + summary on hover.
 *
 * Per-type cards (GameCard, MangaCard, ...) are now thin
 * wrappers that map their per-type props onto this surface
 * and pick the type-badge palette.
 */

import RatingBadge from '@app/components/Common/RatingBadge';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import { Transition } from '@headlessui/react';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import {
  Fragment,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

interface MediaTitleCardProps {
  /** Destination of the click (the card-wide link). */
  href: string;
  /** Cover image URL. When undefined the card renders a
   * placeholder block — the operator-visible card stays the
   * same size so the row's layout never shifts. */
  coverUrl?: string;
  title: string;
  /** Year shown above the title on hover (small, muted). */
  year?: number | string;
  /** Optional 1-line subtitle ABOVE the title on hover (author
   * name, narrator, etc.). For most cards this is undefined. */
  subtitle?: string;
  /** Optional multi-line summary shown below the title on
   * hover. Truncated to 5 lines. */
  summary?: string;
  /** Status badge shown top-right. When ``MediaStatus.UNKNOWN``
   * or undefined the badge is omitted. */
  mediaStatus?: MediaStatus | null;
  /** Short label on the top-left badge (e.g. "Game", "Manga",
   * "Audiobook"). Each type picks its own ``typeBadgeClasses``
   * so the palette is consistent with the rest of the app. */
  typeLabel?: string;
  /** Tailwind classes for the type badge — caller supplies the
   * per-type colour scheme. Defaults to the same teal Game
   * card used so existing GameCard callers don't have to set
   * anything. */
  typeBadgeClasses?: string;
  /** Extra badges stacked under the type badge on the top-left.
   * Each entry is rendered as a small pill with the same shape
   * as the type badge — caller controls the colour palette via
   * ``classes``. Used by MagazineCard to surface publication
   * status (ongoing / ceased) and frequency. */
  extraBadges?: { label: string; classes: string }[];
  /** Optional 0-100 rating pill in the bottom-right. */
  rating?: number;
  /** Optional in-card visual on top of the cover (e.g. a
   * placeholder icon when ``coverUrl`` is missing). Rendered
   * INSIDE the cover container so the card boundary stays
   * fixed. */
  coverFallback?: ReactNode;
}

const MediaTitleCard = ({
  href,
  coverUrl,
  title,
  year,
  subtitle,
  summary,
  mediaStatus,
  typeLabel,
  typeBadgeClasses = 'border-teal-500 bg-teal-600/80',
  extraBadges,
  rating,
  coverFallback,
}: MediaTitleCardProps): ReactElement => {
  const [showDetail, setShowDetail] = useState(false);

  const showStatusBadge =
    mediaStatus !== undefined &&
    mediaStatus !== null &&
    mediaStatus !== MediaStatus.UNKNOWN;

  return (
    // Outer width wrapper — MATCHES the dimensions TitleCard
    // uses (``w-36 sm:w-36 md:w-44``) so a row mixing Movies +
    // Games + Books renders with one consistent card width.
    // The ``paddingBottom: '150%'`` trick below resolves against
    // THIS wrapper's width; without it the card collapses to
    // zero (operator-visible as empty dots in the slider row).
    <div className="w-36 sm:w-36 md:w-44" data-testid="media-title-card">
    <div
      className={[
        'relative transform-gpu cursor-default overflow-hidden rounded-xl',
        'bg-gray-800 bg-cover outline-none ring-1 transition duration-300',
        showDetail
          ? 'scale-105 shadow-lg ring-gray-500'
          : 'scale-100 shadow ring-gray-700',
      ].join(' ')}
      // 2:3 aspect via padding-bottom — same trick TitleCard
      // uses; lets the inner content render absolutely without
      // any height computation.
      style={{ paddingBottom: '150%' }}
      onMouseEnter={() => setShowDetail(true)}
      onMouseLeave={() => setShowDetail(false)}
      onClick={() => setShowDetail(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') setShowDetail(true);
      }}
      role="link"
      tabIndex={0}
    >
      <div className="absolute inset-0 h-full w-full overflow-hidden">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
            {coverFallback ?? (
              <div className="text-gray-500">{title.slice(0, 1)}</div>
            )}
          </div>
        )}

        {/* Top row — type label + extra badges (left, stacked)
            + status badge (right) */}
        <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-2">
          <div className="flex flex-col items-start gap-1">
            {typeLabel && (
              <div
                className={[
                  'pointer-events-none z-40 self-start rounded-full border shadow-md',
                  typeBadgeClasses,
                ].join(' ')}
              >
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {typeLabel}
                </div>
              </div>
            )}
            {extraBadges?.map((b, idx) => (
              <div
                key={`extra-${idx}-${b.label}`}
                className={[
                  'pointer-events-none z-40 self-start rounded-full border shadow-md',
                  b.classes,
                ].join(' ')}
              >
                <div className="flex h-4 items-center px-2 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-white sm:h-5">
                  {b.label}
                </div>
              </div>
            ))}
          </div>
          {showStatusBadge && (
            <div className="pointer-events-none z-40 flex">
              <StatusBadgeMini status={mediaStatus} shrink />
            </div>
          )}
        </div>

        {/* Rating pill — matches the canonical RatingBadge
            position (bottom-right) and only renders for >0
            scores. */}
        <RatingBadge score={rating} />

        {/* Hover overlay — gradient bottom-up with year +
            title + summary. Matches TitleCard's reveal-on-hover
            behaviour so the dashboard reads the same. */}
        <Transition
          as={Fragment}
          show={showDetail || !coverUrl}
          enter="transition-opacity"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="transition-opacity"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="absolute inset-0 overflow-hidden rounded-xl">
            <Link
              href={href}
              className="absolute inset-0 h-full w-full cursor-pointer overflow-hidden text-left"
              style={{
                background:
                  'linear-gradient(180deg, rgba(45, 55, 72, 0.4) 0%, rgba(45, 55, 72, 0.9) 100%)',
              }}
            >
              <div className="flex h-full w-full items-end">
                <div className="px-2 pb-2 text-white">
                  {year && (
                    <div className="text-sm font-medium">{year}</div>
                  )}
                  {subtitle && (
                    <div className="truncate text-xs text-gray-300">
                      {subtitle}
                    </div>
                  )}
                  <h1
                    className="whitespace-normal text-xl font-bold leading-tight"
                    style={{
                      WebkitLineClamp: 3,
                      display: '-webkit-box',
                      overflow: 'hidden',
                      WebkitBoxOrient: 'vertical',
                      wordBreak: 'break-word',
                    }}
                  >
                    {title}
                  </h1>
                  {summary && (
                    <div
                      className="whitespace-normal text-xs"
                      style={{
                        WebkitLineClamp: 5,
                        display: '-webkit-box',
                        overflow: 'hidden',
                        WebkitBoxOrient: 'vertical',
                        wordBreak: 'break-word',
                      }}
                    >
                      {summary}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          </div>
        </Transition>
      </div>
    </div>
    </div>
  );
};

export default MediaTitleCard;
