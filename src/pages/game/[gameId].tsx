import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import defineMessages from '@app/utils/defineMessages';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('pages.GameDetail', {
  request: 'Request Game',
  available: 'Available in ROMM',
  requested: 'Already Requested',
  awaitingAddition: 'Approved — Awaiting Manual Addition',
  manualWorkflow:
    'Games are added manually by the admin. There is no automatic download.',
  selectPlatform: 'Select Platform',
  requestSuccess: 'Game requested successfully!',
  requestFailed: 'Failed to request game.',
  requestDuplicate: 'This game has already been requested for this platform.',
  notFound: 'Game not found.',
  noteLabel: 'Optional note (region, dump type, etc.)',
  platforms: 'Platforms',
  developer: 'Developer',
  publisher: 'Publisher',
  genre: 'Genre',
  rating: 'Rating',
});

interface GameDetailData {
  igdbId: number;
  title: string;
  platforms: {
    id: number;
    name: string;
    abbreviation?: string;
    mediaStatus?: MediaStatus | null;
    gameMediaId?: number | null;
  }[];
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  userRating?: number;
  coverUrl?: string;
  summary?: string;
}

interface GameSearchResponse {
  results: GameDetailData[];
  totalResults: number;
}

const GameDetailPage: NextPage = () => {
  const router = useRouter();
  const intl = useIntl();
  const { addToast } = useToasts();
  const { gameId } = router.query;

  const [selectedPlatform, setSelectedPlatform] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [isRequesting, setIsRequesting] = useState(false);

  // Fetch game details by searching IGDB for this specific game
  const { data: searchData, error } = useSWR<GameSearchResponse>(
    gameId ? `/api/v1/game/search?query=${gameId}&limit=1` : null
  );

  const game = searchData?.results?.[0];

  if (error) {
    return (
      <div className="mt-16 text-center text-gray-400">
        {intl.formatMessage(messages.notFound)}
      </div>
    );
  }

  if (!game) {
    return <LoadingSpinner />;
  }

  const selectedPlatformData = game.platforms.find(
    (p) => p.id === selectedPlatform
  );
  const isAvailable =
    selectedPlatformData?.mediaStatus === MediaStatus.AVAILABLE;
  const isRequested =
    selectedPlatformData?.mediaStatus !== null &&
    selectedPlatformData?.mediaStatus !== undefined &&
    selectedPlatformData?.mediaStatus !== MediaStatus.UNKNOWN;

  const handleRequest = async () => {
    if (!selectedPlatform) return;
    const platform = game.platforms.find((p) => p.id === selectedPlatform);
    if (!platform) return;

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
        note: note || undefined,
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
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
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PageTitle title={game.title} />
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Cover art */}
        <div className="w-full flex-shrink-0 md:w-72">
          {game.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={game.coverUrl}
              alt={game.title}
              className="w-full rounded-lg shadow-lg"
            />
          ) : (
            <div className="flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-gray-700 text-5xl">
              🎮
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-white">{game.title}</h1>

          {/* Metadata grid */}
          <div className="mt-4 grid grid-cols-2 gap-3">
            {game.releaseYear && (
              <div>
                <span className="text-xs text-gray-500">Year</span>
                <p className="text-sm text-gray-200">{game.releaseYear}</p>
              </div>
            )}
            {game.developer && (
              <div>
                <span className="text-xs text-gray-500">
                  {intl.formatMessage(messages.developer)}
                </span>
                <p className="text-sm text-gray-200">{game.developer}</p>
              </div>
            )}
            {game.publisher && (
              <div>
                <span className="text-xs text-gray-500">
                  {intl.formatMessage(messages.publisher)}
                </span>
                <p className="text-sm text-gray-200">{game.publisher}</p>
              </div>
            )}
            {game.genre && (
              <div>
                <span className="text-xs text-gray-500">
                  {intl.formatMessage(messages.genre)}
                </span>
                <p className="text-sm text-gray-200">{game.genre}</p>
              </div>
            )}
            {game.userRating && (
              <div>
                <span className="text-xs text-gray-500">
                  {intl.formatMessage(messages.rating)}
                </span>
                <p className="text-sm text-yellow-400">
                  {Math.round(game.userRating)}%
                </p>
              </div>
            )}
          </div>

          {/* Summary */}
          {game.summary && (
            <p className="mt-4 leading-relaxed text-gray-300">{game.summary}</p>
          )}

          {/* Manual workflow warning */}
          <div className="mt-6 flex items-start gap-2 rounded-lg bg-amber-900/30 p-3">
            <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
            <p className="text-sm text-amber-200">
              {intl.formatMessage(messages.manualWorkflow)}
            </p>
          </div>

          {/* Platform selector */}
          <div className="mt-6">
            <label className="mb-2 block text-sm font-medium text-gray-300">
              {intl.formatMessage(messages.selectPlatform)}
            </label>
            <div className="flex flex-wrap gap-2">
              {game.platforms.map((platform) => {
                const isPlAvailable =
                  platform.mediaStatus === MediaStatus.AVAILABLE;
                const isPlRequested =
                  platform.mediaStatus !== null &&
                  platform.mediaStatus !== undefined &&
                  platform.mediaStatus !== MediaStatus.UNKNOWN;

                return (
                  <button
                    key={platform.id}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      selectedPlatform === platform.id
                        ? 'border-indigo-500 bg-indigo-600/30 text-white'
                        : isPlAvailable
                          ? 'border-green-600 bg-green-600/20 text-green-300'
                          : isPlRequested
                            ? 'border-yellow-600 bg-yellow-600/20 text-yellow-300'
                            : 'border-gray-600 bg-gray-700 text-gray-300 hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedPlatform(platform.id)}
                  >
                    {platform.abbreviation || platform.name}
                    {isPlAvailable && ' ✓'}
                    {isPlRequested && !isPlAvailable && ' ⏳'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Note input */}
          {selectedPlatform && !isAvailable && !isRequested && (
            <div className="mt-4">
              <label className="mb-1 block text-sm text-gray-400">
                {intl.formatMessage(messages.noteLabel)}
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500"
                placeholder="PAL region, No-Intro verified..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="mt-6 flex gap-3">
            {selectedPlatform ? (
              isAvailable ? (
                <span className="rounded bg-green-600 px-4 py-2 font-bold text-white">
                  {intl.formatMessage(messages.available)}
                </span>
              ) : isRequested ? (
                <span className="rounded bg-yellow-600 px-4 py-2 font-bold text-white">
                  {intl.formatMessage(messages.requested)}
                </span>
              ) : (
                <Button
                  buttonType="primary"
                  disabled={isRequesting}
                  onClick={handleRequest}
                >
                  {isRequesting ? (
                    <LoadingSpinner />
                  ) : (
                    intl.formatMessage(messages.request)
                  )}
                </Button>
              )
            ) : (
              <p className="text-sm text-gray-500">
                {intl.formatMessage(messages.selectPlatform)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameDetailPage;
