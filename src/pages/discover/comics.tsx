import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import ComicsFilterSlideover, {
  countComicsActiveFilters,
  type ComicsFilterValues,
} from '@app/components/Discover/ExtendedFilterSlideover/ComicsFilterSlideover';
import ComicCard from '@app/components/ComicCard';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

// ComicVine has no trending API but its ``/volumes`` endpoint
// supports ``sort=date_last_updated:desc`` — series whose latest
// issue was indexed most recently. Stable proxy for "actively
// running comics", which is what an operator browsing comics
// usually wants.
interface PopularComic {
  id: number;
  comicVineId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  issueCount?: number;
  publisher?: string;
  deck?: string;
  mediaStatus?: number | null;
  availableIssues?: number | null;
}

const useComicsFilters = (): ComicsFilterValues => {
  const router = useRouter();
  const get = (k: string) =>
    typeof router.query[k] === 'string'
      ? (router.query[k] as string)
      : undefined;
  return {
    publisher: get('publisher'),
    startYearGte: get('startYearGte'),
    startYearLte: get('startYearLte'),
  };
};

const DiscoverComicsPage: NextPage = () => {
  const intl = useIntl();
  const filters = useComicsFilters();
  return (
    <DiscoverExtended<PopularComic>
      title={intl.formatMessage({
        id: 'pages.discover.comics.title',
        defaultMessage: 'Comics',
      })}
      endpoint="/api/v1/discover/comics"
      noticeMediaType="comic"
      cardKey={(c) => c.comicVineId}
      sortOptions={[
        { value: 'recent', label: 'Recently updated' },
        { value: 'name', label: 'Name (A→Z)' },
      ]}
      activeFilterCount={countComicsActiveFilters(filters)}
      renderFilters={({ show, onClose }) => (
        <ComicsFilterSlideover
          show={show}
          onClose={onClose}
          currentFilters={filters}
        />
      )}
      renderCard={(c, key) => (
        <li key={key}>
          <ComicCard
            comicVineId={c.comicVineId}
            title={c.title}
            coverUrl={c.coverUrl}
            year={c.year}
            issueCount={c.issueCount}
            publisher={c.publisher}
            deck={c.deck}
            mediaStatus={c.mediaStatus as never}
            availableIssues={c.availableIssues ?? undefined}
          />
        </li>
      )}
    />
  );
};

export default DiscoverComicsPage;
