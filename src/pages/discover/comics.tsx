import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import ComicCard from '@app/components/ComicCard';
import type { NextPage } from 'next';
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
    />
  );
};

export default DiscoverComicsPage;
