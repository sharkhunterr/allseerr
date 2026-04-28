import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.ComicCard', {
  comic: 'Comic',
  issuesCount: '{count, plural, one {# issue} other {# issues}}',
});

interface ComicCardProps {
  comicVineId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  issueCount?: number;
  publisher?: string;
  deck?: string;
  mediaStatus?: MediaStatus | null;
}

const ComicCard = ({
  comicVineId,
  title,
  coverUrl,
  year,
  issueCount,
  publisher,
  mediaStatus,
}: ComicCardProps) => {
  const intl = useIntl();

  return (
    <Link href={`/comic/${comicVineId}`}>
      <div className="group relative flex cursor-pointer flex-col overflow-hidden rounded-lg bg-gray-800 shadow-md ring-1 ring-gray-700 transition duration-200 hover:ring-amber-500">
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

          <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2">
            <div className="pointer-events-none z-40 self-start rounded-full border border-amber-500 bg-amber-600/80 shadow-md">
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {intl.formatMessage(messages.comic)}
              </div>
            </div>
            {mediaStatus !== null &&
              mediaStatus !== undefined &&
              mediaStatus !== MediaStatus.UNKNOWN && (
                <div className="pointer-events-none z-40 flex">
                  <StatusBadgeMini status={mediaStatus} shrink />
                </div>
              )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {year && <span>{year}</span>}
            {typeof issueCount === 'number' && issueCount > 0 && (
              <>
                <span>·</span>
                <span>
                  {intl.formatMessage(messages.issuesCount, {
                    count: issueCount,
                  })}
                </span>
              </>
            )}
          </div>
          {publisher && (
            <p className="mt-1 truncate text-xs text-gray-400">{publisher}</p>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ComicCard;
