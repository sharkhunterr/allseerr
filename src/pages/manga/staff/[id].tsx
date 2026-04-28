import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import MangaCard from '@app/components/MangaCard';
import defineMessages from '@app/utils/defineMessages';
import { UserIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.MangaStaff', {
  title: 'Mangaka',
  notFound: 'Staff not found.',
  emptyWorks: 'No manga credited to this person yet.',
  works: 'Works',
  bio: 'About',
  born: 'Born',
  died: 'Died',
  homeTown: 'Hometown',
  yearsActive: 'Years active',
  occupations: 'Occupations',
  totalWorksFmt: '{count, plural, one {# manga} other {# manga}}',
  livedFmt: '{birth}{dash}{death}',
});

interface StaffWork {
  anilistId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  status?: string;
  format?: string;
  averageScore?: number;
  staffRole?: string;
}

interface StaffDetail {
  key: number;
  name: string;
  nameNative?: string;
  photoUrl?: string;
  bio?: string;
  birthDate?: string;
  deathDate?: string;
  homeTown?: string;
  yearsActive?: number[];
  occupations?: string[];
  totalWorks: number;
  works: StaffWork[];
}

const MangaStaffPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { id } = router.query;

  const { data, error } = useSWR<StaffDetail>(
    id ? `/api/v1/manga/staff/${id}` : null
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
          {data.nameNative && data.nameNative !== data.name && (
            <p className="text-sm text-gray-400">{data.nameNative}</p>
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
            {data.homeTown && (
              <>
                <span>·</span>
                <span>{data.homeTown}</span>
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

      {(cleanBio || data.occupations?.length) && (
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
              {data.occupations && data.occupations.length > 0 && (
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.occupations)}</span>
                  <span className="media-fact-value capitalize">
                    {data.occupations.join(', ')}
                  </span>
                </div>
              )}
              {data.yearsActive && data.yearsActive.length > 0 && (
                <div className="media-fact">
                  <span>{intl.formatMessage(messages.yearsActive)}</span>
                  <span className="media-fact-value">
                    {data.yearsActive.length === 1
                      ? data.yearsActive[0]
                      : `${data.yearsActive[0]} – ${
                          data.yearsActive[data.yearsActive.length - 1]
                        }`}
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
            <li key={w.anilistId}>
              <MangaCard
                anilistId={w.anilistId}
                title={w.title}
                coverUrl={w.coverUrl}
                year={w.year}
                status={w.status}
                format={w.format}
                averageScore={w.averageScore}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default MangaStaffPage;
