import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
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
  'components.Settings.MangaComics.SettingsMangaMetadata',
  {
    heading: 'Manga Metadata Providers',
    description:
      'Choose which provider owns manga identity (titles, covers, mangaka, related series). AniList is the default — free, no API key, exposes the richest manga schema (relations, staff, characters, tags). Jikan is a MyAnimeList REST proxy reserved for future enrichment.',
    primarySource: 'Primary source',
    primarySourceHelp:
      'Drives what the search grid shows. AniList is the only viable free primary today; the select keeps the option open for later providers.',
    primaryAniList: 'AniList',
    anilist: 'AniList',
    anilistHelp:
      "Free GraphQL manga + anime metadata service (anilist.co). No API key needed for read access; rate-limited to ~90 requests / minute.",
    jikan: 'Jikan (MyAnimeList)',
    jikanHelp:
      'REST proxy on MyAnimeList. Adapter not implemented yet — toggle reserved for an upcoming enrichment pass.',
    preferredLanguage: 'Preferred language',
    preferredLanguageHelp:
      "Filters search results to manga whose `countryOfOrigin` / synonyms match the chosen ISO-639-1 language code (japanese (jp), korean (kr — manhwa), chinese (cn — manhua) are the most common). Empty = no preference.",
    languagePolicy: 'Language policy',
    languagePolicyHelp:
      '"Prefer": non-matching results stay but are pushed down. "Strict": drop them outright.',
    langAny: 'No preference',
    langPrefer: 'Prefer',
    langStrict: 'Strict',
    hideAdult: 'Hide adult titles',
    hideAdultHelp:
      "AniList tags adult-only entries with `isAdult`. When this is on, those results are filtered out of search and the detail page returns 404 for them.",
    test: 'Test',
    testing: 'Testing…',
    testSuccess: 'Test OK: {message}',
    testFailure: 'Test failed: {message}',
    saved: 'Manga metadata provider settings saved.',
    saveFailed: 'Failed to save manga metadata provider settings.',
  }
);

// AniList's `countryOfOrigin` is a 2-letter code. For the language
// preferences UI we expose the three big manga origin countries +
// blank (no preference). Everything else falls under "no preference"
// since AniList's coverage is heavily JP / KR / CN.
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'langAny' },
  { value: 'jp', label: '日本語 / Manga (jp)' },
  { value: 'kr', label: '한국어 / Manhwa (kr)' },
  { value: 'cn', label: '中文 / Manhua (cn)' },
];

interface MangaProvidersConfig {
  primarySource: 'anilist';
  anilist: boolean;
  jikan: boolean;
  preferredLanguage: string;
  languagePolicy: 'prefer' | 'strict';
  hideAdult: boolean;
}

const SettingsMangaMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [testing, setTesting] = useState<string | null>(null);

  const { data, error, mutate } = useSWR<MangaProvidersConfig>(
    '/api/v1/settings/manga/metadata-providers'
  );

  if (!data && !error) return <LoadingSpinner />;

  const initial: MangaProvidersConfig = data ?? {
    primarySource: 'anilist',
    anilist: true,
    jikan: false,
    preferredLanguage: '',
    languagePolicy: 'prefer',
    hideAdult: true,
  };

  const runTest = async (provider: 'anilist' | 'jikan') => {
    setTesting(provider);
    try {
      const resp = await axios.post<{ success: boolean; message: string }>(
        '/api/v1/settings/manga/metadata-providers/test',
        { provider }
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
              await axios.put(
                '/api/v1/settings/manga/metadata-providers',
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
                      <option value="anilist">
                        {intl.formatMessage(messages.primaryAniList)}
                      </option>
                    </Field>
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="anilist" className="checkbox-label">
                  <span>{intl.formatMessage(messages.anilist)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.anilistHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="anilist"
                    name="anilist"
                    onChange={() => setFieldValue('anilist', !values.anilist)}
                  />
                </div>
              </div>
              {values.anilist && (
                <div className="form-row">
                  <label className="text-label" />
                  <div className="form-input-area">
                    <div className="mt-2 flex justify-end">
                      <Button
                        type="button"
                        buttonType="warning"
                        disabled={testing === 'anilist'}
                        onClick={() => runTest('anilist')}
                      >
                        <BeakerIcon />
                        <span>
                          {testing === 'anilist'
                            ? intl.formatMessage(messages.testing)
                            : intl.formatMessage(messages.test)}
                        </span>
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-row">
                <label htmlFor="jikan" className="checkbox-label">
                  <span>{intl.formatMessage(messages.jikan)}</span>
                  <span className="label-tip">
                    {intl.formatMessage(messages.jikanHelp)}
                  </span>
                </label>
                <div className="form-input-area">
                  <Field
                    type="checkbox"
                    id="jikan"
                    name="jikan"
                    disabled
                    onChange={() => setFieldValue('jikan', !values.jikan)}
                  />
                </div>
              </div>
              {values.jikan && (
                <Alert
                  title="Jikan adapter is not implemented yet."
                  type="warning"
                />
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

export default SettingsMangaMetadata;
