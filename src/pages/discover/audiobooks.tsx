import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import BooksFilterSlideover, {
  countBooksActiveFilters,
  type BooksFilterValues,
} from '@app/components/Discover/ExtendedFilterSlideover/BooksFilterSlideover';
import AudiobookCard from '@app/components/AudiobookCard';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

// Audiobook discover uses the same shape as books (Hardcover /
// OpenLibrary feed + Audible fallback). Both wire the BooksFilter
// slideover but with audiobook-specific genre + endpoint.
interface PopularAudiobook {
  id: string;
  openLibraryId: string;
  title: string;
  authorName: string;
  narratorName?: string;
  durationSeconds?: number;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  mediaStatus?: number | null;
}

const useAudiobookFilters = (): BooksFilterValues => {
  const router = useRouter();
  const get = (k: string) =>
    typeof router.query[k] === 'string'
      ? (router.query[k] as string)
      : undefined;
  return {
    genre: get('genre'),
    yearGte: get('yearGte'),
    yearLte: get('yearLte'),
  };
};

const DiscoverAudiobooksPage: NextPage = () => {
  const intl = useIntl();
  const filters = useAudiobookFilters();
  return (
    <DiscoverExtended<PopularAudiobook>
      title={intl.formatMessage({
        id: 'pages.discover.audiobooks.title',
        defaultMessage: 'Audiobooks',
      })}
      endpoint="/api/v1/discover/audiobooks"
      noticeMediaType="audiobook"
      cardKey={(a) => a.openLibraryId}
      sortOptions={[
        {
          value: 'popular',
          label: intl.formatMessage({
            id: 'pages.discover.sort.popular',
            defaultMessage: 'Popular',
          }),
        },
        {
          value: 'recent',
          label: intl.formatMessage({
            id: 'pages.discover.sort.recent',
            defaultMessage: 'Recently released',
          }),
        },
      ]}
      activeFilterCount={countBooksActiveFilters(filters)}
      renderFilters={({ show, onClose }) => (
        <BooksFilterSlideover
          show={show}
          onClose={onClose}
          currentFilters={filters}
          genreEndpoint="/api/v1/discover/genreslider/audiobooks"
        />
      )}
      renderCard={(a, key) => (
        <li key={key}>
          <AudiobookCard
            openLibraryId={a.openLibraryId}
            title={a.title}
            authorName={a.authorName}
            narratorName={a.narratorName}
            durationSeconds={a.durationSeconds}
            coverUrl={a.coverUrl}
            year={a.year}
            publisher={a.publisher}
            mediaStatus={a.mediaStatus as never}
          />
        </li>
      )}
    />
  );
};

export default DiscoverAudiobooksPage;
