import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import AudiobookCard from '@app/components/AudiobookCard';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

// The Audible upstream doesn't expose a popular feed without
// authenticated cookies, so the backend re-uses OpenLibrary's
// trending books list — the audiobook edition of those popular
// titles is then surface-able on the detail page's edition
// picker. The shape lines up with PopularBook on /discover/books
// (same OpenLibrary keys + cover) so the rendering is
// straightforward.
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
}

const DiscoverAudiobooksPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<PopularAudiobook>
      title={intl.formatMessage({
        id: 'pages.discover.audiobooks.title',
        defaultMessage: 'Audiobooks',
      })}
      endpoint="/api/v1/discover/audiobooks"
      cardKey={(a) => a.openLibraryId}
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
          />
        </li>
      )}
    />
  );
};

export default DiscoverAudiobooksPage;
