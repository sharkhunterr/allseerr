/**
 * Filter slideover for the Discover Books page.
 *
 * Filters honoured by ``/discover/books``:
 *   * Genre — Hardcover cached_tags.Genre name (populated from
 *     the genre-slider endpoint, only meaningful when Hardcover
 *     is the operator's active book provider)
 *   * Year window — applied in-memory to the merged Hardcover /
 *     OpenLibrary feed (works regardless of provider)
 */

import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import {
  useBatchUpdateQueryParams,
  useUpdateQueryParams,
} from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Discover.BooksFilterSlideover',
  {
    filters: 'Filters',
    activefilters:
      '{count, plural, one {# Active Filter} other {# Active Filters}}',
    genre: 'Genre',
    anyGenre: 'Any genre',
    year: 'Release Year',
    yearFrom: 'From',
    yearTo: 'To',
    clearfilters: 'Clear Active Filters',
  }
);

export interface BooksFilterValues {
  genre?: string;
  yearGte?: string;
  yearLte?: string;
}

export const countBooksActiveFilters = (v: BooksFilterValues): number => {
  let n = 0;
  if (v.genre) n += 1;
  if (v.yearGte || v.yearLte) n += 1;
  return n;
};

interface BooksFilterSlideoverProps {
  show: boolean;
  onClose: () => void;
  currentFilters: BooksFilterValues;
  /** Endpoint backing the genre dropdown — books vs audiobooks
   * have separate curated lists (Hardcover vs Audible). */
  genreEndpoint: string;
}

const BooksFilterSlideover = ({
  show,
  onClose,
  currentFilters,
  genreEndpoint,
}: BooksFilterSlideoverProps) => {
  const intl = useIntl();
  const updateQueryParams = useUpdateQueryParams({});
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

  const { data: genres } = useSWR<{ id: string | number; name: string }[]>(
    genreEndpoint,
    { revalidateOnFocus: false }
  );

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countBooksActiveFilters(currentFilters),
      })}
      onClose={onClose}
    >
      <div className="flex flex-col space-y-4">
        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.genre)}
        </span>
        <select
          className="rounded-md"
          value={currentFilters.genre ?? ''}
          onChange={(e) =>
            updateQueryParams('genre', e.target.value || undefined)
          }
        >
          <option value="">{intl.formatMessage(messages.anyGenre)}</option>
          {(genres ?? []).map((g) => (
            <option key={`book-genre-${g.id}`} value={String(g.id)}>
              {g.name}
            </option>
          ))}
        </select>

        <div>
          <div className="mb-2 text-lg font-semibold">
            {intl.formatMessage(messages.year)}
          </div>
          <div className="flex space-x-2">
            <input
              type="number"
              placeholder={intl.formatMessage(messages.yearFrom)}
              className="w-1/2 rounded-md"
              value={currentFilters.yearGte ?? ''}
              min={1500}
              max={2100}
              onChange={(e) =>
                updateQueryParams('yearGte', e.target.value || undefined)
              }
            />
            <input
              type="number"
              placeholder={intl.formatMessage(messages.yearTo)}
              className="w-1/2 rounded-md"
              value={currentFilters.yearLte ?? ''}
              min={1500}
              max={2100}
              onChange={(e) =>
                updateQueryParams('yearLte', e.target.value || undefined)
              }
            />
          </div>
        </div>

        <div className="pt-4">
          <Button
            className="w-full"
            disabled={countBooksActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                genre: undefined,
                yearGte: undefined,
                yearLte: undefined,
              });
              onClose();
            }}
          >
            <XCircleIcon />
            <span>{intl.formatMessage(messages.clearfilters)}</span>
          </Button>
        </div>
      </div>
    </SlideOver>
  );
};

export default BooksFilterSlideover;
