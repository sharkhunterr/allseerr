import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowPathIcon,
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
  'components.Settings.BooksAudiobooks.LibraryServerSettings',
  {
    libraryServers: 'Library Servers',
    addInstance: 'Add Library Server',
    name: 'Name',
    type: 'Type',
    hostname: 'Hostname',
    port: 'Port',
    apiKey: 'API Key',
    ssl: 'SSL',
    scanInterval: 'Scan Interval (seconds)',
    testConnection: 'Test Connection',
    scanNow: 'Scan Now',
    save: 'Save',
    delete: 'Delete',
    noInstances: 'No library servers configured yet.',
    toastSaveSuccess: 'Library server saved!',
    toastScanTriggered: 'Scan triggered.',
  }
);

interface LibraryServerInstance {
  id?: number;
  name: string;
  serviceType: string;
  hostname: string;
  port: number;
  apiKey?: string;
  useSsl: boolean;
  baseUrl?: string;
  mediaTypes: string[];
  isActive: boolean;
  scanIntervalSeconds: number;
  lastScanTimestamp?: number;
}

const LibraryServerSettings = ({
  mediaTypeFilter,
}: {
  mediaTypeFilter?: string;
}) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, mutate } = useSWR<LibraryServerInstance[]>(
    '/api/v1/settings/book/library-servers'
  );
  const [editingInstance, setEditingInstance] =
    useState<LibraryServerInstance | null>(null);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const newInstance = (): LibraryServerInstance => ({
    name: '',
    serviceType: 'audiobookshelf',
    hostname: '',
    port: 8080,
    apiKey: '',
    useSsl: false,
    mediaTypes: [mediaTypeFilter ?? 'book'],
    isActive: true,
    scanIntervalSeconds: 300,
  });

  const saveInstance = async (instance: LibraryServerInstance) => {
    try {
      if (instance.id) {
        await axios.put(
          `/api/v1/settings/book/library-servers/${instance.id}`,
          instance
        );
      } else {
        await axios.post(
          '/api/v1/settings/book/library-servers',
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
      addToast('Failed to save.', {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const triggerScan = async (id: number) => {
    try {
      await axios.post(
        `/api/v1/settings/book/library-servers/${id}/scan`
      );
      addToast(intl.formatMessage(messages.toastScanTriggered), {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast('Scan failed.', {
        appearance: 'error',
        autoDismiss: true,
      });
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
            {inst.lastScanTimestamp && (
              <span className="ml-2 text-xs text-gray-500">
                Last scan:{' '}
                {new Date(inst.lastScanTimestamp * 1000).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {inst.id && (
              <Button
                buttonType="default"
                onClick={() => triggerScan(inst.id!)}
              >
                <ArrowPathIcon className="mr-1 h-4 w-4" />
                {intl.formatMessage(messages.scanNow)}
              </Button>
            )}
            <Button
              buttonType="default"
              onClick={() => setEditingInstance(inst)}
            >
              Edit
            </Button>
            <button
              className="text-gray-400 hover:text-red-400"
              onClick={() =>
                inst.id &&
                axios
                  .delete(
                    `/api/v1/settings/book/library-servers/${inst.id}`
                  )
                  .then(() => mutate())
              }
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
                <option value="audiobookshelf">Audiobookshelf</option>
                <option value="calibre-web">Calibre-Web</option>
                <option value="kavita">Kavita</option>
                <option value="grimmory">Grimmory</option>
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
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.apiKey)}
              </label>
              <input
                type="password"
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.apiKey ?? ''}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    apiKey: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400">
                {intl.formatMessage(messages.scanInterval)}
              </label>
              <input
                type="number"
                min={30}
                className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-white"
                value={editingInstance.scanIntervalSeconds}
                onChange={(e) =>
                  setEditingInstance({
                    ...editingInstance,
                    scanIntervalSeconds: parseInt(e.target.value, 10),
                  })
                }
              />
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
              onClick={async () => {
                setIsTesting(true);
                setTestResult(null);
                try {
                  const res = await axios.post(
                    '/api/v1/settings/book/library-servers/test',
                    editingInstance
                  );
                  setTestResult(res.data);
                } catch {
                  setTestResult({
                    success: false,
                    message: 'Test failed.',
                  });
                } finally {
                  setIsTesting(false);
                }
              }}
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

export default LibraryServerSettings;
