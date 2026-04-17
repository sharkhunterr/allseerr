import Spinner from '@app/assets/spinner.svg';
import Button from '@app/components/Common/Button';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  ArrowPathIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.Games.Romm', {
  rommSection: 'ROMM Library Server',
  rommDescription:
    'Connect to your ROMM instance for game availability detection.',
  rommUrl: 'ROMM URL',
  rommUrlTip: 'e.g., http://romm.local:8080',
  rommApiKey: 'API Key or Token',
  pollInterval: 'Polling Interval (minutes)',
  pollIntervalTip: 'How often to check ROMM for new additions (default: 15)',
  testConnection: 'Test Connection',
  syncNow: 'Sync Now',
  toastSaveSuccess: 'ROMM settings saved!',
  toastSaveFailed: 'Failed to save ROMM settings.',
});

interface RommSettings {
  romm: {
    url: string;
    apiKey: string;
    username: string;
    password: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
}

const SettingsRomm = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate: revalidate } = useSWR<RommSettings>(
    '/api/v1/settings/game',
    {
      fallbackData: {
        romm: {
          url: '',
          apiKey: '',
          username: '',
          password: '',
          pollIntervalMinutes: 15,
          enabled: false,
        },
      },
    }
  );

  const testRomm = async (url: string, apiKey: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/game/romm/test', {
        url,
        apiKey,
      });
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: 'Test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const syncRomm = async () => {
    try {
      await axios.post('/api/v1/settings/game/romm/scan');
      addToast('ROMM scan triggered.', {
        appearance: 'success',
        autoDismiss: true,
      });
    } catch {
      addToast('Scan failed.', { appearance: 'error', autoDismiss: true });
    }
  };

  return (
    <Formik
      initialValues={{
        rommUrl: data?.romm?.url ?? '',
        rommApiKey: data?.romm?.apiKey ?? '',
        rommUsername: data?.romm?.username ?? '',
        rommPassword: '',
        rommPollInterval: data?.romm?.pollIntervalMinutes ?? 15,
        rommEnabled: data?.romm?.enabled ?? false,
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/game', {
            romm: {
              url: values.rommUrl,
              apiKey: values.rommApiKey,
              username: values.rommUsername,
              password: values.rommPassword || undefined,
              pollIntervalMinutes: values.rommPollInterval,
              enabled: values.rommEnabled,
            },
          });
          addToast(intl.formatMessage(messages.toastSaveSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
          revalidate();
        } catch {
          addToast(intl.formatMessage(messages.toastSaveFailed), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      }}
    >
      {({ values, isSubmitting }) => (
        <Form className="section">
          <div className="mb-8">
            <h4 className="mb-2 text-lg font-bold text-gray-100">
              {intl.formatMessage(messages.rommSection)}
            </h4>
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.rommDescription)}
            </p>

            <div className="form-row">
              <label htmlFor="rommEnabled" className="checkbox-label">
                Enable ROMM
              </label>
              <div className="form-input-area">
                <Field
                  type="checkbox"
                  id="rommEnabled"
                  name="rommEnabled"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="rommUrl" className="text-label">
                {intl.formatMessage(messages.rommUrl)}
                <span className="label-tip">
                  {intl.formatMessage(messages.rommUrlTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="rommUrl"
                  name="rommUrl"
                  placeholder="http://romm.local:8080"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="rommApiKey" className="text-label">
                {intl.formatMessage(messages.rommApiKey)}
              </label>
              <div className="form-input-area">
                <SensitiveInput
                  as="field"
                  type="password"
                  id="rommApiKey"
                  name="rommApiKey"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="rommPollInterval" className="text-label">
                {intl.formatMessage(messages.pollInterval)}
                <span className="label-tip">
                  {intl.formatMessage(messages.pollIntervalTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="number"
                  id="rommPollInterval"
                  name="rommPollInterval"
                  min={1}
                />
              </div>
            </div>

            {testResult && (
              <div
                className={`mt-3 flex items-center gap-2 rounded p-3 ${
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

            <div className="mt-3 flex gap-2">
              <Button
                buttonType="default"
                type="button"
                disabled={isTesting || !values.rommUrl}
                onClick={() => testRomm(values.rommUrl, values.rommApiKey)}
              >
                <BeakerIcon className="mr-1 h-4 w-4" />
                {isTesting ? (
                  <Spinner />
                ) : (
                  intl.formatMessage(messages.testConnection)
                )}
              </Button>
              <Button
                buttonType="default"
                type="button"
                onClick={syncRomm}
              >
                <ArrowPathIcon className="mr-1 h-4 w-4" />
                {intl.formatMessage(messages.syncNow)}
              </Button>
            </div>
          </div>

          <div className="actions">
            <div className="flex justify-end">
              <Button
                buttonType="primary"
                type="submit"
                disabled={isSubmitting}
              >
                <ArrowDownOnSquareIcon className="mr-1 h-5 w-5" />
                {intl.formatMessage(globalMessages.save)}
              </Button>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
};

export default SettingsRomm;
