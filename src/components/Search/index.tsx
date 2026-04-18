import AudiobookCard from '@app/components/AudiobookCard';
import BookCard from '@app/components/BookCard';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import GameCard from '@app/components/GameCard';
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
  platforms: {
    id: number;
    name: string;
    mediaStatus?: number | null;
  }[];
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  coverUrl?: string;
  genre?: string;
  userRating?: number;
  summary?: string;
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
  const [audiobookResults, setAudiobookResults] = useState<BookResult[]>([]);
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingAudiobooks, setIsLoadingAudiobooks] = useState(false);
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

  // Load all other results in parallel when query changes
  useEffect(() => {
    if (!query) {
      setBookResults([]);
      setAudiobookResults([]);
      setGameResults([]);
      return;
    }

    // Use %20 instead of '+' for spaces (OpenAPI validator rejects '+')
    const paramsSerializer = (params: Record<string, unknown>) =>
      Object.entries(params)
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`
        )
        .join('&');

    setIsLoadingBooks(true);
    setIsLoadingAudiobooks(true);
    setIsLoadingGames(true);

    axios
      .get<BookSearchResponse>('/api/v1/book/search', {
        params: { query, type: 'book', limit: 40 },
        paramsSerializer,
      })
      .then((res) => setBookResults(res.data.results))
      .catch(() => setBookResults([]))
      .finally(() => setIsLoadingBooks(false));

    axios
      .get<BookSearchResponse>('/api/v1/book/search', {
        params: { query, type: 'audiobook', limit: 40 },
        paramsSerializer,
      })
      .then((res) => setAudiobookResults(res.data.results))
      .catch(() => setAudiobookResults([]))
      .finally(() => setIsLoadingAudiobooks(false));

    axios
      .get<GameSearchResponse>('/api/v1/game/search', {
        params: { query, limit: 40 },
        paramsSerializer,
      })
      .then((res) => setGameResults(res.data.results))
      .catch(() => setGameResults([]))
      .finally(() => setIsLoadingGames(false));
  }, [query]);

  if (error && activeTab === 'all') {
    return <ErrorPage statusCode={500} />;
  }

  const tabs: {
    key: MediaTab;
    label: string;
    count: number | null;
    loading: boolean;
  }[] = [
    {
      key: 'all',
      label: intl.formatMessage(messages.tabAll),
      count: titles?.length ?? null,
      loading: isLoadingInitialData,
    },
    {
      key: 'books',
      label: intl.formatMessage(messages.tabBooks),
      count: isLoadingBooks ? null : bookResults.length,
      loading: isLoadingBooks,
    },
    {
      key: 'audiobooks',
      label: intl.formatMessage(messages.tabAudiobooks),
      count: isLoadingAudiobooks ? null : audiobookResults.length,
      loading: isLoadingAudiobooks,
    },
    {
      key: 'games',
      label: intl.formatMessage(messages.tabGames),
      count: isLoadingGames ? null : gameResults.length,
      loading: isLoadingGames,
    },
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
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'border-b-2 border-indigo-500 text-indigo-400'
                : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  activeTab === tab.key
                    ? 'bg-indigo-500/30 text-indigo-300'
                    : 'bg-gray-700 text-gray-400'
                }`}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Movies & TV (existing) */}
      {activeTab === 'all' && (
        <ListView
          items={titles}
          isEmpty={isEmpty}
          isLoading={
            isLoadingInitialData || (isLoadingMore && (titles?.length ?? 0) > 0)
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
            <ul className="cards-vertical">
              {bookResults.map((book) => (
                <li key={book.openLibraryId}>
                  <BookCard
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Audiobooks */}
      {activeTab === 'audiobooks' && (
        <div>
          {isLoadingAudiobooks ? (
            <LoadingSpinner />
          ) : audiobookResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {audiobookResults.map((book) => (
                <li key={book.openLibraryId}>
                  <AudiobookCard
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
                </li>
              ))}
            </ul>
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
            <ul className="cards-vertical">
              {gameResults.map((game) => (
                <li key={game.igdbId}>
                  <GameCard
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
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
};

export default Search;
