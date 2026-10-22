import { Empty, ListSkeleton, PageHeader, Screen } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { formatNumber } from '@/lib/format';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import { cn } from '@/lib/utils';
import type { BlockGroup } from '@easioprotect/api';
import {
  ChevronDownIcon,
  DicesIcon,
  EyeOffIcon,
  FolderIcon,
  Gamepad2Icon,
  HeartIcon,
  MessageCircleIcon,
  NewspaperIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
  TvIcon,
  UsersIcon,
  XIcon,
  type LucideIcon,
} from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

const categoryIcons: Record<string, LucideIcon> = {
  social: UsersIcon,
  video: TvIcon,
  gaming: Gamepad2Icon,
  messaging: MessageCircleIcon,
  shopping: ShoppingBagIcon,
  dating: HeartIcon,
  gambling: DicesIcon,
  adult: EyeOffIcon,
  fakenews: NewspaperIcon,
};

export default function GroupsScreen() {
  const { data: groups, reload } = usePolled((api) => api.groups(), 0);
  const categories = groups?.filter((g) => g.builtin);
  const mine = groups?.filter((g) => !g.builtin);

  return (
    <Screen onRefresh={reload}>
      <PageHeader title="Groups" description="Block a whole kind of site with one switch." />

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Ready-made lists that we keep up to date.</CardDescription>
        </CardHeader>
        <CardContent className="gap-1 px-2">
          {!categories ? (
            <View className="px-3">
              <ListSkeleton />
            </View>
          ) : (
            categories.map((g) => <CategoryRow key={g.id} group={g} onChange={reload} />)
          )}
        </CardContent>
      </Card>

      <View className="pt-2">
        <PageHeader
          title="My groups"
          description="Put sites together, like “Homework time”, and switch them all on or off at once."
        />
      </View>
      <NewGroupCard onCreated={reload} />
      {mine?.map((g) => (
        <GroupCard key={g.id} group={g} onChange={reload} />
      ))}
    </Screen>
  );
}

/** Switches a group on or off; downloading a category's list can take a few seconds. */
function useToggle(group: BlockGroup, onChange: () => Promise<void>) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  async function toggle(on: boolean) {
    setBusy(true);
    try {
      await api.updateGroup(group.id, { enabled: on });
      toast.show(on ? `${group.name} is now blocked` : `${group.name} is allowed again`);
    } catch (err) {
      onError(err);
    } finally {
      await onChange();
      setBusy(false);
    }
  }
  return { busy, toggle };
}

function OnOff({ on, busy }: { on: boolean; busy: boolean }) {
  if (busy)
    return (
      <View className="flex-row items-center gap-1">
        <ActivityIndicator size="small" />
        <Text className="text-sm text-muted-foreground">Updating</Text>
      </View>
    );
  return (
    <Text
      className={cn('text-sm font-semibold', on ? 'text-destructive' : 'text-muted-foreground')}>
      {on ? 'Blocked' : 'Allowed'}
    </Text>
  );
}

