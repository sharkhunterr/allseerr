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
            // The popular-by-rating-count IGDB endpoint doesn't
            // include platforms in its trimmed shape; an empty
            // array is fine — GameCard guards on length.
            platforms={[]}
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
