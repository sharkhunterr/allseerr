import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsGames from '@app/components/Settings/Games';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsGamesPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsGames />
    </SettingsLayout>
  );
};

export default SettingsGamesPage;
