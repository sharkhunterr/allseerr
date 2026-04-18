import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { ExclamationTriangleIcon, PlayIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('pages.GameDetail', {
  request: 'Request',
  available: 'Available',
  partiallyAvailable: 'Partially Available',
  playOnRomm: 'Play on ROMM',
  selectPlatform: 'Select platform...',
  requested: 'Requested',
  awaitingAddition: 'Approved — Awaiting Manual Addition',
  manualWorkflow:
    'Games are added manually by the admin. There is no automatic download.',
  requestSuccess: 'Game requested successfully!',
  requestFailed: 'Failed to request game.',
  requestDuplicate: 'This game has already been requested for this platform.',
  notFound: 'Game not found.',
  overview: 'Overview',
  overviewunavailable: 'Overview unavailable.',
  platforms: 'Platforms',
  developer: 'Developer',
  publisher: 'Publisher',
  genre: 'Genre',
  rating: 'Rating',
});

interface Platform {
  id: number;
  name: string;
  abbreviation?: string;
  mediaStatus?: MediaStatus | null;
  gameMediaId?: number | null;
  rommUrl?: string | null;
}

const PlayOnRommAction = ({
  platforms,
  intl,
}: {
  platforms: Platform[];
  intl: ReturnType<typeof useIntl>;
}) => {
  const [selected, setSelected] = useState<number>(platforms[0]?.id ?? 0);

  if (platforms.length === 0) return null;

  const current =
    platforms.find((p) => p.id === selected) ?? platforms[0];

  if (platforms.length === 1) {
    return (
      <a
        href={current.rommUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Button buttonType="primary">
          <PlayIcon />
          <span>{intl.formatMessage(messages.playOnRomm)}</span>
        </Button>
      </a>
    );
  }

  return (
    <div className="flex items-stretch">
      <select
        className="rounded-l-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
        value={selected}
        onChange={(e) => setSelected(Number(e.target.value))}
      >
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.abbreviation || p.name}
          </option>
        ))}
      </select>
      <a
        href={current.rommUrl ?? '#'}
        target="_blank"
        rel="noopener noreferrer"
        className="flex"
      >
        <Button buttonType="primary" className="rounded-l-none">
          <PlayIcon />
          <span>{intl.formatMessage(messages.playOnRomm)}</span>
        </Button>
      </a>
    </div>
  );
};

