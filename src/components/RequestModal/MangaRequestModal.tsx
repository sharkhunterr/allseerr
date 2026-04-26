import Alert from '@app/components/Common/Alert';
import Modal from '@app/components/Common/Modal';
import RequestAsUserSelect from '@app/components/RequestModal/RequestAsUserSelect';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import axios from 'axios';
import { useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';

const messages = defineMessages('components.RequestModal.MangaRequestModal', {
  requestManga: 'Request Manga',
  requestManhwa: 'Request Manhwa',
  requestManhua: 'Request Manhua',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  alreadyRequested: 'This title has already been requested.',
  autoApprove: 'This request will be approved automatically.',
  manualWorkflow:
    'No download manager is configured. The request will be tracked but won’t be dispatched automatically.',
});

interface MangaRequestModalProps {
  show: boolean;
  anilistId: number;
  malId?: number;
  title: string;
  titleNative?: string;
  coverUrl?: string;
  year?: number;
  format?: string;
  statusAnilist?: string;
  chapters?: number;
  volumes?: number;
  countryOfOrigin?: string;
  authorName?: string;
  onCancel: () => void;
  onComplete: () => void;
}

const MangaRequestModal = ({
  show,
  anilistId,
  malId,
  title,
  titleNative,
  coverUrl,
  year,
  format,
  statusAnilist,
  chapters,
  volumes,
  countryOfOrigin,
  authorName,
  onCancel,
  onComplete,
}: MangaRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);

  // Country-of-origin picks the modal title — same labels as the
  // MangaCard badge.
  const cc = (countryOfOrigin ?? '').toLowerCase();
  const titleMessage =
    cc === 'kr'
      ? messages.requestManhwa
      : cc === 'cn'
        ? messages.requestManhua
        : messages.requestManga;

  const willAutoApprove = hasPermission(
    [
      Permission.MANAGE_REQUESTS,
      Permission.AUTO_APPROVE,
      Permission.AUTO_APPROVE_MANGA,
    ],
    { type: 'or' }
  );

  const requestAsRequiredPermissions = useMemo(
    () => [Permission.REQUEST, Permission.REQUEST_MANGA],
    []
  );

  const submit = async () => {
    setIsSubmitting(true);
    try {
      await axios.post('/api/v1/manga/request', {
        anilistId,
        malId,
        title,
        titleNative,
        coverUrl,
        year,
        format,
        statusAnilist,
        chapters,
        volumes,
        countryOfOrigin,
        authorName,
        userId: requestAsUser?.id,
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
        title={intl.formatMessage(titleMessage)}
        subTitle={title}
        okText={
          isSubmitting
            ? intl.formatMessage(globalMessages.loading)
            : intl.formatMessage(globalMessages.request)
        }
        okDisabled={isSubmitting}
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
        <RequestAsUserSelect
          requiredPermissions={requestAsRequiredPermissions}
          onChange={setRequestAsUser}
        />
      </Modal>
    </Transition>
  );
};

export default MangaRequestModal;
