import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import MangaFilterSlideover, {
  countMangaActiveFilters,
  type MangaFilterValues,
} from '@app/components/Discover/ExtendedFilterSlideover/MangaFilterSlideover';
import MangaCard from '@app/components/MangaCard';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

interface PopularManga {
  id: number;
  anilistId: number;
  title: string;
  coverUrl?: string;
  bannerUrl?: string;
  year?: number;
  status?: string;
  format?: string;
  averageScore?: number;
  mediaStatus?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  availableChapters?: number | null;
  availableVolumes?: number | null;
}

const useMangaFilters = (): MangaFilterValues => {
  const router = useRouter();
  const get = (k: string) =>
    typeof router.query[k] === 'string'
      ? (router.query[k] as string)
      : undefined;
  return {
    genre: get('genre'),
    format: get('format'),
    status: get('status'),
    country: get('country'),
    startYearGte: get('startYearGte'),
    startYearLte: get('startYearLte'),
  };
};

const DiscoverMangaPage: NextPage = () => {
  const intl = useIntl();
  const filters = useMangaFilters();
  return (
    <DiscoverExtended<PopularManga>
      title={intl.formatMessage({
        id: 'pages.discover.manga.title',
        defaultMessage: 'Manga',
      })}
      endpoint="/api/v1/discover/manga"
      cardKey={(m) => m.anilistId}
      sortOptions={[
        { value: 'trending', label: 'Trending' },
        { value: 'popularity', label: 'Popularity' },
        { value: 'score', label: 'Score' },
        { value: 'recent', label: 'Start date (newest)' },
        { value: 'oldest', label: 'Start date (oldest)' },
        { value: 'title', label: 'Title (A→Z)' },
      ]}
      activeFilterCount={countMangaActiveFilters(filters)}
      renderFilters={({ show, onClose }) => (
        <MangaFilterSlideover
          show={show}
          onClose={onClose}
          currentFilters={filters}
        />
      )}
      renderCard={(m, key) => (
        <li key={key}>
          <MangaCard
            anilistId={m.anilistId}
            title={m.title}
            coverUrl={m.coverUrl}
            year={m.year}
            status={m.status}
            format={m.format}
            averageScore={m.averageScore}
            mediaStatus={m.mediaStatus as never}
            chapters={m.chapters ?? undefined}
            volumes={m.volumes ?? undefined}
            availableChapters={m.availableChapters ?? undefined}
            availableVolumes={m.availableVolumes ?? undefined}
          />
        </li>
      )}
    />
  );
};

export default DiscoverMangaPage;
