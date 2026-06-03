import Button from '@app/components/Common/Button';
import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import MagazineCard from '@app/components/MagazineCard';
import MagazineManualRequestModal from '@app/components/RequestModal/MagazineManualRequestModal';
import { PlusIcon } from '@heroicons/react/24/solid';
import type { NextPage } from 'next';
import { useState } from 'react';
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
  coverIsLogo?: boolean;
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
  // Same escape-hatch the search page exposes — when neither
  // discover nor search surfaces the operator's magazine
  // (very local title, defunct, niche…), they can dispatch a
  // manual request from here instead of hopping back to /search.
  const [showManualRequest, setShowManualRequest] = useState(false);

  return (
    <>
      <DiscoverExtended<DiscoverMagazine>
        title={intl.formatMessage({
          id: 'pages.discover.magazines.title',
          defaultMessage: 'Magazines',
        })}
        endpoint="/api/v1/discover/magazines"
        noticeMediaType="magazine"
        cardKey={(m) => m.id}
        extraToolbarActions={
          <Button
            buttonType="primary"
            onClick={() => setShowManualRequest(true)}
            className="w-full"
          >
            <PlusIcon />
            <span>
              {intl.formatMessage({
                id: 'pages.discover.magazines.manualRequest',
                defaultMessage: 'Request a magazine not listed',
              })}
            </span>
          </Button>
        }
        renderCard={(m, key) => (
          <li key={key}>
            <MagazineCard
              id={m.id}
              title={m.title}
              coverUrl={m.coverUrl}
              coverIsLogo={m.coverIsLogo}
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
      <MagazineManualRequestModal
        show={showManualRequest}
        onCancel={() => setShowManualRequest(false)}
        onComplete={() => setShowManualRequest(false)}
      />
    </>
  );
};

export default DiscoverMagazinesPage;
