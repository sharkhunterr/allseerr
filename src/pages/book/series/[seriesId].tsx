import BookCard from '@app/components/BookCard';
import Header from '@app/components/Common/Header';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
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

  return (
    <>
      <PageTitle title={[data.name, intl.formatMessage(messages.title)]} />
      <div className="mb-6 mt-1">
        <Header
          subtext={intl.formatMessage(messages.booksInSeries, {
            count: data.seedCount || data.members.length,
          })}
        >
          {data.name}
        </Header>
        {data.description && (
          <p className="mt-3 text-sm text-gray-400">{data.description}</p>
        )}
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
    </>
  );
};

export default BookSeriesPage;
