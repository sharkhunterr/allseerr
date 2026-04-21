import BookCard from '@app/components/BookCard';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { UserIcon } from '@heroicons/react/24/solid';
import type { MediaStatus } from '@server/constants/media';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.BookAuthor', {
  title: 'Author',
  notFound: 'Author not found.',
  emptyWorks: 'No works listed yet.',
  works: 'Works',
  totalWorksFmt: '{count, plural, one {# book} other {# books}}',
  overview: 'Biography',
  livedFmt: '{birth}{dash}{death}',
});

interface Work {
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  mediaStatus?: MediaStatus | null;
  bookMediaId?: number | null;
}

interface AuthorDetail {
  key: string;
  name?: string;
  photoUrl?: string;
  bio?: string;
  birthDate?: string;
  deathDate?: string;
  totalWorks: number;
  works: Work[];
}

const AuthorPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { authorId } = router.query;

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

  const cleanBio = data.bio
    ?.replace(/\s*\*\[From[^\]]*\]\[\d+\]\.?\*\s*$/s, '')
    .replace(/\[\d+\]:\s*https?:\/\/[^\s]+/g, '')
    .trim();

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
          <span className="media-attributes">
            {(data.birthDate || data.deathDate) && (
              <span>
                {intl.formatMessage(messages.livedFmt, {
                  birth: data.birthDate ?? '?',
                  dash: data.deathDate ? ' – ' : '',
                  death: data.deathDate ?? '',
                })}
              </span>
            )}
            <span>
              {intl.formatMessage(messages.totalWorksFmt, {
                count: data.totalWorks,
              })}
            </span>
          </span>
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
      <div className="slider-header">
        <div className="slider-title">
          <span>{intl.formatMessage(messages.works)}</span>
        </div>
      </div>
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
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default AuthorPage;
