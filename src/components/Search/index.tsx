import AudiobookCard from '@app/components/AudiobookCard';
import BookCard from '@app/components/BookCard';
import ComicCard from '@app/components/ComicCard';
import Header from '@app/components/Common/Header';
import ListView from '@app/components/Common/ListView';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import GameCard from '@app/components/GameCard';
import MagazineCard from '@app/components/MagazineCard';
import MangaCard from '@app/components/MangaCard';
import { SearchLoadingContext } from '@app/context/SearchLoadingContext';
import useDiscover from '@app/hooks/useDiscover';
import useSettings from '@app/hooks/useSettings';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from '@server/models/Search';
import axios from 'axios';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useContext, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Search', {
  search: 'Search',
  searchresults: 'Search Results',
  tabAll: 'Movies & TV',
  tabBooks: 'Books',
  tabAudiobooks: 'Audiobooks',
  tabGames: 'Games',
  tabManga: 'Manga',
  tabComics: 'Comics',
  tabMagazines: 'Magazines',
  noResults: 'No results found.',
  bookBadge: 'Book',
  seriesBadge: 'Series',
  authorBadge: 'Author',
  gameBadge: 'Game',
  collectionBadge: 'Collection',
  seriesCountFmt: '{count, plural, one {# book} other {# books}}',
  authorBooksFmt: '{count, plural, one {# book} other {# books}}',
  collectionCountFmt: '{count, plural, one {# game} other {# games}}',
});

type MediaTab =
  | 'all'
  | 'books'
  | 'audiobooks'
  | 'games'
  | 'manga'
  | 'comics'
  | 'magazines';

interface MagazineResult {
  id: string;
  title: string;
  publisher?: string;
  issn?: string;
  issns?: { issn: string; format?: string }[];
  coverUrl?: string;
  coverIsLogo?: boolean;
  year?: number;
  language?: string;
  country?: string;
  categories?: string[];
  description?: string;
  frequency?: string;
  firstIssued?: string;
  ceasedAt?: string;
}

interface MagazineSearchResponse {
  results: MagazineResult[];
}

interface MangaResult {
  anilistId: number;
  title: string;
  titleNative?: string;
  coverUrl?: string;
  year?: number;
  status?: string;
  format?: string;
  chapters?: number;
  volumes?: number;
  averageScore?: number;
  countryOfOrigin?: string;
  isAdult?: boolean;
  mediaType: 'manga';
}

interface MangaSearchResponse {
  results: MangaResult[];
  totalResults: number;
}

interface ComicResult {
  comicVineId: number;
  title: string;
  year?: number;
  coverUrl?: string;
  issueCount?: number;
  publisher?: string;
  deck?: string;
  mediaType: 'comic';
}

interface ComicSearchResponse {
  results: ComicResult[];
  totalResults: number;
}

