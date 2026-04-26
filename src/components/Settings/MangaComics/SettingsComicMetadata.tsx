import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import SensitiveInput from '@app/components/Common/SensitiveInput';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon, BeakerIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.MangaComics.SettingsComicMetadata',
  {
    heading: 'Comic Metadata Providers',
    description:
      'Choose which provider owns comic identity (volumes, issues, creators, publishers). ComicVine is the only viable free primary today; an API key is required (free, request at comicvine.gamespot.com).',
    primarySource: 'Primary source',
    primarySourceHelp:
      'Drives what the search grid shows. ComicVine is the only viable free primary today; the select keeps the option open for later providers.',
    primaryComicVine: 'ComicVine',
    comicvine: 'ComicVine',
    comicvineHelp:
      'Free REST metadata service (comicvine.gamespot.com). Requires an API key — throttled at 200 requests / hour per resource type.',
    apiKey: 'ComicVine API key',
    apiKeyHelp:
      'Generate one at comicvine.gamespot.com/api/. Stored encrypted; sent only when you change the value.',
    hideAdult: 'Hide adult titles',
    hideAdultHelp:
      'Drops volumes whose tags / publisher heuristics flag them as mature. ComicVine has no dedicated isAdult flag, so the filter is heuristic.',
    test: 'Test',
    testing: 'Testing…',
    testSuccess: 'Test OK: {message}',
    testFailure: 'Test failed: {message}',
    saved: 'Comic metadata provider settings saved.',
    saveFailed: 'Failed to save comic metadata provider settings.',
  }
);

interface ComicProvidersConfig {
  primarySource: 'comicvine';
  comicvine: boolean;
  apiKey: string;
  hideAdult: boolean;
}

const SettingsComicMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testing, setTesting] = useState(false);

  const { data, error, mutate } = useSWR<ComicProvidersConfig>(
    '/api/v1/settings/comic/metadata-providers'
  );

  if (!data && !error) return <LoadingSpinner />;

  const initial: ComicProvidersConfig = data ?? {
    primarySource: 'comicvine',
    comicvine: false,
    apiKey: '',
    hideAdult: true,
  };

  const runTest = async (apiKey: string) => {
    setTesting(true);
    try {
      const resp = await axios.post<{ success: boolean; message: string }>(
        '/api/v1/settings/comic/metadata-providers/test',
        { provider: 'comicvine', apiKey: apiKey || undefined }
      );
      addToast(
        intl.formatMessage(
          resp.data.success ? messages.testSuccess : messages.testFailure,
          { message: resp.data.message }
        ),
        {
          appearance: resp.data.success ? 'success' : 'error',
          autoDismiss: true,
        }
      );
    } catch (e) {
      let message = e instanceof Error ? e.message : String(e);
      if (axios.isAxiosError(e) && e.response?.data) {
        const responseData = e.response.data as { message?: string };
        if (responseData.message) message = responseData.message;
      }
      addToast(intl.formatMessage(messages.testFailure, { message }), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.heading)}</h3>
        <p className="description">
          {intl.formatMessage(messages.description)}
        </p>
      </div>
      <div className="section">
        <Formik
          initialValues={initial}
          enableReinitialize
          onSubmit={async (values) => {
            try {
              await axios.put('/api/v1/settings/comic/metadata-providers', {
                primarySource: values.primarySource,
                comicvine: values.comicvine,
                apiKey: values.apiKey || undefined,
                hideAdult: values.hideAdult,
              });
              await mutate();
              addToast(intl.formatMessage(messages.saved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch (e) {
              let message = intl.formatMessage(messages.saveFailed);
              if (axios.isAxiosError(e) && e.response?.data) {
                const responseData = e.response.data as { message?: string };
                if (responseData.message)
                  message = `${message}: ${responseData.message}`;
              }
              addToast(message, { appearance: 'error', autoDismiss: true });
            }
          }}
        >
          {({ isSubmitting, values, setFieldValue }) => (
            <Form>
              <div className="form-row">
                <label htmlFor="primarySource" className="text-label">
                  <span>{intl.formatMessage(messages.primarySource)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.primarySourceHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <div className="form-input-field">
                    <Field as="select" id="primarySource" name="primarySource">
                      <option value="comicvine">
                        {intl.formatMessage(messages.primaryComicVine)}
                      </option>
                    </Field>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="comicvine" className="checkbox-label">
                  <span>{intl.formatMessage(messages.comicvine)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.comicvineHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="comicvine"
                    name="comicvine"
                    onChange={() =>
                      setFieldValue('comicvine', !values.comicvine)
                    }
                  />
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="apiKey" className="text-label">
                  <span>{intl.formatMessage(messages.apiKey)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.apiKeyHelp)}
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
              {values.comicvine && (
                <div className="form-row">
                  <label className="text-label" />
                  <div className="form-input-area">
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        buttonType="warning"
                        disabled={testing}
                        onClick={() => runTest(values.apiKey)}
                      >
                        <BeakerIcon />
                        <span>
                          {testing
                            ? intl.formatMessage(messages.testing)
                            : intl.formatMessage(messages.test)}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <label htmlFor="hideAdult" className="checkbox-label">
                  <span>{intl.formatMessage(messages.hideAdult)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.hideAdultHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="hideAdult"
                    name="hideAdult"
                    onChange={() =>
                      setFieldValue('hideAdult', !values.hideAdult)
                    }
                  />
                </div>
              </div>

              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting}
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
      </div>
    </>
  );
};

export default SettingsComicMetadata;
