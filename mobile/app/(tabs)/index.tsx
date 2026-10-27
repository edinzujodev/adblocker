import { PulseRing } from '@/components/pulse-ring';
import { Screen } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { formatNumber, percent } from '@/lib/format';
import { useApi } from '@/lib/session';
import { useStatus } from '@/lib/status';
import { THEME } from '@/lib/theme';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import { cn } from '@/lib/utils';
import type { CheckResult, Status, ThisComputer } from '@easioprotect/api';
import { router } from 'expo-router';
import {
  ChevronRightIcon,
  GlobeIcon,
  MonitorIcon,
  PercentIcon,
  SearchIcon,
  ShieldBanIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

export default function HomeScreen() {
  const { status, reload } = useStatus();
  const groups = usePolled((api) => api.groups(), 0);
  const pc = usePolled((api) => api.thisComputer(), 0); // starts PowerShell on the server: no polling

  return (
    <Screen onRefresh={() => Promise.all([reload(), groups.reload(), pc.reload()])}>
      <ProtectionCard status={status} onChange={reload} />
      <Stats status={status} />
      <GroupsSummary
        names={groups.data?.filter((g) => g.enabled || g.blockedBy).map((g) => g.name)}
      />
      <CheckSiteCard blockingOn={status?.enabled} />
      <ThisComputerCard data={pc.data} onChange={pc.reload} />
    </Screen>
  );
}

/** The one thing most people come here for: is protection on, and a big button to change it. */
function ProtectionCard({ status, onChange }: { status?: Status; onChange: () => Promise<void> }) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (!status) return <Skeleton className="h-80 rounded-2xl" />;
  const on = status.enabled;

  async function toggle() {
    setBusy(true);
    try {
      await api.setEnabled(!on);
      toast.show(on ? 'Protection paused' : 'Protection is back on');
      await onChange();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="items-center gap-5 py-8">
      <View className="items-center justify-center">
        {/* Pulses only while protected, so the motion itself says "active". */}
        {on && <PulseRing size={128} color={theme.success} />}
        {/* Opaque backing, so the pulse shows only outside the tinted circle. */}
        <View className="rounded-full bg-card">
          <View
            className={cn(
              'h-32 w-32 items-center justify-center rounded-full border-8',
              on ? 'border-success/5 bg-success/15' : 'border-destructive/5 bg-destructive/15'
            )}>
            <Icon
              as={on ? ShieldCheckIcon : ShieldOffIcon}
              size={60}
              strokeWidth={1.75}
              className={on ? 'text-success' : 'text-destructive'}
            />
          </View>
        </View>
      </View>
      <View className="gap-1.5 px-6">
        <Text
          role="heading"
          aria-level={1}
          aria-live="polite"
          className="text-center text-2xl font-bold">
          {on ? "You're protected" : 'Protection is paused'}
        </Text>
        <Text className="text-center text-muted-foreground">
          {on
            ? 'Ads, trackers and the groups you switched on are blocked on every device that uses EasioProtect.'
            : 'Everything is let through until you turn protection back on.'}
        </Text>
      </View>
      <Button
        size="lg"
        variant={on ? 'outline' : 'default'}
        onPress={toggle}
        disabled={busy}
        className="w-full max-w-xs self-center">
        {busy && <ActivityIndicator />}
        <Text>{on ? 'Pause protection' : 'Turn protection on'}</Text>
      </Button>
    </Card>
  );
}

function Stats({ status }: { status?: Status }) {
  const items = status && [
    { label: 'Blocked', value: formatNumber(status.blockedQueries), icon: ShieldBanIcon },
    { label: 'Requests checked', value: formatNumber(status.totalQueries), icon: GlobeIcon },
    {
      label: 'Share blocked',
      value: percent(status.blockedQueries, status.totalQueries),
      icon: PercentIcon,
    },
  ];
  return (
    <View className="flex-row gap-3" aria-label="Since EasioProtect started">
      {(items || [null, null, null]).map((item, i) =>
        item ? (
          <Card key={item.label} className="flex-1 gap-1 px-3 py-3">
            <Icon as={item.icon} size={20} className="text-muted-foreground" />
            <Text className="text-xl font-bold" numberOfLines={1} adjustsFontSizeToFit>
              {item.value}
            </Text>
            <Text className="text-xs leading-4 text-muted-foreground">{item.label}</Text>
          </Card>
        ) : (
          <Skeleton key={i} className="h-28 flex-1 rounded-2xl" />
        )
      )}
    </View>
  );
}

/** What is being blocked beyond ads, with a way to change it. */
function GroupsSummary({ names }: { names?: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What's blocked</CardTitle>
        <CardDescription>
          {!names
            ? 'Loading…'
            : names.length === 0
              ? 'Only ads and trackers. Block social media, games and more with one switch.'
              : `Ads and trackers, plus ${names.length} ${names.length === 1 ? 'group' : 'groups'}:`}
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        {!!names?.length && (
          <View className="flex-row flex-wrap gap-2">
            {names.map((n) => (
              <Badge key={n} variant="secondary" className="px-3 py-1.5">
                <Text className="text-sm">{n}</Text>
              </Badge>
            ))}
          </View>
        )}
        <Button
          variant="outline"
          onPress={() => router.navigate('/groups')}
          className="justify-between">
          <Text>{names?.length ? 'Change groups' : 'Choose what to block'}</Text>
          <Icon as={ChevronRightIcon} className="text-foreground" />
        </Button>
      </CardContent>
    </Card>
  );
}

const reasonText: Record<CheckResult['reason'], string> = {
  custom: "It's on your own blocked list.",
  group: "It's in a group you switched on.",
  blocklist: "It's a known ad or tracker.",
  allowlist: "It's on your always-allowed list.",
  disabled: 'It would be blocked, but protection is paused.',
  'not-listed': "It isn't on any list.",
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

  // Re-check when protection is switched on or off, so the answer stays true.
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

  const reason =
    result &&
    (result.reason === 'group' && result.group
      ? `It's in the ${result.group} group${result.bundle ? `, switched on by the ${result.bundle} bundle` : ''}.`
      : reasonText[result.reason]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Is a site blocked?</CardTitle>
        <CardDescription>Check any site, and allow or block it from here.</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="gap-2">
          <Label nativeID="check-site">Site address</Label>
          <View className="flex-row gap-2">
            <Input
              aria-labelledby="check-site"
              value={input}
              onChangeText={setInput}
              placeholder="instagram.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="search"
              onSubmitEditing={() => check(input)}
              className="flex-1"
            />
            <Button onPress={() => check(input)} disabled={!input.trim()}>
              <Icon as={SearchIcon} className="text-primary-foreground" size={18} />
              <Text>Check</Text>
            </Button>
          </View>
        </View>

        {result && (
          <View
            aria-live="polite"
            className={cn(
              'flex-row gap-3 rounded-xl border p-4',
              result.blocked
                ? 'border-destructive/25 bg-destructive/10'
                : 'border-success/25 bg-success/10'
            )}>
            <Icon
              as={result.blocked ? ShieldBanIcon : ShieldCheckIcon}
              size={24}
              className={result.blocked ? 'text-destructive' : 'text-success'}
            />
            <View className="flex-1 gap-3">
              <View>
                <Text className="font-semibold">
                  {result.domain} is {result.blocked ? 'blocked' : 'allowed'}
                </Text>
                <Text className="text-sm text-muted-foreground">
                  {reason}
                  {result.rule && result.rule !== result.domain ? ` Matches “${result.rule}”.` : ''}
                </Text>
              </View>
              <View className="flex-row">
                {result.reason === 'custom' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      act(() => api.removeFrom('custom', result.rule!), `Unblocked ${result.rule}`)
                    }>
                    <Text>Unblock {result.rule}</Text>
                  </Button>
                )}
                {(result.reason === 'blocklist' ||
                  result.reason === 'group' ||
                  result.reason === 'disabled') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      act(
                        () => api.addTo('allowlist', result.domain),
                        `${result.domain} is always allowed`
                      )
                    }>
                    <Text>Always allow it</Text>
                  </Button>
                )}
                {result.reason === 'allowlist' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() =>
                      act(
                        () => api.removeFrom('allowlist', result.rule!),
                        `${result.rule} removed from allowed`
                      )
                    }>
                    <Text>Stop always allowing it</Text>
                  </Button>
                )}
                {result.reason === 'not-listed' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onPress={() =>
                      act(() => api.addTo('custom', result.domain), `Blocked ${result.domain}`)
                    }>
                    <Text>Block it</Text>
                  </Button>
                )}
              </View>
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

