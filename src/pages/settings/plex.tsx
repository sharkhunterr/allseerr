import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const LegacyPlexPage: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/media-servers');
  }, [router]);
  return null;
};

export default LegacyPlexPage;
