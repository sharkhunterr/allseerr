import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import MediaPageBackdrop from '@app/components/Common/MediaPageBackdrop';
import PageTitle from '@app/components/Common/PageTitle';
import Tag from '@app/components/Common/Tag';
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
  request: 'Request',
  requested: 'Requested',
  requestSuccess: 'Magazine request submitted.',
  requestFailed: 'Failed to submit magazine request.',
  // Facts block (label / value pairs in the right rail).
  publisher: 'Publisher',
  country: 'Country',
  language: 'Language',
  frequency: 'Frequency',
  firstPublished: 'First published',
  ceased: 'Ceased',
  issn: 'ISSN',
  zdb: 'ZDB',
  wikidata: 'Wikidata',
  wikipedia: 'Wikipedia',
  sources: 'Sources',
  // Publication status — surfaced as a chip near the title so the
  // operator immediately knows whether it's an ongoing publication,
  // a defunct title, or unknown.
  statusOngoing: 'Ongoing — since {year}',
  statusCeased: 'Ceased in {year}',
  statusOngoingNoYear: 'Ongoing',
  statusUnknown: 'Status unknown',
  categories: 'Categories',
  openExternal: 'Open',
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
  firstIssued?: string;
  ceasedAt?: string;
  mediaStatus?: MediaStatus | null;
}

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

  // Publication status — most useful single piece of info for the
  // operator. Computed from first_issued + ceased_at:
  //   * ceased_at set       → "Cessé en YYYY"
  //   * first_issued only   → "En cours depuis YYYY"
  //   * neither             → "Statut inconnu"
  const ceasedYear = data.ceasedAt?.slice(0, 4);
  const firstYear = data.firstIssued?.slice(0, 4);
  let statusLabel: string;
  let statusTone: 'ongoing' | 'ceased' | 'unknown';
  if (ceasedYear && /^\d{4}$/.test(ceasedYear)) {
    statusLabel = intl.formatMessage(messages.statusCeased, {
      year: ceasedYear,
    });
    statusTone = 'ceased';
  } else if (firstYear && /^\d{4}$/.test(firstYear)) {
    statusLabel = intl.formatMessage(messages.statusOngoing, {
      year: firstYear,
    });
    statusTone = 'ongoing';
  } else if (data.issn || data.wikidataQid) {
    // Have identity but no dates — likely ongoing.
    statusLabel = intl.formatMessage(messages.statusOngoingNoYear);
    statusTone = 'ongoing';
  } else {
    statusLabel = intl.formatMessage(messages.statusUnknown);
    statusTone = 'unknown';
  }

  const statusClass =
    statusTone === 'ongoing'
      ? 'border-emerald-500 bg-emerald-600/20 text-emerald-200'
      : statusTone === 'ceased'
        ? 'border-rose-500 bg-rose-600/20 text-rose-200'
        : 'border-gray-500 bg-gray-600/20 text-gray-300';

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
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-800 ring-1 ring-gray-700">
              <NewspaperIcon className="h-20 w-20 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
            <StatusBadge
              status={data.mediaStatus ?? undefined}
              title={data.title}
            />
            {/* Publication-status chip (different from request-status
                badge above). Tells the operator whether the magazine
                is still being published — the #1 thing they want to
                know before requesting. */}
            <span
              className={`ml-2 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium uppercase tracking-wider ${statusClass}`}
            >
              {statusLabel}
            </span>
          </div>
          <h1 data-testid="media-title">
            {data.title}
            {data.year && <span className="media-year"> ({data.year})</span>}
          </h1>
          {data.publisher && (
            <p className="text-sm text-gray-300">{data.publisher}</p>
          )}
          {data.categories && data.categories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.categories.map((c) => (
                <Tag key={c}>{c}</Tag>
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

        {/* Right rail — same media-facts pattern as the book detail
            page so the visual rhythm matches. Each row is
            label / value with the value right-aligned. Empty fields
            are omitted entirely rather than rendered with "—" so the
            block stays tight. */}
        <div className="media-overview-right">
          <div className="media-facts">
            {data.publisher && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.publisher)}</span>
                <span className="media-fact-value">{data.publisher}</span>
              </div>
            )}
            {data.country && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.country)}</span>
                <span className="media-fact-value inline-flex items-center gap-1 uppercase">
                  {countryFlag(data.country) && (
                    <span className="text-base leading-none">
                      {countryFlag(data.country)}
                    </span>
                  )}
                  <span>{data.country}</span>
                </span>
              </div>
            )}
            {data.language && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.language)}</span>
                <span className="media-fact-value uppercase">
                  {data.language}
                </span>
              </div>
            )}
            {data.frequency && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.frequency)}</span>
                <span className="media-fact-value capitalize">
                  {data.frequency}
                </span>
              </div>
            )}
            {firstYear && /^\d{4}$/.test(firstYear) && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.firstPublished)}</span>
                <span className="media-fact-value">{firstYear}</span>
              </div>
            )}
            {ceasedYear && /^\d{4}$/.test(ceasedYear) && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.ceased)}</span>
                <span className="media-fact-value">{ceasedYear}</span>
              </div>
            )}
            {data.issn && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.issn)}</span>
                <span className="media-fact-value font-mono">
                  {data.issn}
                </span>
              </div>
            )}
            {data.zdbId && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.zdb)}</span>
                <span className="media-fact-value font-mono">
                  {data.zdbId}
                </span>
              </div>
            )}
            {data.wikidataQid && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.wikidata)}</span>
                <span className="media-fact-value">
                  <a
                    href={`https://www.wikidata.org/wiki/${data.wikidataQid}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-indigo-400 hover:text-indigo-300"
                  >
                    {data.wikidataQid}
                  </a>
                </span>
              </div>
            )}
            {data.wikipediaUrl && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.wikipedia)}</span>
                <span className="media-fact-value">
                  <a
                    href={data.wikipediaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-indigo-400 hover:text-indigo-300"
                  >
                    {intl.formatMessage(messages.openExternal)} →
                  </a>
                </span>
              </div>
            )}
            {data.sources && data.sources.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.sources)}</span>
                <span className="media-fact-value text-xs uppercase tracking-wider text-gray-300">
                  {data.sources.join(' · ')}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MagazineDetailPage;
