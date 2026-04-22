import AudiobookCard from '@app/components/AudiobookCard';
import BookCard from '@app/components/BookCard';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import GameCard from '@app/components/GameCard';
import useDiscover from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
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
  bookBadge: 'Book',
  seriesBadge: 'Series',
  authorBadge: 'Author',
  seriesCountFmt: '{count, plural, one {# book} other {# books}}',
  authorBooksFmt: '{count, plural, one {# book} other {# books}}',
});

type MediaTab = 'all' | 'books' | 'audiobooks' | 'games';

const AuthorSearchCard = ({
  result,
}: {
  result: AuthorSearchResult;
}) => {
  const intl = useIntl();
  return (
    <Link href={`/book/author/${encodeURIComponent(result.key)}`}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
          {result.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.photoUrl}
              alt={result.name}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl text-gray-500">
              {result.name[0]?.toUpperCase() ?? '?'}
            </div>
          )}
          <div className="absolute left-0 right-0 top-0 flex items-center gap-1 p-2">
            <div className="pointer-events-none z-40 rounded-full border border-purple-500 bg-purple-600/80 shadow-md">
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(messages.authorBadge)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {result.name}
          </h3>
          {result.booksCount !== undefined && (
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage(messages.authorBooksFmt, {
                count: result.booksCount,
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

const SeriesSearchCard = ({ result }: { result: SeriesResult }) => {
  const intl = useIntl();
  return (
    <Link href={`/book/series/${encodeURIComponent(result.key)}`}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
          {result.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.coverUrl}
              alt={result.name}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <BookOpenIcon className="h-12 w-12 text-gray-500" />
            </div>
          )}
          <div className="absolute left-0 right-0 top-0 flex items-center justify-between gap-1 p-2">
            <div className="flex items-center gap-1">
              {/* Book badge (orange) — visual parity with book cards. */}
              <div className="pointer-events-none z-40 rounded-full border border-orange-500 bg-orange-600/80 shadow-md">
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {intl.formatMessage(messages.bookBadge)}
                </div>
              </div>
              {/* Series badge (indigo) — marks this card as a series
                  entry rather than an individual book. */}
              <div className="pointer-events-none z-40 rounded-full border border-indigo-500 bg-indigo-600/80 shadow-md">
                <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                  {intl.formatMessage(messages.seriesBadge)}
                </div>
              </div>
            </div>
            {/* Aggregate availability of the series' books — same badge
                component as movies/TV so colours / icons match. */}
            {result.aggregateStatus !== undefined &&
              result.aggregateStatus !== MediaStatus.UNKNOWN && (
                <div className="pointer-events-none z-40 flex">
                  <StatusBadgeMini status={result.aggregateStatus} shrink />
                </div>
              )}
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {result.name}
          </h3>
          {result.authorName && (
            <p className="truncate text-xs text-gray-400">
              {result.authorName}
            </p>
          )}
          {result.memberCount !== undefined && (
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage(messages.seriesCountFmt, {
                count: result.memberCount,
              })}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
};

interface BookResult {
  type?: 'book';
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

interface SeriesResult {
  type: 'series';
  key: string;
  name: string;
  authorName?: string;
  coverUrl?: string;
  memberCount?: number;
  description?: string;
  aggregateStatus?: number;
}

interface AuthorSearchResult {
  type: 'author';
  key: string;
  name: string;
  photoUrl?: string;
  bio?: string;
  booksCount?: number;
}

type BookOrSeriesResult = BookResult | SeriesResult | AuthorSearchResult;

interface BookSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: BookOrSeriesResult[];
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
  const { currentSettings } = useSettings();
  const bookEnabled = currentSettings.bookEnabled;
  const audiobookEnabled = currentSettings.audiobookEnabled;
  const gameEnabled = currentSettings.gameEnabled;
  const [activeTab, setActiveTab] = useState<MediaTab>('all');
  const [bookResults, setBookResults] = useState<BookOrSeriesResult[]>([]);
  const [audiobookResults, setAudiobookResults] = useState<
    (BookResult | AuthorSearchResult)[]
  >([]);
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

    if (bookEnabled) {
      setIsLoadingBooks(true);
      axios
        .get<BookSearchResponse>('/api/v1/book/search', {
          params: { query, type: 'book', limit: 40 },
          paramsSerializer,
        })
        .then((res) => setBookResults(res.data.results))
        .catch(() => setBookResults([]))
        .finally(() => setIsLoadingBooks(false));
    } else {
      setBookResults([]);
    }

    if (audiobookEnabled) {
      setIsLoadingAudiobooks(true);
      axios
        .get<BookSearchResponse>('/api/v1/book/search', {
          params: { query, type: 'audiobook', limit: 40 },
          paramsSerializer,
        })
        .then((res) =>
          // Audiobook search never returns series items — filter them
          // out so the author-card path and the audiobook cards don't
          // have to worry about a third shape.
          setAudiobookResults(
            res.data.results.filter(
              (r): r is BookResult | AuthorSearchResult => r.type !== 'series'
            )
          )
        )
        .catch(() => setAudiobookResults([]))
        .finally(() => setIsLoadingAudiobooks(false));
    } else {
      setAudiobookResults([]);
    }

    if (gameEnabled) {
      setIsLoadingGames(true);
      axios
        .get<GameSearchResponse>('/api/v1/game/search', {
          params: { query, limit: 40 },
          paramsSerializer,
        })
        .then((res) => setGameResults(res.data.results))
        .catch(() => setGameResults([]))
        .finally(() => setIsLoadingGames(false));
    } else {
      setGameResults([]);
    }
  }, [query, bookEnabled, audiobookEnabled, gameEnabled]);

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
    ...(bookEnabled
      ? [
          {
            key: 'books' as MediaTab,
            label: intl.formatMessage(messages.tabBooks),
            count: isLoadingBooks ? null : bookResults.length,
            loading: isLoadingBooks,
          },
        ]
      : []),
    ...(audiobookEnabled
      ? [
          {
            key: 'audiobooks' as MediaTab,
            label: intl.formatMessage(messages.tabAudiobooks),
            count: isLoadingAudiobooks ? null : audiobookResults.length,
            loading: isLoadingAudiobooks,
          },
        ]
      : []),
    ...(gameEnabled
      ? [
          {
            key: 'games' as MediaTab,
            label: intl.formatMessage(messages.tabGames),
            count: isLoadingGames ? null : gameResults.length,
            loading: isLoadingGames,
          },
        ]
      : []),
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
              {bookResults.map((item) => {
                if (item.type === 'series') {
                  return (
                    <li key={`series:${item.key}`}>
                      <SeriesSearchCard result={item} />
                    </li>
                  );
                }
                if (item.type === 'author') {
                  return (
                    <li key={`author:${item.key}`}>
                      <AuthorSearchCard result={item} />
                    </li>
                  );
                }
                return (
                  <li key={item.openLibraryId}>
                    <BookCard
                      openLibraryId={item.openLibraryId}
                      title={item.title}
                      authorName={item.authorName}
                      coverUrl={item.coverUrl}
                      year={item.year}
                      publisher={item.publisher}
                      seriesName={item.seriesName}
                      seriesPosition={item.seriesPosition}
                      mediaStatus={item.mediaStatus ?? undefined}
                    />
                  </li>
                );
              })}
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
              {audiobookResults.map((item) => {
                if (item.type === 'author') {
                  return (
                    <li key={`author:${item.key}`}>
                      <AuthorSearchCard result={item} />
                    </li>
                  );
                }
                return (
                  <li key={item.openLibraryId}>
                    <AudiobookCard
                      openLibraryId={item.openLibraryId}
                      title={item.title}
                      authorName={item.authorName}
                      narratorName={item.narratorName}
                      durationSeconds={item.durationSeconds}
                      coverUrl={item.coverUrl}
                      year={item.year}
                      publisher={item.publisher}
                      mediaStatus={item.mediaStatus ?? undefined}
                    />
                  </li>
                );
              })}
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
