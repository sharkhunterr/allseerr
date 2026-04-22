import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import RequestAsUserSelect from '@app/components/RequestModal/RequestAsUserSelect';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { MediaType } from '@server/constants/media';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.RequestModal.BookRequestModal', {
  requestBook: 'Request Book',
  requestAudiobook: 'Request Audiobook',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  selectEdition: 'Select an edition',
  edition: 'Edition',
  format: 'Format',
  year: 'Year',
  publisher: 'Publisher',
  isbn: 'ISBN',
  noEditions: 'No editions available for this book.',
  autoApprove: 'This request will be approved automatically.',
});

export interface BookRequestEdition {
  id: number;
  title?: string;
  subtitle?: string;
  isbn13?: string;
  isbn10?: string;
  year?: number;
  releaseDate?: string;
  pageCount?: number;
  format?: string;
  coverUrl?: string;
  publisher?: string;
  language?: string;
}

interface BookRequestModalProps {
  show: boolean;
  bookKey: string;
  title: string;
  authorName: string;
  authorKey?: string;
  isAudiobook: boolean;
  fallbackCoverUrl?: string;
  fallbackYear?: number;
  fallbackPublisher?: string;
  fallbackIsbn13?: string;
  fallbackIsbn10?: string;
  editions: BookRequestEdition[];
  initialEditionId?: number | null;
  onCancel: () => void;
  onComplete: () => void;
}

const BookRequestModal = ({
  show,
  bookKey,
  title,
  authorName,
  authorKey,
  isAudiobook,
  fallbackCoverUrl,
  fallbackYear,
  fallbackPublisher,
  fallbackIsbn13,
  fallbackIsbn10,
  editions,
  initialEditionId,
  onCancel,
  onComplete,
}: BookRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedEditionId, setSelectedEditionId] = useState<number | null>(
    initialEditionId ??
      editions.find((e) => e.isbn13)?.id ??
      editions[0]?.id ??
      null
  );
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);

  // Mirrors movies/TV: MANAGE_REQUESTS, the generic AUTO_APPROVE, or
  // the per-type AUTO_APPROVE_BOOK / AUDIOBOOK greenlight the request
  // immediately. When ANY of these is held the modal shows the same
  // "approved automatically" alert the movie/TV variants do.
  const willAutoApprove = hasPermission(
    [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      isAudiobook
        ? Permission.AUTO_APPROVE_AUDIOBOOK
        : Permission.AUTO_APPROVE_BOOK,
    ],
    { type: 'or' }
  );

  // Permissions a target user must hold to receive an admin-attributed
  // request — passed to RequestAsUserSelect so we don't impersonate
  // someone who can't request books / audiobooks themselves.
  const requestAsRequiredPermissions = useMemo(
    () => [
      Permission.REQUEST,
      isAudiobook ? Permission.REQUEST_AUDIOBOOK : Permission.REQUEST_BOOK,
    ],
    [isAudiobook]
  );

  const selected = editions.find((e) => e.id === selectedEditionId);

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await axios.post('/api/v1/book/request', {
        mediaType: isAudiobook ? MediaType.AUDIOBOOK : MediaType.BOOK,
        openLibraryId: bookKey,
        title,
        authorName: authorName || 'Unknown',
        foreignBookId: bookKey,
        foreignAuthorId: authorKey,
        isbn13: selected?.isbn13 ?? fallbackIsbn13,
        isbn10: selected?.isbn10 ?? fallbackIsbn10,
        asin: isAudiobook ? bookKey : undefined,
        coverUrl: selected?.coverUrl ?? fallbackCoverUrl,
        year: selected?.year ?? fallbackYear,
        publisher: selected?.publisher ?? fallbackPublisher,
        editionId: selected?.id,
        // Admin-attribute the request to another user when picked.
        // Backend ignores this for callers without MANAGE_REQUESTS /
        // MANAGE_USERS, falling back to req.user.
        userId: requestAsUser?.id,
      });
      addToast(intl.formatMessage(messages.requestSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      onComplete();
    } catch {
      addToast(intl.formatMessage(messages.requestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
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
        title={intl.formatMessage(
          isAudiobook ? messages.requestAudiobook : messages.requestBook
        )}
        subTitle={title}
        okText={
          isSubmitting
            ? intl.formatMessage(globalMessages.loading)
            : intl.formatMessage(globalMessages.request)
        }
        okDisabled={isSubmitting || (!isAudiobook && editions.length === 0)}
        okButtonType="primary"
        cancelText={intl.formatMessage(globalMessages.cancel)}
        backdrop={fallbackCoverUrl}
      >
        {willAutoApprove && (
          <div className="mt-6">
            <Alert
              title={intl.formatMessage(messages.autoApprove)}
              type="info"
            />
          </div>
        )}
        {editions.length === 0 ? (
          isAudiobook ? null : (
            <p className="py-6 text-center text-gray-400">
              {intl.formatMessage(messages.noEditions)}
            </p>
          )
        ) : (
          <div className="flex flex-col">
            <p className="mb-2 text-sm text-gray-300">
              {intl.formatMessage(messages.selectEdition)}
            </p>
            <div className="-mx-4 sm:mx-0">
              <div className="inline-block min-w-full py-2 align-middle">
                <div className="overflow-hidden border border-gray-700 shadow backdrop-blur sm:rounded-lg">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="w-16 bg-gray-700/80 px-4 py-3" />
                        <th className="bg-gray-700/80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200">
                          {intl.formatMessage(messages.edition)}
                        </th>
                        <th className="bg-gray-700/80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200">
                          {intl.formatMessage(messages.year)}
                        </th>
                        <th className="hidden bg-gray-700/80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 sm:table-cell">
                          {intl.formatMessage(messages.publisher)}
                        </th>
                        <th className="hidden bg-gray-700/80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:table-cell">
                          {intl.formatMessage(messages.isbn)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {editions.map((ed) => {
                        const checked = ed.id === selectedEditionId;
                        const label =
                          ed.format || intl.formatMessage(messages.edition);
                        return (
                          <tr
                            key={ed.id}
                            className={`cursor-pointer ${
                              checked
                                ? 'bg-gray-700/40'
                                : 'hover:bg-gray-700/20'
                            }`}
                            onClick={() => setSelectedEditionId(ed.id)}
                          >
                            <td className="whitespace-nowrap px-4 py-4">
                              <span
                                role="radio"
                                tabIndex={0}
                                aria-checked={checked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedEditionId(ed.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setSelectedEditionId(ed.id);
                                  }
                                }}
                                className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                              >
                                <span
                                  aria-hidden="true"
                                  className={`${
                                    checked ? 'bg-indigo-500' : 'bg-gray-700'
                                  } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                                />
                                <span
                                  aria-hidden="true"
                                  className={`${
                                    checked ? 'translate-x-5' : 'translate-x-0'
                                  } absolute left-0 inline-block h-5 w-5 rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out`}
                                />
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-100">
                              <div className="font-medium capitalize">
                                {label}
                              </div>
                              {ed.pageCount && (
                                <div className="text-xs text-gray-400">
                                  {ed.pageCount} pages
                                </div>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-4 py-4 text-sm text-gray-100">
                              {ed.year ?? '—'}
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-4 text-sm text-gray-100 sm:table-cell">
                              {ed.publisher ?? '—'}
                            </td>
                            <td className="hidden whitespace-nowrap px-4 py-4 font-mono text-xs text-gray-400 md:table-cell">
                              {ed.isbn13 ?? ed.isbn10 ?? '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
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

export default BookRequestModal;
