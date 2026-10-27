import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import type { Gear } from './runTypes';

/** The runner's gear closet. `gear` is null until the first load finishes. */
export function useGearList() {
  const { apiFetch } = useAuth();
  const [gear, setGear] = useState<Gear[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    apiFetch('/api/gear')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then((data: Gear[]) => { setGear(data); setError(null); })
      .catch(e => { setGear(g => g ?? []); setError(e.message); });
  }, [apiFetch]);

  useEffect(() => { reload(); }, [reload]);

  return { gear, error, setGear, reload };
}