const AuthorSearchCard = ({ result }: { result: AuthorSearchResult }) => {
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

const GameCollectionSearchCard = ({
  result,
}: {
  result: GameCollectionResult;
}) => {
  const intl = useIntl();
  return (
    // Virtual-collection ids are base64 JSON — encode before
    // pushing into the path so `=` / `/` characters don't break
    // Next.js routing.
    <Link href={`/game/collection/${encodeURIComponent(result.id)}`}>
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
          <div className="absolute left-0 right-0 top-0 flex items-center gap-1 p-2">
            {/* Game badge (emerald) — mirrors the GameCard badge. */}
            <div className="pointer-events-none z-40 rounded-full border border-emerald-500 bg-emerald-600/80 shadow-md">
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(messages.gameBadge)}
              </div>
            </div>
            {/* Collection badge (indigo) — marks this as a ROMM
                collection rather than a single game. */}
            <div className="pointer-events-none z-40 rounded-full border border-indigo-500 bg-indigo-600/80 shadow-md">
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(messages.collectionBadge)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {result.name}
          </h3>
          {typeof result.romCount === 'number' && (
            <div className="mt-1 text-xs text-gray-500">
              {intl.formatMessage(messages.collectionCountFmt, {
                count: result.romCount,
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

interface GameCollectionResult {
  type: 'collection';
  id: string;
  name: string;
  description?: string;
  coverUrl?: string;
  romCount?: number;
  kind?: 'user' | 'virtual';
}

type GameOrCollectionResult = GameResult | GameCollectionResult;

interface GameSearchResponse {
  results: GameOrCollectionResult[];
  totalResults: number;
}

const Search = () => {
  const intl = useIntl();
  const router = useRouter();
  const { currentSettings } = useSettings();
  const { setIsSearching } = useContext(SearchLoadingContext);
  const bookEnabled = currentSettings.bookEnabled;
  const audiobookEnabled = currentSettings.audiobookEnabled;
  const gameEnabled = currentSettings.gameEnabled;
  const mangaEnabled = currentSettings.mangaEnabled;
  const comicEnabled = currentSettings.comicEnabled;
  const magazineEnabled = currentSettings.magazineEnabled;
  const [activeTab, setActiveTab] = useState<MediaTab>('all');
  const [bookResults, setBookResults] = useState<BookOrSeriesResult[]>([]);
  const [audiobookResults, setAudiobookResults] = useState<
    (BookResult | AuthorSearchResult)[]
  >([]);
  const [gameResults, setGameResults] = useState<GameOrCollectionResult[]>([]);
  const [mangaResults, setMangaResults] = useState<MangaResult[]>([]);
  const [comicResults, setComicResults] = useState<ComicResult[]>([]);
  const [magazineResults, setMagazineResults] = useState<MagazineResult[]>([]);
  // Magazine-specific filter: hide ceased publications by default
  // (operators almost always want a still-publishing magazine).
  // Toggleable on the tab via the chip above the result grid.
  const [magazineStatusFilter, setMagazineStatusFilter] = useState<
    'ongoing' | 'all'
  >('ongoing');
  // Verified-only filter is ON by default — operators almost
  // always want to skip the long tail of BnF / ZDB edition
  // records that share a root title with the canonical magazine.
  const [magazineVerifiedOnly, setMagazineVerifiedOnly] = useState(true);
  // Multi-ISSN filter — opt-in. When ON, only shows magazines whose
  // ISSN Portal record has 2+ ISSNs registered under the same
  // ISSN-L (= a publication that exists across formats, typical
  // for canonical titles). Useful for cutting one-shots / obscure
  // edition records.
  const [magazineMultiIssnOnly, setMagazineMultiIssnOnly] = useState(false);
  const [isLoadingBooks, setIsLoadingBooks] = useState(false);
  const [isLoadingAudiobooks, setIsLoadingAudiobooks] = useState(false);
  const [isLoadingGames, setIsLoadingGames] = useState(false);
  const [isLoadingManga, setIsLoadingManga] = useState(false);
  const [isLoadingComics, setIsLoadingComics] = useState(false);
  const [isLoadingMagazines, setIsLoadingMagazines] = useState(false);

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
      setMangaResults([]);
      setComicResults([]);
      setMagazineResults([]);
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

    if (mangaEnabled) {
      setIsLoadingManga(true);
      axios
        .get<MangaSearchResponse>('/api/v1/manga/search', {
          params: { query, limit: 40 },
          paramsSerializer,
        })
        .then((res) => setMangaResults(res.data.results))
        .catch(() => setMangaResults([]))
        .finally(() => setIsLoadingManga(false));
    } else {
      setMangaResults([]);
    }

    if (comicEnabled) {
      setIsLoadingComics(true);
      axios
        .get<ComicSearchResponse>('/api/v1/comic/search', {
          params: { query, limit: 40 },
          paramsSerializer,
        })
        .then((res) => setComicResults(res.data.results))
        .catch(() => setComicResults([]))
        .finally(() => setIsLoadingComics(false));
    } else {
      setComicResults([]);
    }

    if (magazineEnabled) {
      setIsLoadingMagazines(true);
      axios
        .get<MagazineSearchResponse>('/api/v1/magazine/search', {
          params: {
            query,
            // Pass-through to pressarr's cascade so server-side
            // filtering keeps the response small; the chips just
            // re-fetch when toggled.
            status: magazineStatusFilter,
            verified: magazineVerifiedOnly ? 'true' : undefined,
            multi_issn: magazineMultiIssnOnly ? 'true' : undefined,
          },
          paramsSerializer,
        })
        .then((res) => setMagazineResults(res.data.results ?? []))
        .catch(() => setMagazineResults([]))
        .finally(() => setIsLoadingMagazines(false));
    } else {
      setMagazineResults([]);
    }
  }, [
    query,
    bookEnabled,
    audiobookEnabled,
    gameEnabled,
    mangaEnabled,
    comicEnabled,
    magazineEnabled,
    magazineStatusFilter,
    magazineVerifiedOnly,
    magazineMultiIssnOnly,
  ]);

  // Publish a combined "any active fetch" boolean to SearchLoadingContext
  // so the global SearchInput in the layout can swap its magnifying-glass
  // for a spinner. We only count the per-type queries that are actually
  // enabled — a disabled type never fetches and never blocks the spinner
  // from clearing. Movies/TV (useDiscover) is always counted because the
  // /api/v1/search endpoint runs regardless of type toggles.
  const isAnySearching =
    !!query &&
    (isLoadingInitialData ||
      (bookEnabled && isLoadingBooks) ||
      (audiobookEnabled && isLoadingAudiobooks) ||
      (gameEnabled && isLoadingGames) ||
      (mangaEnabled && isLoadingManga) ||
      (comicEnabled && isLoadingComics) ||
      (magazineEnabled && isLoadingMagazines));
  useEffect(() => {
    setIsSearching(isAnySearching);
    // Reset on unmount so navigating away from /search doesn't strand
    // the spinner on.
    return () => setIsSearching(false);
  }, [isAnySearching, setIsSearching]);

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
    ...(mangaEnabled
      ? [
          {
            key: 'manga' as MediaTab,
            label: intl.formatMessage(messages.tabManga),
            count: isLoadingManga ? null : mangaResults.length,
            loading: isLoadingManga,
          },
        ]
      : []),
    ...(comicEnabled
      ? [
          {
            key: 'comics' as MediaTab,
            label: intl.formatMessage(messages.tabComics),
            count: isLoadingComics ? null : comicResults.length,
            loading: isLoadingComics,
          },
        ]
      : []),
    ...(magazineEnabled
      ? [
          {
            key: 'magazines' as MediaTab,
            label: intl.formatMessage(messages.tabMagazines),
            count: isLoadingMagazines ? null : magazineResults.length,
            loading: isLoadingMagazines,
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

      {/* Media Type Tabs — chip-style so 6+ tabs (All / Books /
          Audiobooks / Games / Manga / Comics) wrap to a second row on
          mobile instead of overflowing or scrolling off-screen.
          Self-contained pills mean every count stays visible at a
          glance; no underline weirdness across rows. */}
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              activeTab === tab.key
                ? 'bg-indigo-500/20 text-indigo-300 ring-1 ring-inset ring-indigo-500/40'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {tab.count !== null && tab.count > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  activeTab === tab.key
                    ? 'bg-indigo-500/30 text-indigo-200'
                    : 'bg-gray-700/80 text-gray-300'
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
              {gameResults.map((item) => {
                if ('igdbId' in item) {
                  return (
                    <li key={item.igdbId}>
                      <GameCard
                        igdbId={item.igdbId}
                        title={item.title}
                        platforms={item.platforms}
                        releaseYear={item.releaseYear}
                        developer={item.developer}
                        publisher={item.publisher}
                        genre={item.genre}
                        userRating={item.userRating}
                        coverUrl={item.coverUrl}
                        summary={item.summary}
                      />
                    </li>
                  );
                }
                return (
                  <li key={`collection-${item.id}`}>
                    <GameCollectionSearchCard result={item} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {/* Manga */}
      {activeTab === 'manga' && (
        <div>
          {isLoadingManga ? (
            <LoadingSpinner />
          ) : mangaResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {mangaResults.map((m) => (
                <li key={m.anilistId}>
                  <MangaCard
                    anilistId={m.anilistId}
                    title={m.title}
                    titleNative={m.titleNative}
                    coverUrl={m.coverUrl}
                    year={m.year}
                    status={m.status}
                    format={m.format}
                    chapters={m.chapters}
                    volumes={m.volumes}
                    averageScore={m.averageScore}
                    countryOfOrigin={m.countryOfOrigin}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Comics */}
      {activeTab === 'comics' && (
        <div>
          {isLoadingComics ? (
            <LoadingSpinner />
          ) : comicResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {comicResults.map((c) => (
                <li key={c.comicVineId}>
                  <ComicCard
                    comicVineId={c.comicVineId}
                    title={c.title}
                    coverUrl={c.coverUrl}
                    year={c.year}
                    issueCount={c.issueCount}
                    publisher={c.publisher}
                    deck={c.deck}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Magazines — backed by the ISSN-first cascade (ZDB + Wikidata
          + BnF + ISSN Portal via pressarr). Each MagazineCard's id is
          the cascade key (issn:NNNN-NNNN / wd:Q123 / pressarr:…) which
          the detail route at /magazine/[id] handles uniformly. */}
      {activeTab === 'magazines' && (
        <div>
          {/* Filter chip-toggles. Status (ongoing/all) + verified.
              Both default to the "noise-suppressed" side because
              that's what an operator typing a magazine name almost
              always wants. */}
          <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">
                {intl.formatMessage({
                  id: 'components.Search.statusFilterLabel',
                  defaultMessage: 'Status',
                })}
              </span>
              {(
                [
                  {
                    key: 'ongoing' as const,
                    label: intl.formatMessage({
                      id: 'components.Search.statusOngoing',
                      defaultMessage: 'Ongoing only',
                    }),
                  },
                  {
                    key: 'all' as const,
                    label: intl.formatMessage({
                      id: 'components.Search.statusAll',
                      defaultMessage: 'All',
                    }),
                  },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setMagazineStatusFilter(opt.key)}
                  className={`rounded-full px-3 py-1 ring-1 ring-inset transition ${
                    magazineStatusFilter === opt.key
                      ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/40'
                      : 'text-gray-400 ring-gray-700 hover:bg-gray-700/50 hover:text-gray-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">
                {intl.formatMessage({
                  id: 'components.Search.verifiedFilterLabel',
                  defaultMessage: 'Coverage',
                })}
              </span>
              <button
                onClick={() => setMagazineVerifiedOnly(true)}
                className={`rounded-full px-3 py-1 ring-1 ring-inset transition ${
                  magazineVerifiedOnly
                    ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/40'
                    : 'text-gray-400 ring-gray-700 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
              >
                {intl.formatMessage({
                  id: 'components.Search.verifiedOnly',
                  defaultMessage: 'Verified only',
                })}
              </button>
              <button
                onClick={() => setMagazineVerifiedOnly(false)}
                className={`rounded-full px-3 py-1 ring-1 ring-inset transition ${
                  !magazineVerifiedOnly
                    ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/40'
                    : 'text-gray-400 ring-gray-700 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
              >
                {intl.formatMessage({
                  id: 'components.Search.allCatalogues',
                  defaultMessage: 'All catalogues',
                })}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">
                {intl.formatMessage({
                  id: 'components.Search.formatsLabel',
                  defaultMessage: 'Formats',
                })}
              </span>
              <button
                onClick={() =>
                  setMagazineMultiIssnOnly(!magazineMultiIssnOnly)
                }
                className={`rounded-full px-3 py-1 ring-1 ring-inset transition ${
                  magazineMultiIssnOnly
                    ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/40'
                    : 'text-gray-400 ring-gray-700 hover:bg-gray-700/50 hover:text-gray-200'
                }`}
              >
                {intl.formatMessage({
                  id: 'components.Search.multiIssnOnly',
                  defaultMessage: 'Multi-ISSN only',
                })}
              </button>
            </div>
          </div>
          {isLoadingMagazines ? (
            <LoadingSpinner />
          ) : magazineResults.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.noResults)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {magazineResults.map((m) => (
                <li key={m.id}>
                  <MagazineCard
                    id={m.id}
                    title={m.title}
                    publisher={m.publisher}
                    issn={m.issn}
                    coverUrl={m.coverUrl}
                    coverIsLogo={m.coverIsLogo}
                    year={m.year}
                    language={m.language}
                    country={m.country}
                    categories={m.categories}
                    description={m.description}
                    frequency={m.frequency}
                    firstIssued={m.firstIssued}
                    ceasedAt={m.ceasedAt}
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
