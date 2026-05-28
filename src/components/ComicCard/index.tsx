import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import type { MediaStatus } from '@server/constants/media';
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
  deck,
  mediaStatus,
}: ComicCardProps) => {
  const intl = useIntl();

  // Subtitle line above the title on hover — publisher + issue
  // count so the operator gets the run-length signal at a
  // glance.
  const parts: string[] = [];
  if (publisher) parts.push(publisher);
  if (typeof issueCount === 'number' && issueCount > 0) {
    parts.push(intl.formatMessage(messages.issuesCount, { count: issueCount }));
  }
  const subtitle = parts.length ? parts.join(' · ') : undefined;

  return (
    <MediaTitleCard
      href={`/comic/${comicVineId}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      summary={deck}
      mediaStatus={mediaStatus}
      typeLabel={intl.formatMessage(messages.comic)}
      typeBadgeClasses="border-amber-500 bg-amber-600/80"
    />
  );
};

export default ComicCard;
