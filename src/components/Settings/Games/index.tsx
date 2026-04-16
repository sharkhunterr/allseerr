import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
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

const messages = defineMessages('components.Settings.Games', {
  games: 'Games',
  gamesSettings: 'Games Settings',
  gamesDescription:
    'Configure IGDB metadata credentials and ROMM library server connection for game requests.',
  igdbSection: 'IGDB / Twitch API',
  igdbDescription:
    'IGDB requires a Twitch Developer API key for game metadata search.',
  twitchClientId: 'Twitch Client ID',
  twitchClientSecret: 'Twitch Client Secret',
  twitchSecretTip: 'Leave empty to keep the existing secret',
  rommSection: 'ROMM Library Server',
  rommDescription:
    'Connect to your ROMM instance for game availability detection.',
  rommUrl: 'ROMM URL',
  rommUrlTip: 'e.g., http://romm.local:8080',
  rommApiKey: 'API Key or Token',
  rommUsername: 'Username (alternative to API key)',
  rommPassword: 'Password',
  pollInterval: 'Polling Interval (minutes)',
  pollIntervalTip: 'How often to check ROMM for new additions (default: 15)',
  testConnection: 'Test Connection',
  syncNow: 'Sync Now',
  toastSaveSuccess: 'Game settings saved!',
  toastSaveFailed: 'Failed to save game settings.',
  testSuccess: 'Connection successful!',
  testFailed: 'Connection failed.',
});

interface GameSettings {
  igdb: {
    clientId: string;
    clientSecret: string;
    clientSecretSet?: boolean;
  };
  romm: {
    url: string;
    apiKey: string;
    username: string;
    password: string;
    pollIntervalMinutes: number;
    enabled: boolean;
  };
}

const defaultSettings: GameSettings = {
  igdb: { clientId: '', clientSecret: '' },
  romm: {
    url: '',
    apiKey: '',
    username: '',
    password: '',
    pollIntervalMinutes: 15,
    enabled: false,
  },
};

const SettingsGames = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [igdbTestResult, setIgdbTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [rommTestResult, setRommTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTestingIgdb, setIsTestingIgdb] = useState(false);
  const [isTestingRomm, setIsTestingRomm] = useState(false);

  const { data, mutate: revalidate } = useSWR<GameSettings>(
    '/api/v1/settings/game',
    { fallbackData: defaultSettings }
  );

  const testIgdb = async (clientId: string, clientSecret: string) => {
    setIsTestingIgdb(true);
    setIgdbTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/game/igdb/test', {
        clientId,
        clientSecret,
      });
      setIgdbTestResult(res.data);
    } catch {
      setIgdbTestResult({ success: false, message: 'Test failed.' });
    } finally {
      setIsTestingIgdb(false);
    }
  };

  const testRomm = async (url: string, apiKey: string) => {
    setIsTestingRomm(true);
    setRommTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/game/romm/test', {
        url,
        apiKey,
      });
      setRommTestResult(res.data);
    } catch {
      setRommTestResult({ success: false, message: 'Test failed.' });
    } finally {
      setIsTestingRomm(false);
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
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.games),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.gamesSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.gamesDescription)}
        </p>
      </div>

      <Formik
        initialValues={{
          igdbClientId: data?.igdb?.clientId ?? '',
          igdbClientSecret: '',
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
              igdb: {
                clientId: values.igdbClientId,
                clientSecret: values.igdbClientSecret || undefined,
              },
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
            {/* IGDB Section */}
            <div className="mb-8">
              <h4 className="mb-2 text-lg font-bold text-gray-100">
                {intl.formatMessage(messages.igdbSection)}
              </h4>
              <p className="mb-4 text-sm text-gray-400">
                {intl.formatMessage(messages.igdbDescription)}
              </p>

              <div className="form-row">
                <label htmlFor="igdbClientId" className="text-label">
                  {intl.formatMessage(messages.twitchClientId)}
                </label>
                <div className="form-input-area">
                  <Field type="text" id="igdbClientId" name="igdbClientId" />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="igdbClientSecret" className="text-label">
                  {intl.formatMessage(messages.twitchClientSecret)}
                  <span className="label-tip">
                    {intl.formatMessage(messages.twitchSecretTip)}
                  </span>
                </label>
                <div className="form-input-area">
                  <SensitiveInput
                    as="field"
                    type="password"
                    id="igdbClientSecret"
                    name="igdbClientSecret"
                    placeholder={
                      data?.igdb?.clientSecretSet ? '••••••••••••' : ''
                    }
                    autoComplete="new-password"
                  />
                </div>
              </div>

              {igdbTestResult && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded p-3 ${
                    igdbTestResult.success
                      ? 'bg-green-600/20'
                      : 'bg-red-600/20'
                  }`}
                >
                  {igdbTestResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-400" />
                  ) : (
                    <XCircleIcon className="h-5 w-5 text-red-400" />
                  )}
                  <span
                    className={
                      igdbTestResult.success
                        ? 'text-green-300'
                        : 'text-red-300'
                    }
                  >
                    {igdbTestResult.message}
                  </span>
                </div>
              )}

              <div className="mt-3">
                <Button
                  buttonType="default"
                  type="button"
                  disabled={isTestingIgdb || !values.igdbClientId}
                  onClick={() =>
                    testIgdb(values.igdbClientId, values.igdbClientSecret)
                  }
                >
                  <BeakerIcon className="mr-1 h-4 w-4" />
                  {isTestingIgdb ? (
                    <LoadingSpinner />
                  ) : (
                    intl.formatMessage(messages.testConnection)
                  )}
                </Button>
              </div>
            </div>

            {/* ROMM Section */}
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

              {rommTestResult && (
                <div
                  className={`mt-3 flex items-center gap-2 rounded p-3 ${
                    rommTestResult.success
                      ? 'bg-green-600/20'
                      : 'bg-red-600/20'
                  }`}
                >
                  {rommTestResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-400" />
                  ) : (
                    <XCircleIcon className="h-5 w-5 text-red-400" />
                  )}
                  <span
                    className={
                      rommTestResult.success
                        ? 'text-green-300'
                        : 'text-red-300'
                    }
                  >
                    {rommTestResult.message}
                  </span>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <Button
                  buttonType="default"
                  type="button"
                  disabled={isTestingRomm || !values.rommUrl}
                  onClick={() => testRomm(values.rommUrl, values.rommApiKey)}
                >
                  <BeakerIcon className="mr-1 h-4 w-4" />
                  {isTestingRomm ? (
                    <LoadingSpinner />
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

            {/* Save */}
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
    </>
  );
};

export default SettingsGames;
