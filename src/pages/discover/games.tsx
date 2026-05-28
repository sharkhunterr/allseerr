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
  /** Aggregate local availability (max status across the title's
   * platforms). NULL when the operator hasn't requested or
   * downloaded the title yet. */
  mediaStatus?: number | null;
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
            // include per-platform statuses, so we synthesise a
            // single placeholder entry carrying the aggregate
            // status. GameCard's aggregator picks the MAX across
            // entries so a one-platform synthetic still drives
            // the badge correctly.
            platforms={
              g.mediaStatus
                ? [
                    {
                      id: 0,
                      name: '',
                      mediaStatus: g.mediaStatus as never,
                    },
                  ]
                : []
            }
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
