import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.BookCard', {
  available: 'Available',
  requested: 'Requested',
  request: 'Request',
});

interface BookCardProps {
  openLibraryId: string;
  title: string;
  authorName: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  seriesName?: string;
  seriesPosition?: number;
  mediaStatus?: MediaStatus | null;
}

const BookCard = ({
  openLibraryId,
  title,
  authorName,
  coverUrl,
  year,
  publisher,
  seriesName,
  seriesPosition,
  mediaStatus,
}: BookCardProps) => {
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
              <BookOpenIcon className="h-12 w-12 text-gray-500" />
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
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {title}
          </h3>
          <p className="truncate text-xs text-gray-400">{authorName}</p>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {year && <span>{year}</span>}
            {publisher && (
              <>
                <span>&middot;</span>
                <span className="truncate">{publisher}</span>
              </>
            )}
          </div>
          {seriesName && (
            <p className="mt-1 truncate text-xs text-indigo-400">
              {seriesName}
              {seriesPosition ? ` #${seriesPosition}` : ''}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
};

export default BookCard;
