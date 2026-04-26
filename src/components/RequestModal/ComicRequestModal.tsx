import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import RequestAsUserSelect from '@app/components/RequestModal/RequestAsUserSelect';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.RequestModal.ComicRequestModal', {
  requestComic: 'Request Comic',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  alreadyRequested: 'This comic has already been requested.',
  autoApprove: 'This request will be approved automatically.',
  manualWorkflow:
    'No download manager is configured. The request will be tracked but won’t be dispatched automatically.',
  mylarSeriesNote:
    'Mylar3 subscribes to the entire series. Per-issue selection is recorded for traceability — every selected (or all when none are deselected) issue will be picked up by Mylar as it monitors the series.',
  selectIssues: 'Select issues',
  selectAll: 'Select all',
  selectedCount:
    '{selected, plural, =0 {No issues selected} one {# issue selected} other {# issues selected}}',
  truncationNote:
    'Showing the first {shown} of {total} issues. Use “Select all” to request the entire series, including issues not listed.',
  noIssues: 'No issue list available — the entire series will be requested.',
});

interface ComicIssueOption {
  comicVineId?: number;
  id?: number;
  name?: string;
  issueNumber?: string;
  coverDate?: string;
}

interface ComicRequestModalProps {
  show: boolean;
  comicVineId: number;
  title: string;
  coverUrl?: string;
  year?: number;
  issueCount?: number;
  publisher?: string;
  publisherId?: number;
  creatorName?: string;
  creatorKey?: number;
  issues?: ComicIssueOption[];
  onCancel: () => void;
  onComplete: () => void;
}

