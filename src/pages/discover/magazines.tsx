import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import MagazineCard from '@app/components/MagazineCard';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

// Magazines have no native trending feed (Google Books doesn't
// expose ``trending`` for printType=magazines). The
// /discover/magazines endpoint returns either an operator-typed
// query or a curated default list of well-known titles, so the
// browse page has no sort selector — it just paginates the
// merged result set.
interface DiscoverMagazine {
  id: string;
  googleBooksId?: string;
  title: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  issn?: string;
  language?: string;
  country?: string;
  description?: string;
  categories?: string[];
  issueCount?: number;
  availableIssues?: number | null;
  mediaStatus?: number | null;
}

const DiscoverMagazinesPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<DiscoverMagazine>
      title={intl.formatMessage({
        id: 'pages.discover.magazines.title',
        defaultMessage: 'Magazines',
      })}
      endpoint="/api/v1/discover/magazines"
      cardKey={(m) => m.id}
      renderCard={(m, key) => (
        <li key={key}>
          <MagazineCard
            id={m.id}
            title={m.title}
            coverUrl={m.coverUrl}
            year={m.year}
            publisher={m.publisher}
            issn={m.issn}
            description={m.description}
            language={m.language}
            country={m.country}
            categories={m.categories}
            issueCount={m.issueCount}
            availableIssues={m.availableIssues ?? undefined}
            mediaStatus={m.mediaStatus as never}
          />
        </li>
      )}
    />
  );
};

export default DiscoverMagazinesPage;
