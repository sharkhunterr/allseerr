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

const messages = defineMessages(
  'components.Settings.BooksAudiobooks.SettingsGrimmory',
  {
    section: 'Grimmory',
    description:
      'Connect to your Grimmory instance to detect book availability.',
    url: 'Grimmory URL',
    urlTip: 'e.g., https://grimmory.example.com',
    publicUrl: 'Public URL',
    publicUrlTip: 'External URL for "Open in Grimmory" links (optional)',
    email: 'Email',
    password: 'Password',
    pollInterval: 'Polling Interval (minutes)',
    syncNow: 'Sync Now',
    toastSaveSuccess: 'Grimmory settings saved!',
    toastSaveFailed: 'Failed to save Grimmory settings.',
  }
);

interface GrimmorySettingsData {
  url: string;
  publicUrl: string;
  email: string;
  password: string;
  passwordSet: boolean;
  pollIntervalMinutes: number;
  enabled: boolean;
}

const SettingsGrimmory = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate: revalidate } = useSWR<GrimmorySettingsData>(
    '/api/v1/settings/grimmory'
  );

  const testConnection = async (
    url: string,
    email: string,
    password: string
  ) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/grimmory/test', {
        url,
        email,
        password,
      });
      setTestResult(res.data);
    } catch {
      setTestResult({ success: false, message: 'Test failed.' });
    } finally {
      setIsTesting(false);
    }
  };

  const syncNow = async () => {
    try {
      await axios.post('/api/v1/settings/grimmory/scan');
      addToast('Scan triggered.', {
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
        url: data?.url ?? '',
        publicUrl: data?.publicUrl ?? '',
        email: data?.email ?? '',
        password: '',
        pollIntervalMinutes: data?.pollIntervalMinutes ?? 15,
        enabled: data?.enabled ?? false,
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/grimmory', {
            url: values.url,
            publicUrl: values.publicUrl,
            email: values.email,
            password: values.password || undefined,
            pollIntervalMinutes: values.pollIntervalMinutes,
            enabled: values.enabled,
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
              {intl.formatMessage(messages.section)}
            </h4>
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.description)}
            </p>

            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                Enable Grimmory
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
                  placeholder="https://grimmory.example.com"
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
                <Field type="text" id="publicUrl" name="publicUrl" />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="email" className="text-label">
                {intl.formatMessage(messages.email)}
              </label>
              <div className="form-input-area">
                <Field type="email" id="email" name="email" />
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
                    placeholder={data?.passwordSet ? '••••••••••••' : ''}
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="pollIntervalMinutes" className="text-label">
                {intl.formatMessage(messages.pollInterval)}
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
                  disabled={
                    isTesting || !values.url || !values.email
                  }
                  onClick={() =>
                    testConnection(
                      values.url,
                      values.email,
                      values.password
                    )
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
                <Button buttonType="default" type="button" onClick={syncNow}>
                  <ArrowPathIcon />
                  <span>{intl.formatMessage(messages.syncNow)}</span>
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

export default SettingsGrimmory;
