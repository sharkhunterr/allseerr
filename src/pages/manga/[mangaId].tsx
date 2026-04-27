import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import MangaRequestModal from '@app/components/RequestModal/MangaRequestModal';
import Slider from '@app/components/Slider';
import StatusBadge from '@app/components/StatusBadge';
import StatusReason from '@app/components/StatusReason';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('pages.MangaDetail', {
  notFound: 'Manga not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  status: 'Status',
  format: 'Format',
  chapters: 'Chapters',
  volumes: 'Volumes',
  source: 'Source',
  startDate: 'Started',
  endDate: 'Ended',
  country: 'Country',
  score: 'Score',
  popularity: 'Popularity',
  favourites: 'Favourites',
  genres: 'Genres',
  tags: 'Tags',
  characters: 'Characters',
  aboutAuthor: 'About the author',
  popularityCountFmt: '{count, plural, one {# user} other {# users}}',
  request: 'Request',
});

interface MangaRelation {
  relationType?: string;
  anilistId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  format?: string;
  status?: string;
}

interface MangaDetailData {
  key: number;
  anilistId: number;
  malId?: number;
  title: string;
  titleNative?: string;
  titleRomaji?: string;
  synonyms?: string[];
  description?: string;
  coverUrl?: string;
  bannerUrl?: string;
  colorAccent?: string;
  year?: number;
  releaseDate?: string;
  endDate?: string;
  status?: string;
  format?: string;
  chapters?: number;
  volumes?: number;
  averageScore?: number;
  meanScore?: number;
  popularity?: number;
  favourites?: number;
  countryOfOrigin?: string;
  source?: string;
  isAdult?: boolean;
  genres?: string[];
  tags?: string[];
  characters?: string[];
  authorName?: string;
  authorKey?: number;
  authorPhotoUrl?: string;
  authorRole?: string;
  relations?: MangaRelation[];
  mediaStatus?: number | null;
  mediaStatusReason?: string | null;
}

const MangaDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { mangaId } = router.query;
  const { hasPermission } = useUser();
  const [showRequestModal, setShowRequestModal] = useState(false);

  const { data, error, mutate } = useSWR<MangaDetailData>(
    mangaId ? `/api/v1/manga/${mangaId}` : null
  );

  const canRequest = hasPermission(
    [Permission.REQUEST, Permission.REQUEST_MANGA],
    { type: 'or' }
  );

  // Group relations by their AniList relationType so we can render one
  // horizontal slider per type (PREQUEL / SEQUEL / SIDE_STORY /
  // SPIN_OFF / ALTERNATIVE / ADAPTATION / …) the way movies render
  // recommendations and similar. Order is preserved: each type appears
  // in the order its first item showed up in the relations array, which
  // already follows AniList's relevance ranking.
  const relationGroups = useMemo(() => {
    const grouped = new Map<string, MangaRelation[]>();
    for (const rel of data?.relations ?? []) {
      const key = rel.relationType ?? 'OTHER';
      const bucket = grouped.get(key);
      if (bucket) {
        bucket.push(rel);
      } else {
        grouped.set(key, [rel]);
      }
    }
    return Array.from(grouped.entries());
  }, [data?.relations]);

  // Humanise the AniList relation enum: SIDE_STORY → "Side Story".
  const relationLabel = (raw: string) =>
    raw
      .toLowerCase()
      .split('_')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

  if (!data && !error) return <LoadingSpinner />;
  if (error || !data) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  // AniList description has minimal HTML; strip tags for the card.
  const cleanDescription = data.description
    ? data.description.replace(/<[^>]+>/g, '').trim()
    : '';

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={data.title} />

      {data.bannerUrl && (
        <div
          className="media-page-bg-image"
          style={{
            backgroundImage: `linear-gradient(180deg, rgba(17, 24, 39, 0.47) 0%, rgba(17, 24, 39, 1) 100%), url(${data.bannerUrl})`,
          }}
        />
      )}

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
            <span className="rounded-full border border-fuchsia-500 bg-fuchsia-600/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              {(data.countryOfOrigin ?? 'jp').toUpperCase() === 'KR'
                ? 'Manhwa'
                : (data.countryOfOrigin ?? 'jp').toUpperCase() === 'CN'
                  ? 'Manhua'
                  : 'Manga'}
            </span>
            <StatusBadge
              status={data.mediaStatus ?? undefined}
              title={data.title}
            />
            <StatusReason reason={data.mediaStatusReason} />
          </div>
          <h1>{data.title}</h1>
          {data.titleNative && data.titleNative !== data.title && (
            <p className="text-sm text-gray-400">{data.titleNative}</p>
          )}
          <span className="media-attributes">
            {data.year && <span>{data.year}</span>}
            {data.format && (
              <>
                <span>·</span>
                <span>{data.format.replace(/_/g, ' ')}</span>
              </>
            )}
            {data.status && (
              <>
                <span>·</span>
                <span>{data.status.replace(/_/g, ' ').toLowerCase()}</span>
              </>
            )}
          </span>
          {canRequest && (
            <div className="media-actions mt-4">
              <button
                type="button"
                onClick={() => setShowRequestModal(true)}
                className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              >
                <BookOpenIcon className="mr-2 h-5 w-5" />
                {intl.formatMessage(messages.request)}
              </button>
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

          {data.genres && data.genres.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.genres)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-gray-600 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="media-overview-right">
          {data.authorName && (
            <button
              type="button"
              disabled={!data.authorKey}
              onClick={() =>
                data.authorKey &&
                router.push(`/manga/staff/${data.authorKey}`)
              }
              className="group mb-6 block w-full cursor-pointer overflow-hidden rounded-lg bg-gray-800 text-left shadow-md ring-1 ring-gray-700 transition hover:ring-indigo-400 disabled:cursor-default disabled:hover:ring-gray-700"
            >
              <div className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0">
                  {data.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={data.authorPhotoUrl}
                      alt={data.authorName}
                      className="h-20 w-20 rounded-full object-cover ring-2 ring-indigo-500/40"
                    />
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-700 text-2xl font-semibold text-gray-300">
                      {data.authorName[0]?.toUpperCase() ?? '?'}
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
                  {data.authorRole && (
                    <div className="text-xs text-gray-400">
                      {data.authorRole}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )}

          <div className="media-facts">
            {data.status && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.status)}</span>
                <span className="media-fact-value">
                  {data.status.replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>
            )}
            {data.format && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.format)}</span>
                <span className="media-fact-value">
                  {data.format.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {typeof data.chapters === 'number' && data.chapters > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.chapters)}</span>
                <span className="media-fact-value">{data.chapters}</span>
              </div>
            )}
            {typeof data.volumes === 'number' && data.volumes > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.volumes)}</span>
                <span className="media-fact-value">{data.volumes}</span>
              </div>
            )}
            {data.source && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.source)}</span>
                <span className="media-fact-value">
                  {data.source.replace(/_/g, ' ').toLowerCase()}
                </span>
              </div>
            )}
            {data.releaseDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.startDate)}</span>
                <span className="media-fact-value">{data.releaseDate}</span>
              </div>
            )}
            {data.endDate && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.endDate)}</span>
                <span className="media-fact-value">{data.endDate}</span>
              </div>
            )}
            {data.countryOfOrigin && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.country)}</span>
                <span className="media-fact-value uppercase">
                  {data.countryOfOrigin}
                </span>
              </div>
            )}
            {typeof data.averageScore === 'number' && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.score)}</span>
                <span className="media-fact-value">
                  {data.averageScore}%
                </span>
              </div>
            )}
            {typeof data.popularity === 'number' && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.popularity)}</span>
                <span className="media-fact-value">
                  {intl.formatMessage(messages.popularityCountFmt, {
                    count: data.popularity,
                  })}
                </span>
              </div>
            )}
            {data.tags && data.tags.length > 0 && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.tags)}</span>
                <span className="media-fact-value flex flex-wrap gap-1">
                  {data.tags.map((t) => (
                    <span
                      key={`tag-${t}`}
                      className="rounded-full bg-fuchsia-900/40 px-2 py-0.5 text-xs text-fuchsia-200"
                    >
                      {t}
                    </span>
                  ))}
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

      {/* Related works — one horizontal Slider per relation type
          (PREQUEL / SEQUEL / SIDE_STORY / SPIN_OFF / ALTERNATIVE /
          ADAPTATION / …). Mirrors the way movie pages stack
          recommendations + similar at the bottom. Order follows
          AniList's relevance ranking inside each group. */}
      {relationGroups.map(([type, items]) => (
        <div key={`relations-${type}`}>
          <div className="slider-header">
            <div className="slider-title">
              <span>{relationLabel(type)}</span>
            </div>
          </div>
          <Slider
            sliderKey={`manga-relations-${type}`}
            isLoading={false}
            isEmpty={items.length === 0}
            items={items.map((r) => (
              <Link
                key={`relation-${r.anilistId}`}
                href={`/manga/${r.anilistId}`}
              >
                <div className="group relative flex w-36 cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-fuchsia-500 sm:w-40">
                  <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
                    {r.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.coverUrl}
                        alt={r.title}
                        className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <BookOpenIcon className="h-12 w-12 text-gray-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2">
                    <h3 className="truncate text-sm font-semibold text-white">
                      {r.title}
                    </h3>
                    {(r.year || r.format) && (
                      <div className="mt-0.5 truncate text-xs text-gray-500">
                        {r.year}
                        {r.format && ` · ${r.format.replace(/_/g, ' ')}`}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          />
        </div>
      ))}

      <div className="extra-bottom-space relative" />

      <MangaRequestModal
        show={showRequestModal}
        anilistId={data.anilistId}
        malId={data.malId}
        title={data.title}
        titleNative={data.titleNative}
        coverUrl={data.coverUrl}
        year={data.year}
        format={data.format}
        statusAnilist={data.status}
        chapters={data.chapters}
        volumes={data.volumes}
        countryOfOrigin={data.countryOfOrigin}
        authorName={data.authorName}
        onCancel={() => setShowRequestModal(false)}
        onComplete={() => {
          setShowRequestModal(false);
          mutate();
        }}
      />
    </div>
  );
};

export default MangaDetailPage;
