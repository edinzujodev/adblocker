import type { Client } from '@jok/api';
import { useFocusEffect } from 'expo-router';
import * as React from 'react';
import { AppState } from 'react-native';

import { useApi } from '@/lib/session';

/**
 * Loads data with fn while the screen is focused, reloading every intervalMs
 * (0 = only on focus) while the app is in the foreground. reload() fetches
 * again right away.
 */
export function usePolled<T>(fn: (api: Client) => Promise<T>, intervalMs = 5000) {
  const { api, onError } = useApi();
  const [data, setData] = React.useState<T>();
  const fnRef = React.useRef(fn);
  React.useLayoutEffect(() => {
    fnRef.current = fn;
  });

  const reload = React.useCallback(async () => {
    try {
      setData(await fnRef.current(api));
    } catch (err) {
      onError(err);
    }
  }, [api, onError]);

  useFocusEffect(
    React.useCallback(() => {
      reload();
      const sub = AppState.addEventListener('change', (s) => s === 'active' && reload());
      const id = intervalMs
        ? setInterval(() => AppState.currentState === 'active' && reload(), intervalMs)
        : undefined;
      return () => {
        sub.remove();
        clearInterval(id);
      };
    }, [reload, intervalMs])
  );

  return { data, reload };
}
