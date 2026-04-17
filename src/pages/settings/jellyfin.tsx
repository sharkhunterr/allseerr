import type { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const LegacyJellyfinPage: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace('/settings/media-servers');
  }, [router]);
  return null;
};

export default LegacyJellyfinPage;
