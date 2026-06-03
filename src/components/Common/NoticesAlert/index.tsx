import Alert from '@app/components/Common/Alert';
import useSettings from '@app/hooks/useSettings';
import type {
  NoticeContext,
  NoticeEntry,
  NoticeMediaScope,
  RequestNoticeEntry,
} from '@server/interfaces/api/settingsInterfaces';

interface NoticesAlertProps {
  /**
   * The media-type the surface is rendering (book detail page →
   * ``book``, magazine search tab → ``magazine``, etc.). Global
   * notices always render regardless of this value.
   */
  mediaType: Exclude<NoticeMediaScope, 'global'>;
  /**
   * Which surface is asking. ``detail`` is the per-item detail
   * page + the request modal that opens from it; ``search`` is
   * the per-type tab inside ``/search``; ``discover`` is
   * ``/discover/<type>``.
   */
  context: NoticeContext;
  className?: string;
}

/**
 * Renders all admin-defined notices that match the given
 * ``(mediaType, context)`` pair, in storage order. Each notice
 * carries its own severity (info / warning / error) which maps
 * to an Alert color. Empty / disabled notices are filtered out.
 *
 * When ``currentSettings.notices`` is empty, falls back to the
 * legacy ``requestNotices`` map so operators who never migrated
 * still see their existing detail-page notices.
 */
const NoticesAlert = ({ mediaType, context, className }: NoticesAlertProps) => {
  const { currentSettings } = useSettings();

  // Primary source — the new list-shaped storage.
  const all: NoticeEntry[] = currentSettings.notices ?? [];

  const visible = all.filter(
    (n) =>
      n.enabled &&
      n.message.trim().length > 0 &&
      (n.mediaScope === 'global' || n.mediaScope === mediaType) &&
      n.contexts.includes(context)
  );

  // Backward-compat: when the operator hasn't created any
  // entries in the new model AND the surface is ``detail``,
  // fall back to the legacy ``requestNotices`` map (the only
  // surface the legacy shape ever rendered on). ``search`` /
  // ``discover`` contexts never had a legacy equivalent so
  // they render nothing when ``notices`` is empty.
  if (visible.length === 0 && context === 'detail') {
    const legacy = currentSettings.requestNotices;
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
    const fallback = [
      coerce(legacy?.global),
      coerce(
        legacy?.[mediaType as keyof typeof legacy] as
          | RequestNoticeEntry
          | string
          | undefined
      ),
    ].filter((e) => e.message.trim().length > 0);
    if (fallback.length === 0) return null;
    return (
      <div className={`space-y-2 ${className ?? ''}`}>
        {fallback.map((entry, idx) => (
          <Alert
            key={`legacy-notice-${idx}`}
            title={entry.message}
            type={entry.severity}
          />
        ))}
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      {visible.map((n) => (
        <Alert key={n.id} title={n.message} type={n.severity} />
      ))}
    </div>
  );
};

export default NoticesAlert;
