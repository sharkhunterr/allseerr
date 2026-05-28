import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.GameCard', {
  game: 'Game',
});

interface Platform {
  id: number;
  name: string;
  abbreviation?: string;
  mediaStatus?: MediaStatus | null;
  gameMediaId?: number | null;
}

interface GameCardProps {
  igdbId: number;
  title: string;
  platforms: Platform[];
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  userRating?: number;
  coverUrl?: string;
  summary?: string;
}

const GameCard = ({
  igdbId,
  title,
  platforms,
  releaseYear,
  developer,
  userRating,
  coverUrl,
  summary,
}: GameCardProps) => {
  const intl = useIntl();

  // Aggregate the per-platform status into one card-level signal.
  // ALL platforms available → AVAILABLE; some → PARTIALLY_AVAILABLE;
  // none available but at least one PROCESSING/PENDING → that.
  const availableCount = platforms.filter(
    (p) => p.mediaStatus === MediaStatus.AVAILABLE
  ).length;
  const nonAvailablePendingStatus = platforms
    .map((p) => p.mediaStatus)
    .filter(
      (s): s is MediaStatus =>
        s !== null &&
        s !== undefined &&
        s !== MediaStatus.UNKNOWN &&
        s !== MediaStatus.AVAILABLE
    )
    .sort((a, b) => b - a)[0];
  const aggregateStatus: MediaStatus | undefined =
    availableCount > 0
      ? availableCount === platforms.length
        ? MediaStatus.AVAILABLE
        : MediaStatus.PARTIALLY_AVAILABLE
      : nonAvailablePendingStatus;

  // Subtitle line above the title on hover — first 4 platform
  // abbreviations (Switch · PS5 · Xbox · PC) so the operator
  // knows which systems the title runs on without opening the
  // detail page.
  const platformSubtitle = platforms.length
    ? `${platforms
        .map((p) => p.abbreviation || p.name)
        .slice(0, 4)
        .join(' · ')}${platforms.length > 4 ? ` +${platforms.length - 4}` : ''}`
    : developer;

  return (
    <MediaTitleCard
      href={`/game/${igdbId}`}
      coverUrl={coverUrl}
      title={title}
      year={releaseYear}
      subtitle={platformSubtitle}
      summary={summary}
      mediaStatus={aggregateStatus}
      typeLabel={intl.formatMessage(messages.game)}
      typeBadgeClasses="border-teal-500 bg-teal-600/80"
      rating={userRating}
    />
  );
};

export default GameCard;
