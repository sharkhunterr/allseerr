import RatingBadge from '@app/components/Common/RatingBadge';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
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
  genre,
  userRating,
  coverUrl,
}: GameCardProps) => {
  const intl = useIntl();

  const availableCount = platforms.filter(
    (p) => p.mediaStatus === MediaStatus.AVAILABLE
  ).length;
  // Find the best status among the non-available platforms so we show
  // the right badge (PROCESSING = indigo clock, PENDING = yellow bell).
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

  return (
    <Link href={`/game/${igdbId}`}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
        <div className="relative aspect-[3/4] w-full overflow-hidden bg-gray-700">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={title}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-2xl text-gray-500">
              🎮
            </div>
          )}

          <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2">
            <div className="pointer-events-none z-40 self-start rounded-full border border-teal-500 bg-teal-600/80 shadow-md">
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(messages.game)}
              </div>
            </div>
            {aggregateStatus !== undefined && (
              <div className="pointer-events-none z-40 flex">
                <StatusBadgeMini status={aggregateStatus} shrink />
              </div>
            )}
          </div>

          <RatingBadge score={userRating} />
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {title}
          </h3>
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {platforms
              .map((p) => p.abbreviation || p.name)
              .slice(0, 4)
              .join(' · ')}
            {platforms.length > 4 && ` +${platforms.length - 4}`}
          </p>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {releaseYear && <span>{releaseYear}</span>}
            {developer && (
              <>
                {releaseYear && <span>&middot;</span>}
                <span className="truncate">{developer}</span>
              </>
            )}
          </div>
          {genre && (
            <p className="mt-1 truncate text-xs text-indigo-400">{genre}</p>
          )}
        </div>
      </div>
    </Link>
  );
};

export default GameCard;
