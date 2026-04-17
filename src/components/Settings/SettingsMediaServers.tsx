import PageTitle from '@app/components/Common/PageTitle';
import SubTabs from '@app/components/Common/SubTabs';
import SettingsRomm from '@app/components/Settings/Games/SettingsRomm';
import SettingsJellyfin from '@app/components/Settings/SettingsJellyfin';
import SettingsPlex from '@app/components/Settings/SettingsPlex';
import useSettings from '@app/hooks/useSettings';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { MediaServerType } from '@server/constants/server';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Settings.SettingsMediaServers', {
  mediaServers: 'Media Servers',
  mediaServersDescription:
    'Configure media server connections for content availability detection.',
  comingSoon: '{name} integration coming soon.',
});

type MediaServerTab =
  | 'plex'
  | 'jellyfin'
  | 'audiobookshelf'
  | 'calibre'
  | 'romm';

const ComingSoon = ({ name }: { name: string }) => {
  const intl = useIntl();
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <p className="text-lg">
        {intl.formatMessage(messages.comingSoon, { name })}
      </p>
    </div>
  );
};

const SettingsMediaServers = () => {
  const intl = useIntl();
  const settings = useSettings();
  const isPlex =
    settings.currentSettings.mediaServerType === MediaServerType.PLEX;

  const [activeTab, setActiveTab] = useState<MediaServerTab>(
    isPlex ? 'plex' : 'jellyfin'
  );

  useEffect(() => {
    setActiveTab(isPlex ? 'plex' : 'jellyfin');
  }, [isPlex]);

  const tabs: { key: MediaServerTab; label: string }[] = [
    { key: 'plex', label: 'Plex' },
    { key: 'jellyfin', label: 'Jellyfin / Emby' },
    { key: 'audiobookshelf', label: 'Audiobookshelf' },
    { key: 'calibre', label: 'Calibre / Grimoire' },
    { key: 'romm', label: 'ROMM' },
  ];

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.mediaServers),
          intl.formatMessage(globalMessages.settings),
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">
          {intl.formatMessage(messages.mediaServers)}
        </h3>
        <p className="description">
          {intl.formatMessage(messages.mediaServersDescription)}
        </p>
      </div>
      <SubTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      {activeTab === 'plex' && <SettingsPlex embedded />}
      {activeTab === 'jellyfin' && <SettingsJellyfin embedded />}
      {activeTab === 'audiobookshelf' && (
        <ComingSoon name="Audiobookshelf" />
      )}
      {activeTab === 'calibre' && <ComingSoon name="Calibre / Grimoire" />}
      {activeTab === 'romm' && <SettingsRomm />}
    </>
  );
};

export default SettingsMediaServers;
