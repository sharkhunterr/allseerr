/**
 * Filter slideover for the Discover Manga page.
 *
 * AniList-flavoured filters (genre + format + status + country
 * of origin + start-year window) — single-value selects for the
 * fields AniList exposes as single-value GraphQL args, comma-
 * separated multi for ``format_in`` / ``status_in``.
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
  'components.Discover.MangaFilterSlideover',
  {
    filters: 'Filters',
    activefilters:
      '{count, plural, one {# Active Filter} other {# Active Filters}}',
    genre: 'Genre',
    format: 'Format',
    status: 'Status',
    country: 'Country of Origin',
    startYear: 'Start Year',
    yearFrom: 'From',
    yearTo: 'To',
    anyGenre: 'Any genre',
    anyCountry: 'Any country',
    clearfilters: 'Clear Active Filters',
  }
);

export interface MangaFilterValues {
  genre?: string;
  format?: string;
  status?: string;
  country?: string;
  startYearGte?: string;
  startYearLte?: string;
}

export const countMangaActiveFilters = (v: MangaFilterValues): number => {
  let n = 0;
  if (v.genre) n += 1;
  if (v.format) n += 1;
  if (v.status) n += 1;
  if (v.country) n += 1;
  if (v.startYearGte || v.startYearLte) n += 1;
  return n;
};

// AniList enum mirrors. Kept on the client to avoid a round-trip
// (these are stable across AniList API versions).
const FORMATS = ['MANGA', 'NOVEL', 'ONE_SHOT'] as const;
const STATUSES = [
  'RELEASING',
  'FINISHED',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
] as const;
const COUNTRIES: { code: string; label: string }[] = [
  { code: 'JP', label: 'Japan (Manga)' },
  { code: 'KR', label: 'South Korea (Manhwa)' },
  { code: 'CN', label: 'China (Manhua)' },
  { code: 'TW', label: 'Taiwan' },
];

interface MangaFilterSlideoverProps {
  show: boolean;
  onClose: () => void;
  currentFilters: MangaFilterValues;
}

const MangaFilterSlideover = ({
  show,
  onClose,
  currentFilters,
}: MangaFilterSlideoverProps) => {
  const intl = useIntl();
  const updateQueryParams = useUpdateQueryParams({});
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

  // Genres come from the dashboard's manga genre slider endpoint.
  const { data: genres } = useSWR<{ id: string; name: string }[]>(
    '/api/v1/discover/genreslider/manga',
    { revalidateOnFocus: false }
  );

  const toggleCsv = (key: keyof MangaFilterValues, value: string) => {
    const current = (currentFilters[key] ?? '')
      .split(',')
      .filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateQueryParams(key as string, next.length ? next.join(',') : undefined);
  };
  const csvHas = (key: keyof MangaFilterValues, value: string) =>
    (currentFilters[key] ?? '').split(',').includes(value);

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countMangaActiveFilters(currentFilters),
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
            <option key={`m-genre-${g.id}`} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.format)}
        </span>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map((f) => (
            <button
              key={`fmt-${f}`}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm transition ${
                csvHas('format', f)
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-gray-400'
              }`}
              onClick={() => toggleCsv('format', f)}
            >
              {f.replace('_', ' ')}
            </button>
          ))}
        </div>

        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.status)}
        </span>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={`st-${s}`}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm transition ${
                csvHas('status', s)
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : 'border-gray-600 bg-gray-800 text-gray-200 hover:border-gray-400'
              }`}
              onClick={() => toggleCsv('status', s)}
            >
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.country)}
        </span>
        <select
          className="rounded-md"
          value={currentFilters.country ?? ''}
          onChange={(e) =>
            updateQueryParams('country', e.target.value || undefined)
          }
        >
          <option value="">{intl.formatMessage(messages.anyCountry)}</option>
          {COUNTRIES.map((c) => (
            <option key={`co-${c.code}`} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>

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
            disabled={countMangaActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                genre: undefined,
                format: undefined,
                status: undefined,
                country: undefined,
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

export default MangaFilterSlideover;
