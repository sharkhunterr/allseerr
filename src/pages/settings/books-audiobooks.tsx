import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsBooksAudiobooks from '@app/components/Settings/BooksAudiobooks';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsBooksAudiobooksPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsBooksAudiobooks />
    </SettingsLayout>
  );
};

export default SettingsBooksAudiobooksPage;
