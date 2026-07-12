/**
 * Filter slideover for the global /search page's Magazines tab.
 *
 * Mirrors the visual pattern of the Discover filter slideovers
 * (``BooksFilterSlideover`` et al.) but drives local component
 * state instead of URL query params — the global search keeps
 * filter state in-memory because the URL already carries the
 * query string itself.
 */

import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Search.MagazineFilters', {
  filters: 'Filters',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
  status: 'Publication status',
  statusOngoing: 'Ongoing only',
  statusAll: 'All (include ceased)',
  coverage: 'Coverage',
  coverageVerified: 'Verified only (Wikidata-anchored)',
  coverageAll: 'All catalogues (include single-source records)',
  formats: 'Formats',
  formatsMulti: 'Multi-ISSN only (excludes one-shots)',
  formatsAny: 'All entries',
  clearfilters: 'Reset to defaults',
});

export interface MagazineFilterValues {
  statusOngoing: boolean;
  verifiedOnly: boolean;
  multiIssnOnly: boolean;
}

export const MAGAZINE_FILTER_DEFAULTS: MagazineFilterValues = {
  statusOngoing: true,
  verifiedOnly: true,
  multiIssnOnly: true,
};

export const countMagazineActiveFilters = (
  v: MagazineFilterValues
): number => {
  // We count anything that diverges from the noise-suppressed
  // defaults as "active" — same intent the discover counters
  // use (every filter that's been touched contributes 1).
  let n = 0;
  if (v.statusOngoing !== MAGAZINE_FILTER_DEFAULTS.statusOngoing) n += 1;
  if (v.verifiedOnly !== MAGAZINE_FILTER_DEFAULTS.verifiedOnly) n += 1;
  if (v.multiIssnOnly !== MAGAZINE_FILTER_DEFAULTS.multiIssnOnly) n += 1;
  return n;
};

interface MagazineSearchFilterSlideoverProps {
  show: boolean;
  onClose: () => void;
  currentFilters: MagazineFilterValues;
  onChange: (next: MagazineFilterValues) => void;
}

/**
 * Two-option row used for every filter dimension — visually
 * mirrors the radio-style choice the discover slideovers use
 * for genre + year. Keeps the slideover scannable when several
 * dimensions live side by side.
 */
const RadioPair = ({
  label,
  primary,
  primaryLabel,
  secondary,
  secondaryLabel,
  selected,
  onSelect,
}: {
  label: string;
  primary: boolean;
  primaryLabel: string;
  secondary: boolean;
  secondaryLabel: string;
  selected: boolean;
  onSelect: (next: boolean) => void;
}) => {
  void primary;
  void secondary;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-lg font-semibold">{label}</span>
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            className="h-4 w-4 text-indigo-500"
            checked={selected}
            onChange={() => onSelect(true)}
          />
          <span>{primaryLabel}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="radio"
            className="h-4 w-4 text-indigo-500"
            checked={!selected}
            onChange={() => onSelect(false)}
          />
          <span>{secondaryLabel}</span>
        </label>
      </div>
    </div>
  );
};

const MagazineSearchFilterSlideover = ({
  show,
  onClose,
  currentFilters,
  onChange,
}: MagazineSearchFilterSlideoverProps) => {
  const intl = useIntl();

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countMagazineActiveFilters(currentFilters),
      })}
      onClose={onClose}
    >
      <div className="flex flex-col space-y-6">
        <RadioPair
          label={intl.formatMessage(messages.status)}
          primary
          primaryLabel={intl.formatMessage(messages.statusOngoing)}
          secondary={false}
          secondaryLabel={intl.formatMessage(messages.statusAll)}
          selected={currentFilters.statusOngoing}
          onSelect={(next) =>
            onChange({ ...currentFilters, statusOngoing: next })
          }
        />
        <RadioPair
          label={intl.formatMessage(messages.coverage)}
          primary
          primaryLabel={intl.formatMessage(messages.coverageVerified)}
          secondary={false}
          secondaryLabel={intl.formatMessage(messages.coverageAll)}
          selected={currentFilters.verifiedOnly}
          onSelect={(next) =>
            onChange({ ...currentFilters, verifiedOnly: next })
          }
        />
        <RadioPair
          label={intl.formatMessage(messages.formats)}
          primary
          primaryLabel={intl.formatMessage(messages.formatsMulti)}
          secondary={false}
          secondaryLabel={intl.formatMessage(messages.formatsAny)}
          selected={currentFilters.multiIssnOnly}
          onSelect={(next) =>
            onChange({ ...currentFilters, multiIssnOnly: next })
          }
        />
        <Button
          className="mt-2"
          buttonType="default"
          onClick={() => onChange(MAGAZINE_FILTER_DEFAULTS)}
        >
          <XCircleIcon />
          <span>{intl.formatMessage(messages.clearfilters)}</span>
        </Button>
      </div>
    </SlideOver>
  );
};

export default MagazineSearchFilterSlideover;
