import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import BooksFilterSlideover, {
  countBooksActiveFilters,
  type BooksFilterValues,
} from '@app/components/Discover/ExtendedFilterSlideover/BooksFilterSlideover';
import BookCard from '@app/components/BookCard';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useIntl } from 'react-intl';

interface PopularBook {
  // OpenLibrary keys are strings (``/works/OL123W``) — we keep
  // them as-is for the ``key`` extractor and pass them to the
  // detail page via the BookCard's ``openLibraryId`` prop.
  id: string;
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  mediaStatus?: number | null;
}

const useBooksFilters = (): BooksFilterValues => {
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

const DiscoverBooksPage: NextPage = () => {
  const intl = useIntl();
  const filters = useBooksFilters();
  return (
    <DiscoverExtended<PopularBook>
      title={intl.formatMessage({
        id: 'pages.discover.books.title',
        defaultMessage: 'Books',
      })}
      endpoint="/api/v1/discover/books"
      noticeMediaType="book"
      cardKey={(b) => b.openLibraryId}
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
          genreEndpoint="/api/v1/discover/genreslider/books"
        />
      )}
      renderCard={(b, key) => (
        <li key={key}>
          <BookCard
            openLibraryId={b.openLibraryId}
            title={b.title}
            authorName={b.authorName}
            coverUrl={b.coverUrl}
            year={b.year}
            publisher={b.publisher}
            mediaStatus={b.mediaStatus as never}
          />
        </li>
      )}
    />
  );
};

export default DiscoverBooksPage;
