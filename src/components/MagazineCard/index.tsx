import MediaTitleCard from '@app/components/Common/MediaTitleCard';
import defineMessages from '@app/utils/defineMessages';
import { MediaStatus } from '@server/constants/media';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MagazineCard', {
  magazine: 'Magazine',
  issuesCount: '{count, plural, one {# issue} other {# issues}}',
  ongoing: 'Ongoing',
  ceasedYear: 'Ceased {year}',
  ceased: 'Ceased',
  freqDaily: 'Daily',
  freqWeekly: 'Weekly',
  freqMonthly: 'Monthly',
  freqQuarterly: 'Quarterly',
  freqAnnual: 'Annual',
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
  // Cascade enrichment fields surfaced as on-card pills so the
  // operator can scan a row of magazine results without opening
  // each detail page.
  frequency?: string;
  firstIssued?: string;
  ceasedAt?: string;
  coverIsLogo?: boolean;
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
  frequency,
  firstIssued,
  ceasedAt,
  coverIsLogo,
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

  // Publication status + frequency badges stacked under the
  // type badge. Status colour signals at-a-glance whether the
  // magazine is still being published.
  const extraBadges: { label: string; classes: string }[] = [];
  if (ceasedAt) {
    const yearStr = ceasedAt.slice(0, 4);
    extraBadges.push({
      label: /^\d{4}$/.test(yearStr)
        ? intl.formatMessage(messages.ceasedYear, { year: yearStr })
        : intl.formatMessage(messages.ceased),
      classes: 'border-rose-500 bg-rose-600/80',
    });
  } else if (firstIssued || issn) {
    extraBadges.push({
      label: intl.formatMessage(messages.ongoing),
      classes: 'border-emerald-500 bg-emerald-600/80',
    });
  }
  if (frequency) {
    // Map known canonical frequency strings to localised pills
    // and keep anything else verbatim (Wikidata can return rare
    // values like "bimonthly" that we don't pre-translate).
    const freqLabel = ((): string => {
      switch (frequency.toLowerCase()) {
        case 'daily':
          return intl.formatMessage(messages.freqDaily);
        case 'weekly':
          return intl.formatMessage(messages.freqWeekly);
        case 'monthly':
          return intl.formatMessage(messages.freqMonthly);
        case 'quarterly':
          return intl.formatMessage(messages.freqQuarterly);
        case 'annual':
          return intl.formatMessage(messages.freqAnnual);
        default:
          return frequency;
      }
    })();
    extraBadges.push({
      label: freqLabel,
      classes: 'border-sky-500 bg-sky-600/80',
    });
  }

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
      extraBadges={extraBadges}
      coverIsLogo={coverIsLogo}
    />
  );
};

export default MagazineCard;
