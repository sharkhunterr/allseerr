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

const messages = defineMessages('components.RequestModal.ComicRequestModal', {
  requestComic: 'Request Comic',
  requestSuccess: 'Request submitted successfully!',
  requestFailed: 'Failed to submit request.',
  alreadyRequested: 'This comic has already been requested.',
  autoApprove: 'This request will be approved automatically.',
  manualWorkflow:
    'No download manager is configured. The request will be tracked but won’t be dispatched automatically.',
});

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
  onCancel,
  onComplete,
}: ComicRequestModalProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { hasPermission } = useUser();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requestAsUser, setRequestAsUser] = useState<User | null>(null);

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

  const submit = async () => {
    setIsSubmitting(true);
    try {
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

export default ComicRequestModal;
