/**
 * Filter slideover for the Discover Comics page.
 *
 * ComicVine has a thin filter surface (no genre taxonomy, no
 * popularity index), so we expose only what the
 * ``/volumes/?filter=`` operator supports cleanly: publisher
 * substring match + start-year window.
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

const messages = defineMessages(
  'components.Discover.ComicsFilterSlideover',
  {
    filters: 'Filters',
    activefilters:
      '{count, plural, one {# Active Filter} other {# Active Filters}}',
    publisher: 'Publisher',
    publisherPlaceholder: 'e.g. Marvel, DC, Image',
    startYear: 'Start Year',
    yearFrom: 'From',
    yearTo: 'To',
    clearfilters: 'Clear Active Filters',
  }
);

export interface ComicsFilterValues {
  publisher?: string;
  startYearGte?: string;
  startYearLte?: string;
}

export const countComicsActiveFilters = (v: ComicsFilterValues): number => {
  let n = 0;
  if (v.publisher) n += 1;
  if (v.startYearGte || v.startYearLte) n += 1;
  return n;
};

interface ComicsFilterSlideoverProps {
  show: boolean;
  onClose: () => void;
  currentFilters: ComicsFilterValues;
}

const ComicsFilterSlideover = ({
  show,
  onClose,
  currentFilters,
}: ComicsFilterSlideoverProps) => {
  const intl = useIntl();
  const updateQueryParams = useUpdateQueryParams({});
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countComicsActiveFilters(currentFilters),
      })}
      onClose={onClose}
    >
      <div className="flex flex-col space-y-4">
        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.publisher)}
        </span>
        <input
          type="text"
          placeholder={intl.formatMessage(messages.publisherPlaceholder)}
          className="rounded-md"
          value={currentFilters.publisher ?? ''}
          onChange={(e) =>
            updateQueryParams('publisher', e.target.value || undefined)
          }
        />

        <div>
          <div className="mb-2 text-lg font-semibold">
            {intl.formatMessage(messages.startYear)}
          </div>
          <div className="flex space-x-2">
            <input
              type="number"
              placeholder={intl.formatMessage(messages.yearFrom)}
              className="w-1/2 rounded-md"
              value={currentFilters.startYearGte ?? ''}
              min={1900}
              max={2100}
              onChange={(e) =>
                updateQueryParams(
                  'startYearGte',
                  e.target.value || undefined
                )
              }
            />
            <input
              type="number"
              placeholder={intl.formatMessage(messages.yearTo)}
              className="w-1/2 rounded-md"
              value={currentFilters.startYearLte ?? ''}
              min={1900}
              max={2100}
              onChange={(e) =>
                updateQueryParams(
                  'startYearLte',
                  e.target.value || undefined
                )
              }
            />
          </div>
        </div>

        <div className="pt-4">
          <Button
            className="w-full"
            disabled={countComicsActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                publisher: undefined,
                startYearGte: undefined,
                startYearLte: undefined,
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

export default ComicsFilterSlideover;
