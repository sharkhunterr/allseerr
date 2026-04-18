import Badge from '@app/components/Common/Badge';
import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.GameRequestModal', {
  requestForTitle: 'Request {title}',
  description:
    'Select the platform(s) you want to request. One request is created per selected platform.',
  selectAll: 'Select All',
  platform: 'Platform',
  status: 'Status',
  available: 'Available',
  requested: 'Requested',
  notrequested: 'Not Requested',
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

const isPlatformDisabled = (p: Platform): boolean => {
  const s = p.mediaStatus;
  return (
    s === MediaStatus.AVAILABLE ||
    (s !== null &&
      s !== undefined &&
      s !== MediaStatus.UNKNOWN &&
      s !== MediaStatus.DELETED)
  );
};

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

  const requestable = platforms.filter((p) => !isPlatformDisabled(p));
  const allSelected =
    requestable.length > 0 && selected.length === requestable.length;

  const togglePlatform = (p: Platform) => {
    if (isPlatformDisabled(p)) return;
    setSelected((prev) =>
      prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
    );
  };

  const toggleAll = () => {
    setSelected(allSelected ? [] : requestable.map((p) => p.id));
  };

  const handleSubmit = async () => {
    if (selected.length === 0) return;
    setIsSubmitting(true);

    const selectedPlatforms = platforms.filter(
      (p) => selected.includes(p.id) && !isPlatformDisabled(p)
    );
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
      setSelected([]);
      onComplete?.();
    }
    if (failed > 0) {
      addToast(intl.formatMessage(messages.requestFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const renderSwitch = (checked: boolean, disabled: boolean) => (
    <span
      className={`relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none ${
        disabled ? 'cursor-not-allowed opacity-50' : ''
      }`}
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
  );

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
        <div className="flex flex-col">
          <div className="-mx-4 sm:mx-0">
            <div className="inline-block min-w-full py-2 align-middle">
              <div className="overflow-hidden shadow sm:rounded-lg">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="bg-gray-500 bg-opacity-80 px-4 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200">
                        <span
                          role="checkbox"
                          tabIndex={0}
                          aria-checked={allSelected}
                          onClick={toggleAll}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleAll();
                            }
                          }}
                          className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                        >
                          {renderSwitch(allSelected, false)}
                        </span>
                      </th>
                      <th className="bg-gray-500 bg-opacity-80 px-1 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                        {intl.formatMessage(messages.platform)}
                      </th>
                      <th className="bg-gray-500 bg-opacity-80 px-2 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                        {intl.formatMessage(messages.status)}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 bg-gray-600 bg-opacity-50">
                    {platforms.map((p) => {
                      const disabled = isPlatformDisabled(p);
                      const isAvailable =
                        p.mediaStatus === MediaStatus.AVAILABLE;
                      const isRequested = disabled && !isAvailable;
                      const isChecked = selected.includes(p.id);
                      const switchChecked =
                        isAvailable || isRequested || isChecked;

                      return (
                        <tr key={`platform-${p.id}`}>
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-medium leading-5 text-gray-100">
                            <span
                              role="checkbox"
                              tabIndex={0}
                              aria-checked={switchChecked}
                              onClick={() => togglePlatform(p)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  togglePlatform(p);
                                }
                              }}
                              className="inline-flex"
                            >
                              {renderSwitch(switchChecked, disabled)}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-1 py-4 text-sm font-medium leading-5 text-gray-100 md:px-6">
                            {p.name}
                          </td>
                          <td className="whitespace-nowrap px-2 py-4 text-sm leading-5 text-gray-200 md:px-6">
                            {isAvailable ? (
                              <Badge badgeType="success">
                                {intl.formatMessage(messages.available)}
                              </Badge>
                            ) : isRequested ? (
                              <Badge badgeType="warning">
                                {intl.formatMessage(messages.requested)}
                              </Badge>
                            ) : (
                              <Badge>
                                {intl.formatMessage(messages.notrequested)}
                              </Badge>
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
        </div>
      </Modal>
    </Transition>
  );
};

export default GameRequestModal;
