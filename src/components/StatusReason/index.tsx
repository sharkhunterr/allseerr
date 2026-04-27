import Tooltip from '@app/components/Common/Tooltip';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

interface StatusReasonProps {
  reason?: string | null;
  // Compact = smaller icon + tighter spacing, for use inline next
  // to small badges (request cards / list items). The full size is
  // for detail-page headers where the badge is bigger.
  compact?: boolean;
}

/**
 * Tiny info-icon + popover that explains why a non-TMDB request is
 * in its current state ("no download manager configured", "Mylar
 * rejected the addComic command", "no Suwayomi source matched the
 * title", …). The reason text is set by the subscriber at dispatch
 * time and persisted on the *Media entity. When the reason is null
 * the component renders nothing — not every state needs a story.
 */
const StatusReason = ({ reason, compact = false }: StatusReasonProps) => {
  if (!reason) return null;
  const sizeClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <Tooltip
      content={<span className="block max-w-xs leading-snug">{reason}</span>}
    >
      <span
        className="inline-flex cursor-help items-center text-gray-400 hover:text-gray-200"
        aria-label="Show status reason"
      >
        <InformationCircleIcon className={sizeClass} />
      </span>
    </Tooltip>
  );
};

export default StatusReason;
