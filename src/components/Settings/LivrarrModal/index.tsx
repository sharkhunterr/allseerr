/**
 * Settings modal for adding / editing a Livrarr server instance.
 *
 * Slimmer than BookshelfModal: Livrarr has no per-instance
 * quality / metadata profile pickers (it resolves both from its
 * own config) and no root-folder selector on dispatch (the root
 * folder is configured inside Livrarr's own UI), so the form is
 * just connection details + mediaType + isDefault + an "enable
 * search" toggle that maps to ``preventSearch`` on the
 * settings shape (mirrors Bookshelf).
 *
 * Same chrome (Formik + Yup, Test button + Save) as BookshelfModal
 * so operators get a consistent UX between download managers.
 */

import Modal from '@app/components/Common/Modal';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { isValidURL } from '@app/utils/urlValidationHelper';
import { Transition } from '@headlessui/react';
import type { LivrarrSettings } from '@server/lib/settings';
import axios from 'axios';
import { Field, Formik } from 'formik';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import * as Yup from 'yup';

interface LivrarrTestResponse {
  status: Record<string, unknown>;
  rootFolders: { id: number; path: string }[];
}

const messages = defineMessages('components.Settings.LivrarrModal', {
  createlivrarr: 'Add New Livrarr Server',
  editlivrarr: 'Edit Livrarr Server',
  validationNameRequired: 'You must provide a server name',
  validationHostnameRequired: 'You must provide a valid hostname or IP address',
  validationPortRequired: 'You must provide a valid port number',
  validationApiKeyRequired: 'You must provide an API key',
  validationMediaTypeRequired: 'You must select a media type',
  toastLivrarrTestSuccess: 'Livrarr connection established successfully!',
  toastLivrarrTestFailure: 'Failed to connect to Livrarr.',
  add: 'Add Server',
  defaultserver: 'Default Server',
  servername: 'Server Name',
  hostname: 'Hostname or IP Address',
  port: 'Port',
  ssl: 'Use SSL',
  apiKey: 'API Key',
  apiKeyHelp:
    'Find it in Livrarr: Profile → Regenerate API Key (top-right menu).',
  baseUrl: 'URL Base',
  baseUrlHelp:
    'If Livrarr is served behind a reverse proxy at a subpath (e.g. /livrarr), enter it here. Leave blank otherwise.',
  externalUrl: 'External URL',
  externalUrlHelp:
    'Public URL of your Livrarr instance — used for direct deep-links from the request page.',
  mediaType: 'Media Type',
  mediaTypeHelp:
    'Choose whether this Livrarr instance handles books or audiobooks. Only one default per type is allowed.',
  mediaTypeBook: 'Books',
  mediaTypeAudiobook: 'Audiobooks',
  enableSearch: 'Enable Automatic Search',
  enableSearchHelp:
    'Trigger Livrarr to start searching for the work as soon as a request is approved.',
  rootFolderInfo: 'Detected root folders in this Livrarr instance:',
  noRootFolders:
    'No root folders configured in Livrarr yet — add one inside Livrarr before sending requests.',
  validationApplicationUrl: 'You must provide a valid URL',
  validationApplicationUrlTrailingSlash: 'URL must not end in a trailing slash',
  validationBaseUrlLeadingSlash: 'URL base must have a leading slash',
  validationBaseUrlTrailingSlash: 'URL base must not end in a trailing slash',
});

interface LivrarrModalProps {
  livrarr: LivrarrSettings | null;
  defaultMediaType?: 'book' | 'audiobook';
  onClose: () => void;
  onSave: () => void;
}

