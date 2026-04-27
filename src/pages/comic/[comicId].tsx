import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import ComicRequestModal from '@app/components/RequestModal/ComicRequestModal';
import StatusBadge from '@app/components/StatusBadge';
import StatusReason from '@app/components/StatusReason';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.ComicDetail', {
  notFound: 'Comic not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  publisher: 'Publisher',
  issueCount: 'Issues',
  firstIssue: 'First issue',
  lastIssue: 'Last issue',
  characters: 'Characters',
  creator: 'About the creator',
  issues: 'Issues',
  issueLabel: '#{number}',
  request: 'Request',
});

interface ComicIssue {
  id?: number;
  comicVineId?: number;
  name?: string;
  issueNumber?: string;
  coverDate?: string;
}

interface ComicDetailData {
  key: number;
  comicVineId: number;
  title: string;
  year?: number;
  coverUrl?: string;
  issueCount?: number;
  publisher?: string;
  publisherId?: number;
  description?: string;
  siteDetailUrl?: string;
  aliases?: string;
  firstIssue?: ComicIssue;
  lastIssue?: ComicIssue;
  issues?: ComicIssue[];
  characters?: string[];
  creatorName?: string;
  creatorKey?: number;
  creatorRole?: string;
  creatorPhotoUrl?: string;
  creatorCountry?: string;
  mediaStatus?: number | null;
  mediaStatusReason?: string | null;
}

// Convert an ISO-3166-1 alpha-2 country code to its flag emoji
// (regional indicator symbols, each = "🇦" + (letter - A) offset).
const countryFlag = (code: string): string => {
  if (!/^[A-Z]{2}$/i.test(code)) return '';
  return code
    .toUpperCase()
    .split('')
    .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
    .join('');
};

// ComicVine ships the creator's country as a full string ("United
// States", "France", …), not an ISO code. Map the most common
// origins to alpha-2 so we can render a flag chip in the author
// block. Anything not in the table falls back to the bare country
// name (no flag) so we never render a broken glyph.
const COMIC_COUNTRY_TO_ISO: Record<string, string> = {
  'united states': 'US',
  usa: 'US',
  'u.s.a.': 'US',
  'u.s.': 'US',
  america: 'US',
  'united kingdom': 'GB',
  uk: 'GB',
  'u.k.': 'GB',
  england: 'GB',
  scotland: 'GB',
  wales: 'GB',
  'northern ireland': 'GB',
  'great britain': 'GB',
  france: 'FR',
  belgium: 'BE',
  italy: 'IT',
  spain: 'ES',
  portugal: 'PT',
  germany: 'DE',
  switzerland: 'CH',
  austria: 'AT',
  netherlands: 'NL',
  ireland: 'IE',
  canada: 'CA',
  mexico: 'MX',
  brazil: 'BR',
  argentina: 'AR',
  chile: 'CL',
  australia: 'AU',
  'new zealand': 'NZ',
  japan: 'JP',
  china: 'CN',
  'south korea': 'KR',
  korea: 'KR',
  india: 'IN',
  philippines: 'PH',
  russia: 'RU',
  poland: 'PL',
  ukraine: 'UA',
  sweden: 'SE',
  norway: 'NO',
  denmark: 'DK',
  finland: 'FI',
  greece: 'GR',
  hungary: 'HU',
  'czech republic': 'CZ',
  czechia: 'CZ',
  romania: 'RO',
  turkey: 'TR',
  israel: 'IL',
  'south africa': 'ZA',
};

const comicCountryFlag = (country?: string): string => {
  if (!country) return '';
  const iso = COMIC_COUNTRY_TO_ISO[country.toLowerCase().trim()];
  return iso ? countryFlag(iso) : '';
};

const ComicDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { comicId } = router.query;
  const { hasPermission } = useUser();
  const [showRequestModal, setShowRequestModal] = useState(false);

  const { data, error, mutate } = useSWR<ComicDetailData>(
    comicId ? `/api/v1/comic/${comicId}` : null
  );

  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_COMIC],
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

  // ComicVine descriptions ship with HTML; strip tags for the card.
  const cleanDescription = data.description
    ? data.description.replace(/<[^>]+>/g, '').trim()
    : '';

  return (
    <div className="media-page" style={{ height: 493 }}>
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
              <BookOpenIcon className="h-16 w-16 text-gray-500" />
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status flex items-center gap-2">
            <span className="rounded-full border border-amber-500 bg-amber-600/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              Comic
            </span>
            <StatusBadge
              status={data.mediaStatus ?? undefined}
              title={data.title}
            />
            <StatusReason reason={data.mediaStatusReason} />
          </div>
          <h1>{data.title}</h1>
          {data.aliases && (
            <p className="text-sm text-gray-400">{data.aliases}</p>
          )}
          <span className="media-attributes">
            {data.year && <span>{data.year}</span>}
            {data.publisher && (
              <>
                <span>·</span>
                <span>{data.publisher}</span>
              </>
            )}
            {typeof data.issueCount === 'number' && data.issueCount > 0 && (
              <>
                <span>·</span>
                <span>
                  {intl.formatMessage(messages.issueCount)}: {data.issueCount}
                </span>
              </>
            )}
          </span>
          {canRequest && (
            <div className="media-actions mt-4">
              <Button
                buttonType="primary"
                onClick={() => setShowRequestModal(true)}
              >
                <BookOpenIcon />
                <span>{intl.formatMessage(messages.request)}</span>
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {cleanDescription ||
              intl.formatMessage(messages.overviewunavailable)}
          </p>

          {data.issues && data.issues.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.issues)}
              </h3>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {data.issues.map((i, idx) => (
                  <li
                    key={`issue-${i.comicVineId ?? i.id ?? idx}`}
                    className="rounded-md bg-gray-800 p-2 text-xs text-gray-200 ring-1 ring-gray-700"
                  >
                    <div className="font-mono text-amber-300">
                      {i.issueNumber
                        ? intl.formatMessage(messages.issueLabel, {
                            number: i.issueNumber,
                          })
                        : '—'}
                    </div>
                    {i.name && (
                      <div className="mt-0.5 truncate text-gray-300">
                        {i.name}
                      </div>
                    )}
                    {i.coverDate && (
                      <div className="text-gray-500">{i.coverDate}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="media-overview-right">
          {data.creatorName && (
            <button
              type="button"
              disabled={!data.creatorKey}
              onClick={() =>
                data.creatorKey &&
                router.push(`/comic/person/${data.creatorKey}`)
              }
              className="group mb-6 block w-full cursor-pointer overflow-hidden rounded-lg bg-gray-800 text-left shadow-md ring-1 ring-gray-700 transition hover:ring-amber-400 disabled:cursor-default disabled:hover:ring-gray-700"
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0">
                  {data.creatorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.creatorPhotoUrl}
                      alt={data.creatorName}
                      className="h-20 w-20 rounded-full object-cover ring-2 ring-amber-500/40"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-semibold text-gray-300 ring-2 ring-amber-500/40">
                      {data.creatorName[0]?.toUpperCase() ?? '?'}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs uppercase tracking-wide text-gray-400">
                    {intl.formatMessage(messages.creator)}
                  </div>
                  <div className="text-base font-semibold text-white group-hover:text-amber-300">
                    {data.creatorName}
                  </div>
                  {data.creatorRole && (
                    <div className="text-xs text-gray-400">
                      {data.creatorRole}
                    </div>
                  )}
                  {data.creatorCountry && (
                    <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-gray-700/60 px-2 py-0.5 text-xs text-gray-200">
                      {comicCountryFlag(data.creatorCountry) && (
                        <span aria-hidden="true">
                          {comicCountryFlag(data.creatorCountry)}
                        </span>
                      )}
                      <span>{data.creatorCountry}</span>
                    </div>
                  )}
                </div>
              </div>
            </button>
          )}

          <div className="media-facts">
            {data.publisher && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.publisher)}</span>
                <span className="media-fact-value">{data.publisher}</span>
              </div>
            )}
            {data.firstIssue && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.firstIssue)}</span>
                <span className="media-fact-value">
                  {data.firstIssue.coverDate ?? data.firstIssue.issueNumber}
                </span>
              </div>
            )}
            {data.lastIssue && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.lastIssue)}</span>
                <span className="media-fact-value">
                  {data.lastIssue.coverDate ?? data.lastIssue.issueNumber}
                </span>
              </div>
            )}
            {data.characters && data.characters.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.characters)}</span>
                <span className="media-fact-value">
                  {data.characters.join(', ')}
                </span>
              </div>
            )}
          </div>

        </div>
      </div>
      <div className="extra-bottom-space relative" />

      <ComicRequestModal
        show={showRequestModal}
        comicVineId={data.comicVineId}
        title={data.title}
        coverUrl={data.coverUrl}
        year={data.year}
        issueCount={data.issueCount}
        publisher={data.publisher}
        publisherId={data.publisherId}
        creatorName={data.creatorName}
        creatorKey={data.creatorKey}
        issues={data.issues}
        onCancel={() => setShowRequestModal(false)}
        onComplete={() => {
          setShowRequestModal(false);
          mutate();
        }}
      />
    </div>
  );
};

export default ComicDetailPage;
