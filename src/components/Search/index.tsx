import AudiobookCard from '@app/components/AudiobookCard';
import BookCard from '@app/components/BookCard';
import GameCard from '@app/components/GameCard';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import useDiscover from '@app/hooks/useDiscover';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Search', {
  search: 'Search',
  searchresults: 'Search Results',
  tabAll: 'Movies & TV',
  tabBooks: 'Books',
  tabAudiobooks: 'Audiobooks',
  tabGames: 'Games',
  noResults: 'No results found.',
});

type MediaTab = 'all' | 'books' | 'audiobooks' | 'games';

interface BookResult {
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  seriesName?: string;
  seriesPosition?: number;
  mediaStatus?: number | null;
  narratorName?: string;
  durationSeconds?: number;
}

interface BookSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: BookResult[];
}

interface GameResult {
  igdbId: number;
  title: string;
  platforms: Array<{
    id: number;
    name: string;
    mediaStatus?: number | null;
  }>;
  releaseYear?: number;
  developer?: string;
  coverUrl?: string;
  genre?: string;
  userRating?: number;
}

interface GameSearchResponse {
  results: GameResult[];
  totalResults: number;
}

const Search = () => {
  const intl = useIntl();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MediaTab>('all');
  const [bookResults, setBookResults] = useState<BookResult[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);

  const query = (router.query.query as string) ?? '';

  // Movie/TV search (existing)
  const {
    isLoadingInitialData,
    isEmpty,
    isLoadingMore,
    isReachingEnd,
    titles,
    fetchMore,
    error,
  } = useDiscover<MovieResult | TvResult | PersonResult>(
    `/api/v1/search`,
    { query: router.query.query },
    { hideAvailable: false, hideBlocklisted: false }
  );

  // Book search
  useEffect(() => {
    if (activeTab === 'books' || activeTab === 'audiobooks') {
      const type = activeTab === 'audiobooks' ? 'audiobook' : 'book';
      setIsLoadingBooks(true);
      axios
        .get<BookSearchResponse>('/api/v1/book/search', {
          params: { query, type, limit: 40 },
        })
        .then((res) => setBookResults(res.data.results))
        .catch(() => setBookResults([]))
        .finally(() => setIsLoadingBooks(false));
    }
  }, [query, activeTab]);

  // Game search
  useEffect(() => {
    if (activeTab === 'games') {
      setIsLoadingGames(true);
      axios
        .get<GameSearchResponse>('/api/v1/game/search', {
          params: { query, limit: 40 },
        })
        .then((res) => setGameResults(res.data.results))
        .catch(() => setGameResults([]))
        .finally(() => setIsLoadingGames(false));
    }
  }, [query, activeTab]);

  if (error && activeTab === 'all') {
    return <ErrorPage statusCode={500} />;
  }

  const tabs: Array<{ key: MediaTab; label: string }> = [
    { key: 'all', label: intl.formatMessage(messages.tabAll) },
    { key: 'books', label: intl.formatMessage(messages.tabBooks) },
    {
      key: 'audiobooks',
      label: intl.formatMessage(messages.tabAudiobooks),
    },
    { key: 'games', label: intl.formatMessage(messages.tabGames) },
  ];

  return (
    <>
      <PageTitle title={intl.formatMessage(messages.search)} />
      <div className="mb-5 mt-1">
        <Header>{intl.formatMessage(messages.searchresults)}</Header>
      </div>

      {/* Media Type Tabs */}
      <div className="mb-6 flex border-b border-gray-600">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Movies & TV (existing) */}
      {activeTab === 'all' && (
        <ListView
          items={titles}
          isEmpty={isEmpty}
          isLoading={
            isLoadingInitialData ||
            (isLoadingMore && (titles?.length ?? 0) > 0)
          }
          isReachingEnd={isReachingEnd}
          onScrollBottom={fetchMore}
        />
      )}

      {/* Books */}
      {activeTab === 'books' && (
        <div>
          {isLoadingBooks ? (
            <LoadingSpinner />
          ) : bookResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {bookResults.map((book) => (
                <BookCard
                  key={book.openLibraryId}
                  openLibraryId={book.openLibraryId}
                  title={book.title}
                  authorName={book.authorName}
                  coverUrl={book.coverUrl}
                  year={book.year}
                  publisher={book.publisher}
                  seriesName={book.seriesName}
                  seriesPosition={book.seriesPosition}
                  mediaStatus={book.mediaStatus ?? undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Audiobooks */}
      {activeTab === 'audiobooks' && (
        <div>
          {isLoadingBooks ? (
            <LoadingSpinner />
          ) : bookResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {bookResults.map((book) => (
                <AudiobookCard
                  key={book.openLibraryId}
                  openLibraryId={book.openLibraryId}
                  title={book.title}
                  authorName={book.authorName}
                  narratorName={book.narratorName}
                  durationSeconds={book.durationSeconds}
                  coverUrl={book.coverUrl}
                  year={book.year}
                  publisher={book.publisher}
                  mediaStatus={book.mediaStatus ?? undefined}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Games */}
      {activeTab === 'games' && (
        <div>
          {isLoadingGames ? (
            <LoadingSpinner />
          ) : gameResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {gameResults.map((game) => (
                <GameCard
                  key={game.igdbId}
                  igdbId={game.igdbId}
                  title={game.title}
                  platforms={game.platforms}
                  releaseYear={game.releaseYear}
                  developer={game.developer}
                  publisher={game.publisher}
                  genre={game.genre}
                  userRating={game.userRating}
                  coverUrl={game.coverUrl}
                  summary={game.summary}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default Search;
