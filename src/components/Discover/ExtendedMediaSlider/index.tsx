/**
 * Dashboard slider for the non-TMDB media types (Games / Manga
 * / Comics / Books / Audiobooks).
 *
 * Mirrors the visual structure of ``MediaSlider`` (slider header
 * with title + optional "see more" link, horizontal scrollable
 * row of cards) but decoupled from the TMDB-specific
 * Movie/TV/Person card switch — each caller passes a
 * ``renderCard`` function that returns the right per-type card.
 *
 * Data comes from the ``/api/v1/discover/{type}`` endpoints we
 * already wired for the dedicated browse pages, so the dashboard
 * row and the full-list browse page share the same source of
 * truth.
 *
 * Self-hides when the first page returns zero results (or
 * errors) — operators who haven't configured the upstream for a
 * given type don't see a blank row, they see nothing at all.
 * That maps cleanly onto the "show row only when there's
 * content" expectation the operator articulated.
 */

import ShowMoreCard from '@app/components/MediaSlider/ShowMoreCard';
import Slider from '@app/components/Slider';
import { ArrowRightCircleIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { type ReactElement, type ReactNode } from 'react';
import useSWRInfinite from 'swr/infinite';

interface DiscoverEnvelope<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

interface ExtendedMediaSliderProps<T> {
  /** Visible slider title (e.g. "Popular Games"). */
  title: string;
  /** Backend endpoint — must return DiscoverEnvelope<T>. */
  url: string;
  /** Optional "see more" target. Renders the show-more card at
   * the end when set AND we have more than 20 items. */
  linkUrl?: string;
  /** Stable cache key for SWR. Mirrors the same prop on
   * MediaSlider so the two coexist on the dashboard without
   * collision. */
  sliderKey: string;
  /** Render one item as a JSX card. The wrapper handles the
   * <li> + key extraction. */
  renderCard: (item: T) => ReactNode;
  /** Stable per-item key extractor — used for React's ``key``
   * on the per-card ``<li>``. */
  cardKey: (item: T) => string | number;
}

function ExtendedMediaSlider<T>(
  props: ExtendedMediaSliderProps<T>
): ReactElement | null {
  const { data, error, size, setSize } = useSWRInfinite<
    DiscoverEnvelope<T>
  >(
    (pageIndex, previousPageData) => {
      if (
        previousPageData &&
        (pageIndex + 1 > previousPageData.totalPages ||
          (previousPageData.results.length === 0 && pageIndex > 0))
      ) {
        return null;
      }
      return `${props.url}?page=${pageIndex + 1}`;
    },
    { initialSize: 2, revalidateFirstPage: false, revalidateOnFocus: false }
  );

  const items: T[] = data ? data.flatMap((env) => env.results) : [];

  // Auto-fetch a second page when the first page came back
  // short, mirroring MediaSlider's behavior — keeps the row
  // visually full when individual pages are small.
  if (
    items.length < 20 &&
    size < 3 &&
    (data?.[0]?.totalResults ?? 0) > size * 20
  ) {
    setSize(size + 1);
  }

  // Self-hide on first-page emptiness or hard error so unmet
  // upstreams (e.g. ComicVine without an API key) don't leave a
  // dead row on the dashboard. Loading state still renders the
  // Slider's skeleton so the dashboard layout stays stable
  // during the initial fetch.
  if (data && (data[0]?.results?.length ?? 0) === 0) return null;
  if (error) return null;

  // NB: the inner ``Slider`` component already wraps each item
  // in its own ``<div class="inline-block px-2 align-top">``
  // (mirrors how MediaSlider hands TitleCard straight in), so
  // we MUST NOT add an extra ``<li>`` here — a double wrap
  // makes the inline-block parent collapse to zero width,
  // which in turn collapses the card's ``paddingBottom: 150%``
  // to zero height. Operator-visible symptom: only dots and
  // the show-more tile rendered in each row.
  const cards: JSX.Element[] = items
    .slice(0, 20)
    .map((item) => (
      <div key={`${props.sliderKey}-${props.cardKey(item)}`}>
        {props.renderCard(item)}
      </div>
    ));

  // ShowMore card — same UX MediaSlider uses for the movie/tv
  // rows, but WITHOUT a poster mosaic: ShowMoreCard hard-codes
  // the TMDB image-proxy base (``image.tmdb.org/t/p/...``) in
  // front of whatever string lands in ``posters``, so handing
  // it our IGDB / Hardcover / AniList / ComicVine full URLs
  // produces broken concatenations (``https://image.tmdb.org/
  // t/p/w300_and_h450_facehttps://images.igdb.com/…``). Pass
  // an empty array so the card renders the simple "see more"
  // tile with no thumbnails — operator still gets the click
  // target, no broken images.
  if (props.linkUrl && items.length > 20) {
    cards.push(
      <ShowMoreCard
        key={`${props.sliderKey}-show-more`}
        url={props.linkUrl}
        posters={[]}
      />
    );
  }

  return (
    <>
      <div className="slider-header">
        {props.linkUrl ? (
          <Link href={props.linkUrl} className="slider-title min-w-0 pr-16">
            <span className="truncate">{props.title}</span>
            <ArrowRightCircleIcon />
          </Link>
        ) : (
          <div className="slider-title">
            <span>{props.title}</span>
          </div>
        )}
      </div>
      <Slider
        sliderKey={props.sliderKey}
        isLoading={!data && !error}
        items={cards}
      />
    </>
  );
}

export default ExtendedMediaSlider;
