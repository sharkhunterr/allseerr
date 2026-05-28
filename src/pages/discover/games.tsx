import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import GamesFilterSlideover, {
  countGamesActiveFilters,
  type GamesFilterValues,
} from '@app/components/Discover/ExtendedFilterSlideover/GamesFilterSlideover';
import GameCard from '@app/components/GameCard';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

interface PopularGame {
  id: number;
  igdbId: number;
  title: string;
  coverUrl?: string;
  releaseYear?: number;
  summary?: string;
  rating?: number;
  /** IGDB's full platform list for this title, each annotated
   * with the user's per-platform availability. Matches the shape
   * the search page sends so the card's aggregator can compute
   * AVAILABLE / PARTIALLY_AVAILABLE consistently. */
  platforms?: {
    id: number;
    name: string;
    abbreviation?: string;
    mediaStatus?: number | null;
    gameMediaId?: number | null;
  }[];
}

// Pull the URL-shaped filter values from router.query. Strings
// only — DiscoverExtended already forwards them to the endpoint
// verbatim, so we don't need to coerce here (the server-side zod
// schema does the int coercion for ids).
const useGamesFilters = (): GamesFilterValues => {
  const router = useRouter();
  const get = (k: string) =>
    typeof router.query[k] === 'string'
      ? (router.query[k] as string)
      : undefined;
  return {
    genre: get('genre'),
    platform: get('platform'),
    releaseDateGte: get('releaseDateGte'),
    releaseDateLte: get('releaseDateLte'),
  };
};

const DiscoverGamesPage: NextPage = () => {
  const intl = useIntl();
  const filters = useGamesFilters();
  return (
    <DiscoverExtended<PopularGame>
      title={intl.formatMessage({
        id: 'pages.discover.games.title',
        defaultMessage: 'Games',
      })}
      endpoint="/api/v1/discover/games"
      cardKey={(g) => g.igdbId}
      sortOptions={[
        { value: 'popularity', label: 'Popularity' },
        { value: 'recent', label: 'Release date (newest)' },
        { value: 'oldest', label: 'Release date (oldest)' },
        { value: 'rating', label: 'Rating' },
        { value: 'title', label: 'Title (A→Z)' },
      ]}
      activeFilterCount={countGamesActiveFilters(filters)}
      renderFilters={({ show, onClose }) => (
        <GamesFilterSlideover
          show={show}
          onClose={onClose}
          currentFilters={filters}
        />
      )}
      renderCard={(g, key) => (
        <li key={key}>
          <GameCard
            igdbId={g.igdbId}
            title={g.title}
            platforms={(g.platforms ?? []) as never}
            releaseYear={g.releaseYear}
            coverUrl={g.coverUrl}
            summary={g.summary}
            userRating={g.rating}
          />
        </li>
      )}
    />
  );
};

export default DiscoverGamesPage;
