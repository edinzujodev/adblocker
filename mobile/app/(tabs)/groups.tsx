import { Empty, ListSkeleton, Screen } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { formatNumber } from '@/lib/format';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import type { BlockGroup } from '@easioprotect/api';
import { Trash2Icon, XIcon } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Pressable, View } from 'react-native';

export default function GroupsScreen() {
  const { data: groups, reload } = usePolled((api) => api.groups(), 0);
  const categories = groups?.filter((g) => g.builtin);
  const mine = groups?.filter((g) => !g.builtin);

  return (
    <Screen onRefresh={reload}>
      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>Switch on a category to block every site in it.</CardDescription>
        </CardHeader>
        <CardContent>
          {!categories ? (
            <ListSkeleton />
          ) : (
            categories.map((g, i) => (
              <React.Fragment key={g.id}>
                {i > 0 && <Separator />}
                <CategoryRow group={g} onChange={reload} />
              </React.Fragment>
            ))
          )}
        </CardContent>
      </Card>

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
      toast.show(`${group.name} ${on ? 'blocked' : 'allowed again'}`);
    } catch (err) {
      onError(err);
    } finally {
      await onChange();
      setBusy(false);
    }
  }
  return { busy, toggle };
}

function CategoryRow({ group: g, onChange }: { group: BlockGroup; onChange: () => Promise<void> }) {
  const { busy, toggle } = useToggle(g, onChange);
  const [open, setOpen] = React.useState(false);

  return (
    <View className="gap-2 py-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-0.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-medium">{g.name}</Text>
            {g.enabled && g.size > g.entries.length && (
              <Badge variant="secondary">
                <Text>{formatNumber(g.size)} sites</Text>
              </Badge>
            )}
          </View>
          <Text className="text-sm text-muted-foreground">
            {busy ? 'Updating…' : g.description}
          </Text>
          {!!g.error && (
            <Text className="text-sm text-destructive">Could not download the list: {g.error}</Text>
          )}
        </View>
        <Switch
          checked={g.enabled}
          onCheckedChange={toggle}
          disabled={busy}
          aria-label={`Block ${g.name}`}
        />
      </View>
      {g.entries.length > 0 && (
        <Pressable onPress={() => setOpen(!open)} hitSlop={8}>
          <Text className="text-sm text-muted-foreground">{open ? 'Hide' : "What's included"}</Text>
        </Pressable>
      )}
      {open && (
        <View className="flex-row flex-wrap gap-1">
          {g.entries.map((e) => (
            <Badge key={e} variant="outline">
              <Text>{e}</Text>
            </Badge>
          ))}
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
      toast.show(`Created ${g.name}. Add sites to it below.`);
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
      <CardHeader>
        <CardTitle>My groups</CardTitle>
        <CardDescription>
          Put several sites and keywords together and switch them on or off at once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <View className="flex-row gap-2">
          <Input
            value={name}
            onChangeText={setName}
            placeholder="e.g. Homework time"
            maxLength={50}
            returnKeyType="done"
            onSubmitEditing={create}
            className="h-10 flex-1"
          />
          <Button onPress={create} disabled={busy || !name.trim()} className="h-10 px-4">
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
    Alert.alert(`Delete "${g.name}"?`, 'The sites in it will no longer be blocked by this group.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => run(() => api.deleteGroup(g.id), `Deleted ${g.name}`),
      },
    ]);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1.5">
          <CardTitle>{g.name}</CardTitle>
          <CardDescription>
            {g.enabled ? 'On: these are blocked.' : 'Off: these are allowed.'}
          </CardDescription>
        </View>
        <Switch
          checked={g.enabled}
          onCheckedChange={toggle}
          disabled={busy}
          aria-label={`Block ${g.name}`}
          className="scale-125"
        />
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row gap-2">
          <Input
            value={input}
            onChangeText={setInput}
            placeholder="e.g. roblox.com or youtube"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={add}
            className="h-10 flex-1"
          />
          <Button onPress={add} disabled={!input.trim()} className="h-10 px-4">
            <Text>Add</Text>
          </Button>
        </View>

        {g.entries.length === 0 ? (
          <Empty>No sites in this group yet.</Empty>
        ) : (
          <View>
            {g.entries.map((e, i) => (
              <React.Fragment key={e}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 py-2">
                  <Text className="flex-1 font-medium">{e}</Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    onPress={() =>
                      run(() => api.removeFromGroup(g.id, e), `Removed ${e} from ${g.name}`)
                    }
                    aria-label={`Remove ${e}`}>
                    <Icon as={XIcon} className="text-muted-foreground" />
                  </Button>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}

        <Button variant="outline" className="self-start" onPress={remove}>
          <Icon as={Trash2Icon} className="text-destructive" />
          <Text className="text-destructive">Delete group</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
