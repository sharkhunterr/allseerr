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
  'components.Settings.BooksAudiobooks.SettingsBookMetadata',
  {
    heading: 'Book Metadata Providers',
    description:
      'OpenLibrary is always used as the base source. Enable additional providers to enrich and widen search results (different languages, canonical editions, etc.).',
    bindery: 'Bindery',
    binderyHelp:
      'Use your configured Bindery instance as a metadata source. Bindery already aggregates OpenLibrary, Google Books, Hardcover and DNB; results use foreignBookIds that Bindery recognizes (fewer request failures).',
    binderyNotConfigured:
      'No default Bindery instance is configured. Add one in Services → Books first.',
    bookshelf: 'Bookshelf',
    bookshelfHelp:
      'Enrich book detail with rating, genres, language, page count and series info from your configured Bookshelf instance.',
    bookshelfNotConfigured:
      'No default Bookshelf instance is configured. Add one in Services → Books first.',
    googleBooks: 'Google Books',
    googleBooksHelp:
      'Add results from the Google Books catalogue. An API key is optional (unauthenticated calls are rate-limited).',
    googleBooksApiKey: 'Google Books API key (optional)',
    hardcover: 'Hardcover',
    hardcoverHelp:
      'Free GraphQL book API (hardcover.app). Provides ratings, genres, and series data. Get an API token from your Hardcover account settings.',
    hardcoverApiKey: 'Hardcover API token',
    test: 'Test',
    testing: 'Testing…',
    testSuccess: 'Test OK: {message}',
    testFailure: 'Test failed: {message}',
    saved: 'Book metadata provider settings saved.',
    saveFailed: 'Failed to save book metadata provider settings.',
  }
);

interface MetadataProvidersConfig {
  bindery: boolean;
  bookshelf: boolean;
  googleBooks: boolean;
  googleBooksApiKey?: string;
  hardcover: boolean;
  hardcoverApiKey?: string;
}

const SettingsBookMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testing, setTesting] = useState<string | null>(null);

  const runTest = async (
    provider: 'hardcover' | 'googleBooks',
    apiKey?: string
  ) => {
    setTesting(provider);
    try {
      const resp = await axios.post<{ success: boolean; message: string }>(
        '/api/v1/settings/book/metadata-providers/test',
        { provider, apiKey }
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
      addToast(
        intl.formatMessage(messages.testFailure, {
          message: e instanceof Error ? e.message : String(e),
        }),
        { appearance: 'error', autoDismiss: true }
      );
    } finally {
      setTesting(null);
    }
  };
  const { data: binderyInstances } = useSWR<
    { mediaType?: string; isDefault?: boolean }[]
  >('/api/v1/settings/bindery');
  const binderyConfigured =
    Array.isArray(binderyInstances) &&
    binderyInstances.some((b) => b.mediaType === 'book' && b.isDefault);
  const { data: bookshelfInstances } = useSWR<
    { mediaType?: string; isDefault?: boolean }[]
  >('/api/v1/settings/bookshelf');
  const bookshelfConfigured =
    Array.isArray(bookshelfInstances) &&
    bookshelfInstances.some((b) => b.mediaType === 'book' && b.isDefault);

  const { data, error, mutate } = useSWR<MetadataProvidersConfig>(
    '/api/v1/settings/book/metadata-providers'
  );

  if (!data && !error) return <LoadingSpinner />;

  const initial: MetadataProvidersConfig = data ?? {
    bindery: false,
    bookshelf: false,
    googleBooks: false,
    googleBooksApiKey: '',
    hardcover: false,
    hardcoverApiKey: '',
  };

  return (
    <>
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.heading)}</h3>
        <p className="description">{intl.formatMessage(messages.description)}</p>
      </div>
      <div className="section">
        <Formik
          initialValues={initial}
          enableReinitialize
          onSubmit={async (values) => {
            try {
              await axios.put(
                '/api/v1/settings/book/metadata-providers',
                values
              );
              await mutate();
              addToast(intl.formatMessage(messages.saved), {
                appearance: 'success',
                autoDismiss: true,
              });
            } catch {
              addToast(intl.formatMessage(messages.saveFailed), {
                appearance: 'error',
                autoDismiss: true,
              });
            }
          }}
        >
          {({ isSubmitting, values, setFieldValue }) => (
            <Form>
              {!binderyConfigured && values.bindery && (
                <Alert
                  title={intl.formatMessage(messages.binderyNotConfigured)}
                  type="warning"
                />
              )}
              <div className="form-row">
                <label htmlFor="bindery" className="checkbox-label">
                  <span>{intl.formatMessage(messages.bindery)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.binderyHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="bindery"
                    name="bindery"
                    // Only block ENABLING when no instance exists —
                    // always allow disabling so users can clear an
                    // obsolete toggle after removing the service.
                    disabled={!binderyConfigured && !values.bindery}
                    onChange={() =>
                      setFieldValue('bindery', !values.bindery)
                    }
                  />
                </div>
              </div>
              {!bookshelfConfigured && values.bookshelf && (
                <Alert
                  title={intl.formatMessage(messages.bookshelfNotConfigured)}
                  type="warning"
                />
              )}
              <div className="form-row">
                <label htmlFor="bookshelf" className="checkbox-label">
                  <span>{intl.formatMessage(messages.bookshelf)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.bookshelfHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="bookshelf"
                    name="bookshelf"
                    disabled={!bookshelfConfigured && !values.bookshelf}
                    onChange={() =>
                      setFieldValue('bookshelf', !values.bookshelf)
                    }
                  />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="googleBooks" className="checkbox-label">
                  <span>{intl.formatMessage(messages.googleBooks)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.googleBooksHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="googleBooks"
                    name="googleBooks"
                    onChange={() =>
                      setFieldValue('googleBooks', !values.googleBooks)
                    }
                  />
                </div>
              </div>
              {values.googleBooks && (
                <div className="form-row">
                  <label
                    htmlFor="googleBooksApiKey"
                    className="text-label"
                  >
                    {intl.formatMessage(messages.googleBooksApiKey)}
                  </label>
                  <div className="form-input-area">
                    <div className="form-input-field">
                      <SensitiveInput
                        as="field"
                        id="googleBooksApiKey"
                        name="googleBooksApiKey"
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        buttonType="warning"
                        disabled={testing === 'googleBooks'}
                        onClick={() =>
                          runTest('googleBooks', values.googleBooksApiKey)
                        }
                      >
                        <BeakerIcon />
                        <span>
                          {testing === 'googleBooks'
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
                    {intl.formatMessage(messages.hardcoverApiKey)}
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
                          runTest('hardcover', values.hardcoverApiKey)
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

export default SettingsBookMetadata;
