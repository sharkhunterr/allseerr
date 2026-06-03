import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { Field, Form, Formik } from 'formik';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate as globalMutate } from 'swr';

const messages = defineMessages('components.Settings.MediaTypeToggles', {
  heading: 'Media type management',
  description:
    'Master on/off switches for each non-TMDB media type. Disable a type to hide it from search and reject any incoming request — the per-provider configuration is preserved so you can flip it back on without re-entering anything.',
  book: 'Books',
  bookHelp:
    'When off: the Books tab disappears from search and /book/request returns 503.',
  audiobook: 'Audiobooks',
  audiobookHelp:
    'When off: the Audiobooks tab disappears from search and audiobook requests return 503.',
  game: 'Games',
  gameHelp:
    'When off: the Games tab disappears from search and /game/request returns 503.',
  manga: 'Manga',
  mangaHelp:
    'When off: the Manga tab disappears from search and /manga/request returns 503.',
  comic: 'Comics',
  comicHelp:
    'When off: the Comics tab disappears from search and /comic/request returns 503.',
  magazine: 'Magazines',
  magazineHelp:
    'When off: the Magazines tab disappears from search and /magazine/request returns 503.',
  saved: 'Media type toggles saved.',
  saveFailed: 'Failed to save media type toggles.',
});

interface MediaTypeTogglesValues {
  book: boolean;
  audiobook: boolean;
  game: boolean;
  manga: boolean;
  comic: boolean;
  magazine: boolean;
}

const ROWS: {
  key: keyof MediaTypeTogglesValues;
  label: keyof typeof messages;
  help: keyof typeof messages;
}[] = [
  { key: 'book', label: 'book', help: 'bookHelp' },
  { key: 'audiobook', label: 'audiobook', help: 'audiobookHelp' },
  { key: 'game', label: 'game', help: 'gameHelp' },
  { key: 'manga', label: 'manga', help: 'mangaHelp' },
  { key: 'comic', label: 'comic', help: 'comicHelp' },
  { key: 'magazine', label: 'magazine', help: 'magazineHelp' },
];

const MediaTypeTogglesSection = () => {
  const intl = useIntl();
  const { addToast } = useToasts();

  const { data, error, mutate } = useSWR<MediaTypeTogglesValues>(
    '/api/v1/settings/media-types'
  );

  if (!data && !error) return <LoadingSpinner />;

  const initial: MediaTypeTogglesValues = data ?? {
    book: true,
    audiobook: true,
    game: true,
    manga: true,
    comic: true,
    magazine: true,
  };

  return (
    <>
      <div className="mb-6 mt-12">
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
              await axios.put('/api/v1/settings/media-types', values);
              await mutate();
              // The xxxEnabled flags in /settings/public derive from
              // these toggles — revalidate it so the search tabs in
              // the live UI refresh without a hard reload.
              await globalMutate('/api/v1/settings/public');
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
          {({ isSubmitting }) => (
            <Form>
              {ROWS.map((row) => (
                <div className="form-row" key={row.key}>
                  <label htmlFor={row.key} className="checkbox-label">
                    <span>{intl.formatMessage(messages[row.label])}</span>
                    <span className="label-tip">
                      {intl.formatMessage(messages[row.help])}
                    </span>
                  </label>
                  <div className="form-input-area">
                    <Field type="checkbox" id={row.key} name={row.key} />
                  </div>
                </div>
              ))}

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

export default MediaTypeTogglesSection;