const LivrarrModal = ({
  onClose,
  livrarr,
  defaultMediaType = 'book',
  onSave,
}: LivrarrModalProps) => {
  const intl = useIntl();
  const initialLoad = useRef(false);
  const { addToast } = useToasts();
  const [isValidated, setIsValidated] = useState(livrarr ? true : false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResponse, setTestResponse] = useState<LivrarrTestResponse>({
    status: {},
    rootFolders: [],
  });

  const LivrarrSettingsSchema = Yup.object().shape({
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
    mediaType: Yup.string()
      .oneOf(['book', 'audiobook'])
      .required(intl.formatMessage(messages.validationMediaTypeRequired)),
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
        const response = await axios.post<LivrarrTestResponse>(
          '/api/v1/settings/livrarr/test',
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
          addToast(intl.formatMessage(messages.toastLivrarrTestSuccess), {
            appearance: 'success',
            autoDismiss: true,
          });
        }
      } catch {
        setIsValidated(false);
        if (initialLoad.current) {
          addToast(intl.formatMessage(messages.toastLivrarrTestFailure), {
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
    if (livrarr) {
      testConnection({
        apiKey: livrarr.apiKey,
        hostname: livrarr.hostname,
        port: livrarr.port,
        baseUrl: livrarr.baseUrl,
        useSsl: livrarr.useSsl,
      });
    }
  }, [livrarr, testConnection]);

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
          name: livrarr?.name ?? '',
          hostname: livrarr?.hostname ?? '',
          // Livrarr's docker-compose default port — operator can override.
          port: livrarr?.port ?? 8789,
          ssl: livrarr?.useSsl ?? false,
          apiKey: livrarr?.apiKey ?? '',
          baseUrl: livrarr?.baseUrl ?? '',
          mediaType: livrarr?.mediaType ?? defaultMediaType,
          isDefault: livrarr?.isDefault ?? false,
          externalUrl: livrarr?.externalUrl ?? '',
          enableSearch: !livrarr?.preventSearch,
        }}
        validationSchema={LivrarrSettingsSchema}
        onSubmit={async (values) => {
          try {
            const submission: Omit<LivrarrSettings, 'id'> & { id?: number } = {
              name: values.name,
              hostname: values.hostname,
              port: Number(values.port),
              apiKey: values.apiKey,
              useSsl: values.ssl,
              baseUrl: values.baseUrl,
              mediaType: values.mediaType as 'book' | 'audiobook',
              isDefault: values.isDefault,
              externalUrl: values.externalUrl,
              preventSearch: !values.enableSearch,
            };
            if (!livrarr) {
              await axios.post('/api/v1/settings/livrarr', submission);
            } else {
              await axios.put(
                `/api/v1/settings/livrarr/${livrarr.id}`,
                submission
              );
            }
            onSave();
          } catch {
            // surfaced through global toast handler
          }
        }}
      >
        {({
          errors,
          touched,
          values,
          handleSubmit,
          isSubmitting,
          isValid,
        }) => {
          return (
            <Modal
              onCancel={onClose}
              okButtonType="primary"
              okText={
                isSubmitting
                  ? intl.formatMessage(globalMessages.saving)
                  : livrarr
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
                !livrarr
                  ? intl.formatMessage(messages.createlivrarr)
                  : intl.formatMessage(messages.editlivrarr)
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
                  <label htmlFor="mediaType" className="text-label">
                    {intl.formatMessage(messages.mediaType)}
                    <span className="label-required">*</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.mediaTypeHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field as="select" id="mediaType" name="mediaType">
                        <option value="book">
                          {intl.formatMessage(messages.mediaTypeBook)}
                        </option>
                        <option value="audiobook">
                          {intl.formatMessage(messages.mediaTypeAudiobook)}
                        </option>
                      </Field>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="name" className="text-label">
                    {intl.formatMessage(messages.servername)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="name"
                        name="name"
                        type="text"
                        placeholder="My Livrarr"
                      />
                    </div>
                    {errors.name && touched.name && (
                      <div className="error">{errors.name}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="hostname" className="text-label">
                    {intl.formatMessage(messages.hostname)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="hostname"
                        name="hostname"
                        type="text"
                        placeholder="livrarr.example.com or 192.168.1.10"
                      />
                    </div>
                    {errors.hostname && touched.hostname && (
                      <div className="error">{errors.hostname}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="port" className="text-label">
                    {intl.formatMessage(messages.port)}
                    <span className="label-required">*</span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="port"
                        name="port"
                        type="text"
                        placeholder="8789"
                      />
                    </div>
                    {errors.port && touched.port && (
                      <div className="error">{errors.port}</div>
                    )}
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
                    <span className="label-tip">
                      {intl.formatMessage(messages.apiKeyHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SensitiveInput
                        as="field"
                        id="apiKey"
                        name="apiKey"
                        autoComplete="one-time-code"
                      />
                    </div>
                    {errors.apiKey && touched.apiKey && (
                      <div className="error">{errors.apiKey}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="baseUrl" className="text-label">
                    {intl.formatMessage(messages.baseUrl)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.baseUrlHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="baseUrl"
                        name="baseUrl"
                        type="text"
                        placeholder="/livrarr"
                      />
                    </div>
                    {errors.baseUrl && touched.baseUrl && (
                      <div className="error">{errors.baseUrl}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="externalUrl" className="text-label">
                    {intl.formatMessage(messages.externalUrl)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.externalUrlHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        id="externalUrl"
                        name="externalUrl"
                        type="text"
                        placeholder="https://livrarr.example.com"
                      />
                    </div>
                    {errors.externalUrl && touched.externalUrl && (
                      <div className="error">{errors.externalUrl}</div>
                    )}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="enableSearch" className="checkbox-label">
                    {intl.formatMessage(messages.enableSearch)}
                    <span className="label-tip">
                      {intl.formatMessage(messages.enableSearchHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="enableSearch"
                      name="enableSearch"
                    />
                  </div>
                </div>
                {/* Informational only — root folders are managed inside
                    Livrarr itself, not here. Surfacing the list helps the
                    operator confirm Livrarr is properly set up before
                    they make this instance the default. */}
                {isValidated && testResponse.rootFolders.length > 0 && (
                  <div className="form-row">
                    <label className="text-label">
                      {intl.formatMessage(messages.rootFolderInfo)}
                    </label>
                    <div className="form-input-area">
                      <ul className="list-disc pl-5 text-sm text-gray-300">
                        {testResponse.rootFolders.map((f) => (
                          <li key={`livrarr-root-${f.id}`}>{f.path}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
                {isValidated && testResponse.rootFolders.length === 0 && (
                  <div className="form-row">
                    <div className="form-input-area">
                      <p className="text-sm text-yellow-400">
                        {intl.formatMessage(messages.noRootFolders)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Modal>
          );
        }}
      </Formik>
    </Transition>
  );
};

export default LivrarrModal;