const ComicRequestModal = ({
  show,
  comicVineId,
  title,
  coverUrl,
  year,
  issueCount,
  publisher,
  publisherId,
  creatorName,
  creatorKey,
  issues,
  onCancel,
  onComplete,
}: ComicRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);

  // Stable list of selectable issues — fall back to issueNumber when
  // ComicVine doesn't ship one (rare but possible).
  const selectable = useMemo(
    () =>
      (issues ?? [])
        .map((i) => i.issueNumber ?? '')
        .filter((n) => n.length > 0),
    [issues]
  );

  // Default = everything selected. Re-syncs whenever the issue list
  // shifts (e.g. modal opens for a new comic without unmount).
  const [selectedIssues, setSelectedIssues] = useState<string[]>(selectable);
  useEffect(() => {
    setSelectedIssues(selectable);
  }, [selectable]);

  const allSelected =
    selectable.length > 0 && selectedIssues.length === selectable.length;
  const truncated = !!issueCount && issueCount > selectable.length;

  const willAutoApprove = hasPermission(
    [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      Permission.AUTO_APPROVE_COMIC,
    ],
    { type: 'or' }
  );

  const requestAsRequiredPermissions = useMemo(
    () => [Permission.REQUEST, Permission.REQUEST_COMIC],
    []
  );

  const toggleIssue = (issueNumber: string) => {
    setSelectedIssues((curr) =>
      curr.includes(issueNumber)
        ? curr.filter((n) => n !== issueNumber)
        : [...curr, issueNumber]
    );
  };

  const toggleAll = () => {
    setSelectedIssues(allSelected ? [] : selectable);
  };

  const submit = async () => {
    setIsSubmitting(true);
    try {
      // When the user kept everything selected (or there was no list
      // to pick from), omit the field — the backend treats absence as
      // "request the whole series", which avoids storing redundant
      // data.
      const omitSelection =
        selectable.length === 0 ||
        selectedIssues.length === selectable.length;
      await axios.post('/api/v1/comic/request', {
        comicVineId,
        title,
        year,
        coverUrl,
        issueCount,
        publisher,
        publisherId,
        creatorName,
        creatorKey,
        userId: requestAsUser?.id,
        ...(omitSelection
          ? {}
          : {
              selectedIssueNumbers: selectedIssues
                .slice()
                .sort((a, b) => Number(a) - Number(b)),
            }),
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      onComplete();
    } catch (e) {
      const status = e?.response?.status;
      const message =
        status === 409
          ? intl.formatMessage(messages.alreadyRequested)
          : intl.formatMessage(messages.requestFailed);
      addToast(message, { appearance: 'error', autoDismiss: true });
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
        title={intl.formatMessage(messages.requestComic)}
        subTitle={title}
        okText={
          isSubmitting
            ? intl.formatMessage(globalMessages.loading)
            : intl.formatMessage(globalMessages.request)
        }
        okDisabled={
          isSubmitting ||
          (selectable.length > 0 && selectedIssues.length === 0)
        }
        okButtonType="primary"
        cancelText={intl.formatMessage(globalMessages.cancel)}
        backdrop={coverUrl}
      >
        {willAutoApprove && (
          <div className="mt-6">
            <Alert
              title={intl.formatMessage(messages.autoApprove)}
              type="info"
            />
          </div>
        )}
        <div className="mt-4">
          <Alert
            title={intl.formatMessage(messages.manualWorkflow)}
            type="warning"
          />
        </div>

        {selectable.length > 0 ? (
          <div className="mt-6 flex flex-col">
            <div className="flex items-center justify-between pb-3">
              <span className="text-sm font-semibold text-gray-100">
                {intl.formatMessage(messages.selectIssues)}
              </span>
              <button
                type="button"
                onClick={toggleAll}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 focus:outline-none"
              >
                {intl.formatMessage(messages.selectAll)}
              </button>
            </div>

            {truncated && (
              <div className="pb-2">
                <Alert
                  title={intl.formatMessage(messages.truncationNote, {
                    shown: selectable.length,
                    total: issueCount,
                  })}
                  type="info"
                />
              </div>
            )}

            {/* Issue chip grid — same 2/3/4-col responsive layout as
                the issues panel on the detail page. Each chip is a
                selectable button: filled indigo when picked, ghost
                gray otherwise. Compact + scannable for series with
                many issues, no dead space on narrow viewports. */}
            <div
              role="group"
              aria-label={intl.formatMessage(messages.selectIssues)}
              className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto rounded-md border border-gray-700 bg-gray-800/40 p-2 sm:grid-cols-4 md:grid-cols-5"
            >
              {(issues ?? [])
                .filter(
                  (i): i is ComicIssueOption & { issueNumber: string } =>
                    !!i.issueNumber
                )
                .map((i) => {
                  const checked = selectedIssues.includes(i.issueNumber);
                  return (
                    <button
                      type="button"
                      key={`issue-${i.comicVineId ?? i.id ?? i.issueNumber}`}
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => toggleIssue(i.issueNumber)}
                      title={
                        i.name
                          ? `#${i.issueNumber} — ${i.name}`
                          : `#${i.issueNumber}`
                      }
                      className={`group flex flex-col items-start rounded-md border px-2 py-1.5 text-left transition focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${
                        checked
                          ? 'border-indigo-500 bg-indigo-500/20 text-indigo-100'
                          : 'border-gray-700 bg-gray-800/60 text-gray-300 hover:border-gray-500 hover:bg-gray-700/60'
                      }`}
                    >
                      <span
                        className={`font-mono text-sm font-semibold ${
                          checked ? 'text-indigo-200' : 'text-amber-300'
                        }`}
                      >
                        #{i.issueNumber}
                      </span>
                      {(i.name || i.coverDate) && (
                        <span className="mt-0.5 w-full truncate text-[11px] text-gray-400">
                          {i.name ?? i.coverDate}
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            <p className="mt-2 text-xs text-gray-400">
              {intl.formatMessage(messages.selectedCount, {
                selected: selectedIssues.length,
              })}
            </p>
            <p className="mt-1 text-xs italic text-gray-500">
              {intl.formatMessage(messages.mylarSeriesNote)}
            </p>
          </div>
        ) : (
          <div className="mt-6">
            <Alert
              title={intl.formatMessage(messages.noIssues)}
              type="info"
            />
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

export default ComicRequestModal;
