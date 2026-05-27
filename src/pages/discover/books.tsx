import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import BookCard from '@app/components/BookCard';
import Link from 'next/link';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

interface PopularBook {
  id: number;
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
      emptyHint={
        <>
          <p className="mb-3">
            {intl.formatMessage({
              id: 'pages.discover.books.empty',
              defaultMessage:
                'No popular books feed wired yet — use search to find titles.',
            })}
          </p>
          <Link
            href="/search"
            className="text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            {intl.formatMessage({
              id: 'pages.discover.books.goSearch',
              defaultMessage: 'Open search',
            })}
          </Link>
        </>
      }
    />
  );
};

export default DiscoverBooksPage;
