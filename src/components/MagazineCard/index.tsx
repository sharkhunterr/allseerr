import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MagazineCard', {
  magazine: 'Magazine',
  issuesCount: '{count, plural, one {# issue} other {# issues}}',
});

interface MagazineCardProps {
  // Cascade-shaped magazine key. Shape varies by source:
  //   * ``issn:NNNN-NNNN`` — cascade ISSN hit (ZDB / Wikidata / BnF)
  //   * ``wd:Q123`` — Wikidata-only hit (no ISSN known)
  //   * ``pressarr:<provider_id>`` — pressarr's local catalogue
  //   * ``<google-books-volume-id>`` — legacy Google Books fallback
  // The /magazine/{id} route handler dispatches by prefix.
  id: string;
  title: string;
  coverUrl?: string;
  year?: number;
  publisher?: string;
  issn?: string;
  description?: string;
  language?: string;
  country?: string;
  categories?: string[];
  issueCount?: number;
  // Live count populated by pressarr availability scanning
  // (commit 4+). Drives PARTIALLY_AVAILABLE when 0 < available
  // < total — same logic ComicCard uses.
  availableIssues?: number;
  mediaStatus?: MediaStatus | null;
}

const MagazineCard = ({
  id,
  title,
  coverUrl,
  year,
  publisher,
  issn,
  description,
  language,
  country,
  categories: _categories,
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
  if (country && /^[A-Z]{2}$/i.test(country)) {
    parts.push(
      country
        .toUpperCase()
        .split('')
        .map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
        .join('')
    );
  }
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
      href={`/magazine/${encodeURIComponent(id)}`}
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
