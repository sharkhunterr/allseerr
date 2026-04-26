import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import defineMessages from '@app/utils/defineMessages';
import { BookOpenIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import Link from 'next/link';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MangaCard', {
  manga: 'Manga',
  manhwa: 'Manhwa',
  manhua: 'Manhua',
  chaptersCount: '{count} ch',
  volumesCount: '{count} vol',
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
  // Indigo for manga (matches the satellite colour in the new
  // brand icon), purple for manhwa, teal for manhua so the three
  // origin sources read distinctly on the grid.
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
        classes: 'border-indigo-500 bg-indigo-600/80',
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
  // Keep the "manga" / "manhwa" / "manhua" label localisable even
  // though the underlying labels are hard-coded English in the
  // genre vocabulary.
  void intl;

  return (
    <Link href={`/manga/${anilistId}`}>
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

          <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-2">
            <div
              className={`pointer-events-none z-40 self-start rounded-full border shadow-md ${badge.classes}`}
            >
              <div className="flex h-4 items-center px-2 py-2 text-center text-xs font-medium uppercase tracking-wider text-white sm:h-5">
                {badge.label}
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

          {typeof averageScore === 'number' && averageScore > 0 && (
            <div className="absolute bottom-2 right-2 z-40 rounded-full bg-black/70 px-2 py-0.5 text-xs font-bold text-yellow-300">
              {averageScore}%
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-3">
          <h3 className="truncate text-sm font-semibold text-white">
            {title}
          </h3>
          <div className="mt-1 flex items-center gap-1 text-xs text-gray-500">
            {year && <span>{year}</span>}
            {typeof chapters === 'number' && chapters > 0 && (
              <>
                <span>·</span>
                <span>
                  {intl.formatMessage(messages.chaptersCount, {
                    count: chapters,
                  })}
                </span>
              </>
            )}
            {typeof volumes === 'number' && volumes > 0 && (
              <>
                <span>·</span>
                <span>
                  {intl.formatMessage(messages.volumesCount, {
                    count: volumes,
                  })}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
};

export default MangaCard;
