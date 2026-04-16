import defineMessages from '@app/utils/defineMessages';
import { MusicalNoteIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AudiobookCard', {
  available: 'Available',
  requested: 'Requested',
  narrator: 'Narrated by {narrator}',
});

interface AudiobookCardProps {
  openLibraryId: string;
  title: string;
  authorName: string;
  narratorName?: string;
  durationSeconds?: number;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  mediaStatus?: MediaStatus | null;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

const AudiobookCard = ({
  openLibraryId,
  title,
  authorName,
  narratorName,
  durationSeconds,
  coverUrl,
  year,
  mediaStatus,
}: AudiobookCardProps) => {
  const intl = useIntl();
  const bookId = openLibraryId.replace('/works/', '');

  return (
    <Link href={`/book/${bookId}`}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-indigo-500">
        <div className="relative aspect-[2/3] w-full overflow-hidden bg-gray-700">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={title}
              className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <MusicalNoteIcon className="h-12 w-12 text-gray-500" />
            </div>
          )}

          {mediaStatus !== null && mediaStatus !== undefined && (
            <div className="absolute left-2 top-2">
              <span
                className={`rounded px-2 py-1 text-xs font-bold ${
                  mediaStatus === MediaStatus.AVAILABLE
                    ? 'bg-green-600 text-white'
                    : 'bg-yellow-600 text-white'
                }`}
              >
                {mediaStatus === MediaStatus.AVAILABLE
                  ? intl.formatMessage(messages.available)
                  : intl.formatMessage(messages.requested)}
              </span>
            </div>
          )}

          <div className="absolute bottom-2 right-2">
            <span className="rounded bg-purple-600 px-2 py-0.5 text-xs font-bold text-white">
              Audiobook
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <p className="truncate text-xs text-gray-400">{authorName}</p>
          {narratorName && (
            <p className="truncate text-xs text-indigo-400">
              {intl.formatMessage(messages.narrator, {
                narrator: narratorName,
              })}
            </p>
          )}
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {durationSeconds && <span>{formatDuration(durationSeconds)}</span>}
            {year && (
              <>
                {durationSeconds && <span>&middot;</span>}
                <span>{year}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default AudiobookCard;
