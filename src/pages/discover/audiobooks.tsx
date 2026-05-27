import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import AudiobookCard from '@app/components/AudiobookCard';
import Link from 'next/link';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

interface PopularAudiobook {
  id: number;
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
      emptyHint={
        <>
          <p className="mb-3">
            {intl.formatMessage({
              id: 'pages.discover.audiobooks.empty',
              defaultMessage:
                'No popular audiobooks feed wired yet — use search to find titles.',
            })}
          </p>
          <Link
            href="/search"
            className="text-indigo-400 hover:text-indigo-300 hover:underline"
          >
            {intl.formatMessage({
              id: 'pages.discover.audiobooks.goSearch',
              defaultMessage: 'Open search',
            })}
          </Link>
        </>
      }
    />
  );
};

export default DiscoverAudiobooksPage;
