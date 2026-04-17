import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import {
  BeakerIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.BooksAudiobooks.DownloadManagerSettings',
  {
    downloadManagers: 'Download Managers',
    addInstance: 'Add Download Manager',
    name: 'Name',
    type: 'Type',
    hostname: 'Hostname',
    port: 'Port',
    apiKey: 'API Key',
    ssl: 'SSL',
    mediaTypes: 'Media Types',
    fallback: 'Fallback',
    testConnection: 'Test Connection',
    save: 'Save',
    delete: 'Delete',
    noInstances: 'No download managers configured yet.',
    toastSaveSuccess: 'Download manager saved!',
    toastSaveFailed: 'Failed to save download manager.',
    toastDeleteSuccess: 'Download manager removed.',
    toastTestSuccess: 'Connection successful!',
    toastTestFailed: 'Connection failed.',
  }
);

interface DownloadManagerInstance {
  id?: number;
  name: string;
  serviceType: string;
  hostname: string;
  port: number;
  apiKey: string;
  useSsl: boolean;
  baseUrl?: string;
  mediaTypes: string[];
  isFallback: boolean;
  isActive: boolean;
}

const DownloadManagerSettings = ({
  mediaTypeFilter,
}: {
  mediaTypeFilter?: string;
}) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, mutate } = useSWR<DownloadManagerInstance[]>(
    '/api/v1/settings/book/download-managers'
  );
  const [editingInstance, setEditingInstance] =
    useState<DownloadManagerInstance | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const newInstance = (): DownloadManagerInstance => ({
    name: '',
    serviceType: 'bindery',
    hostname: '',
    port: 8787,
    apiKey: '',
    useSsl: false,
    mediaTypes: [mediaTypeFilter ?? 'book'],
    isFallback: false,
    isActive: true,
  });

  const saveInstance = async (instance: DownloadManagerInstance) => {
    try {
      if (instance.id) {
        await axios.put(
          `/api/v1/settings/book/download-managers/${instance.id}`,
          instance
        );
      } else {
        await axios.post(
          '/api/v1/settings/book/download-managers',
          instance
        );
      }
      addToast(intl.formatMessage(messages.toastSaveSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      setEditingInstance(null);
      mutate();
    } catch {
      addToast(intl.formatMessage(messages.toastSaveFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const deleteInstance = async (id: number) => {
    try {
      await axios.delete(
        `/api/v1/settings/book/download-managers/${id}`
      );
      addToast(intl.formatMessage(messages.toastDeleteSuccess), {
        appearance: 'success',
        autoDismiss: true,
      });
      mutate();
    } catch {
      addToast('Failed to delete.', {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const testConnection = async (instance: DownloadManagerInstance) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post(
        '/api/v1/settings/book/download-managers/test',
        instance
      );
      setTestResult(res.data);
    } catch (e) {
      setTestResult({
        success: false,
        message:
          (e as { response?: { data?: { message?: string } } }).response
            ?.data?.message ?? 'Test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (!data) return <LoadingSpinner />;

  const filtered = mediaTypeFilter
    ? data.filter((d) => d.mediaTypes.includes(mediaTypeFilter))
    : data;

  return (
    <div>
      {filtered.length === 0 && !editingInstance && (
        <p className="mb-4 text-gray-400">
          {intl.formatMessage(messages.noInstances)}
        </p>
      )}

      {filtered.map((inst) => (
        <div
          key={inst.id}
          className="mb-3 flex items-center justify-between rounded-lg bg-gray-800 p-4"
        >
          <div>
            <span className="font-medium text-white">{inst.name}</span>
            <span className="ml-2 text-sm text-gray-400">
              ({inst.serviceType}) — {inst.hostname}:{inst.port}
            </span>
            {inst.isFallback && (
              <span className="ml-2 rounded bg-yellow-600 px-2 py-0.5 text-xs text-white">
                Fallback
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              buttonType="default"
              onClick={() => setEditingInstance(inst)}
            >
              Edit
            </Button>
            <button
              className="text-gray-400 hover:text-red-400"
              onClick={() => inst.id && deleteInstance(inst.id)}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}

      {editingInstance ? (
        <div className="mt-4 rounded-lg bg-gray-800 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.name)}
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.name}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    name: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.type)}
              </label>
              <select
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.serviceType}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    serviceType: e.target.value,
                  })
                }
              >
                <option value="bindery">Bindery</option>
                <option value="readarr">Readarr</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.hostname)}
              </label>
              <input
                type="text"
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.hostname}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    hostname: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.port)}
              </label>
              <input
                type="number"
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.port}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    port: parseInt(e.target.value, 10),
                  })
                }
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.apiKey)}
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.apiKey}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    apiKey: e.target.value,
                  })
                }
              />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={editingInstance.useSsl}
                  onChange={(e) =>
                    setEditingInstance({
                      ...editingInstance,
                      useSsl: e.target.checked,
                    })
                  }
                />
                {intl.formatMessage(messages.ssl)}
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-400">
                <input
                  type="checkbox"
                  checked={editingInstance.isFallback}
                  onChange={(e) =>
                    setEditingInstance({
                      ...editingInstance,
                      isFallback: e.target.checked,
                    })
                  }
                />
                {intl.formatMessage(messages.fallback)}
              </label>
            </div>
          </div>

          {testResult && (
            <div
              className={`mt-4 flex items-center gap-2 rounded p-3 ${
                testResult.success ? 'bg-green-600/20' : 'bg-red-600/20'
              }`}
            >
              {testResult.success ? (
                <CheckCircleIcon className="h-5 w-5 text-green-400" />
              ) : (
                <XCircleIcon className="h-5 w-5 text-red-400" />
              )}
              <span
                className={
                  testResult.success ? 'text-green-300' : 'text-red-300'
                }
              >
                {testResult.message}
              </span>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button
              buttonType="default"
              onClick={() => testConnection(editingInstance)}
              disabled={isTesting}
            >
              <BeakerIcon className="mr-1 h-4 w-4" />
              {isTesting ? (
                <LoadingSpinner />
              ) : (
                intl.formatMessage(messages.testConnection)
              )}
            </Button>
            <Button
              buttonType="default"
              onClick={() => {
                setEditingInstance(null);
                setTestResult(null);
              }}
            >
              Cancel
            </Button>
            <Button
              buttonType="primary"
              onClick={() => saveInstance(editingInstance)}
            >
              {intl.formatMessage(messages.save)}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          buttonType="primary"
          className="mt-4"
          onClick={() => setEditingInstance(newInstance())}
        >
          <PlusIcon className="mr-1 h-4 w-4" />
          {intl.formatMessage(messages.addInstance)}
        </Button>
      )}
    </div>
  );
};

export default DownloadManagerSettings;
