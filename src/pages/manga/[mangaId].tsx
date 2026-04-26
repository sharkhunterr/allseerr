import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
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
  externalLinks: 'External links',
  aboutAuthor: 'About the author',
  related: 'Related works',
  popularityCountFmt: '{count, plural, one {# user} other {# users}}',
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

interface MangaExternalLink {
  site: string;
  url: string;
  type?: string;
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
  externalLinks?: MangaExternalLink[];
  authorName?: string;
  authorKey?: number;
  authorPhotoUrl?: string;
  authorRole?: string;
  relations?: MangaRelation[];
}

const MangaDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { mangaId } = router.query;

  const { data, error } = useSWR<MangaDetailData>(
    mangaId ? `/api/v1/manga/${mangaId}` : null
  );

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
          <div className="media-status">
            <span className="rounded-full border border-indigo-500 bg-indigo-600/80 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-md">
              {(data.countryOfOrigin ?? 'jp').toUpperCase() === 'KR'
                ? 'Manhwa'
                : (data.countryOfOrigin ?? 'jp').toUpperCase() === 'CN'
                  ? 'Manhua'
                  : 'Manga'}
            </span>
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
        </div>
      </div>

      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {cleanDescription ||
              intl.formatMessage(messages.overviewunavailable)}
          </p>

          {data.tags && data.tags.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.tags)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-gray-600 bg-gray-800/80 px-2 py-0.5 text-xs text-gray-200"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.relations && data.relations.length > 0 && (
            <div className="mt-8">
              <h3 className="mb-3 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.related)}
              </h3>
              <ul className="cards-vertical">
                {data.relations.map((r) => (
                  <li key={r.anilistId}>
                    <Link href={`/manga/${r.anilistId}`}>
                      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
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
                          {r.relationType && (
                            <div className="absolute left-2 top-2 z-40 rounded-full border border-indigo-500 bg-indigo-600/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white shadow-md">
                              {r.relationType.replace(/_/g, ' ')}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col p-3">
                          <h3 className="truncate text-sm font-semibold text-white">
                            {r.title}
                          </h3>
                          <div className="mt-1 text-xs text-gray-500">
                            {r.year}
                            {r.format && ` · ${r.format.replace(/_/g, ' ')}`}
                          </div>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
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
          </div>

          {data.genres && data.genres.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-400">
                {intl.formatMessage(messages.genres)}
              </h3>
              <div className="flex flex-wrap gap-2">
                {data.genres.map((g) => (
                  <span
                    key={g}
                    className="rounded-full border border-indigo-500 bg-indigo-600/30 px-2 py-0.5 text-xs text-indigo-200"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.externalLinks && data.externalLinks.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-400">
                {intl.formatMessage(messages.externalLinks)}
              </h3>
              <ul className="space-y-1">
                {data.externalLinks.map((l) => (
                  <li key={l.url}>
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-indigo-400 hover:text-indigo-300"
                    >
                      {l.site}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default MangaDetailPage;
