import type { Status } from '@jok/api';
import * as React from 'react';

import { usePolled } from '@/lib/use-polled';

const StatusContext = React.createContext<{ status?: Status; reload: () => Promise<void> } | null>(
  null
);

/** Polls the server status once for the header badge and the Home screen. */
export function StatusProvider({ children }: { children: React.ReactNode }) {
  const { data, reload } = usePolled((api) => api.status());
  const value = React.useMemo(() => ({ status: data, reload }), [data, reload]);
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus() {
  const ctx = React.useContext(StatusContext);
  if (!ctx) throw new Error('useStatus must be used inside StatusProvider');
  return ctx;
}
