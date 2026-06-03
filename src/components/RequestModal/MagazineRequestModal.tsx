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
  // Subscription vs one-shot toggle.
  requestTypeLabel: 'What do you want?',
  requestTypeSubscription: 'Subscribe — get new issues',
  requestTypeSubscriptionHelp:
    'Monitor this magazine going forward. Every new issue published on or after the "Watch from" date is grabbed automatically.',
  requestTypeOneShot: 'One specific issue',
  requestTypeOneShotHelp:
    'Grab a single back issue, no monitoring. Give the issue number or its publication date — whichever the magazine is identified by.',
  // Subscription-mode fields
  watchFrom: 'Watch from',
  watchFromHelp:
    'Pressarr will only grab issues published on or after this date. Leave blank to monitor the entire back catalogue.',
  todayShortcut: 'Today',
  clear: 'Clear',
  // One-shot-mode fields
  targetIssueLabel: 'Issue identifier',
  targetIssueHelp:
    'Either an issue number ("594" or "N°594" or "HS 14") OR an issue date (YYYY-MM-DD for dailies like L\'Équipe). One of the two is enough.',
  targetIssueDate: 'Issue date',
  targetIssueDateHelp:
    "Useful for dailies where the issue is identified by its date instead of a number (L'Équipe du 03/06/2026).",
  // Static info row
  frequencyLabel: 'Frequency',
  frequencyValue: '{value}',
  publisherLabel: 'Publisher',
});

type RequestType = 'subscription' | 'one_shot';

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
  // Subscription (recurring monitor) vs one_shot (single back
  // issue). Subscription is the common case so it's the
  // default; toggling to one_shot swaps the date picker for a
  // pair of identifier fields.
  const [requestType, setRequestType] = useState<RequestType>('subscription');
  const [targetIssueLabel, setTargetIssueLabel] = useState('');
  const [targetIssueDate, setTargetIssueDate] = useState('');
  const oneShotValid =
    requestType === 'subscription' ||
    targetIssueLabel.trim().length > 0 ||
    targetIssueDate.trim().length > 0;

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
    if (!oneShotValid) return;
    setIsSubmitting(true);
    try {
      // Subscription = recurring monitor; pressarr keeps the
      // magazine in its scheduled-scan list and auto-grabs every
      // new issue published on/after ``monitoringStartDate``.
      // One-shot = the operator wants a single back issue and
      // does NOT want pressarr to keep monitoring afterwards;
      // pressarr resolves the target (issue number or date) and
      // grabs exactly that one release.
      const subscriptionFields =
        requestType === 'subscription'
          ? monitoringStartDate
            ? { monitoringStartDate }
            : {}
          : {};
      const oneShotFields =
        requestType === 'one_shot'
          ? {
              requestType: 'one_shot' as const,
              ...(targetIssueLabel.trim()
                ? { targetIssueLabel: targetIssueLabel.trim() }
                : {}),
              ...(targetIssueDate.trim()
                ? { targetIssueDate: targetIssueDate.trim() }
                : {}),
            }
          : { requestType: 'subscription' as const };
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
        ...subscriptionFields,
        ...oneShotFields,
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
        okDisabled={isSubmitting || !oneShotValid}
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

        {/* Subscription vs one-shot picker — radio pair styled
            as cards. Each option has its own help line so the
            operator picks confidently without skimming the
            tooltips. */}
        <div className="mt-6">
          <span className="mb-2 block text-sm font-medium text-gray-100">
            {intl.formatMessage(messages.requestTypeLabel)}
          </span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: 'subscription' as const,
                  label: messages.requestTypeSubscription,
                  help: messages.requestTypeSubscriptionHelp,
                },
                {
                  value: 'one_shot' as const,
                  label: messages.requestTypeOneShot,
                  help: messages.requestTypeOneShotHelp,
                },
              ]
            ).map((opt) => {
              const active = requestType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRequestType(opt.value)}
                  className={`rounded-md border p-3 text-left transition ${
                    active
                      ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500/40'
                      : 'border-gray-700 bg-gray-700/30 hover:border-gray-600'
                  }`}
                >
                  <div
                    className={`text-sm font-semibold ${active ? 'text-indigo-200' : 'text-gray-100'}`}
                  >
                    {intl.formatMessage(opt.label)}
                  </div>
                  <p className="mt-1 text-xs text-gray-400">
                    {intl.formatMessage(opt.help)}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {requestType === 'subscription' ? (
          <div className="mt-4">
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
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="targetIssueLabel"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.targetIssueLabel)}
              </label>
              <input
                id="targetIssueLabel"
                type="text"
                value={targetIssueLabel}
                onChange={(e) => setTargetIssueLabel(e.target.value)}
                placeholder="N°594  |  HS 14  |  594"
                className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {intl.formatMessage(messages.targetIssueHelp)}
              </p>
            </div>
            <div>
              <label
                htmlFor="targetIssueDate"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.targetIssueDate)}
              </label>
              <input
                id="targetIssueDate"
                type="date"
                value={targetIssueDate}
                onChange={(e) => setTargetIssueDate(e.target.value)}
                className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {intl.formatMessage(messages.targetIssueDateHelp)}
              </p>
            </div>
          </div>
        )}

        <RequestAsUserSelect
          requiredPermissions={requestAsRequiredPermissions}
          onChange={setRequestAsUser}
        />
      </Modal>
    </Transition>
  );
};

export default MagazineRequestModal;
