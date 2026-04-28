import Button from '@app/components/Common/Button';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages('components.Settings.MangaComics.Mylar', {
  section: 'Mylar3 Download Manager',
  description:
    'Optional. When configured, approved comic requests are added to your Mylar3 series list and Mylar starts monitoring + downloading new issues. Leave disabled for the manual workflow.',
  enabled: 'Enable Mylar3',
  url: 'Mylar3 URL',
  urlTip: 'e.g., http://mylar.local:8090',
  publicUrl: 'Public URL',
  publicUrlTip: 'External URL exposed to users (optional)',
  apiKey: 'API key',
  apiKeyTip: 'Find your API key in Mylar → Settings → Web Interface. Required.',
  pollInterval: 'Polling interval (minutes)',
  pollIntervalTip: 'How often to refresh issue availability (default 15)',
  saved: 'Mylar settings saved.',
  saveFailed: 'Failed to save Mylar settings.',
});

interface MylarSettings {
  url: string;
  publicUrl: string;
  apiKey: string;
  pollIntervalMinutes: number;
  enabled: boolean;
}

const SettingsMylar = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate: revalidate } = useSWR<MylarSettings>(
    '/api/v1/settings/comic/mylar',
    {
      fallbackData: {
        url: '',
        publicUrl: '',
        apiKey: '',
        pollIntervalMinutes: 15,
        enabled: false,
      },
    }
  );

  const test = async (values: { url: string; apiKey: string }) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/comic/mylar/test', {
        url: values.url,
        apiKey: values.apiKey,
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
        apiKey: '',
        pollIntervalMinutes: data?.pollIntervalMinutes ?? 15,
        enabled: data?.enabled ?? false,
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/comic/mylar', {
            url: values.url,
            publicUrl: values.publicUrl,
            apiKey: values.apiKey || undefined,
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
                  placeholder="http://mylar.local:8090"
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
                  placeholder="https://mylar.example.com"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="apiKey" className="text-label">
                {intl.formatMessage(messages.apiKey)}
                <span className="label-tip">
                  {intl.formatMessage(messages.apiKeyTip)}
                </span>
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
                  disabled={isTesting || !values.url || !values.apiKey}
                  onClick={() =>
                    test({ url: values.url, apiKey: values.apiKey })
                  }
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

export default SettingsMylar;