/** Points the DNS of the computer running EasioProtect at it (Windows only). */
function ThisComputerCard({
  data: pc,
  onChange,
}: {
  data?: ThisComputer;
  onChange: () => Promise<void>;
}) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  if (!pc?.supported) return null;

  const adapters = pc.adapters ?? [];
  const servers = adapters.flatMap((a) => a.servers ?? []);
  const backup = servers.find((ip) => ip !== servers[0]);
  const disabled = busy || !pc.admin || adapters.length === 0;

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      await api.setThisComputer(enabled);
      toast.show(
        enabled ? `${pc!.computer} is now protected` : `${pc!.computer} is back to normal DNS`
      );
    } catch (err) {
      onError(err);
    } finally {
      await onChange();
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="gap-3">
        {/* The whole row toggles the switch: one large tap target. */}
        <Pressable
          onPress={() => toggle(!pc.enabled)}
          disabled={disabled}
          role="switch"
          aria-checked={pc.enabled}
          aria-label={`Protect the server computer, ${pc.computer}`}
          className="flex-row items-center gap-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Icon as={MonitorIcon} size={22} className="text-muted-foreground" />
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="font-semibold">Protect the server computer ({pc.computer})</Text>
            <Text className="text-sm text-muted-foreground">
              {pc.enabled
                ? `On.${backup ? ` If EasioProtect stops, it falls back to ${backup}.` : ''}`
                : `Off. It uses ${servers[0] ?? 'automatic DNS'}.`}
            </Text>
          </View>
          <Switch checked={pc.enabled} onCheckedChange={toggle} disabled={disabled} aria-hidden />
        </Pressable>
        {!!pc.message && (
          <Text className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {pc.message}
          </Text>
        )}
      </CardContent>
    </Card>
  );
}
