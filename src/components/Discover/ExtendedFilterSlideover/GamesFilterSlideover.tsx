/**
 * Filter slideover for the Discover Games page.
 *
 * Mirrors the chrome of FilterSlideover (films/TV) but with the
 * controls IGDB actually supports through ``/discover/games``:
 *   * Genre (single, IGDB integer id) — populated from
 *     ``/api/v1/discover/genreslider/games``
 *   * Platform (single, IGDB integer id) — populated from
 *     ``/api/v1/discover/platformslider/games`` (already filtered
 *     to Romarr-allowed platforms when restrictToRomarrPlatforms
 *     is on)
 *   * Release date window (from / to)
 *
 * Sort selector lives on the page itself (via DiscoverExtended's
 * ``sortOptions`` prop) so it's not duplicated here.
 */

import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import {
  useBatchUpdateQueryParams,
  useUpdateQueryParams,
} from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import Datepicker from '@seerr-team/react-tailwindcss-datepicker';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Discover.GamesFilterSlideover',
  {
    filters: 'Filters',
    activefilters:
      '{count, plural, one {# Active Filter} other {# Active Filters}}',
    releaseDate: 'Release Date',
    from: 'From',
    to: 'To',
    genre: 'Genre',
    platform: 'Platform',
    anyGenre: 'Any genre',
    anyPlatform: 'Any platform',
    clearfilters: 'Clear Active Filters',
  }
);

export interface GamesFilterValues {
  genre?: string;
  platform?: string;
  releaseDateGte?: string;
  releaseDateLte?: string;
}

export const countGamesActiveFilters = (v: GamesFilterValues): number => {
  let n = 0;
  if (v.genre) n += 1;
  if (v.platform) n += 1;
  if (v.releaseDateGte || v.releaseDateLte) n += 1;
  return n;
};

interface ApiTile {
  id: number | string;
  name: string;
  backdrops?: string[];
}

interface GamesFilterSlideoverProps {
  show: boolean;
  onClose: () => void;
  currentFilters: GamesFilterValues;
}

const GamesFilterSlideover = ({
  show,
  onClose,
  currentFilters,
}: GamesFilterSlideoverProps) => {
  const intl = useIntl();
  const updateQueryParams = useUpdateQueryParams({});
  const batchUpdateQueryParams = useBatchUpdateQueryParams({});

  const { data: genres } = useSWR<ApiTile[]>(
    '/api/v1/discover/genreslider/games',
    { revalidateOnFocus: false }
  );
  const { data: platforms } = useSWR<ApiTile[]>(
    '/api/v1/discover/platformslider/games',
    { revalidateOnFocus: false }
  );

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countGamesActiveFilters(currentFilters),
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
            <option key={`game-genre-${g.id}`} value={String(g.id)}>
              {g.name}
            </option>
          ))}
        </select>

        <span className="text-lg font-semibold">
          {intl.formatMessage(messages.platform)}
        </span>
        <select
          className="rounded-md"
          value={currentFilters.platform ?? ''}
          onChange={(e) =>
            updateQueryParams('platform', e.target.value || undefined)
          }
        >
          <option value="">{intl.formatMessage(messages.anyPlatform)}</option>
          {(platforms ?? []).map((p) => (
            <option key={`game-platform-${p.id}`} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>

        <div>
          <div className="mb-2 text-lg font-semibold">
            {intl.formatMessage(messages.releaseDate)}
          </div>
          <div className="relative z-40 flex space-x-2">
            <div className="flex flex-col">
              <div className="mb-2">{intl.formatMessage(messages.from)}</div>
              <Datepicker
                primaryColor="indigo"
                value={{
                  startDate: currentFilters.releaseDateGte ?? null,
                  endDate: currentFilters.releaseDateGte ?? null,
                }}
                onChange={(value) =>
                  updateQueryParams(
                    'releaseDateGte',
                    value?.startDate ? (value.startDate as string) : undefined
                  )
                }
                inputName="fromdate"
                useRange={false}
                asSingle
                containerClassName="datepicker-wrapper"
                inputClassName="pr-1 sm:pr-4 text-base leading-5"
              />
            </div>
            <div className="flex flex-col">
              <div className="mb-2">{intl.formatMessage(messages.to)}</div>
              <Datepicker
                primaryColor="indigo"
                value={{
                  startDate: currentFilters.releaseDateLte ?? null,
                  endDate: currentFilters.releaseDateLte ?? null,
                }}
                onChange={(value) =>
                  updateQueryParams(
                    'releaseDateLte',
                    value?.startDate ? (value.startDate as string) : undefined
                  )
                }
                inputName="todate"
                useRange={false}
                asSingle
                containerClassName="datepicker-wrapper"
                inputClassName="pr-1 sm:pr-4 text-base leading-5"
              />
            </div>
          </div>
        </div>

        <div className="pt-4">
          <Button
            className="w-full"
            disabled={countGamesActiveFilters(currentFilters) === 0}
            onClick={() => {
              batchUpdateQueryParams({
                genre: undefined,
                platform: undefined,
                releaseDateGte: undefined,
                releaseDateLte: undefined,
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

export default GamesFilterSlideover;
