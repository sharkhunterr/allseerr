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

const messages = defineMessages('components.Settings.Games.Igdb', {
  igdbSection: 'IGDB / Twitch API',
  igdbDescription:
    'IGDB requires a Twitch Developer API key for game metadata search.',
  twitchClientId: 'Twitch Client ID',
  twitchClientSecret: 'Twitch Client Secret',
  twitchSecretTip: 'Leave empty to keep the existing secret',
  testConnection: 'Test Connection',
  toastSaveSuccess: 'IGDB settings saved!',
  toastSaveFailed: 'Failed to save IGDB settings.',
});

interface IgdbSettings {
  igdb: {
    clientId: string;
    clientSecret: string;
    clientSecretSet?: boolean;
  };
}

const SettingsIgdb = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const { data, mutate: revalidate } = useSWR<IgdbSettings>(
    '/api/v1/settings/game',
    {
      fallbackData: {
        igdb: { clientId: '', clientSecret: '' },
      },
    }
  );

  const testIgdb = async (clientId: string, clientSecret: string) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await axios.post('/api/v1/settings/game/igdb/test', {
        clientId,
        clientSecret,
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
        igdbClientId: data?.igdb?.clientId ?? '',
        igdbClientSecret: '',
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/game', {
            igdb: {
              clientId: values.igdbClientId,
              clientSecret: values.igdbClientSecret || undefined,
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
                <div className="form-input-field">
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
                  disabled={isTesting || !values.igdbClientId}
                  onClick={() =>
                    testIgdb(values.igdbClientId, values.igdbClientSecret)
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

export default SettingsIgdb;
