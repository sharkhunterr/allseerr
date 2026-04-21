import BookCard from '@app/components/BookCard';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { MediaStatus } from '@server/constants/media';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.BookSeries', {
  title: 'Book Series',
  notFound: 'Series not found.',
  empty: 'This series has no books listed yet.',
  booksInSeries: '{count, plural, one {# book} other {# books}}',
  overview: 'Overview',
  books: 'Books',
  aboutAuthor: 'About the author',
});

interface SeriesMember {
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
}

interface SeriesDetail {
  key: string;
  name: string;
  description?: string;
  seedCount: number;
  members: SeriesMember[];
  authorName?: string;
  authorKey?: string;
  authorPhotoUrl?: string;
  authorBio?: string;
}

const BookSeriesPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { seriesId } = router.query;

  const { data, error } = useSWR<SeriesDetail>(
    seriesId ? `/api/v1/book/series/${seriesId}` : null
  );

  if (!data && !error) return <LoadingSpinner />;

  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  // Use the first member's cover as the series "poster" fallback
  const heroCover = data.members.find((m) => m.coverUrl)?.coverUrl;
  const totalCount = data.seedCount || data.members.length;

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={[data.name, intl.formatMessage(messages.title)]} />
      <div className="media-header">
        <div className="media-poster">
          {heroCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={heroCover}
              alt={data.name}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700">
              <BookOpenIcon className="h-16 w-16 text-gray-500" />
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
          <span className="media-attributes">
            <span>
              {intl.formatMessage(messages.booksInSeries, {
                count: totalCount,
              })}
            </span>
          </span>
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {data.description ?? intl.formatMessage(messages.empty)}
          </p>
        </div>
        <div className="media-overview-right">
          {(data.authorName || data.authorPhotoUrl || data.authorBio) && (
            <button
              type="button"
              disabled={!data.authorKey}
              onClick={() =>
                data.authorKey &&
                router.push(`/book/author/${data.authorKey}`)
              }
              className="group mb-6 block w-full cursor-pointer overflow-hidden rounded-lg bg-gray-800 text-left shadow-md ring-1 ring-gray-700 transition hover:ring-indigo-400 disabled:cursor-default disabled:hover:ring-gray-700"
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0">
                  {data.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.authorPhotoUrl}
                      alt={data.authorName ?? ''}
                      className="h-20 w-20 rounded-full object-cover ring-2 ring-indigo-500/40"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-semibold text-gray-300">
                      {data.authorName?.[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    {intl.formatMessage(messages.aboutAuthor)}
                  </div>
                  <div className="text-base font-semibold text-white group-hover:text-indigo-300">
                    {data.authorName}
                  </div>
                </div>
              </div>
              {data.authorBio && (
                <p className="max-h-32 overflow-hidden px-4 pb-4 text-sm text-gray-300">
                  {data.authorBio}
                </p>
              )}
            </button>
          )}
        </div>
      </div>
      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.books)}</span>
        </div>
      </div>
      {data.members.length === 0 ? (
        <p className="py-8 text-center text-gray-400">
          {intl.formatMessage(messages.empty)}
        </p>
      ) : (
        <ul className="cards-vertical">
          {data.members.map((m) => (
            <li key={m.openLibraryId}>
              <BookCard
                openLibraryId={m.openLibraryId}
                title={m.title}
                authorName={m.authorName}
                coverUrl={m.coverUrl}
                mediaStatus={m.mediaStatus ?? undefined}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default BookSeriesPage;
