import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import { stripOLWorkPrefix } from '@app/utils/bookIds';
import defineMessages from '@app/utils/defineMessages';
import type { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AudiobookCard', {
  audiobook: 'Audiobook',
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
  if (hours > 0) return `${hours}h ${minutes}m`;
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
  const bookId = stripOLWorkPrefix(openLibraryId);

  // Subtitle line above the title on hover — author + duration
  // + narrator. The audiobook-specific signals (narrator,
  // runtime) are what makes an audiobook card distinct from a
  // print BookCard at a glance.
  const parts: string[] = [authorName];
  if (durationSeconds) parts.push(formatDuration(durationSeconds));
  if (narratorName) {
    parts.push(intl.formatMessage(messages.narrator, { narrator: narratorName }));
  }
  const subtitle = parts.join(' · ');

  return (
    <MediaTitleCard
      href={`/book/${bookId}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      mediaStatus={mediaStatus}
      typeLabel={intl.formatMessage(messages.audiobook)}
      typeBadgeClasses="border-pink-500 bg-pink-600/80"
    />
  );
};

export default AudiobookCard;
