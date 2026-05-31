import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import MediaPageBackdrop from '@app/components/Common/MediaPageBackdrop';
import PageTitle from '@app/components/Common/PageTitle';
import StatusBadge from '@app/components/StatusBadge';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { NewspaperIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('pages.MagazineDetail', {
  notFound: 'Magazine not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  publisher: 'Publisher',
  identity: 'Identity',
  sources: 'Sources',
  wikipedia: 'Wikipedia',
  request: 'Request',
  requested: 'Requested',
  requestSuccess: 'Magazine request submitted.',
  requestFailed: 'Failed to submit magazine request.',
  categories: 'Categories',
});

interface MagazineDetailData {
  source: 'pressarr' | 'googlebooks';
  id: string;
  title: string;
  publisher?: string;
  issn?: string;
  coverUrl?: string;
  year?: number;
  language?: string;
  description?: string;
  frequency?: string;
  country?: string;
  categories?: string[];
  wikidataQid?: string;
  zdbId?: string;
  wikipediaUrl?: string;
  sources?: string[];
  // Available when the magazine is already in the library / has a
  // pending request — populated by future scanners. Carried here
  // so the StatusBadge can render the right colour without an
  // extra round-trip.
  mediaStatus?: MediaStatus | null;
}

// ISO-3166-1 alpha-2 → regional indicator emoji.
const countryFlag = (code?: string): string => {
  if (!code || !/^[A-Z]{2}$/i.test(code)) return '';
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
};

const MagazineDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isRequesting, setIsRequesting] = useState(false);
  const [didRequest, setDidRequest] = useState(false);
  const id =
    typeof router.query.id === 'string' ? router.query.id : undefined;

  const { data, error } = useSWR<MagazineDetailData>(
    id ? `/api/v1/magazine/${encodeURIComponent(id)}` : null
  );

  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MAGAZINE],
    { type: 'or' }
  );

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  const submitRequest = async () => {
    setIsRequesting(true);
    try {
      await axios.post('/api/v1/magazine/request', {
        id: data.id,
        title: data.title,
        issn: data.issn,
        publisher: data.publisher,
        coverUrl: data.coverUrl,
        year: data.year,
        language: data.language,
        description: data.description,
        frequency: data.frequency,
        googleBooksId: data.source === 'googlebooks' ? data.id : undefined,
      });
      setDidRequest(true);
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      // 409 = duplicate request — treat as success for the user
      // (the magazine is already on the way).
      if (status === 409) {
        setDidRequest(true);
        addToast(intl.formatMessage(messages.requestSuccess), {
          appearance: 'info',
          autoDismiss: true,
        });
      } else {
        addToast(intl.formatMessage(messages.requestFailed), {
          appearance: 'error',
          autoDismiss: true,
        });
      }
    } finally {
      setIsRequesting(false);
    }
  };

  // Subtitle: country flag · language · frequency. Each piece is
  // dropped silently when missing so a sparse record doesn't show
  // dot separators with nothing between.
  const subtitleParts: string[] = [];
  if (data.country) {
    const flag = countryFlag(data.country);
    subtitleParts.push(flag ? `${flag} ${data.country}` : data.country);
  }
  if (data.language) subtitleParts.push(data.language.toUpperCase());
  if (data.frequency) subtitleParts.push(data.frequency);

  return (
    <div className="media-page" style={{ height: 493 }}>
      <MediaPageBackdrop src={data.coverUrl} mode="cover" />
      <PageTitle title={data.title} />

      <div className="media-header">
        <div className="media-poster">
          {data.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.coverUrl}
              alt={data.title}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700">
              <NewspaperIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
            <StatusBadge
              status={data.mediaStatus ?? undefined}
              title={data.title}
            />
          </div>
          <h1 data-testid="media-title">
            {data.title}{' '}
            {data.year && <span className="media-year">({data.year})</span>}
          </h1>
          {data.publisher && (
            <p className="text-sm text-gray-300">{data.publisher}</p>
          )}
          {subtitleParts.length > 0 && (
            <span className="media-attributes">
              {subtitleParts.map((label, k) => <span key={k}>{label}</span>)
                .reduce<React.ReactNode>(
                  (prev, curr, idx) =>
                    idx === 0 ? curr : (
                      <>
                        {prev}
                        <span>|</span>
                        {curr}
                      </>
                    ),
                  null,
                )}
            </span>
          )}
          {data.categories && data.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.categories.map((c) => (
                <span
                  key={c}
                  className="inline-block rounded-full bg-indigo-600/20 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-indigo-300 ring-1 ring-indigo-500/40"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        {canRequest && (
          <div className="media-actions">
            <Button
              buttonType={didRequest ? 'default' : 'primary'}
              onClick={submitRequest}
              disabled={isRequesting || didRequest}
            >
              <NewspaperIcon />
              <span>
                {intl.formatMessage(
                  didRequest ? messages.requested : messages.request
                )}
              </span>
            </Button>
          </div>
        )}
      </div>

      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {data.description ||
              intl.formatMessage(messages.overviewunavailable)}
          </p>
        </div>

        <div className="media-overview-right">
          <div className="rounded-lg bg-gray-800/60 p-4 ring-1 ring-gray-700">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-400">
              {intl.formatMessage(messages.identity)}
            </h3>
            <dl className="space-y-2 text-sm">
              {data.issn && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ISSN</dt>
                  <dd className="font-mono text-gray-200">{data.issn}</dd>
                </div>
              )}
              {data.zdbId && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">ZDB</dt>
                  <dd className="font-mono text-gray-200">{data.zdbId}</dd>
                </div>
              )}
              {data.wikidataQid && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">Wikidata</dt>
                  <dd>
                    <a
                      href={`https://www.wikidata.org/wiki/${data.wikidataQid}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-indigo-400 hover:text-indigo-300"
                    >
                      {data.wikidataQid}
                    </a>
                  </dd>
                </div>
              )}
              {data.wikipediaUrl && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">
                    {intl.formatMessage(messages.wikipedia)}
                  </dt>
                  <dd>
                    <a
                      href={data.wikipediaUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 hover:text-indigo-300"
                    >
                      →
                    </a>
                  </dd>
                </div>
              )}
              {data.sources && data.sources.length > 0 && (
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-500">
                    {intl.formatMessage(messages.sources)}
                  </dt>
                  <dd className="text-xs uppercase tracking-wider text-gray-300">
                    {data.sources.join(' · ')}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MagazineDetailPage;
