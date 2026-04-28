import Tooltip from '@app/components/Common/Tooltip';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import useSWR from 'swr';

interface StatusReasonProps {
  // Static reason — used by the non-TMDB request types whose
  // `*Media.statusReason` is persisted at dispatch time.
  reason?: string | null;
  // Lazy mode — used by movie / TV requests where the reason is
  // computed live from Radarr / Sonarr queue state. When this is
  // set the component fetches `/api/v1/request/:requestId/status-reason`
  // on mount (cached server-side at 60s) and renders only when the
  // backend returns a non-null reason.
  requestId?: number;
  // Compact = smaller icon + tighter spacing, for use inline next
  // to small badges (request cards / list items). The full size is
  // for detail-page headers where the badge is bigger.
  compact?: boolean;
}

interface StatusReasonResponse {
  reason: string | null;
}

const StatusReason = ({
  reason,
  requestId,
  compact = false,
}: StatusReasonProps) => {
  // Lazy SWR fetch when in requestId mode. revalidateOnFocus is on so
  // tabbing back to /requests refreshes the reason (download progress
  // moves), but we don't poll — the server-side 60s NodeCache
  // amortises Radarr / Sonarr calls across users.
  const { data } = useSWR<StatusReasonResponse>(
    requestId ? `/api/v1/request/${requestId}/status-reason` : null
  );

  const resolved = reason ?? data?.reason ?? null;
  if (!resolved) return null;

  const sizeClass = compact ? 'h-3.5 w-3.5' : 'h-4 w-4';
  return (
    <Tooltip
      content={<span className="block max-w-xs leading-snug">{resolved}</span>}
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
