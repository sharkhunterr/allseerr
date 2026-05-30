import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import type {
  RequestNoticeEntry,
  RequestNotices,
} from '@server/interfaces/api/settingsInterfaces';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate as globalMutate } from 'swr';

const messages = defineMessages('components.Settings.RequestNotices', {
  heading: 'Request notices',
  description:
    'Optional admin-defined messages shown as alerts on the matching content detail page AND at the top of each request modal. Each notice has its own colour / icon (info, warning, error) so you can call attention proportionally. Leave the message blank to disable a notice.',
  global: 'Global',
  globalHelp:
    'Shown on every detail page and in every request modal regardless of type.',
  movie: 'Movies',
  tv: 'Series',
  book: 'Books',
  audiobook: 'Audiobooks',
  game: 'Games',
  manga: 'Manga',
  comic: 'Comics',
  perTypeHelp:
    'Shown only on the matching detail page / request modal. Stacks with the global notice when both are set.',
  message: 'Message',
  severity: 'Style',
  severityInfo: 'Info (blue)',
  severityWarning: 'Warning (amber)',
  severityError: 'Error (red)',
  saved: 'Request notices saved.',
  saveFailed: 'Failed to save request notices.',
});

type Scope = keyof RequestNotices;

const PER_TYPE_FIELDS: { key: Scope; label: keyof typeof messages }[] = [
  { key: 'movie', label: 'movie' },
  { key: 'tv', label: 'tv' },
  { key: 'book', label: 'book' },
  { key: 'audiobook', label: 'audiobook' },
  { key: 'game', label: 'game' },
  { key: 'manga', label: 'manga' },
  { key: 'comic', label: 'comic' },
];

const NoticeRow = ({
  scope,
  labelKey,
  helpKey,
  value,
}: {
  scope: Scope;
  labelKey: keyof typeof messages;
  helpKey: keyof typeof messages;
  value: RequestNoticeEntry;
}) => {
  const intl = useIntl();
  // Suppress lint — `value` is used by Formik via Field/`name=` props,
  // but referenced here only as a type anchor.
  void value;
  return (
    <>
      <div className="form-row">
        <label htmlFor={`${scope}.message`} className="text-label">
          <span>{intl.formatMessage(messages[labelKey])}</span>
          <span className="label-tip">
            {intl.formatMessage(messages[helpKey])}
          </span>
        </label>
        <div className="form-input-area">
          <Field
            as="textarea"
            id={`${scope}.message`}
            name={`${scope}.message`}
            rows={2}
            placeholder={intl.formatMessage(messages.message)}
          />
        </div>
      </div>
      <div className="form-row">
        <label htmlFor={`${scope}.severity`} className="text-label">
          <span>{intl.formatMessage(messages.severity)}</span>
        </label>
        <div className="form-input-area">
          <div className="form-input-field">
            <Field
              as="select"
              id={`${scope}.severity`}
              name={`${scope}.severity`}
            >
              <option value="info">
                {intl.formatMessage(messages.severityInfo)}
              </option>
              <option value="warning">
                {intl.formatMessage(messages.severityWarning)}
              </option>
              <option value="error">
                {intl.formatMessage(messages.severityError)}
              </option>
            </Field>
          </div>
        </div>
      </div>
    </>
  );
};

const RequestNoticesSection = () => {
  const intl = useIntl();
  const { addToast } = useToasts();

  const { data, error, mutate } = useSWR<RequestNotices>(
    '/api/v1/settings/request-notices'
  );

  if (!data && !error) return <LoadingSpinner />;

  const blank: RequestNoticeEntry = { message: '', severity: 'info' };
  const initial: RequestNotices = data ?? {
    global: blank,
    movie: blank,
    tv: blank,
    book: blank,
    audiobook: blank,
    game: blank,
    manga: blank,
    comic: blank,
    magazine: blank,
  };

  return (
    <>
      <div className="mb-6 mt-12">
        <h3 className="heading">{intl.formatMessage(messages.heading)}</h3>
        <p className="description">
          {intl.formatMessage(messages.description)}
        </p>
      </div>
      <div className="section">
        <Formik
          initialValues={initial}
          enableReinitialize
          onSubmit={async (values) => {
            try {
              await axios.put('/api/v1/settings/request-notices', values);
              await mutate();
              // Notices live in /settings/public so request modals
              // (which run as any user) can read them. Bust that
              // cache so saved changes show up live.
              await globalMutate('/api/v1/settings/public');
              addToast(intl.formatMessage(messages.saved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              addToast(intl.formatMessage(messages.saveFailed), {
                appearance: 'error',
                autoDismiss: true,
              });
            }
          }}
        >
          {({ isSubmitting, values }) => (
            <Form>
              <NoticeRow
                scope="global"
                labelKey="global"
                helpKey="globalHelp"
                value={values.global}
              />
              {PER_TYPE_FIELDS.map((row) => (
                <NoticeRow
                  key={row.key}
                  scope={row.key}
                  labelKey={row.label}
                  helpKey="perTypeHelp"
                  value={values[row.key]}
                />
              ))}

              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      <ArrowDownOnSquareIcon />
                      <span>
                        {isSubmitting
                          ? intl.formatMessage(globalMessages.saving)
                          : intl.formatMessage(globalMessages.save)}
                      </span>
                    </Button>
                  </span>
                </div>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </>
  );
};

export default RequestNoticesSection;
