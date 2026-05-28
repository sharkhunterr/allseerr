import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import { stripOLWorkPrefix } from '@app/utils/bookIds';
import defineMessages from '@app/utils/defineMessages';
import type { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.BookCard', {
  book: 'Book',
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
  const bookId = stripOLWorkPrefix(openLibraryId);

  // Subtitle line above the title on hover — author + series
  // info when present. The author is the most operator-relevant
  // disambiguator for books with common titles.
  const subtitleParts: string[] = [authorName];
  if (seriesName) {
    subtitleParts.push(
      seriesPosition ? `${seriesName} #${seriesPosition}` : seriesName
    );
  }
  if (publisher) subtitleParts.push(publisher);
  const subtitle = subtitleParts.join(' · ');

  return (
    <MediaTitleCard
      href={`/book/${bookId}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      mediaStatus={mediaStatus}
      typeLabel={intl.formatMessage(messages.book)}
      typeBadgeClasses="border-orange-500 bg-orange-600/80"
    />
  );
};

export default BookCard;
