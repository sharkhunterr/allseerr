import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import { MediaStatus } from '@server/constants/media';
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
  // Library-side counts populated by MangaAvailabilityScanner.
  // When set, the card derives PARTIALLY_AVAILABLE from the
  // ratio rather than trusting the static ``mediaStatus`` alone
  // — same UX TV gets from per-season aggregation.
  availableChapters?: number;
  availableVolumes?: number;
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
  availableChapters,
  availableVolumes,
}: MangaCardProps) => {
  const intl = useIntl();
  const badge = badgeForCountry(countryOfOrigin);

  // Derive PARTIALLY_AVAILABLE when the scanner has reported
  // some-but-not-all chapters/volumes downloaded. Preferring
  // chapters because Suwayomi reports them natively; volumes are
  // approximated from the ratio when AniList exposes a total.
  const derivedStatus = ((): MediaStatus | null | undefined => {
    if (
      typeof availableChapters === 'number' &&
      typeof chapters === 'number' &&
      chapters > 0
    ) {
      if (availableChapters <= 0) {
        // Scanner running but nothing downloaded yet — preserve
        // whatever the DB column says (typically PROCESSING).
        return mediaStatus;
      }
      return availableChapters >= chapters
        ? MediaStatus.AVAILABLE
        : MediaStatus.PARTIALLY_AVAILABLE;
    }
    if (
      typeof availableVolumes === 'number' &&
      typeof volumes === 'number' &&
      volumes > 0 &&
      availableVolumes > 0
    ) {
      return availableVolumes >= volumes
        ? MediaStatus.AVAILABLE
        : MediaStatus.PARTIALLY_AVAILABLE;
    }
    return mediaStatus;
  })();

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
      mediaStatus={derivedStatus}
      typeLabel={badge.label}
      typeBadgeClasses={badge.classes}
      rating={averageScore}
    />
  );
};

export default MangaCard;
