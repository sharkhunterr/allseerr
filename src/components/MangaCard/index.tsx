import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import type { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';
import { defineMessage } from 'react-intl';

const chaptersMsg = defineMessage({
  id: 'components.MangaCard.chaptersCount',
  defaultMessage: '{count} ch',
});
const volumesMsg = defineMessage({
  id: 'components.MangaCard.volumesCount',
  defaultMessage: '{count} vol',
});

interface MangaCardProps {
  anilistId: number;
  title: string;
  titleNative?: string;
  coverUrl?: string;
  year?: number;
  status?: string;
  format?: string;
  chapters?: number;
  volumes?: number;
  averageScore?: number;
  countryOfOrigin?: string;
  mediaStatus?: MediaStatus | null;
}

const badgeForCountry = (
  country?: string
): { label: 'Manga' | 'Manhwa' | 'Manhua'; classes: string } => {
  // Fuchsia for manga, purple for manhwa, teal for manhua so
  // the three origin sources read distinctly on the grid.
  switch ((country ?? 'jp').toLowerCase()) {
    case 'kr':
      return {
        label: 'Manhwa',
        classes: 'border-purple-500 bg-purple-600/80',
      };
    case 'cn':
      return { label: 'Manhua', classes: 'border-teal-500 bg-teal-600/80' };
    default:
      return {
        label: 'Manga',
        classes: 'border-fuchsia-500 bg-fuchsia-600/80',
      };
  }
};

const MangaCard = ({
  anilistId,
  title,
  coverUrl,
  year,
  chapters,
  volumes,
  averageScore,
  countryOfOrigin,
  mediaStatus,
}: MangaCardProps) => {
  const intl = useIntl();
  const badge = badgeForCountry(countryOfOrigin);

  // Subtitle line above the title on hover — chapters / volumes
  // counts so the operator gets the "how big is this series"
  // signal at a glance without opening the detail page.
  const subtitleParts: string[] = [];
  if (typeof chapters === 'number' && chapters > 0) {
    subtitleParts.push(intl.formatMessage(chaptersMsg, { count: chapters }));
  }
  if (typeof volumes === 'number' && volumes > 0) {
    subtitleParts.push(intl.formatMessage(volumesMsg, { count: volumes }));
  }
  const subtitle = subtitleParts.length
    ? subtitleParts.join(' · ')
    : undefined;

  return (
    <MediaTitleCard
      href={`/manga/${anilistId}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      mediaStatus={mediaStatus}
      typeLabel={badge.label}
      typeBadgeClasses={badge.classes}
      rating={averageScore}
    />
  );
};

export default MangaCard;
