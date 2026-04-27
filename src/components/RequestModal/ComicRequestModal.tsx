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
  issue: 'Issue',
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
        <RequestNoticesAlert scope="comic" className="mt-4" />
        {willAutoApprove && (
          <div className="mt-4">
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

            {/* Same toggle-row pattern as the TV season picker, but
                collapsed to two columns (toggle + content) so the
                table never has hidden / empty columns at narrow
                widths. Title and cover date stack as small subtext
                inside the content cell when present. */}
            <div className="-mx-4 max-h-80 overflow-y-auto sm:mx-0">
              <div className="inline-block min-w-full py-2 align-middle">
                <div className="overflow-hidden border border-gray-700 shadow backdrop-blur sm:rounded-lg">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="w-16 bg-gray-700/80 px-4 py-3">
                          <span
                            role="checkbox"
                            tabIndex={0}
                            aria-checked={allSelected}
                            aria-label={intl.formatMessage(messages.selectAll)}
                            onClick={toggleAll}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleAll();
                              }
                            }}
                            className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                          >
                            <span
                              aria-hidden="true"
                              className={`${
                                allSelected ? 'bg-indigo-500' : 'bg-gray-800'
                              } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                            />
                            <span
                              aria-hidden="true"
                              className={`${
                                allSelected ? 'translate-x-5' : 'translate-x-0'
                              } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out`}
                            />
                          </span>
                        </th>
                        <th className="bg-gray-700/80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200">
                          {intl.formatMessage(messages.issue)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {(issues ?? [])
                        .filter(
                          (i): i is ComicIssueOption & { issueNumber: string } =>
                            !!i.issueNumber
                        )
                        .map((i) => {
                          const checked = selectedIssues.includes(
                            i.issueNumber
                          );
                          return (
                            <tr
                              key={`issue-row-${i.comicVineId ?? i.id ?? i.issueNumber}`}
                              className={`cursor-pointer ${
                                checked
                                  ? 'bg-gray-700/40'
                                  : 'hover:bg-gray-700/20'
                              }`}
                              onClick={() => toggleIssue(i.issueNumber)}
                            >
                              <td className="w-16 whitespace-nowrap px-4 py-3 align-top">
                                <span
                                  role="checkbox"
                                  tabIndex={0}
                                  aria-checked={checked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleIssue(i.issueNumber);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      toggleIssue(i.issueNumber);
                                    }
                                  }}
                                  className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                                >
                                  <span
                                    aria-hidden="true"
                                    className={`${
                                      checked
                                        ? 'bg-indigo-500'
                                        : 'bg-gray-800'
                                    } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                                  />
                                  <span
                                    aria-hidden="true"
                                    className={`${
                                      checked
                                        ? 'translate-x-5'
                                        : 'translate-x-0'
                                    } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out`}
                                  />
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div className="font-mono text-sm font-semibold text-amber-300">
                                  #{i.issueNumber}
                                </div>
                                {(i.name || i.coverDate) && (
                                  <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-gray-400">
                                    {i.name && (
                                      <span className="truncate text-gray-200">
                                        {i.name}
                                      </span>
                                    )}
                                    {i.coverDate && (
                                      <span className="text-gray-500">
                                        {i.coverDate}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
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
