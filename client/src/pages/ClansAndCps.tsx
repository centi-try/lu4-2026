import { useMemo } from 'react';
import { AppShell } from '../components/layout/AppShell';
import RaidClansAndCps from './raid/RaidClansAndCps';
import { useAuth } from '../contexts/AuthContext';
import { trpc } from '../lib/trpc';

export default function ClansAndCps() {
  const { user } = useAuth();
  const roleLc = String(user?.role || '').toLowerCase();
  const isSA = roleLc === 'super_admin';

  const { data: cpSelector = [] } = trpc.warehouse.commandParties.cpSelector.useQuery();
  const ledCpIds = useMemo(() => {
    if (isSA) return [];
    const uid = Number(user?.id);
    return (cpSelector as any[])
      .filter((cp: any) => {
        if (Number(cp.leaderId) === uid) return true;
        if (Array.isArray(cp.leaderIds) && cp.leaderIds.map(Number).includes(uid)) return true;
        return false;
      })
      .map((cp: any) => Number(cp.id));
  }, [cpSelector, user, isSA]);

  return (
    <AppShell>
      {isSA
        ? <RaidClansAndCps />
        : <RaidClansAndCps readOnly allowSecondaryChars={(roleLc === 'admin' || ledCpIds.length > 0)} />
      }
    </AppShell>
  );
}
