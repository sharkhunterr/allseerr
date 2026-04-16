import PageTitle from '@app/components/Common/PageTitle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import DownloadManagerSettings from './DownloadManagerSettings';
import LibraryServerSettings from './LibraryServerSettings';

const messages = defineMessages('components.Settings.BooksAudiobooks', {
  booksAudiobooks: 'Books & Audiobooks',
  booksAudiobooksSettings: 'Books & Audiobooks Settings',
  booksAudiobooksDescription:
    'Configure download managers and library servers for books and audiobooks.',
  tabDownloadManagers: 'Download Managers',
  tabLibraryServers: 'Library Servers',
});

const SettingsBooksAudiobooks = () => {
  const intl = useIntl();
  const [activeTab, setActiveTab] = useState<'download' | 'library'>(
    'download'
  );

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.booksAudiobooks),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.booksAudiobooksSettings)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.booksAudiobooksDescription)}
        </p>
      </div>

      <div className="mb-6 flex border-b border-gray-600">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'download'
              ? 'border-b-2 border-indigo-500 text-indigo-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('download')}
        >
          {intl.formatMessage(messages.tabDownloadManagers)}
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            activeTab === 'library'
              ? 'border-b-2 border-indigo-500 text-indigo-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          onClick={() => setActiveTab('library')}
        >
          {intl.formatMessage(messages.tabLibraryServers)}
        </button>
      </div>

      {activeTab === 'download' ? (
        <DownloadManagerSettings />
      ) : (
        <LibraryServerSettings />
      )}
    </>
  );
};

export default SettingsBooksAudiobooks;
