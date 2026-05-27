/**
 * Shared browse-page shell for the non-TMDB media types
 * (Games / Manga / Comics / Books / Audiobooks).
 *
 * Mirrors the visual structure of ``DiscoverMovies`` /
 * ``DiscoverTv`` — ``<PageTitle>``, ``<Header>``, then a
 * ``cards-vertical`` grid that paginates via "load more" —
 * but is fully decoupled from the TMDB ``useDiscover`` hook
 * because that hook hard-codes blocklist / watchlist gates
 * specific to movies+tv.
 *
 * Pagination is operator-driven (Load more button) rather
 * than the infinite-scroll the movie/tv pages use. Reasoning:
 * the extended-media providers don't all expose ``totalPages``,
 * and our envelopes optimistically bump ``totalPages = page+1``
 * until the response shortens — that's safer with an explicit
 * click than a scroll trigger that would chase phantom pages.
 *
 * When the backend returns ``totalResults === 0`` on page 1
 * (the comics / books / audiobooks fall-through for providers
 * with no real "popular" endpoint), the shell renders the
 * ``emptyHint`` so the operator sees a useful "search instead"
 * message rather than a blank grid.
 */

import Button from '@app/components/Common/Button';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { useState, type ReactElement, type ReactNode } from 'react';
import { useIntl } from 'react-intl';
import useSWRInfinite from 'swr/infinite';

interface DiscoverEnvelope<T> {
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

interface DiscoverExtendedProps<T> {
  title: string;
  endpoint: string;
  renderCard: (item: T, key: string | number) => ReactNode;
  /** Key extractor for the ``<li>``. Falls back to array index. */
  cardKey?: (item: T) => string | number;
  /** Shown when the first page returns zero results — typical
   * fallback for providers without a real popular endpoint. */
  emptyHint?: ReactNode;
}

function DiscoverExtended<T>(
  props: DiscoverExtendedProps<T>
): ReactElement {
  const intl = useIntl();
  // Tracks how many times the operator pressed "Load more". Used
  // only to force a re-render when SWR's ``size`` change alone
  // doesn't (e.g. when the new page resolves from cache instantly).
  const [, setLoadMoreClicks] = useState(0);

  const { data, error, size, setSize, isValidating } = useSWRInfinite<
    DiscoverEnvelope<T>
  >(
    (pageIndex, previousPageData) => {
      // Stop fetching once the previous page reported it was the
      // last one. Providers without a real total bump
      // ``totalPages = page + 1`` until the response shortens, so
      // we check both the explicit limit AND whether results came
      // back empty.
      if (
        previousPageData &&
        (pageIndex + 1 > previousPageData.totalPages ||
          (previousPageData.results.length === 0 && pageIndex > 0))
      ) {
        return null;
      }
      return `${props.endpoint}?page=${pageIndex + 1}`;
    },
    { revalidateFirstPage: false, revalidateOnFocus: false }
  );

  const items: T[] = data ? data.flatMap((envelope) => envelope.results) : [];
  const firstPage = data?.[0];
  const isLoadingInitial = !data && !error;
  const isLoadingMore =
    isValidating && data !== undefined && data.length > 0 && size > data.length - 1;
  const lastPage = data?.[data.length - 1];
  const isEmpty = firstPage?.totalResults === 0 && items.length === 0;
  const isReachingEnd =
    !!lastPage &&
    (lastPage.results.length === 0 || lastPage.page >= lastPage.totalPages);

  return (
    <>
      <PageTitle title={props.title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{props.title}</Header>
      </div>

      {isLoadingInitial ? (
        <LoadingSpinner />
      ) : isEmpty ? (
        <div className="rounded-md border border-dashed border-gray-700 bg-gray-800/40 p-8 text-center text-gray-300">
          {props.emptyHint ?? (
            <p>
              {intl.formatMessage(
                {
                  id: 'components.Discover.DiscoverExtended.noContent',
                  defaultMessage:
                    'No popular content available right now — use search to browse.',
                },
                {}
              )}
            </p>
          )}
        </div>
      ) : (
        <>
          <ul className="cards-vertical">
            {items.map((item, idx) =>
              props.renderCard(
                item,
                props.cardKey ? props.cardKey(item) : idx
              )
            )}
          </ul>
          {!isReachingEnd && (
            <div className="mt-6 flex justify-center">
              <Button
                buttonType="primary"
                disabled={isLoadingMore}
                onClick={() => {
                  setLoadMoreClicks((n) => n + 1);
                  setSize(size + 1);
                }}
              >
                {isLoadingMore
                  ? intl.formatMessage({
                      id: 'components.Discover.DiscoverExtended.loading',
                      defaultMessage: 'Loading…',
                    })
                  : intl.formatMessage({
                      id: 'components.Discover.DiscoverExtended.loadMore',
                      defaultMessage: 'Load more',
                    })}
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default DiscoverExtended;
