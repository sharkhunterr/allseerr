import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import RequestAsUserSelect from '@app/components/RequestModal/RequestAsUserSelect';
import RequestNoticesAlert from '@app/components/RequestModal/RequestNoticesAlert';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.RequestModal.MagazineRequestModal', {
  requestMagazine: 'Request Magazine',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  alreadyRequested: 'This magazine has already been requested.',
  autoApprove: 'This request will be approved automatically.',
  watchFrom: 'Watch from',
  watchFromHelp:
    'Pressarr will only grab issues published on or after this date. Leave blank to monitor the entire back catalogue.',
  todayShortcut: 'Today',
  clear: 'Clear',
  frequencyLabel: 'Frequency',
  frequencyValue: '{value}',
  publisherLabel: 'Publisher',
});

interface MagazineRequestModalProps {
  show: boolean;
  id: string;
  title: string;
  issn?: string;
  publisher?: string;
  coverUrl?: string;
  coverIsLogo?: boolean;
  year?: number;
  language?: string;
  description?: string;
  frequency?: string;
  googleBooksId?: string;
  onCancel: () => void;
  onComplete: () => void;
}

const MagazineRequestModal = ({
  show,
  id,
  title,
  issn,
  publisher,
  coverUrl,
  coverIsLogo,
  year,
  language,
  description,
  frequency,
  googleBooksId,
  onCancel,
  onComplete,
}: MagazineRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);
  // Default the start-watching date to today — that's the most
  // common "I only want new issues" case. Operators who want the
  // back catalogue clear the field.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [monitoringStartDate, setMonitoringStartDate] = useState<string>(today);

  const willAutoApprove = hasPermission(
    [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      Permission.AUTO_APPROVE_MAGAZINE,
    ],
    { type: 'or' }
  );

  const requestAsRequiredPermissions = useMemo(
    () => [Permission.REQUEST, Permission.REQUEST_MAGAZINE],
    []
  );

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await axios.post('/api/v1/magazine/request', {
        id,
        title,
        issn,
        publisher,
        coverUrl,
        coverIsLogo,
        year,
        language,
        description,
        frequency,
        googleBooksId,
        userId: requestAsUser?.id,
        // Empty string = "no preference" → don't send the field at
        // all; pressarr falls back to monitoring everything.
        ...(monitoringStartDate
          ? { monitoringStartDate }
          : {}),
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      onComplete();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      const message =
        status === 409
          ? intl.formatMessage(messages.alreadyRequested)
          : intl.formatMessage(messages.requestFailed);
      addToast(message, { appearance: status === 409 ? 'info' : 'error', autoDismiss: true });
      if (status === 409) onComplete();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Transition
      as="div"
      enter="transition-opacity duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
      show={show}
    >
      <Modal
        loading={false}
        backgroundClickable
        onCancel={onCancel}
        onOk={submit}
        title={intl.formatMessage(messages.requestMagazine)}
        subTitle={title}
        okText={
          isSubmitting
            ? intl.formatMessage(globalMessages.loading)
            : intl.formatMessage(globalMessages.request)
        }
        okDisabled={isSubmitting}
        okButtonType="primary"
        cancelText={intl.formatMessage(globalMessages.cancel)}
        // The detail page already styles logo covers on a light
        // background — when the cascade returned a logo we skip the
        // modal backdrop instead of zoom-cropping it into the
        // unreadable mess Modal's default behaviour produces.
        backdrop={coverIsLogo ? undefined : coverUrl}
      >
        <RequestNoticesAlert scope="magazine" className="mt-4" />
        {willAutoApprove && (
          <div className="mt-4">
            <Alert
              title={intl.formatMessage(messages.autoApprove)}
              type="info"
            />
          </div>
        )}

        {(publisher || frequency) && (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {publisher && (
              <div className="rounded-md bg-gray-700/40 p-3">
                <div className="text-xs uppercase tracking-wider text-gray-400">
                  {intl.formatMessage(messages.publisherLabel)}
                </div>
                <div className="mt-0.5 text-sm font-medium text-gray-100">
                  {publisher}
                </div>
              </div>
            )}
            {frequency && (
              <div className="rounded-md bg-gray-700/40 p-3">
                <div className="text-xs uppercase tracking-wider text-gray-400">
                  {intl.formatMessage(messages.frequencyLabel)}
                </div>
                <div className="mt-0.5 text-sm font-medium capitalize text-gray-100">
                  {intl.formatMessage(messages.frequencyValue, {
                    value: frequency,
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Start-watching date — the one mandatory choice. Defaults
            to today because it's by far the most common case
            ("only grab new issues"); operators who want the back
            catalogue blank the field. */}
        <div className="mt-6">
          <label
            htmlFor="monitoringStartDate"
            className="mb-2 block text-sm font-medium text-gray-100"
          >
            {intl.formatMessage(messages.watchFrom)}
          </label>
          <div className="flex items-center gap-2">
            <input
              id="monitoringStartDate"
              type="date"
              value={monitoringStartDate}
              onChange={(e) => setMonitoringStartDate(e.target.value)}
              className="block w-full max-w-xs rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={() => setMonitoringStartDate(today)}
              className="rounded-md bg-gray-700/60 px-3 py-2 text-xs uppercase tracking-wider text-gray-200 ring-1 ring-gray-600 hover:bg-gray-700"
            >
              {intl.formatMessage(messages.todayShortcut)}
            </button>
            <button
              type="button"
              onClick={() => setMonitoringStartDate('')}
              className="rounded-md bg-gray-700/60 px-3 py-2 text-xs uppercase tracking-wider text-gray-200 ring-1 ring-gray-600 hover:bg-gray-700"
            >
              {intl.formatMessage(messages.clear)}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            {intl.formatMessage(messages.watchFromHelp)}
          </p>
        </div>

        <RequestAsUserSelect
          requiredPermissions={requestAsRequiredPermissions}
          onChange={setRequestAsUser}
        />
      </Modal>
    </Transition>
  );
};

export default MagazineRequestModal;
