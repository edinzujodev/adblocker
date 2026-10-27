import { AuthError, createClient, type Client } from '@jok/api';
import { storage } from '@/lib/storage';
import * as React from 'react';

import { useToast } from '@/lib/toast';

const SERVER_KEY = 'jok.server';
const TOKEN_KEY = 'jok.token';

type State =
  | { status: 'loading' }
  | { status: 'signedOut'; server: string }
  | { status: 'signedIn'; server: string; api: Client };

interface Session {
  state: State;
  /**
   * Connects to server (e.g. "192.168.0.197:8080") and logs in. Throws on
   * failure. With the master password it returns a reset token instead of
   * signing in: pass it to resetPassword.
   */
  signIn: (server: string, password: string) => Promise<{ resetToken: string } | undefined>;
  /** Sets a new password after a master-password login. */
  resetPassword: (server: string, resetToken: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Call when a request fails: signs out on AuthError, otherwise shows a toast. */
  onError: (err: unknown) => void;
}

const SessionContext = React.createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<State>({ status: 'loading' });
  const toast = useToast();

  // Restore the saved session on launch.
  React.useEffect(() => {
    (async () => {
      const [server, token] = await Promise.all([
        storage.getItemAsync(SERVER_KEY),
        storage.getItemAsync(TOKEN_KEY),
      ]);
      if (server && token) {
        setState({ status: 'signedIn', server, api: createClient({ baseUrl: server, token }) });
      } else {
        setState({ status: 'signedOut', server: server ?? '' });
      }
    })();
  }, []);

  const signIn = React.useCallback(async (input: string, password: string) => {
    const server = normalizeServer(input);
    const api = createClient({ baseUrl: server });
    // Generous timeout: checking a password takes a few seconds on a Raspberry Pi.
    const r = await withTimeout(api.login(password), 15000, unreachable(server));
    await storage.setItemAsync(SERVER_KEY, server);
    if (r.reset && r.resetToken) return { resetToken: r.resetToken };
    await storage.setItemAsync(TOKEN_KEY, r.token!);
    setState({ status: 'signedIn', server, api });
  }, []);

  const resetPassword = React.useCallback(async (input: string, resetToken: string, password: string) => {
    const server = normalizeServer(input);
    await withTimeout(createClient({ baseUrl: server }).resetPassword(resetToken, password), 15000, unreachable(server));
  }, []);

  const signOut = React.useCallback(async () => {
    if (state.status === 'signedIn') state.api.logout().catch(() => {});
    await storage.deleteItemAsync(TOKEN_KEY);
    setState({ status: 'signedOut', server: state.status === 'loading' ? '' : state.server });
  }, [state]);

  const onError = React.useCallback(
    (err: unknown) => {
      if (err instanceof AuthError) {
        storage.deleteItemAsync(TOKEN_KEY);
        setState((s) => ({ status: 'signedOut', server: s.status === 'loading' ? '' : s.server }));
        toast.show('Your session ended. Please log in again.', 'error');
        return;
      }
      toast.show(errorMessage(err), 'error');
    },
    [toast]
  );

  const value = React.useMemo(
    () => ({ state, signIn, resetPassword, signOut, onError }),
    [state, signIn, resetPassword, signOut, onError]
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The API client of the signed-in session. Only use on signed-in screens. */
export function useApi(): { api: Client; onError: (err: unknown) => void } {
  const { state, onError } = useSession();
  if (state.status !== 'signedIn') throw new Error('useApi needs a signed-in session');
  return { api: state.api, onError };
}

/** "192.168.0.197" → "http://192.168.0.197:8080" (8080 is the server's default). */
export function normalizeServer(input: string): string {
  let s = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  const url = s.replace(/^https?:\/\//i, '');
  if (!/:\d+$/.test(url)) s += ':8080';
  return s;
}

export function errorMessage(err: unknown): string {
  if (err instanceof TypeError) return 'Could not reach JoK. Check the address and that you are on the same Wi-Fi.';
  return err instanceof Error ? err.message : 'Something went wrong';
}

function unreachable(server: string) {
  return new Error(`No answer from ${server}. Is JoK running, and is this phone on the same Wi-Fi?`);
}

function withTimeout<T>(p: Promise<T>, ms: number, err: Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(err), ms);
    p.then(
      (v) => (clearTimeout(id), resolve(v)),
      (e) => (clearTimeout(id), reject(e))
    );
  });
}
