import { useMemo } from 'react';
import { AppShell } from '../components/layout/AppShell';
import RaidClansAndCps from './raid/RaidClansAndCps';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';

export default function ClansAndCps() {
  const { currentUser } = useAuth();
  const roleLc = String(currentUser?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';

  const { data: cpSelector = [] } = trpc.warehouse.commandParties.cpSelector.useQuery();
  const ledCpIds = useMemo(() => {
    if (isSA) return [];
    return (cpSelector as any[])
      .filter((cp: any) => Number(cp.leaderId) === Number(currentUser?.id))
      .map((cp: any) => Number(cp.id));
  }, [cpSelector, currentUser, isSA]);

  return (
    <AppShell>
      {isSA
        ? <RaidClansAndCps />
        : <RaidClansAndCps readOnly allowSecondaryChars={(roleLc === 'admin' || ledCpIds.length > 0)} />
      }
    </AppShell>
  );
}
