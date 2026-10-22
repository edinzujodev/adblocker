import { Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { formatNumber, percent } from '@/lib/format';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import { cn } from '@/lib/utils';
import type { CheckResult, Status, ThisComputer } from '@easioprotect/api';
import * as React from 'react';
import { View } from 'react-native';

export default function HomeScreen() {
  const status = usePolled((api) => api.status());
  const pc = usePolled((api) => api.thisComputer(), 0); // starts PowerShell on the server: no polling

  return (
    <Screen onRefresh={() => Promise.all([status.reload(), pc.reload()])}>
      <BlockingCard status={status.data} onChange={status.reload} />
      <ThisComputerCard data={pc.data} onChange={pc.reload} />
      <Stats status={status.data} />
      <CheckSiteCard blockingOn={status.data?.enabled} />
    </Screen>
  );
}

function BlockingCard({ status, onChange }: { status?: Status; onChange: () => Promise<void> }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const on = status?.enabled ?? true;

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await api.setEnabled(enabled);
      toast.show(enabled ? 'Blocking turned on' : 'Blocking turned off');
      await onChange();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      className={cn(
        'py-5',
        status && (on ? 'border-primary/40 bg-primary/10' : 'border-destructive/40 bg-destructive/10')
      )}>
      <CardContent className="flex-row items-center justify-between gap-4">
        <View className="flex-1">
          <Text className="text-xl font-semibold">{on ? 'Blocking is on' : 'Blocking is off'}</Text>
          <Text className="text-sm text-muted-foreground">
            {on ? 'Ads and trackers are being blocked.' : 'Everything is allowed through.'}
          </Text>
        </View>
        <Switch
          checked={on}
          onCheckedChange={toggle}
          disabled={!status || busy}
          aria-label="Blocking on or off"
          className="scale-150"
        />
      </CardContent>
    </Card>
  );
}

/** Points the DNS of the computer running EasioProtect at it (Windows only). */
function ThisComputerCard({ data: pc, onChange }: { data?: ThisComputer; onChange: () => Promise<void> }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (!pc?.supported) return null;

  const adapters = pc.adapters ?? [];
  const servers = adapters.flatMap((a) => a.servers ?? []);
  const backup = servers.find((ip) => ip !== servers[0]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await api.setThisComputer(enabled);
      toast.show(enabled ? `${pc!.computer} is now protected` : `${pc!.computer} is back to normal DNS`);
    } catch (err) {
      onError(err);
    } finally {
      await onChange();
      setBusy(false);
    }
  }

  return (
    <Card className="py-4">
      <CardContent className="gap-3">
        <View className="flex-row items-center justify-between gap-4">
          <View className="flex-1">
            <Text className="font-semibold">Protect the server computer ({pc.computer})</Text>
            <Text className="text-sm text-muted-foreground">
              {pc.enabled
                ? `${pc.computer} is protected by EasioProtect.${backup ? ` If EasioProtect stops, it uses ${backup} so the internet keeps working.` : ''}`
                : `${pc.computer} uses ${servers[0] ?? 'automatic DNS'}, not EasioProtect.`}
            </Text>
          </View>
          <Switch
            checked={pc.enabled}
            onCheckedChange={toggle}
            disabled={busy || !pc.admin || adapters.length === 0}
            aria-label="Protect the server computer"
            className="scale-125"
          />
        </View>
        {!!pc.message && (
          <Text className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{pc.message}</Text>
        )}
      </CardContent>
    </Card>
  );
}

function Stats({ status }: { status?: Status }) {
  const items = status
    ? [
        { label: 'Queries', value: formatNumber(status.totalQueries) },
        { label: 'Blocked', value: formatNumber(status.blockedQueries) },
        { label: 'Blocked %', value: percent(status.blockedQueries, status.totalQueries) },
        { label: 'On blocklist', value: formatNumber(status.blocklistSize + status.customCount) },
      ]
    : [null, null, null, null];

  return (
    <View className="flex-row flex-wrap gap-3">
      {items.map((item, i) => (
        <Card key={i} className="min-w-[45%] flex-1 gap-1 py-3">
          <CardContent className="px-3">
            {item ? (
              <>
                <Text className="text-2xl font-semibold tabular-nums">{item.value}</Text>
                <Text className="text-sm text-muted-foreground">{item.label}</Text>
              </>
            ) : (
              <Skeleton className="h-12" />
            )}
          </CardContent>
        </Card>
      ))}
    </View>
  );
}

const reasonText: Record<CheckResult['reason'], string> = {
  custom: 'Blocked by your own list',
  group: 'Blocked by a block group',
  blocklist: 'Blocked by the ad/tracker blocklist',
  allowlist: 'Allowed — it is on your always-allowed list',
  disabled: 'Would be blocked, but blocking is switched off',
  'not-listed': 'Allowed — not on any blocklist',
};

function CheckSiteCard({ blockingOn }: { blockingOn?: boolean }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [input, setInput] = React.useState('');
  const [result, setResult] = React.useState<CheckResult>();

  async function check(domain: string) {
    if (!domain.trim()) return;
    try {
      setResult(await api.check(domain.trim()));
    } catch (err) {
      onError(err);
    }
  }

  // Re-check when blocking is switched on or off, so the answer stays true.
  const shownDomain = result?.domain;
  React.useEffect(() => {
    if (shownDomain) api.check(shownDomain).then(setResult, onError);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on switch changes
  }, [blockingOn]);

  async function act(fn: () => Promise<void>, message: string) {
    try {
      await fn();
      toast.show(message);
      await check(result!.domain);
    } catch (err) {
      onError(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test a site</CardTitle>
        <CardDescription>Type a site to see whether it would be blocked.</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row gap-2">
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="e.g. instagram.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="search"
            onSubmitEditing={() => check(input)}
            className="h-10 flex-1"
          />
          <Button onPress={() => check(input)} className="h-10 px-4">
            <Text>Test</Text>
          </Button>
        </View>

        {result && (
          <View className={cn('gap-3 rounded-lg p-3', result.blocked ? 'bg-destructive/10' : 'bg-primary/10')}>
            <View>
              <Text className="font-semibold">
                {result.domain} is {result.blocked ? 'blocked' : 'allowed'}
              </Text>
              <Text className="text-sm text-muted-foreground">
                {result.group && result.reason === 'group' ? `Blocked by the ${result.group} group` : reasonText[result.reason]}
                {result.rule && result.rule !== result.domain ? ` (matches ${result.rule})` : ''}
              </Text>
            </View>
            <View className="flex-row">
              {result.reason === 'custom' && (
                <Button variant="outline" onPress={() => act(() => api.removeFrom('custom', result.rule!), `Unblocked ${result.rule}`)}>
                  <Text>Unblock {result.rule}</Text>
                </Button>
              )}
              {(result.reason === 'blocklist' || result.reason === 'group' || result.reason === 'disabled') && (
                <Button variant="outline" onPress={() => act(() => api.addTo('allowlist', result.domain), `${result.domain} is always allowed`)}>
                  <Text>Always allow {result.domain}</Text>
                </Button>
              )}
              {result.reason === 'allowlist' && (
                <Button variant="outline" onPress={() => act(() => api.removeFrom('allowlist', result.rule!), `${result.rule} removed from allowed`)}>
                  <Text>Stop allowing {result.rule}</Text>
                </Button>
              )}
              {result.reason === 'not-listed' && (
                <Button variant="destructive" onPress={() => act(() => api.addTo('custom', result.domain), `Blocked ${result.domain}`)}>
                  <Text>Block {result.domain}</Text>
                </Button>
              )}
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}
