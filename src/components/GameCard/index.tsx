import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.GameCard', {
  available: 'Available',
  requested: 'Requested',
  awaitingAddition: 'Awaiting Addition',
  manualNote: 'Manual addition required',
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

  const hasAvailable = platforms.some(
    (p) => p.mediaStatus === MediaStatus.AVAILABLE
  );
  const hasRequested = platforms.some(
    (p) =>
      p.mediaStatus !== null &&
      p.mediaStatus !== undefined &&
      p.mediaStatus !== MediaStatus.UNKNOWN &&
      p.mediaStatus !== MediaStatus.AVAILABLE
  );

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

          {(hasAvailable || hasRequested) && (
            <div className="absolute left-2 top-2">
              <span
                className={`rounded px-2 py-1 text-xs font-bold ${
                  hasAvailable
                    ? 'bg-green-600 text-white'
                    : 'bg-yellow-600 text-white'
                }`}
              >
                {hasAvailable
                  ? intl.formatMessage(messages.available)
                  : intl.formatMessage(messages.requested)}
              </span>
            </div>
          )}

          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
              Game
            </span>
          </div>

          {userRating && (
            <div className="absolute right-2 top-2">
              <span className="rounded bg-yellow-500/90 px-1.5 py-0.5 text-xs font-bold text-black">
                {Math.round(userRating)}%
              </span>
            </div>
          )}
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
