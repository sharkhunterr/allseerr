/**
 * Settings modal for adding / editing a Pressarr server
 * instance. Mirrors BookshelfModal's chrome — Pressarr exposes
 * quality profiles + root folders the same way the *arr family
 * does, so the operator picks them from dropdowns after the
 * Test button validates the connection.
 *
 * mediaType is fixed to ``magazine`` (Pressarr only handles
 * periodicals — no per-instance media-type choice).
 */

import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { PressarrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import * as Yup from 'yup';

interface PressarrTestResponse {
  profiles: { id: number; name: string }[];
  rootFolders: { id: number; path: string }[];
  urlBase?: string;
}

const messages = defineMessages('components.Settings.PressarrModal', {
  createpressarr: 'Add New Pressarr Server',
  editpressarr: 'Edit Pressarr Server',
  validationNameRequired: 'You must provide a server name',
  validationHostnameRequired: 'You must provide a valid hostname or IP address',
  validationPortRequired: 'You must provide a valid port number',
  validationApiKeyRequired: 'You must provide an API key',
  validationRootFolderRequired: 'You must select a root folder',
  validationProfileRequired: 'You must select a quality profile',
  toastPressarrTestSuccess: 'Pressarr connection established successfully!',
  toastPressarrTestFailure: 'Failed to connect to Pressarr.',
  add: 'Add Server',
  defaultserver: 'Default Server',
  servername: 'Server Name',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  apiKeyHelp: 'Find it in Pressarr: Settings → General → API Key',
  baseUrl: 'URL Base',
  baseUrlHelp:
    'If Pressarr is served behind a reverse proxy at a subpath (e.g. /pressarr), enter it here. Leave blank otherwise.',
  externalUrl: 'External URL',
  externalUrlHelp:
    'Public URL of your Pressarr instance — used for deep links from request details.',
  qualityprofile: 'Quality Profile',
  rootfolder: 'Root Folder',
  selectQualityProfile: 'Select quality profile',
  selectRootFolder: 'Select root folder',
  loadingprofiles: 'Loading quality profiles…',
  testFirstQualityProfiles: 'Test connection to load quality profiles',
  loadingrootfolders: 'Loading root folders…',
  testFirstRootFolders: 'Test connection to load root folders',
  enableSearch: 'Enable Automatic Search',
  enableSearchHelp:
    'Trigger Pressarr to start searching for missing issues as soon as the magazine is added.',
  validationApplicationUrl: 'You must provide a valid URL',
  validationApplicationUrlTrailingSlash: 'URL must not end in a trailing slash',
  validationBaseUrlLeadingSlash: 'URL base must have a leading slash',
  validationBaseUrlTrailingSlash: 'URL base must not end in a trailing slash',
});

interface PressarrModalProps {
  pressarr: PressarrSettings | null;
  onClose: () => void;
  onSave: () => void;
}

const PressarrModal = ({ onClose, pressarr, onSave }: PressarrModalProps) => {
  const intl = useIntl();
  const initialLoad = useRef(false);
  const { addToast } = useToasts();
  const [isValidated, setIsValidated] = useState(pressarr ? true : false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<PressarrTestResponse>({
    profiles: [],
    rootFolders: [],
  });

  const PressarrSettingsSchema = Yup.object().shape({
    name: Yup.string().required(
      intl.formatMessage(messages.validationNameRequired)
    ),
    hostname: Yup.string().required(
      intl.formatMessage(messages.validationHostnameRequired)
    ),
    port: Yup.number()
      .nullable()
      .required(intl.formatMessage(messages.validationPortRequired)),
    apiKey: Yup.string().required(
      intl.formatMessage(messages.validationApiKeyRequired)
    ),
    rootFolder: Yup.string().required(
      intl.formatMessage(messages.validationRootFolderRequired)
    ),
    activeProfileId: Yup.string().required(
      intl.formatMessage(messages.validationProfileRequired)
    ),
    externalUrl: Yup.string()
      .test(
        'valid-url',
        intl.formatMessage(messages.validationApplicationUrl),
        isValidURL
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationApplicationUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
    baseUrl: Yup.string()
      .test(
        'leading-slash',
        intl.formatMessage(messages.validationBaseUrlLeadingSlash),
        (value) => !value || value.startsWith('/')
      )
      .test(
        'no-trailing-slash',
        intl.formatMessage(messages.validationBaseUrlTrailingSlash),
        (value) => !value || !value.endsWith('/')
      ),
  });

  const testConnection = useCallback(
    async ({
      hostname,
      port,
      apiKey,
      baseUrl,
      useSsl = false,
    }: {
      hostname: string;
      port: number;
      apiKey: string;
      baseUrl?: string;
      useSsl?: boolean;
    }) => {
      setIsTesting(true);
      try {
        const response = await axios.post<PressarrTestResponse>(
          '/api/v1/settings/pressarr/test',
          {
            hostname,
            apiKey,
            port: Number(port),
            baseUrl,
            useSsl,
          }
        );
        setIsValidated(true);
        setTestResponse(response.data);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastPressarrTestSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
      } catch {
        setIsValidated(false);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastPressarrTestFailure), {
            appearance: 'error',
            autoDismiss: true,
          });
        }
      } finally {
        setIsTesting(false);
        initialLoad.current = true;
      }
    },
    [addToast, intl]
  );

  useEffect(() => {
    if (pressarr) {
      testConnection({
        apiKey: pressarr.apiKey,
        hostname: pressarr.hostname,
        port: pressarr.port,
        baseUrl: pressarr.baseUrl,
        useSsl: pressarr.useSsl,
      });
    }
  }, [pressarr, testConnection]);

  return (
    <Transition
      as="div"
      appear
      show
      enter="transition-opacity ease-in-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="transition-opacity ease-in-out duration-300"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <Formik
        initialValues={{
          name: pressarr?.name ?? '',
          hostname: pressarr?.hostname ?? '',
          // Pressarr's docker-compose default port (per its Dockerfile EXPOSE).
          port: pressarr?.port ?? 8585,
          ssl: pressarr?.useSsl ?? false,
          apiKey: pressarr?.apiKey ?? '',
          baseUrl: pressarr?.baseUrl ?? '',
          activeProfileId: pressarr?.activeProfileId,
          rootFolder: pressarr?.activeDirectory,
          isDefault: pressarr?.isDefault ?? false,
          externalUrl: pressarr?.externalUrl ?? '',
          enableSearch: !pressarr?.preventSearch,
        }}
        validationSchema={PressarrSettingsSchema}
        onSubmit={async (values) => {
          try {
            const profileName = testResponse.profiles.find(
              (p) => p.id === Number(values.activeProfileId)
            )?.name;
            const submission = {
              name: values.name,
              hostname: values.hostname,
              port: Number(values.port),
              apiKey: values.apiKey,
              useSsl: values.ssl,
              baseUrl: values.baseUrl,
              activeProfileId: Number(values.activeProfileId),
              activeProfileName: profileName,
              activeDirectory: values.rootFolder,
              mediaType: 'magazine' as const,
              isDefault: values.isDefault,
              externalUrl: values.externalUrl,
              preventSearch: !values.enableSearch,
            };
            if (!pressarr) {
              await axios.post('/api/v1/settings/pressarr', submission);
            } else {
              await axios.put(
                `/api/v1/settings/pressarr/${pressarr.id}`,
                submission
              );
            }
            onSave();
          } catch {
            // surfaced via global toast handler
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          handleSubmit,
          setFieldValue,
          isSubmitting,
          isValid,
        }) => (
          <Modal
            onCancel={onClose}
            okButtonType="primary"
            okText={
              isSubmitting
                ? intl.formatMessage(globalMessages.saving)
                : pressarr
                  ? intl.formatMessage(globalMessages.save)
                  : intl.formatMessage(messages.add)
            }
            secondaryButtonType="warning"
            secondaryText={
              isTesting
                ? intl.formatMessage(globalMessages.testing)
                : intl.formatMessage(globalMessages.test)
            }
            onSecondary={() => {
              if (values.apiKey && values.hostname && values.port) {
                testConnection({
                  apiKey: values.apiKey,
                  baseUrl: values.baseUrl,
                  hostname: values.hostname,
                  port: values.port,
                  useSsl: values.ssl,
                });
                if (!values.baseUrl || values.baseUrl === '/') {
                  setFieldValue('baseUrl', testResponse.urlBase);
                }
              }
            }}
            secondaryDisabled={
              !values.apiKey ||
              !values.hostname ||
              !values.port ||
              isTesting ||
              isSubmitting
            }
            okDisabled={!isValidated || isSubmitting || isTesting || !isValid}
            onOk={() => handleSubmit()}
            title={
              !pressarr
                ? intl.formatMessage(messages.createpressarr)
                : intl.formatMessage(messages.editpressarr)
            }
          >
            <div className="mb-6">
              <div className="form-row">
                <label htmlFor="isDefault" className="checkbox-label">
                  {intl.formatMessage(messages.defaultserver)}
                </label>
                <div className="form-input-area">
                  <Field type="checkbox" id="isDefault" name="isDefault" />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="name" className="text-label">
                  {intl.formatMessage(messages.servername)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="name" name="name" type="text" placeholder="Pressarr" />
                  </div>
                  {errors.name && touched.name && <div className="error">{errors.name}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="hostname" className="text-label">
                  {intl.formatMessage(messages.hostname)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="hostname" name="hostname" type="text" placeholder="pressarr.local" />
                  </div>
                  {errors.hostname && touched.hostname && <div className="error">{errors.hostname}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="port" className="text-label">
                  {intl.formatMessage(messages.port)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="port" name="port" type="text" placeholder="8585" />
                  </div>
                  {errors.port && touched.port && <div className="error">{errors.port}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="ssl" className="checkbox-label">
                  {intl.formatMessage(messages.ssl)}
                </label>
                <div className="form-input-area">
                  <Field type="checkbox" id="ssl" name="ssl" />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="apiKey" className="text-label">
                  {intl.formatMessage(messages.apiKey)}
                  <span className="label-required">*</span>
                  <span className="label-tip">{intl.formatMessage(messages.apiKeyHelp)}</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <SensitiveInput as="field" id="apiKey" name="apiKey" autoComplete="one-time-code" />
                  </div>
                  {errors.apiKey && touched.apiKey && <div className="error">{errors.apiKey}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="baseUrl" className="text-label">
                  {intl.formatMessage(messages.baseUrl)}
                  <span className="label-tip">{intl.formatMessage(messages.baseUrlHelp)}</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="baseUrl" name="baseUrl" type="text" placeholder="/pressarr" />
                  </div>
                  {errors.baseUrl && touched.baseUrl && <div className="error">{errors.baseUrl}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="externalUrl" className="text-label">
                  {intl.formatMessage(messages.externalUrl)}
                  <span className="label-tip">{intl.formatMessage(messages.externalUrlHelp)}</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field id="externalUrl" name="externalUrl" type="text" placeholder="https://pressarr.example.com" />
                  </div>
                  {errors.externalUrl && touched.externalUrl && <div className="error">{errors.externalUrl}</div>}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="activeProfileId" className="text-label">
                  {intl.formatMessage(messages.qualityprofile)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="activeProfileId" name="activeProfileId" disabled={!isValidated || isTesting}>
                      <option value="">
                        {isTesting
                          ? intl.formatMessage(messages.loadingprofiles)
                          : !isValidated
                            ? intl.formatMessage(messages.testFirstQualityProfiles)
                            : intl.formatMessage(messages.selectQualityProfile)}
                      </option>
                      {testResponse.profiles.map((p) => (
                        <option key={`profile-${p.id}`} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Field>
                  </div>
                  {errors.activeProfileId && touched.activeProfileId && (
                    <div className="error">{errors.activeProfileId}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="rootFolder" className="text-label">
                  {intl.formatMessage(messages.rootfolder)}
                  <span className="label-required">*</span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="rootFolder" name="rootFolder" disabled={!isValidated || isTesting}>
                      <option value="">
                        {isTesting
                          ? intl.formatMessage(messages.loadingrootfolders)
                          : !isValidated
                            ? intl.formatMessage(messages.testFirstRootFolders)
                            : intl.formatMessage(messages.selectRootFolder)}
                      </option>
                      {testResponse.rootFolders.map((f) => (
                        <option key={`root-${f.id}`} value={f.path}>
                          {f.path}
                        </option>
                      ))}
                    </Field>
                  </div>
                  {errors.rootFolder && touched.rootFolder && (
                    <div className="error">{errors.rootFolder}</div>
                  )}
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="enableSearch" className="checkbox-label">
                  {intl.formatMessage(messages.enableSearch)}
                  <span className="label-tip">{intl.formatMessage(messages.enableSearchHelp)}</span>
                </label>
                <div className="form-input-area">
                  <Field type="checkbox" id="enableSearch" name="enableSearch" />
                </div>
              </div>
            </div>
          </Modal>
        )}
      </Formik>
    </Transition>
  );
};

export default PressarrModal;
