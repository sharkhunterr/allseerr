import Alert from '@app/components/Common/Alert';
import useSettings from '@app/hooks/useSettings';
import type { RequestNoticeEntry } from '@server/interfaces/api/settingsInterfaces';

type NoticeScope =
  | 'movie'
  | 'tv'
  | 'book'
  | 'audiobook'
  | 'game'
  | 'manga'
  | 'comic';

interface RequestNoticesAlertProps {
  scope: NoticeScope;
  className?: string;
}

/**
 * Renders the admin-configured request-modal notices for a given
 * scope. Layout: global notice on top, per-type notice below.
 * Either or both may be empty — the component renders nothing when
 * there's no notice to show, so call sites can drop it in without
 * conditional wrappers. Each notice carries its own severity which
 * drives the Alert color / icon (info = blue, warning = amber,
 * error = red).
 *
 * Used by both the request modals AND the content detail pages so
 * users see the same admin message in both surfaces.
 */
const RequestNoticesAlert = ({ scope, className }: RequestNoticesAlertProps) => {
  const { currentSettings } = useSettings();
  const notices = currentSettings.requestNotices;

  // Defensive: requestNotices arrived after the initial defaults
  // shipped, so an old cached settings object could leave it as a
  // legacy plain-string shape. Coerce both shapes into the new entry
  // form before rendering.
  const coerce = (
    raw: RequestNoticeEntry | string | undefined
  ): RequestNoticeEntry => {
    if (typeof raw === 'string') return { message: raw, severity: 'info' };
    if (raw && typeof raw === 'object')
      return {
        message: raw.message ?? '',
        severity: raw.severity ?? 'info',
      };
    return { message: '', severity: 'info' };
  };

  const globalNotice = coerce(notices?.global);
  const typeNotice = coerce(notices?.[scope]);

  if (!globalNotice.message && !typeNotice.message) return null;

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {globalNotice.message && (
        <Alert title={globalNotice.message} type={globalNotice.severity} />
      )}
      {typeNotice.message && (
        <Alert title={typeNotice.message} type={typeNotice.severity} />
      )}
    </div>
  );
};

export default RequestNoticesAlert;
