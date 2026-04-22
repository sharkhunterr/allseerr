import Alert from '@app/components/Common/Alert';
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
  'components.Settings.BooksAudiobooks.SettingsAudiobookMetadata',
  {
    heading: 'Audiobook Metadata Providers',
    description:
      "Choose which provider owns audiobook identity (titles, covers, narrators, series). Audible is the default because it has the widest free catalogue. Hardcover adds richer ratings / tags and multi-language audio editions but still relies on an ASIN to route through the audiobook detail page, so results without an ASIN silently fall back to Audible.",
    primarySource: 'Primary source',
    primarySourceHelp:
      'Drives what the search grid shows. Audible: Audible Catalog API, keyed on ASIN. Hardcover: aggregated metadata service with per-language audio editions; requires Hardcover enabled + API key on the Book Metadata tab.',
    primaryAudible: 'Audible',
    primaryHardcover: 'Hardcover',
    primaryHardcoverUnavailable:
      'Hardcover primary requires Hardcover enabled below AND an API token configured on the Book Metadata tab.',
    audible: 'Audible',
    audibleHelp:
      "Audible's public Catalog API — free and unauthenticated, covers most commercial audiobook releases.",
    hardcover: 'Hardcover',
    hardcoverHelp:
      'Free GraphQL metadata service (hardcover.app). Uses a single account shared with Book Metadata — editing the token here updates both tabs.',
    hardcoverApiKey: 'Hardcover API token',
    hardcoverApiKeyHelp:
      'Shared with the Book Metadata tab. Get a token from your Hardcover account settings page.',
    audibleRegion: 'Audible region',
    audibleRegionHelp:
      'Storefront the Audible API will query. Pick the region that matches your library — ASINs differ per region, so a mis-match will silently return no results.',
    preferredLanguage: 'Preferred language',
    preferredLanguageHelp:
      'Filters audio editions to the selected ISO-639-1 language (passed to Hardcover as an editions-level where clause). Has no effect on Audible because each region only returns one language.',
    languagePolicy: 'Language policy',
    languagePolicyHelp:
      '"Prefer": non-matching-language editions are still returned (ordered after the preferred ones). "Strict": drop audio editions that are not in the preferred language.',
    langAny: 'No preference',
    langPrefer: 'Prefer',
    langStrict: 'Strict',
    test: 'Test',
    testing: 'Testing…',
    testSuccess: 'Test OK: {message}',
    testFailure: 'Test failed: {message}',
    saved: 'Audiobook metadata provider settings saved.',
    saveFailed: 'Failed to save audiobook metadata provider settings.',
  }
);

const AUDIBLE_REGIONS = [
  { value: 'us', label: 'United States (.com)' },
  { value: 'uk', label: 'United Kingdom (.co.uk)' },
  { value: 'ca', label: 'Canada (.ca)' },
  { value: 'au', label: 'Australia (.com.au)' },
  { value: 'fr', label: 'France (.fr)' },
  { value: 'de', label: 'Germany (.de)' },
  { value: 'it', label: 'Italy (.it)' },
  { value: 'es', label: 'Spain (.es)' },
  { value: 'jp', label: 'Japan (.co.jp)' },
  { value: 'in', label: 'India (.in)' },
  { value: 'br', label: 'Brazil (.com.br)' },
];

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'langAny' },
  { value: 'en', label: 'English (en)' },
  { value: 'fr', label: 'Français (fr)' },
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'es', label: 'Español (es)' },
  { value: 'it', label: 'Italiano (it)' },
  { value: 'pt', label: 'Português (pt)' },
  { value: 'nl', label: 'Nederlands (nl)' },
  { value: 'ja', label: '日本語 (ja)' },
  { value: 'zh', label: '中文 (zh)' },
  { value: 'ru', label: 'Русский (ru)' },
  { value: 'pl', label: 'Polski (pl)' },
  { value: 'sv', label: 'Svenska (sv)' },
];

interface AudiobookProvidersConfig {
  primarySource: 'audible' | 'hardcover';
  audible: boolean;
  audibleRegion?: string;
  hardcover: boolean;
  // Populated read-only from the book-side key so the UI can decide
  // whether to enable the Hardcover primary option.
  hardcoverApiKey?: string;
  preferredLanguage: string;
  languagePolicy: 'prefer' | 'strict';
}

const SettingsAudiobookMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testing, setTesting] = useState<string | null>(null);

  const { data, error, mutate } = useSWR<AudiobookProvidersConfig>(
    '/api/v1/settings/audiobook/metadata-providers'
  );

  if (!data && !error) return <LoadingSpinner />;

  const initial: AudiobookProvidersConfig = data ?? {
    primarySource: 'audible',
    audible: true,
    audibleRegion: 'us',
    hardcover: false,
    hardcoverApiKey: '',
    preferredLanguage: '',
    languagePolicy: 'prefer',
  };

  const runTest = async (
    provider: 'audible' | 'hardcover',
    opts: { audibleRegion?: string; apiKey?: string } = {}
  ) => {
    setTesting(provider);
    try {
      const resp = await axios.post<{ success: boolean; message: string }>(
        '/api/v1/settings/audiobook/metadata-providers/test',
        { provider, ...opts }
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
      // Surface the backend error message when available — a bare
      // "Failed" toast is useless for debugging.
      let message = e instanceof Error ? e.message : String(e);
      if (axios.isAxiosError(e) && e.response?.data) {
        const data = e.response.data as { message?: string };
        if (data.message) message = data.message;
      }
      addToast(intl.formatMessage(messages.testFailure, { message }), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setTesting(null);
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
              // Hardcover API key is shared with the Book Metadata tab,
              // but we send it through so the user can edit it from
              // either place — the server write-through keeps them in
              // sync on book.metadataProviders.hardcoverApiKey.
              await axios.put(
                '/api/v1/settings/audiobook/metadata-providers',
                values
              );
              await mutate();
              addToast(intl.formatMessage(messages.saved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch (e) {
              let message = intl.formatMessage(messages.saveFailed);
              if (axios.isAxiosError(e) && e.response?.data) {
                const data = e.response.data as { message?: string };
                if (data.message) message = `${message}: ${data.message}`;
              }
              addToast(message, { appearance: 'error', autoDismiss: true });
            }
          }}
        >
          {({ isSubmitting, values, setFieldValue }) => {
            const hardcoverReady =
              values.hardcover && !!values.hardcoverApiKey;
            return (
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
                      <Field
                        as="select"
                        id="primarySource"
                        name="primarySource"
                      >
                        <option value="audible">
                          {intl.formatMessage(messages.primaryAudible)}
                        </option>
                        <option
                          value="hardcover"
                          disabled={!hardcoverReady}
                        >
                          {intl.formatMessage(messages.primaryHardcover)}
                        </option>
                      </Field>
                    </div>
                    {values.primarySource === 'hardcover' && !hardcoverReady && (
                      <Alert
                        title={intl.formatMessage(
                          messages.primaryHardcoverUnavailable
                        )}
                        type="warning"
                      />
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <label htmlFor="audible" className="checkbox-label">
                    <span>{intl.formatMessage(messages.audible)}</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.audibleHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="audible"
                      name="audible"
                      onChange={() =>
                        setFieldValue('audible', !values.audible)
                      }
                    />
                  </div>
                </div>
                {values.audible && (
                  <div className="form-row">
                    <label htmlFor="audibleRegion" className="text-label">
                      <span>{intl.formatMessage(messages.audibleRegion)}</span>
                      <span className="label-tip">
                        {intl.formatMessage(messages.audibleRegionHelp)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <Field
                          as="select"
                          id="audibleRegion"
                          name="audibleRegion"
                        >
                          {AUDIBLE_REGIONS.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Field>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          buttonType="warning"
                          disabled={testing === 'audible'}
                          onClick={() =>
                            runTest('audible', {
                              audibleRegion: values.audibleRegion,
                            })
                          }
                        >
                          <BeakerIcon />
                          <span>
                            {testing === 'audible'
                              ? intl.formatMessage(messages.testing)
                              : intl.formatMessage(messages.test)}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <label htmlFor="hardcover" className="checkbox-label">
                    <span>{intl.formatMessage(messages.hardcover)}</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.hardcoverHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field
                      type="checkbox"
                      id="hardcover"
                      name="hardcover"
                      onChange={() =>
                        setFieldValue('hardcover', !values.hardcover)
                      }
                    />
                  </div>
                </div>
                {values.hardcover && (
                  <div className="form-row">
                    <label htmlFor="hardcoverApiKey" className="text-label">
                      <span>
                        {intl.formatMessage(messages.hardcoverApiKey)}
                      </span>
                      <span className="label-tip">
                        {intl.formatMessage(messages.hardcoverApiKeyHelp)}
                      </span>
                    </label>
                    <div className="form-input-area">
                      <div className="form-input-field">
                        <SensitiveInput
                          as="field"
                          id="hardcoverApiKey"
                          name="hardcoverApiKey"
                        />
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Button
                          type="button"
                          buttonType="warning"
                          disabled={
                            testing === 'hardcover' || !values.hardcoverApiKey
                          }
                          onClick={() =>
                            runTest('hardcover', {
                              apiKey: values.hardcoverApiKey,
                            })
                          }
                        >
                          <BeakerIcon />
                          <span>
                            {testing === 'hardcover'
                              ? intl.formatMessage(messages.testing)
                              : intl.formatMessage(messages.test)}
                          </span>
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="form-row">
                  <label htmlFor="preferredLanguage" className="text-label">
                    <span>
                      {intl.formatMessage(messages.preferredLanguage)}
                    </span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.preferredLanguageHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        as="select"
                        id="preferredLanguage"
                        name="preferredLanguage"
                      >
                        {LANGUAGE_OPTIONS.map((opt) => (
                          <option key={opt.value || 'any'} value={opt.value}>
                            {opt.value === ''
                              ? intl.formatMessage(messages.langAny)
                              : opt.label}
                          </option>
                        ))}
                      </Field>
                    </div>
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="languagePolicy" className="text-label">
                    <span>{intl.formatMessage(messages.languagePolicy)}</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages.languagePolicyHelp)}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <Field
                        as="select"
                        id="languagePolicy"
                        name="languagePolicy"
                        disabled={!values.preferredLanguage}
                      >
                        <option value="prefer">
                          {intl.formatMessage(messages.langPrefer)}
                        </option>
                        <option value="strict">
                          {intl.formatMessage(messages.langStrict)}
                        </option>
                      </Field>
                    </div>
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
            );
          }}
        </Formik>
      </div>
    </>
  );
};

export default SettingsAudiobookMetadata;