function CategoryRow({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { busy, toggle } = useToggle(g, onChange);
  const [open, setOpen] = React.useState(false);

  return (
    <View className={cn('rounded-xl', g.enabled && 'bg-destructive/10')}>
      {/* The whole row toggles the switch: one large tap target. */}
      <Pressable
        onPress={() => toggle(!g.enabled)}
        disabled={busy}
        role="switch"
        aria-checked={g.enabled}
        aria-label={`Block ${g.name}`}
        android_ripple={{ borderless: false, foreground: true }}
        className="flex-row items-center gap-3 rounded-xl p-3 active:opacity-70">
        <View
          className={cn(
            'h-12 w-12 items-center justify-center rounded-xl',
            g.enabled ? 'bg-destructive/15' : 'bg-muted'
          )}>
          <Icon
            as={categoryIcons[g.id] ?? FolderIcon}
            size={22}
            className={g.enabled ? 'text-destructive' : 'text-muted-foreground'}
          />
        </View>
        <View className="flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Text className="font-semibold">{g.name}</Text>
            <OnOff on={g.enabled} busy={busy} />
          </View>
          <Text className="text-sm text-muted-foreground">{g.description}</Text>
          {g.enabled && g.size > g.entries.length && (
            <Text className="text-xs text-muted-foreground">
              {formatNumber(g.size)} sites on the list
            </Text>
          )}
          {!!g.error && (
            <Text className="text-sm text-destructive">Couldn't download the list: {g.error}</Text>
          )}
        </View>
        <Switch checked={g.enabled} onCheckedChange={toggle} disabled={busy} aria-hidden />
      </Pressable>

      {g.entries.length > 0 && (
        <View className="pb-2 pl-[72px] pr-3">
          <Pressable
            onPress={() => setOpen(!open)}
            aria-expanded={open}
            hitSlop={8}
            className="min-h-11 flex-row items-center gap-1 self-start active:opacity-60">
            <Text className="text-sm font-medium text-muted-foreground">
              {open ? 'Hide sites' : 'Show sites'}
            </Text>
            <Icon
              as={ChevronDownIcon}
              size={16}
              className="text-muted-foreground"
              style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}
            />
          </Pressable>
          {open && (
            <View className="flex-row flex-wrap gap-1.5 pb-2">
              {g.entries.map((e) => (
                <Badge key={e} variant="outline">
                  <Text>{e}</Text>
                </Badge>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function NewGroupCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const g = await api.createGroup(name);
      toast.show(`Created ${g.name}. Now add sites to it.`);
      setName('');
      await onCreated();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="gap-2">
        <Label nativeID="new-group">New group name</Label>
        <View className="flex-row gap-2">
          <Input
            aria-labelledby="new-group"
            value={name}
            onChangeText={setName}
            placeholder="Homework time"
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={create}
            className="flex-1"
          />
          <Button onPress={create} disabled={busy || !name.trim()}>
            <Icon as={PlusIcon} size={18} />
            <Text>Create</Text>
          </Button>
        </View>
      </CardContent>
    </Card>
  );
}

function GroupCard({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const { busy, toggle } = useToggle(g, onChange);
  const [input, setInput] = React.useState('');
  const labelId = `add-${g.id}`;

  async function run(fn: () => Promise<unknown>, done: string) {
    try {
      await fn();
      toast.show(done);
      await onChange();
      return true;
    } catch (err) {
      onError(err);
      return false;
    }
  }

  async function add() {
    const entry = input.trim();
    if (entry && (await run(() => api.addToGroup(g.id, entry), `Added ${entry} to ${g.name}`)))
      setInput('');
  }

  function remove() {
    Alert.alert(`Delete "${g.name}"?`, 'Its sites will no longer be blocked by this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => run(() => api.deleteGroup(g.id), `Deleted ${g.name}`),
      },
    ]);
  }

  return (
    <Card className={cn(g.enabled && 'border-destructive/30')}>
      <CardHeader className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-x-2">
            <CardTitle>{g.name}</CardTitle>
            <OnOff on={g.enabled} busy={busy} />
          </View>
          <CardDescription>
            {g.entries.length === 0
              ? 'Add sites or keywords below.'
              : `${g.entries.length} ${g.entries.length === 1 ? 'site' : 'sites'} · ${g.enabled ? 'blocked now' : 'switched off'}`}
          </CardDescription>
        </View>
        <Switch
          checked={g.enabled}
          onCheckedChange={toggle}
          disabled={busy}
          aria-label={`Block ${g.name}`}
        />
      </CardHeader>
      <CardContent className="gap-4">
        <View className="gap-2">
          <Label nativeID={labelId}>Add a site or keyword</Label>
          <View className="flex-row gap-2">
            <Input
              aria-labelledby={labelId}
              value={input}
              onChangeText={setInput}
              placeholder="roblox.com or youtube"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={add}
              className="flex-1"
            />
            <Button variant="secondary" onPress={add} disabled={!input.trim()}>
              <Icon as={PlusIcon} size={18} />
              <Text>Add</Text>
            </Button>
          </View>
          <Text className="text-sm text-muted-foreground">
            A word without a dot, like <Text className="text-sm font-semibold">youtube</Text>,
            blocks every site containing it.
          </Text>
        </View>

        {g.entries.length === 0 ? (
          <Empty>No sites in this group yet.</Empty>
        ) : (
          <View className="rounded-xl border border-border">
            {g.entries.map((e, i) => (
              <React.Fragment key={e}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 pl-4">
                  <Text className="flex-1 font-medium">{e}</Text>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() =>
                      run(() => api.removeFromGroup(g.id, e), `Removed ${e} from ${g.name}`)
                    }
                    aria-label={`Remove ${e}`}>
                    <Icon as={XIcon} size={20} className="text-muted-foreground" />
                  </Button>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <Button variant="ghost" className="self-start px-2" onPress={remove}>
          <Icon as={Trash2Icon} size={18} className="text-destructive" />
          <Text className="text-destructive">Delete group</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
