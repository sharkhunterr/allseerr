import SettingsLayout from '@app/components/Settings/SettingsLayout';
import SettingsOidc from '@app/components/Settings/SettingsOidc';
import useRouteGuard from '@app/hooks/useRouteGuard';
import { Permission } from '@app/hooks/useUser';
import type { NextPage } from 'next';

const SettingsOidcPage: NextPage = () => {
  useRouteGuard(Permission.ADMIN);
  return (
    <SettingsLayout>
      <SettingsOidc />
    </SettingsLayout>
  );
};

export default SettingsOidcPage;
