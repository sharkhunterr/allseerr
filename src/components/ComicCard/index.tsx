import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
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
  // Library-side count populated by ComicAvailabilityScanner.
  // When set, the card derives PARTIALLY_AVAILABLE from the
  // ratio rather than trusting the static ``mediaStatus`` alone.
  availableIssues?: number;
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
  availableIssues,
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

  const derivedStatus = ((): MediaStatus | null | undefined => {
    if (
      typeof availableIssues === 'number' &&
      typeof issueCount === 'number' &&
      issueCount > 0
    ) {
      if (availableIssues <= 0) {
        return mediaStatus;
      }
      return availableIssues >= issueCount
        ? MediaStatus.AVAILABLE
        : MediaStatus.PARTIALLY_AVAILABLE;
    }
    return mediaStatus;
  })();

  return (
    <MediaTitleCard
      href={`/comic/${comicVineId}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      summary={deck}
      mediaStatus={derivedStatus}
      typeLabel={intl.formatMessage(messages.comic)}
      typeBadgeClasses="border-amber-500 bg-amber-600/80"
    />
  );
};

export default ComicCard;
