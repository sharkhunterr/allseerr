import Button from '@app/components/Common/Button';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.MangaComics.Suwayomi', {
  section: 'Suwayomi (Tachidesk) Download Manager',
  description:
    'Optional. When configured, approved manga requests are added to your Suwayomi library and chapters are downloaded automatically. Leave disabled for the manual workflow.',
  enabled: 'Enable Suwayomi',
  url: 'Suwayomi URL',
  urlTip: 'e.g., http://suwayomi.local:4567',
  publicUrl: 'Public URL',
  publicUrlTip: 'External URL exposed to users (optional)',
  apiKey: 'API key (optional)',
  username: 'Username (optional)',
  password: 'Password (optional, leave blank to keep current)',
  pollInterval: 'Polling interval (minutes)',
  pollIntervalTip: 'How often to refresh chapter availability (default 15)',
  saved: 'Suwayomi settings saved.',
  saveFailed: 'Failed to save Suwayomi settings.',
});

interface SuwayomiSettings {
  url: string;
  publicUrl: string;
  apiKey: string;
  username: string;
  password: string;
  pollIntervalMinutes: number;
  enabled: boolean;
}

const SettingsSuwayomi = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    version?: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate: revalidate } = useSWR<SuwayomiSettings>(
    '/api/v1/settings/manga/suwayomi',
    {
      fallbackData: {
        url: '',
        publicUrl: '',
        apiKey: '',
        username: '',
        password: '',
        pollIntervalMinutes: 15,
        enabled: false,
      },
    }
  );

  const test = async (values: {
    url: string;
    apiKey: string;
    username: string;
    password: string;
  }) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/manga/suwayomi/test', {
        url: values.url,
        apiKey: values.apiKey || undefined,
        username: values.username || undefined,
        password: values.password || undefined,
      });
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: 'Test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Formik
      initialValues={{
        url: data?.url ?? '',
        publicUrl: data?.publicUrl ?? '',
        apiKey: data?.apiKey ?? '',
        username: data?.username ?? '',
        password: '',
        pollIntervalMinutes: data?.pollIntervalMinutes ?? 15,
        enabled: data?.enabled ?? false,
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/manga/suwayomi', {
            url: values.url,
            publicUrl: values.publicUrl,
            apiKey: values.apiKey,
            username: values.username,
            password: values.password || undefined,
            pollIntervalMinutes: Number(values.pollIntervalMinutes),
            enabled: values.enabled,
          });
          addToast(intl.formatMessage(messages.saved), {
            appearance: 'success',
            autoDismiss: true,
          });
          revalidate();
        } catch {
          addToast(intl.formatMessage(messages.saveFailed), {
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
              {intl.formatMessage(messages.section)}
            </h4>
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.description)}
            </p>

            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                {intl.formatMessage(messages.enabled)}
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="enabled" name="enabled" />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="url" className="text-label">
                {intl.formatMessage(messages.url)}
                <span className="label-tip">
                  {intl.formatMessage(messages.urlTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="url"
                  name="url"
                  placeholder="http://suwayomi.local:4567"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="publicUrl" className="text-label">
                {intl.formatMessage(messages.publicUrl)}
                <span className="label-tip">
                  {intl.formatMessage(messages.publicUrlTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="publicUrl"
                  name="publicUrl"
                  placeholder="https://suwayomi.example.com"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="apiKey" className="text-label">
                {intl.formatMessage(messages.apiKey)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    as="field"
                    type="password"
                    id="apiKey"
                    name="apiKey"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="username" className="text-label">
                {intl.formatMessage(messages.username)}
              </label>
              <div className="form-input-area">
                <Field type="text" id="username" name="username" />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="password" className="text-label">
                {intl.formatMessage(messages.password)}
              </label>
              <div className="form-input-area">
                <div className="form-input-field">
                  <SensitiveInput
                    as="field"
                    type="password"
                    id="password"
                    name="password"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="pollIntervalMinutes" className="text-label">
                {intl.formatMessage(messages.pollInterval)}
                <span className="label-tip">
                  {intl.formatMessage(messages.pollIntervalTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  inputMode="numeric"
                  id="pollIntervalMinutes"
                  name="pollIntervalMinutes"
                  className="short"
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
          </div>

          <div className="actions">
            <div className="flex justify-end">
              <span className="ml-3 inline-flex rounded-md shadow-sm">
                <Button
                  buttonType="warning"
                  type="button"
                  disabled={isTesting || !values.url}
                  onClick={() => test(values)}
                >
                  <BeakerIcon />
                  <span>
                    {isTesting
                      ? intl.formatMessage(globalMessages.testing)
                      : intl.formatMessage(globalMessages.test)}
                  </span>
                </Button>
              </span>
              <span className="ml-3 inline-flex rounded-md shadow-sm">
                <Button
                  buttonType="primary"
                  type="submit"
                  disabled={isSubmitting || isTesting}
                >
                  <ArrowDownOnSquareIcon />
                  <span>
                    {isSubmitting
                      ? intl.formatMessage(globalMessages.saving)
                      : intl.formatMessage(globalMessages.save)}
                  </span>
                </Button>
              </span>
            </div>
          </div>
        </Form>
      )}
    </Formik>
  );
};

export default SettingsSuwayomi;
