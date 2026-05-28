import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import GameCard from '@app/components/GameCard';
import type { NextPage } from 'next';
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

const DiscoverGamesPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<PopularGame>
      title={intl.formatMessage({
        id: 'pages.discover.games.title',
        defaultMessage: 'Games',
      })}
      endpoint="/api/v1/discover/games"
      cardKey={(g) => g.igdbId}
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
