import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.GameRequestModal', {
  title: 'Request Game',
  requestForTitle: 'Request {title}',
  description:
    'Select the platform(s) you want to request. One request is created per selected platform.',
  selectAll: 'Select All',
  available: 'Available',
  requested: 'Requested',
  request: 'Request',
  requestPlatforms:
    'Request {count} {count, plural, one {Platform} other {Platforms}}',
  requestSuccess: '<strong>{title}</strong> requested successfully!',
  requestFailed: 'Failed to submit request.',
});

interface Platform {
  id: number;
  name: string;
  abbreviation?: string;
  mediaStatus?: MediaStatus | null;
}

interface GameRequestModalProps {
  show: boolean;
  igdbId: number;
  title: string;
  platforms: Platform[];
  releaseYear?: number;
  developer?: string;
  publisher?: string;
  genre?: string;
  coverUrl?: string;
  onCancel?: () => void;
  onComplete?: () => void;
}

const GameRequestModal = ({
  show,
  igdbId,
  title,
  platforms,
  releaseYear,
  developer,
  publisher,
  genre,
  coverUrl,
  onCancel,
  onComplete,
}: GameRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [selected, setSelected] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const requestable = platforms.filter((p) => {
    const s = p.mediaStatus;
    return (
      s === null ||
      s === undefined ||
      s === MediaStatus.UNKNOWN ||
      s === MediaStatus.DELETED
    );
  });

  const allSelected =
    requestable.length > 0 && selected.length === requestable.length;

  const togglePlatform = (id: number) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : requestable.map((p) => p.id));
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);

    const selectedPlatforms = platforms.filter((p) => selected.includes(p.id));
    let success = 0;
    let failed = 0;

    for (const platform of selectedPlatforms) {
      try {
        await axios.post('/api/v1/game/request', {
          igdbId,
          platformIgdbId: platform.id,
          platformName: platform.name,
          title,
          releaseYear,
          developer,
          publisher,
          genre,
          coverUrl,
        });
        success++;
      } catch {
        failed++;
      }
    }

    setIsSubmitting(false);

    if (success > 0) {
      addToast(
        intl.formatMessage(messages.requestSuccess, {
          title,
          strong: (msg: React.ReactNode) => <strong>{msg}</strong>,
        }),
        { appearance: 'success', autoDismiss: true }
      );
      onComplete?.();
    }
    if (failed > 0) {
      addToast(intl.formatMessage(messages.requestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
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
        title={intl.formatMessage(messages.requestForTitle, { title })}
      subTitle={
        developer
          ? `${developer}${releaseYear ? ` · ${releaseYear}` : ''}`
          : releaseYear?.toString()
      }
      backgroundClickable
      onCancel={onCancel}
      onOk={handleSubmit}
      okDisabled={selected.length === 0 || isSubmitting}
      okText={
        isSubmitting
          ? intl.formatMessage(globalMessages.saving)
          : selected.length > 0
            ? intl.formatMessage(messages.requestPlatforms, {
                count: selected.length,
              })
            : intl.formatMessage(messages.request)
      }
      okButtonType="primary"
      backdrop={coverUrl}
    >
      <p className="mb-4 text-sm text-gray-300">
        {intl.formatMessage(messages.description)}
      </p>
      {requestable.length > 1 && (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            className="text-sm text-indigo-400 hover:text-indigo-300"
            onClick={toggleAll}
          >
            {allSelected ? '✕ ' : '✓ '}
            {intl.formatMessage(messages.selectAll)}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {platforms.map((p) => {
          const isAvailable = p.mediaStatus === MediaStatus.AVAILABLE;
          const isRequested =
            p.mediaStatus !== null &&
            p.mediaStatus !== undefined &&
            p.mediaStatus !== MediaStatus.UNKNOWN &&
            p.mediaStatus !== MediaStatus.DELETED &&
            !isAvailable;
          const disabled = isAvailable || isRequested;
          const isChecked = selected.includes(p.id);

          return (
            <label
              key={p.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition ${
                disabled
                  ? 'cursor-not-allowed border-gray-700 bg-gray-800/30 opacity-60'
                  : isChecked
                    ? 'border-indigo-500 bg-indigo-600/20'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'
              }`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isChecked}
                  disabled={disabled}
                  onChange={() => !disabled && togglePlatform(p.id)}
                />
                <span className="text-sm font-medium text-gray-200">
                  {p.name}
                </span>
              </div>
              {isAvailable ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-green-400">
                  <CheckCircleIcon className="h-4 w-4" />
                  {intl.formatMessage(messages.available)}
                </span>
              ) : isRequested ? (
                <span className="flex items-center gap-1 text-xs font-semibold text-yellow-400">
                  <XCircleIcon className="h-4 w-4" />
                  {intl.formatMessage(messages.requested)}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
      </Modal>
    </Transition>
  );
};

export default GameRequestModal;
