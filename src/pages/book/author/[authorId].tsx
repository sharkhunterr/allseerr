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
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.BookAuthor', {
  title: 'Author',
  notFound: 'Author not found.',
  emptyWorks: 'No works listed yet.',
  works: 'Works',
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
