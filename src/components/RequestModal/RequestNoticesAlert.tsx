import NoticesAlert from '@app/components/Common/NoticesAlert';

/**
 * Legacy adapter — every per-type request modal / detail page
 * still imports ``RequestNoticesAlert``. The implementation
 * now defers entirely to ``NoticesAlert`` with
 * ``context="detail"`` so both the legacy single-entry-per-type
 * shape AND the new richer ``notices`` list reach the same
 * rendering pipeline.
 */
type NoticeScope =
  | 'movie'
  | 'tv'
  | 'book'
  | 'audiobook'
  | 'game'
  | 'manga'
  | 'comic'
  | 'magazine';

interface RequestNoticesAlertProps {
  scope: NoticeScope;
  className?: string;
}

const RequestNoticesAlert = ({ scope, className }: RequestNoticesAlertProps) => {
  return (
    <NoticesAlert mediaType={scope} context="detail" className={className} />
  );
};

export default RequestNoticesAlert;
