import ComicCard from '@app/components/ComicCard';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { UserIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.ComicPerson', {
  title: 'Creator',
  notFound: 'Creator not found.',
  emptyWorks: 'No comics credited to this creator yet.',
  works: 'Works',
  bio: 'About',
  born: 'Born',
  died: 'Died',
  hometown: 'Hometown',
  country: 'Country',
  appearances: 'Issue appearances',
  totalWorksFmt: '{count, plural, one {# volume} other {# volumes}}',
  livedFmt: '{birth}{dash}{death}',
});

interface ComicWork {
  comicVineId: number;
  title: string;
  year?: number;
  coverUrl?: string;
  issueCount?: number;
  publisher?: string;
}

interface PersonDetail {
  key: number;
  name: string;
  aliases?: string;
  photoUrl?: string;
  bio?: string;
  birthDate?: string;
  deathDate?: string;
  hometown?: string;
  country?: string;
  issueAppearances?: number;
  siteDetailUrl?: string;
  totalWorks: number;
  works: ComicWork[];
}

const ComicPersonPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { id } = router.query;

  const { data, error } = useSWR<PersonDetail>(
    id ? `/api/v1/comic/person/${id}` : null
  );

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  const cleanBio = data.bio?.replace(/<[^>]+>/g, '').trim();

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={[data.name, intl.formatMessage(messages.title)]} />

      <div className="media-header">
        <div className="media-poster">
          {data.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.photoUrl}
              alt={data.name}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700">
              <UserIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <h1>{data.name}</h1>
          {data.aliases && (
            <p className="text-sm text-gray-400">{data.aliases}</p>
          )}
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
            {data.hometown && (
              <>
                <span>·</span>
                <span>{data.hometown}</span>
              </>
            )}
            {data.country && (
              <>
                <span>·</span>
                <span>{data.country}</span>
              </>
            )}
            <span>·</span>
            <span>
              {intl.formatMessage(messages.totalWorksFmt, {
                count: data.totalWorks,
              })}
            </span>
          </span>
        </div>
      </div>

      {(cleanBio || typeof data.issueAppearances === 'number') && (
        <div className="media-overview">
          <div className="media-overview-left">
            {cleanBio && (
              <>
                <h2>{intl.formatMessage(messages.bio)}</h2>
                <p>{cleanBio}</p>
              </>
            )}
          </div>
          <div className="media-overview-right">
            <div className="media-facts">
              {typeof data.issueAppearances === 'number' && (
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.appearances)}</span>
                  <span className="media-fact-value">
                    {data.issueAppearances}
                  </span>
                </div>
              )}
            </div>
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
            <li key={w.comicVineId}>
              <ComicCard
                comicVineId={w.comicVineId}
                title={w.title}
                coverUrl={w.coverUrl}
                year={w.year}
                issueCount={w.issueCount}
                publisher={w.publisher}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default ComicPersonPage;
