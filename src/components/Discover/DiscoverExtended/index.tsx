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

import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import { useUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import { BarsArrowDownIcon } from '@heroicons/react/24/solid';
import { useRouter } from 'next/router';
import { type ReactElement, type ReactNode } from 'react';
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
  /** Sort-selector options. When omitted, no selector renders.
   * Values are forwarded to the endpoint as ``?sort=<value>``
   * and round-trip via the URL query so the choice survives
   * a refresh. */
  sortOptions?: { value: string; label: string }[];
}

function DiscoverExtended<T>(
  props: DiscoverExtendedProps<T>
): ReactElement {
  const intl = useIntl();
  const router = useRouter();
  const updateQueryParams = useUpdateQueryParams({});

  // Sort param round-trips through the URL so refreshes / shared
  // links preserve the operator's choice. Default = first option
  // (typically "popular").
  const sortFromUrl =
    typeof router.query.sort === 'string' ? router.query.sort : undefined;
  const activeSort =
    props.sortOptions?.find((o) => o.value === sortFromUrl)?.value ??
    props.sortOptions?.[0]?.value;

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
      const qs = new URLSearchParams({ page: String(pageIndex + 1) });
      if (activeSort) qs.set('sort', activeSort);
      return `${props.endpoint}?${qs.toString()}`;
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

  // Auto-load on scroll-to-bottom — same UX DiscoverMovies /
  // DiscoverTv get via ListView's ``useVerticalScroll``. Replaces
  // the explicit "Load more" button: an operator scrolling
  // through Popular Books expects the next page to materialise
  // when they reach the bottom of the grid, not to have to
  // click a button.
  useVerticalScroll(
    () => setSize(size + 1),
    !isLoadingMore && !isLoadingInitial && !isEmpty && !isReachingEnd
  );

  return (
    <>
      <PageTitle title={props.title} />
      <div className="mb-4 flex flex-col justify-between lg:flex-row lg:items-end">
        <Header>{props.title}</Header>
        {props.sortOptions && props.sortOptions.length > 1 && (
          <div className="mt-2 flex flex-grow flex-col sm:flex-row lg:flex-grow-0">
            <div className="mb-2 flex flex-grow sm:mb-0 lg:flex-grow-0">
              {/* Same visual the DiscoverMovies sort selector
                  uses (icon prefix on a rounded-l-md gray-800
                  span, then the select with rounded-r-only).
                  Keeps the catalogue's sort UX consistent
                  between Movies/TV and the extended types. */}
              <span className="inline-flex cursor-default items-center rounded-l-md border border-r-0 border-gray-500 bg-gray-800 px-3 text-gray-100 sm:text-sm">
                <BarsArrowDownIcon className="h-6 w-6" />
              </span>
              <select
                id="sortBy"
                name="sortBy"
                className="rounded-r-only"
                value={activeSort ?? ''}
                onChange={(e) => updateQueryParams('sort', e.target.value)}
              >
                {props.sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
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
          {/* Passive loading footer — useVerticalScroll fires
              setSize on bottom-of-page; this spinner is just
              visual feedback during the in-flight fetch. */}
          {(isLoadingMore || (!isReachingEnd && isValidating)) && (
            <div className="mt-6 flex justify-center">
              <LoadingSpinner />
            </div>
          )}
        </>
      )}
    </>
  );
}

export default DiscoverExtended;
