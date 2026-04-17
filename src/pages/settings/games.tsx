import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const LegacyGamesPage: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/services');
  }, [router]);
  return null;
};

export default LegacyGamesPage;
