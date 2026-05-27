import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import ComicCard from '@app/components/ComicCard';
import Link from 'next/link';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

// ComicVine doesn't expose a "popular" surface without significant
// crawling work, so the backend returns an empty envelope and we
// render a search-first hint. As soon as the popular endpoint is
// wired up (e.g. cached "most-viewed" issues), this page renders
// the cards exactly like the games / manga pages do.
interface PopularComic {
  id: number;
  comicVineId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  issueCount?: number;
  publisher?: string;
  deck?: string;
}

const DiscoverComicsPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<PopularComic>
      title={intl.formatMessage({
        id: 'pages.discover.comics.title',
        defaultMessage: 'Comics',
      })}
      endpoint="/api/v1/discover/comics"
      cardKey={(c) => c.comicVineId}
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
          />
        </li>
      )}
      emptyHint={
        <>
          <p className="mb-3">
            {intl.formatMessage({
              id: 'pages.discover.comics.empty',
              defaultMessage:
                'ComicVine has no popular feed — use search to browse.',
            })}
          </p>
          <Link
            href="/search"
            className="text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            {intl.formatMessage({
              id: 'pages.discover.comics.goSearch',
              defaultMessage: 'Open search',
            })}
          </Link>
        </>
      }
    />
  );
};

export default DiscoverComicsPage;
