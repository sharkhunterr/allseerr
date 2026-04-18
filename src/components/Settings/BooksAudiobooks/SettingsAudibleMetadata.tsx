import Button from '@app/components/Common/Button';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';

const messages = defineMessages(
  'components.Settings.BooksAudiobooks.SettingsAudibleMetadata',
  {
    section: 'Audible Metadata',
    description:
      'Audible is used as the audiobook metadata source. Select the regional catalog that matches your library — ASINs differ between regions.',
    region: 'Audible Region',
    regionTip:
      'Use the same region as your audiobook library to match ASINs correctly',
    toastSaveSuccess: 'Audible metadata settings saved!',
    toastSaveFailed: 'Failed to save Audible metadata settings.',
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

interface MetadataSettings {
  tv: string;
  anime: string;
  audibleRegion?: string;
}

const SettingsAudibleMetadata = () => {
  const intl = useIntl();
  const { addToast } = useToasts();

  const { data, mutate: revalidate } = useSWR<MetadataSettings>(
    '/api/v1/settings/metadatas'
  );

  return (
    <Formik
      initialValues={{
        audibleRegion: data?.audibleRegion ?? 'us',
      }}
      enableReinitialize
      onSubmit={async (values) => {
        try {
          await axios.put('/api/v1/settings/metadatas', {
            tv: data?.tv,
            anime: data?.anime,
            audibleRegion: values.audibleRegion,
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
      {({ isSubmitting }) => (
        <Form className="section">
          <div className="mb-8">
            <h4 className="mb-2 text-lg font-bold text-gray-100">
              {intl.formatMessage(messages.section)}
            </h4>
            <p className="mb-4 text-sm text-gray-400">
              {intl.formatMessage(messages.description)}
            </p>

            <div className="form-row">
              <label htmlFor="audibleRegion" className="text-label">
                {intl.formatMessage(messages.region)}
                <span className="label-tip">
                  {intl.formatMessage(messages.regionTip)}
                </span>
              </label>
              <div className="form-input-area">
                <Field as="select" id="audibleRegion" name="audibleRegion">
                  {AUDIBLE_REGIONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
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
      )}
    </Formik>
  );
};

export default SettingsAudibleMetadata;
