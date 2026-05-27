import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import BookCard from '@app/components/BookCard';
import type { NextPage } from 'next';
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
}

const DiscoverBooksPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<PopularBook>
      title={intl.formatMessage({
        id: 'pages.discover.books.title',
        defaultMessage: 'Books',
      })}
      endpoint="/api/v1/discover/books"
      cardKey={(b) => b.openLibraryId}
      renderCard={(b, key) => (
        <li key={key}>
          <BookCard
            openLibraryId={b.openLibraryId}
            title={b.title}
            authorName={b.authorName}
            coverUrl={b.coverUrl}
            year={b.year}
            publisher={b.publisher}
          />
        </li>
      )}
    />
  );
};

export default DiscoverBooksPage;
