import DiscoverExtended from '@app/components/Discover/DiscoverExtended';
import MangaCard from '@app/components/MangaCard';
import type { NextPage } from 'next';
import { useIntl } from 'react-intl';

interface PopularManga {
  id: number;
  anilistId: number;
  title: string;
  coverUrl?: string;
  bannerUrl?: string;
  year?: number;
  status?: string;
  format?: string;
  averageScore?: number;
}

const DiscoverMangaPage: NextPage = () => {
  const intl = useIntl();
  return (
    <DiscoverExtended<PopularManga>
      title={intl.formatMessage({
        id: 'pages.discover.manga.title',
        defaultMessage: 'Manga',
      })}
      endpoint="/api/v1/discover/manga"
      cardKey={(m) => m.anilistId}
      renderCard={(m, key) => (
        <li key={key}>
          <MangaCard
            anilistId={m.anilistId}
            title={m.title}
            coverUrl={m.coverUrl}
            year={m.year}
            status={m.status}
            format={m.format}
            averageScore={m.averageScore}
          />
        </li>
      )}
    />
  );
};

export default DiscoverMangaPage;
