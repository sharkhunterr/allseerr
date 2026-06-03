import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  LinkIcon,
} from '@heroicons/react/24/solid';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.Magazine.ReleasesPanel', {
  heading: 'Available releases',
  description:
    'Releases scraped from the configured magazine indexers (Bookys, telecharger-magazines.org). Hand one off to JDownloader 2 with a single click.',
  scan: 'Scan now',
  scanning: 'Scanning…',
  grab: 'Grab',
  grabbing: 'Grabbing…',
  grabbed: 'Sent to JD2',
  imported: 'In library',
  failed: 'Failed',
  available: 'Available',
  empty: 'No releases yet. Click "Scan now" to query the indexers.',
  notDispatched:
    'This magazine has not been dispatched to pressarr yet. Approve the request first so pressarr can scan release indexers for it.',
  scanFailed: 'Scan failed: {message}.',
  grabFailed: 'Grab failed: {message}.',
  openSource: 'Open on source',
  hostersLabel: 'Hosters',
  sourceLabel: 'Source',
  formatLabel: 'Format',
  sizeLabel: 'Size',
});

interface Hoster {
  hoster: string;
  url: string;
}

interface MagazineRelease {
  id: number;
  magazineId: number;
  source: string;
  sourceUrl: string;
  title: string;
  issueLabel?: string | null;
  year?: number | null;
  language?: string | null;
  fileFormat?: string | null;
  sizeBytes?: number | null;
  publishedAt?: string | null;
  coverUrl?: string | null;
  hosterLinks: Hoster[];
  status: 'available' | 'grabbed' | 'imported' | 'failed';
  statusMessage?: string | null;
  grabbedAt?: string | null;
  discoveredAt?: string | null;
}

const formatSize = (bytes?: number | null): string | null => {
  if (!bytes || bytes < 1024) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(1)} ${units[i]}`;
};

const STATUS_CHIP: Record<MagazineRelease['status'], string> = {
  available: 'bg-gray-500/20 text-gray-200 ring-gray-500/40',
  grabbed: 'bg-amber-500/20 text-amber-200 ring-amber-500/40',
  imported: 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/40',
  failed: 'bg-red-500/20 text-red-200 ring-red-500/40',
};

const SOURCE_LABEL: Record<string, string> = {
  bookys: 'Bookys',
  telecharger_magazines: 'telecharger-magazines.org',
};

interface ReleasesPanelProps {
  magazineId: string;
}

const ReleasesPanel = ({ magazineId }: ReleasesPanelProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [isScanning, setScanning] = useState(false);
  const [grabbing, setGrabbing] = useState<Set<number>>(new Set());
  const releasesUrl = magazineId
    ? `/api/v1/magazine/${encodeURIComponent(magazineId)}/releases`
    : null;
  const { data, error, mutate } = useSWR<MagazineRelease[]>(releasesUrl);

  const notDispatched = useMemo(() => {
    const status = (error as { response?: { status?: number } })?.response
      ?.status;
    return status === 409;
  }, [error]);

  if (!data && !error) return <LoadingSpinner />;

  const onScan = async () => {
    setScanning(true);
    try {
      await axios.post(
        `/api/v1/magazine/${encodeURIComponent(magazineId)}/releases/scan`
      );
      await mutate();
    } catch (e) {
      const msg = (e as Error)?.message ?? 'unknown error';
      addToast(intl.formatMessage(messages.scanFailed, { message: msg }), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setScanning(false);
    }
  };

  const onGrab = async (release: MagazineRelease) => {
    setGrabbing((s) => new Set(s).add(release.id));
    try {
      await axios.post(
        `/api/v1/magazine/${encodeURIComponent(magazineId)}/releases/${release.id}/grab`
      );
      await mutate();
    } catch (e) {
      const msg = (e as Error)?.message ?? 'unknown error';
      addToast(intl.formatMessage(messages.grabFailed, { message: msg }), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setGrabbing((s) => {
        const next = new Set(s);
        next.delete(release.id);
        return next;
      });
    }
  };

  const releases = data ?? [];

  return (
    <div className="mt-8 rounded-lg border border-gray-700 bg-gray-800/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold text-gray-100">
            {intl.formatMessage(messages.heading)}
          </h3>
          <p className="text-xs text-gray-400">
            {intl.formatMessage(messages.description)}
          </p>
        </div>
        {!notDispatched && (
          <Button onClick={onScan} disabled={isScanning} buttonType="primary">
            <ArrowPathIcon
              className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`}
            />
            <span>
              {intl.formatMessage(
                isScanning ? messages.scanning : messages.scan
              )}
            </span>
          </Button>
        )}
      </div>

      {notDispatched ? (
        <Alert
          title={intl.formatMessage(messages.notDispatched)}
          type="info"
        />
      ) : releases.length === 0 ? (
        <div className="rounded border border-dashed border-gray-700 p-6 text-center text-sm text-gray-400">
          {intl.formatMessage(messages.empty)}
        </div>
      ) : (
        <ul className="space-y-2">
          {releases.map((r) => {
            const sourceLabel = SOURCE_LABEL[r.source] ?? r.source;
            const size = formatSize(r.sizeBytes);
            const isGrabbing = grabbing.has(r.id);
            const canGrab = r.status === 'available' || r.status === 'failed';
            const StatusIcon =
              r.status === 'imported'
                ? CheckBadgeIcon
                : r.status === 'grabbed'
                  ? ClockIcon
                  : r.status === 'failed'
                    ? ExclamationTriangleIcon
                    : ArrowDownTrayIcon;
            return (
              <li
                key={r.id}
                className="rounded-md border border-gray-700 bg-gray-900/40 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-gray-100">
                      {r.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium uppercase tracking-wider ring-1 ${STATUS_CHIP[r.status]}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {intl.formatMessage(
                          r.status === 'available'
                            ? messages.available
                            : r.status === 'grabbed'
                              ? messages.grabbed
                              : r.status === 'imported'
                                ? messages.imported
                                : messages.failed
                        )}
                      </span>
                      {r.issueLabel && (
                        <span className="rounded bg-gray-700/60 px-1.5 py-0.5 font-mono text-gray-200">
                          {r.issueLabel}
                        </span>
                      )}
                      {r.year && (
                        <span className="text-gray-400">{r.year}</span>
                      )}
                      {r.fileFormat && (
                        <span className="uppercase text-gray-400">
                          {r.fileFormat}
                        </span>
                      )}
                      {size && <span className="text-gray-400">{size}</span>}
                      <span className="text-gray-500">·</span>
                      <span className="text-gray-300">{sourceLabel}</span>
                    </div>
                    {r.hosterLinks.length > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <LinkIcon className="h-3.5 w-3.5 text-gray-500" />
                        {r.hosterLinks.map((h) => (
                          <span
                            key={h.url}
                            className="rounded bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-mono uppercase text-indigo-200 ring-1 ring-indigo-500/30"
                            title={h.url}
                          >
                            {h.hoster}
                          </span>
                        ))}
                      </div>
                    )}
                    {r.statusMessage && r.status === 'failed' && (
                      <p className="mt-1 text-xs text-red-300">
                        {r.statusMessage}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <a
                      href={r.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300"
                    >
                      {intl.formatMessage(messages.openSource)} →
                    </a>
                    {canGrab && (
                      <Button
                        buttonType="primary"
                        buttonSize="sm"
                        onClick={() => onGrab(r)}
                        disabled={isGrabbing}
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        <span>
                          {intl.formatMessage(
                            isGrabbing ? messages.grabbing : messages.grab
                          )}
                        </span>
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ReleasesPanel;
