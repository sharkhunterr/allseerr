import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  ArrowDownOnSquareIcon,
  BeakerIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';
import type { OidcSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';
import * as Yup from 'yup';
import OidcGroupMappingEditor from './OidcGroupMappingEditor';

const messages = defineMessages('components.Settings.SettingsOidc', {
  oidc: 'OIDC',
  oidcSettings: 'OIDC Settings',
  oidcSettingsDescription:
    'Configure OpenID Connect for single sign-on with your identity provider.',
  enabled: 'Enable OIDC',
  issuerUrl: 'Issuer URL',
  issuerUrlTip:
    'The OIDC issuer URL (e.g., https://auth.example.com/application/o/allseerr/)',
  clientId: 'Client ID',
  clientSecret: 'Client Secret',
  clientSecretTip: 'Leave empty to keep the existing secret',
  displayName: 'Provider Display Name',
  displayNameTip: 'Name shown on the login button (e.g., "Authentik")',
  autoCreateUsers: 'Auto-create Users',
  autoCreateUsersTip:
    'Automatically create a new account when a user logs in via OIDC for the first time',
  groupClaimName: 'Group Claim Name',
  groupClaimNameTip:
    'The OIDC claim that contains group membership (default: "groups")',
  defaultPermissions: 'Default Permission Level',
  defaultPermissionsTip:
    'Permission level for OIDC users not matching any group mapping',
  testConnection: 'Test Connection',
  testSuccess: 'Successfully connected to OIDC provider!',
  testFailed: 'Connection test failed: {message}',
  toastSettingsSuccess: 'OIDC settings saved successfully!',
  toastSettingsFailure: 'Something went wrong while saving OIDC settings.',
  validationIssuerUrl: 'Issuer URL is required when OIDC is enabled',
  validationClientId: 'Client ID is required when OIDC is enabled',
  validationIssuerUrlFormat:
    'Issuer URL must start with http:// or https://',
});

interface OidcSettingsResponse extends Omit<OidcSettings, 'clientSecret'> {
  clientSecretSet: boolean;
}

const SettingsOidc = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testResult, setTestResult] = useState<{
    status: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<OidcSettingsResponse>('/api/v1/settings/oidc');

  const OidcSettingsSchema = Yup.object().shape({
    enabled: Yup.boolean(),
    issuerUrl: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema
          .required(intl.formatMessage(messages.validationIssuerUrl))
          .matches(
            /^https?:\/\//,
            intl.formatMessage(messages.validationIssuerUrlFormat)
          ),
    }),
    clientId: Yup.string().when('enabled', {
      is: true,
      then: (schema) =>
        schema.required(intl.formatMessage(messages.validationClientId)),
    }),
    clientSecret: Yup.string(),
    displayName: Yup.string(),
    autoCreateUsers: Yup.boolean(),
    groupClaimName: Yup.string(),
    defaultPermissions: Yup.number().integer(),
  });

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  const testOidcConnection = async (values: {
    issuerUrl: string;
    clientId: string;
    clientSecret: string;
  }) => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const response = await axios.post('/api/v1/settings/oidc/test', {
        issuerUrl: values.issuerUrl,
        clientId: values.clientId,
        clientSecret: values.clientSecret || undefined,
      });
      setTestResult({
        status: 'success',
        message: response.data.message,
      });
    } catch (e) {
      setTestResult({
        status: 'error',
        message:
          e.response?.data?.message || 'Connection test failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.oidc),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.oidcSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.oidcSettingsDescription)}
        </p>
      </div>
      <Formik
        initialValues={{
          enabled: data?.enabled ?? false,
          issuerUrl: data?.issuerUrl ?? '',
          clientId: data?.clientId ?? '',
          clientSecret: '',
          displayName: data?.displayName ?? 'OIDC',
          autoCreateUsers: data?.autoCreateUsers ?? true,
          groupClaimName: data?.groupClaimName ?? 'groups',
          defaultPermissions: data?.defaultPermissions ?? 32,
          groupMappings: data?.groupMappings ?? [],
        }}
        validationSchema={OidcSettingsSchema}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.put('/api/v1/settings/oidc', values);
            addToast(intl.formatMessage(messages.toastSettingsSuccess), {
              appearance: 'success',
              autoDismiss: true,
            });
            revalidate();
          } catch {
            addToast(intl.formatMessage(messages.toastSettingsFailure), {
              appearance: 'error',
              autoDismiss: true,
            });
          }
        }}
      >
        {({ errors, touched, values, isSubmitting, setFieldValue }) => (
          <Form className="section">
            <div className="form-row">
              <label htmlFor="enabled" className="checkbox-label">
                {intl.formatMessage(messages.enabled)}
              </label>
              <div className="form-input-area">
                <Field type="checkbox" id="enabled" name="enabled" />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="issuerUrl" className="text-label">
                {intl.formatMessage(messages.issuerUrl)}
                <span className="label-tip">
                  {intl.formatMessage(messages.issuerUrlTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="issuerUrl"
                  name="issuerUrl"
                  placeholder="https://auth.example.com/application/o/allseerr/"
                />
                {errors.issuerUrl &&
                  touched.issuerUrl && (
                    <div className="error">{errors.issuerUrl}</div>
                  )}
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="clientId" className="text-label">
                {intl.formatMessage(messages.clientId)}
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="clientId"
                  name="clientId"
                />
                {errors.clientId &&
                  touched.clientId && (
                    <div className="error">{errors.clientId}</div>
                  )}
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="clientSecret" className="text-label">
                {intl.formatMessage(messages.clientSecret)}
                <span className="label-tip">
                  {intl.formatMessage(messages.clientSecretTip)}
                </span>
              </label>
              <div className="form-input-area">
                <SensitiveInput
                  as="field"
                  type="password"
                  id="clientSecret"
                  name="clientSecret"
                  placeholder={
                    data?.clientSecretSet ? '••••••••••••' : ''
                  }
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="displayName" className="text-label">
                {intl.formatMessage(messages.displayName)}
                <span className="label-tip">
                  {intl.formatMessage(messages.displayNameTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="displayName"
                  name="displayName"
                  placeholder="OIDC"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="autoCreateUsers" className="checkbox-label">
                {intl.formatMessage(messages.autoCreateUsers)}
                <span className="label-tip">
                  {intl.formatMessage(messages.autoCreateUsersTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="checkbox"
                  id="autoCreateUsers"
                  name="autoCreateUsers"
                />
              </div>
            </div>

            <div className="form-row">
              <label htmlFor="groupClaimName" className="text-label">
                {intl.formatMessage(messages.groupClaimName)}
                <span className="label-tip">
                  {intl.formatMessage(messages.groupClaimNameTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field
                  type="text"
                  id="groupClaimName"
                  name="groupClaimName"
                  placeholder="groups"
                />
              </div>
            </div>

            <OidcGroupMappingEditor
              groupMappings={values.groupMappings}
              onChange={(mappings) =>
                setFieldValue('groupMappings', mappings)
              }
            />

            {/* Test Connection */}
            {testResult && (
              <div
                className={`mt-4 rounded-md p-4 ${
                  testResult.status === 'success'
                    ? 'bg-green-600/20'
                    : 'bg-red-600/20'
                }`}
              >
                <div className="flex">
                  <div className="flex-shrink-0">
                    {testResult.status === 'success' ? (
                      <CheckCircleIcon className="h-5 w-5 text-green-400" />
                    ) : (
                      <XCircleIcon className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                  <div className="ml-3">
                    <p
                      className={`text-sm ${
                        testResult.status === 'success'
                          ? 'text-green-300'
                          : 'text-red-300'
                      }`}
                    >
                      {testResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="actions">
              <div className="flex justify-end space-x-2">
                <Button
                  buttonType="default"
                  type="button"
                  disabled={isTesting || !values.issuerUrl || !values.clientId}
                  onClick={() =>
                    testOidcConnection({
                      issuerUrl: values.issuerUrl,
                      clientId: values.clientId,
                      clientSecret: values.clientSecret,
                    })
                  }
                >
                  <BeakerIcon className="mr-1 h-5 w-5" />
                  {isTesting ? (
                    <LoadingSpinner />
                  ) : (
                    intl.formatMessage(messages.testConnection)
                  )}
                </Button>
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

export default SettingsOidc;
