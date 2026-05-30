import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MagazineCard', {
  magazine: 'Magazine',
  issuesCount: '{count, plural, one {# issue} other {# issues}}',
});

interface MagazineCardProps {
  // Google Books volume id (or pressarr metadata provider id —
  // both flavours flow through the same /magazine/{id} route).
  googleBooksId: string;
  title: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  issn?: string;
  description?: string;
  language?: string;
  issueCount?: number;
  // Live count populated by pressarr availability scanning
  // (commit 4+). Drives PARTIALLY_AVAILABLE when 0 < available
  // < total — same logic ComicCard uses.
  availableIssues?: number;
  mediaStatus?: MediaStatus | null;
}

const MagazineCard = ({
  googleBooksId,
  title,
  coverUrl,
  year,
  publisher,
  issn,
  description,
  language,
  issueCount,
  availableIssues,
  mediaStatus,
}: MagazineCardProps) => {
  const intl = useIntl();

  // Subtitle above the title on hover — publisher first, then
  // ISSN when present, then language / year fallback. Operators
  // browsing a wall of magazines need the publisher prominently
  // because it's how they identify edition variants ("Le Monde"
  // vs "Le Monde Diplomatique" etc.).
  const parts: string[] = [];
  if (publisher) parts.push(publisher);
  if (issn) parts.push(`ISSN ${issn}`);
  else if (language) parts.push(language.toUpperCase());
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
      if (availableIssues <= 0) return mediaStatus;
      return availableIssues >= issueCount
        ? MediaStatus.AVAILABLE
        : MediaStatus.PARTIALLY_AVAILABLE;
    }
    return mediaStatus;
  })();

  return (
    <MediaTitleCard
      href={`/magazine/${encodeURIComponent(googleBooksId)}`}
      coverUrl={coverUrl}
      title={title}
      year={year}
      subtitle={subtitle}
      summary={description}
      mediaStatus={derivedStatus}
      typeLabel={intl.formatMessage(messages.magazine)}
      // Indigo to differentiate magazines visually from the
      // amber Comics and orange Books tiles in mixed rows.
      typeBadgeClasses="border-indigo-500 bg-indigo-600/80"
    />
  );
};

export default MagazineCard;
