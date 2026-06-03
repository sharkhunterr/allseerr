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

const messages = defineMessages(
  'components.RequestModal.MagazineManualRequestModal',
  {
    title: 'Request a magazine not listed',
    description:
      "Can't find the magazine you want in the search results? Provide the details manually — pressarr will create the subscription and try to enrich it from ISSN authorities at first scan.",
    titleField: 'Title',
    titleRequired: 'A title is required.',
    publisher: 'Publisher',
    issn: 'ISSN',
    issnHelp: '8 digits, hyphenated — e.g. 0151-1262. Strongly recommended when known.',
    issnInvalid: 'ISSN must look like 1234-5678.',
    frequency: 'Frequency',
    frequencyHelp: "Pressarr defaults to monthly when you don't pick one.",
    description2: 'Description',
    coverUrl: 'Cover URL',
    coverUrlHelp: 'Optional — used as the card image until pressarr finds a better one.',
    watchFrom: 'Watch from',
    watchFromHelp:
      'Pressarr will only grab issues published on or after this date. Leave blank to monitor the entire back catalogue.',
    todayShortcut: 'Today',
    clear: 'Clear',
    submit: 'Submit request',
    submitting: 'Submitting…',
    requestSuccess: 'Manual magazine request submitted.',
    requestFailed: 'Failed to submit request.',
    alreadyRequested: 'A request for this magazine already exists.',
    autoApprove: 'This request will be approved automatically.',
  }
);

const FREQUENCY_OPTIONS = [
  '',
  'daily',
  'weekly',
  'biweekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'semiannual',
  'annual',
] as const;

interface MagazineManualRequestModalProps {
  show: boolean;
  onCancel: () => void;
  onComplete: () => void;
}

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');

const MagazineManualRequestModal = ({
  show,
  onCancel,
  onComplete,
}: MagazineManualRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [titleField, setTitleField] = useState('');
  const [publisher, setPublisher] = useState('');
  const [issn, setIssn] = useState('');
  const [frequency, setFrequency] = useState<string>('monthly');
  const [descriptionField, setDescriptionField] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [monitoringStartDate, setMonitoringStartDate] = useState<string>(today);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);

  const titleTrimmed = titleField.trim();
  const issnTrimmed = issn.trim();
  const issnLooksValid =
    issnTrimmed === '' || /^\d{4}-\d{3}[\dXx]$/.test(issnTrimmed);
  const canSubmit = titleTrimmed.length > 0 && issnLooksValid && !isSubmitting;

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

  const reset = () => {
    setTitleField('');
    setPublisher('');
    setIssn('');
    setFrequency('monthly');
    setDescriptionField('');
    setCoverUrl('');
    setMonitoringStartDate(today);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    // Cascade id needs a stable shape — ISSN takes priority (the
    // backend dedupes on ``issn:NNNN-NNNN``), else fall back to a
    // ``manual:<slug>`` key so two manual entries for "Le Monde"
    // collapse into one MagazineMedia row.
    const id = issnTrimmed
      ? `issn:${issnTrimmed}`
      : `manual:${slugify(titleTrimmed)}`;
    try {
      await axios.post('/api/v1/magazine/request', {
        id,
        title: titleTrimmed,
        issn: issnTrimmed || undefined,
        publisher: publisher.trim() || undefined,
        coverUrl: coverUrl.trim() || undefined,
        description: descriptionField.trim() || undefined,
        frequency: frequency || undefined,
        userId: requestAsUser?.id,
        ...(monitoringStartDate ? { monitoringStartDate } : {}),
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      reset();
      onComplete();
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response
        ?.status;
      const msg =
        status === 409
          ? intl.formatMessage(messages.alreadyRequested)
          : intl.formatMessage(messages.requestFailed);
      addToast(msg, { appearance: status === 409 ? 'info' : 'error', autoDismiss: true });
      if (status === 409) {
        reset();
        onComplete();
      }
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
        title={intl.formatMessage(messages.title)}
        okText={
          isSubmitting
            ? intl.formatMessage(messages.submitting)
            : intl.formatMessage(messages.submit)
        }
        okDisabled={!canSubmit}
        okButtonType="primary"
        cancelText={intl.formatMessage(globalMessages.cancel)}
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
        <p className="mt-4 text-sm text-gray-300">
          {intl.formatMessage(messages.description)}
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label
              htmlFor="manualMagazineTitle"
              className="mb-1 block text-sm font-medium text-gray-100"
            >
              {intl.formatMessage(messages.titleField)}
              <span className="ml-1 text-red-400">*</span>
            </label>
            <input
              id="manualMagazineTitle"
              type="text"
              value={titleField}
              onChange={(e) => setTitleField(e.target.value)}
              className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {titleField !== '' && titleTrimmed === '' && (
              <p className="mt-1 text-xs text-red-400">
                {intl.formatMessage(messages.titleRequired)}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manualMagazineIssn"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.issn)}
              </label>
              <input
                id="manualMagazineIssn"
                type="text"
                value={issn}
                onChange={(e) => setIssn(e.target.value)}
                placeholder="0151-1262"
                className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 font-mono text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                {intl.formatMessage(messages.issnHelp)}
              </p>
              {!issnLooksValid && (
                <p className="mt-1 text-xs text-red-400">
                  {intl.formatMessage(messages.issnInvalid)}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="manualMagazinePublisher"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.publisher)}
              </label>
              <input
                id="manualMagazinePublisher"
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="manualMagazineFrequency"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.frequency)}
              </label>
              <select
                id="manualMagazineFrequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm capitalize text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {FREQUENCY_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt || '—'}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-400">
                {intl.formatMessage(messages.frequencyHelp)}
              </p>
            </div>

            <div>
              <label
                htmlFor="manualMagazineWatchFrom"
                className="mb-1 block text-sm font-medium text-gray-100"
              >
                {intl.formatMessage(messages.watchFrom)}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="manualMagazineWatchFrom"
                  type="date"
                  value={monitoringStartDate}
                  onChange={(e) => setMonitoringStartDate(e.target.value)}
                  className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              <p className="mt-1 text-xs text-gray-400">
                {intl.formatMessage(messages.watchFromHelp)}
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="manualMagazineCover"
              className="mb-1 block text-sm font-medium text-gray-100"
            >
              {intl.formatMessage(messages.coverUrl)}
            </label>
            <input
              id="manualMagazineCover"
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://…"
              className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-gray-400">
              {intl.formatMessage(messages.coverUrlHelp)}
            </p>
          </div>

          <div>
            <label
              htmlFor="manualMagazineDescription"
              className="mb-1 block text-sm font-medium text-gray-100"
            >
              {intl.formatMessage(messages.description2)}
            </label>
            <textarea
              id="manualMagazineDescription"
              value={descriptionField}
              onChange={(e) => setDescriptionField(e.target.value)}
              rows={3}
              className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <RequestAsUserSelect
          requiredPermissions={requestAsRequiredPermissions}
          onChange={setRequestAsUser}
        />
      </Modal>
    </Transition>
  );
};

export default MagazineManualRequestModal;
