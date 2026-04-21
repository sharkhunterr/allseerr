import BookCard from '@app/components/BookCard';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import {
  BookOpenIcon,
  CakeIcon,
  UserIcon,
} from '@heroicons/react/24/solid';
import type { MediaStatus } from '@server/constants/media';
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.BookAuthor', {
  title: 'Author',
  notFound: 'Author not found.',
  emptyWorks: 'No works listed yet.',
  emptySeries: 'No series listed yet.',
  works: 'Works',
  tabBooks: 'Books',
  tabSeries: 'Series',
  totalWorksFmt: '{count, plural, one {# book} other {# books}}',
  worksListedFmt: '{count, plural, one {# work} other {# works}} on OpenLibrary',
  uniqueTitlesFmt:
    '{count, plural, one {# unique title} other {# unique titles}}',
  overview: 'Biography',
  born: 'Born',
  died: 'Died',
});

interface Work {
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
}

interface SeriesLink {
  key: string;
  name: string;
  coverUrl?: string;
}

interface AuthorDetail {
  key: string;
  name?: string;
  photoUrl?: string;
  bio?: string;
  birthDate?: string;
  deathDate?: string;
  totalWorks: number;
  uniqueWorks?: number;
  works: Work[];
  series?: SeriesLink[];
}

type AuthorTab = 'books' | 'series';

const AuthorPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { authorId } = router.query;
  const [activeTab, setActiveTab] = useState<AuthorTab>('books');

  const { data, error } = useSWR<AuthorDetail>(
    authorId ? `/api/v1/book/author/${authorId}` : null
  );

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  // Bio already cleaned server-side (cleanOpenLibraryText)
  const cleanBio = data.bio;

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle
        title={[data.name ?? '', intl.formatMessage(messages.title)]}
      />
      <div className="media-header">
        <div className="media-poster">
          {data.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.photoUrl}
              alt={data.name ?? ''}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700">
              <UserIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
            <span className="rounded-full border border-orange-500 bg-orange-600/80 px-2 text-xs font-semibold uppercase leading-5 text-white">
              {intl.formatMessage(messages.title)}
            </span>
          </div>
          <h1>{data.name}</h1>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-300 xl:justify-start">
            {data.birthDate && (
              <span className="inline-flex items-center gap-1.5">
                <CakeIcon className="h-4 w-4 text-gray-400" />
                <span>
                  {intl.formatMessage(messages.born)}: {data.birthDate}
                </span>
              </span>
            )}
            {data.deathDate && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-gray-400">✝</span>
                <span>
                  {intl.formatMessage(messages.died)}: {data.deathDate}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <BookOpenIcon className="h-4 w-4 text-gray-400" />
              <span>
                {intl.formatMessage(messages.worksListedFmt, {
                  count: data.totalWorks,
                })}
                {data.uniqueWorks !== undefined &&
                  data.uniqueWorks !== data.totalWorks && (
                    <span className="ml-2 text-gray-500">
                      (
                      {intl.formatMessage(messages.uniqueTitlesFmt, {
                        count: data.uniqueWorks,
                      })}
                      )
                    </span>
                  )}
              </span>
            </span>
          </div>
        </div>
      </div>
      {cleanBio && (
        <div className="media-overview">
          <div className="media-overview-left">
            <h2>{intl.formatMessage(messages.overview)}</h2>
            <p>{cleanBio}</p>
          </div>
        </div>
      )}
      {/* Tabs — mirror the search page's sub-tab styling. Series tab
          is hidden when the backend didn't return any series (e.g.
          OpenLibrary-keyed authors don't expose a clean author →
          series mapping yet). */}
      <div className="mb-4 border-b border-gray-600">
        <nav className="-mb-px flex gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('books')}
            className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition ${
              activeTab === 'books'
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-gray-400 hover:border-gray-400 hover:text-gray-200'
            }`}
          >
            {intl.formatMessage(messages.tabBooks)}
            {data.works.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({data.works.length})
              </span>
            )}
          </button>
          {(data.series?.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab('series')}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition ${
                activeTab === 'series'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:border-gray-400 hover:text-gray-200'
              }`}
            >
              {intl.formatMessage(messages.tabSeries)}
              <span className="ml-2 text-xs text-gray-500">
                ({data.series?.length})
              </span>
            </button>
          )}
        </nav>
      </div>
      {activeTab === 'books' && (
        <>
          {data.works.length === 0 ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.emptyWorks)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {data.works.map((w) => (
                <li key={w.openLibraryId}>
                  <BookCard
                    openLibraryId={w.openLibraryId}
                    title={w.title}
                    authorName={w.authorName}
                    coverUrl={w.coverUrl}
                    mediaStatus={w.mediaStatus ?? undefined}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {activeTab === 'series' && (
        <>
          {!data.series?.length ? (
            <p className="py-8 text-center text-gray-400">
              {intl.formatMessage(messages.emptySeries)}
            </p>
          ) : (
            <ul className="cards-vertical">
              {data.series.map((s) => (
                <li key={s.key}>
                  <Link
                    href={`/book/series/${encodeURIComponent(s.key)}`}
                  >
                    <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
                      <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
                        {s.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={s.coverUrl}
                            alt={s.name}
                            className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <BookOpenIcon className="h-12 w-12 text-gray-500" />
                          </div>
                        )}
                        <div className="absolute left-0 right-0 top-0 flex items-center gap-1 p-2">
                          <div className="pointer-events-none z-40 rounded-full border border-orange-500 bg-orange-600/80 shadow-md">
                            <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                              Book
                            </div>
                          </div>
                          <div className="pointer-events-none z-40 rounded-full border border-indigo-500 bg-indigo-600/80 shadow-md">
                            <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                              Series
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col p-3">
                        <h3 className="truncate text-sm font-semibold text-white">
                          {s.name}
                        </h3>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default AuthorPage;