interface GameDetailData {
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

const PlatformRequestButton = ({
  platform,
  game,
  onRequested,
}: {
  platform: Platform;
  game: GameDetailData;
  onRequested?: () => void;
}) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isRequesting, setIsRequesting] = useState(false);
  const [localOverride, setLocalOverride] = useState<MediaStatus | null>(null);

  const effectiveStatus = localOverride ?? platform.mediaStatus ?? null;
  const isAvailable = effectiveStatus === MediaStatus.AVAILABLE;
  const isRequested =
    effectiveStatus !== null &&
    effectiveStatus !== undefined &&
    effectiveStatus !== MediaStatus.UNKNOWN;

  const handleRequest = async () => {
    setIsRequesting(true);
    try {
      await axios.post('/api/v1/game/request', {
        igdbId: game.igdbId,
        platformIgdbId: platform.id,
        platformName: platform.name,
        title: game.title,
        releaseYear: game.releaseYear,
        developer: game.developer,
        publisher: game.publisher,
        genre: game.genre,
        coverUrl: game.coverUrl,
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      setLocalOverride(MediaStatus.PENDING);
      onRequested?.();
    } catch (e) {
      const msg =
        (e as { response?: { status?: number } }).response?.status === 409
          ? messages.requestDuplicate
          : messages.requestFailed;
      addToast(intl.formatMessage(msg), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsRequesting(false);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-200">
          {platform.name}
        </span>
        {isAvailable && (
          <span className="rounded-full bg-green-500 px-2 py-0.5 text-xs font-bold text-white">
            {intl.formatMessage(messages.available)}
          </span>
        )}
        {isRequested && !isAvailable && (
          <span className="rounded-full bg-yellow-500 px-2 py-0.5 text-xs font-bold text-white">
            {intl.formatMessage(messages.requested)}
          </span>
        )}
      </div>
      {isAvailable && platform.rommUrl ? (
        <a href={platform.rommUrl} target="_blank" rel="noopener noreferrer">
          <Button buttonType="primary" buttonSize="sm">
            <PlayIcon className="h-4 w-4" />
            <span>{intl.formatMessage(messages.playOnRomm)}</span>
          </Button>
        </a>
      ) : isAvailable || isRequested ? null : (
        <Button
          buttonType="primary"
          buttonSize="sm"
          disabled={isRequesting}
          onClick={handleRequest}
        >
          {isRequesting ? (
            <Spinner />
          ) : (
            intl.formatMessage(messages.request)
          )}
        </Button>
      )}
    </div>
  );
};

const GameDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { gameId } = router.query;

  const {
    data: game,
    error,
    mutate: revalidate,
  } = useSWR<GameDetailData>(gameId ? `/api/v1/game/${gameId}` : null);

  if (!game && !error) {
    return <LoadingSpinner />;
  }

  if (error || !game) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  const gameAttributes: React.ReactNode[] = [];
  if (game.releaseYear) {
    gameAttributes.push(<span>{game.releaseYear}</span>);
  }
  if (game.genre) {
    gameAttributes.push(<span>{game.genre}</span>);
  }

  const availablePlatforms = game.platforms.filter(
    (p) => p.mediaStatus === MediaStatus.AVAILABLE && p.rommUrl
  );
  const hasAnyAvailable = availablePlatforms.length > 0;
  const isFullyAvailable =
    game.platforms.length > 0 &&
    availablePlatforms.length === game.platforms.length;

  return (
    <div className="media-page" style={{ height: 493 }}>
      <PageTitle title={game.title} />
      <div className="media-header">
        <div className="media-poster">
          {game.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.coverUrl}
              alt={game.title}
              style={{ width: '100%', height: 'auto' }}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-700 text-5xl">
              🎮
            </div>
          )}
        </div>
        <div className="media-title">
          <div className="media-status">
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
              Game
            </span>
            {hasAnyAvailable && (
              <span className="rounded-full bg-green-500 px-3 py-1 text-xs font-bold text-white">
                {intl.formatMessage(
                  isFullyAvailable
                    ? messages.available
                    : messages.partiallyAvailable
                )}
              </span>
            )}
          </div>
          <h1 data-testid="media-title">
            {game.title}{' '}
            {game.releaseYear && (
              <span className="media-year">({game.releaseYear})</span>
            )}
          </h1>
          {gameAttributes.length > 0 && (
            <span className="media-attributes">
              {gameAttributes
                .map((t, k) => <span key={k}>{t}</span>)
                .reduce((prev, curr) => (
                  <>
                    {prev}
                    <span>|</span>
                    {curr}
                  </>
                ))}
            </span>
          )}
        </div>
        <div className="media-actions">
          {hasAnyAvailable && (
            <PlayOnRommAction platforms={availablePlatforms} intl={intl} />
          )}
        </div>
      </div>
      <div className="media-overview">
        <div className="media-overview-left">
          <h2>{intl.formatMessage(messages.overview)}</h2>
          <p>
            {game.summary || intl.formatMessage(messages.overviewunavailable)}
          </p>

          {/* Manual workflow warning */}
          <div className="mt-6 flex items-start gap-2 rounded-lg bg-amber-900/30 p-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
            <p className="text-sm text-amber-200">
              {intl.formatMessage(messages.manualWorkflow)}
            </p>
          </div>

          {/* Platform list with request buttons */}
          {game.platforms.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-3 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.platforms)}
              </h3>
              <div className="flex flex-col gap-2">
                {game.platforms.map((platform) => (
                  <PlatformRequestButton
                    key={platform.id}
                    platform={platform}
                    game={game}
                    onRequested={revalidate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="media-overview-right">
          <div className="media-facts">
            {game.userRating && (
              <div className="media-ratings">
                <span className="media-rating">
                  <span className="rounded bg-yellow-500/90 px-1.5 py-0.5 text-xs font-bold text-black">
                    IGDB
                  </span>
                  <span>{Math.round(game.userRating)}%</span>
                </span>
              </div>
            )}
            {game.developer && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.developer)}</span>
                <span className="media-fact-value">{game.developer}</span>
              </div>
            )}
            {game.publisher && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.publisher)}</span>
                <span className="media-fact-value">{game.publisher}</span>
              </div>
            )}
            {game.genre && (
              <div className="media-fact">
                <span>{intl.formatMessage(messages.genre)}</span>
                <span className="media-fact-value">{game.genre}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="extra-bottom-space relative" />
    </div>
  );
};

export default GameDetailPage;
