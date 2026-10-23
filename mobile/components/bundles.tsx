import { PageHeader } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import type { BlockGroup, Bundle } from '@easioprotect/api';
import {
  CheckIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  SquareCheckIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';

interface Props {
  bundles?: Bundle[];
  groups?: BlockGroup[];
  onChange: () => Promise<void>;
}

/** Bundles: one switch for several groups, like "Kids mode". */
export function BundlesSection({ bundles, groups, onChange }: Props) {
  return (
    <>
      <PageHeader
        title="Bundles"
        description="Put groups together, like “Kids mode”, and switch them all on with one switch. Turning a bundle off leaves each group's own switch as it was."
      />
      {bundles?.map((b) => (
        <BundleCard key={b.id} bundle={b} groups={groups ?? []} onChange={onChange} />
      ))}
      <NewBundleCard onCreated={onChange} />
    </>
  );
}

function NewBundleCard({ onCreated }: { onCreated: () => Promise<void> }) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const b = await api.createBundle(name);
      toast.show(`Created ${b.name}. Now choose its groups.`);
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
        <Label nativeID="new-bundle">New bundle name</Label>
        <View className="flex-row gap-2">
          <Input
            aria-labelledby="new-bundle"
            value={name}
            onChangeText={setName}
            placeholder="Kids mode"
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

function BundleCard({
  bundle: b,
  groups,
  onChange,
}: {
  bundle: Bundle;
  groups: BlockGroup[];
  onChange: () => Promise<void>;
}) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  // A new, empty bundle opens straight into choosing its groups.
  const [editing, setEditing] = React.useState(b.groups.length === 0);
  const [chosen, setChosen] = React.useState<string[]>(b.groups);
  const members = b.groups
    .map((id) => groups.find((g) => g.id === id))
    .filter((g): g is BlockGroup => !!g);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.show(done);
      await onChange();
      return true;
    } catch (err) {
      onError(err);
      return false;
    } finally {
      setBusy(false);
    }
  }

  function toggle(on: boolean) {
    run(() => api.updateBundle(b.id, { enabled: on }), on ? `${b.name} is on` : `${b.name} is off`);
  }

  async function save() {
    if (await run(() => api.setBundleGroups(b.id, chosen), `Saved the groups in ${b.name}`))
      setEditing(false);
  }

  function remove() {
    Alert.alert(`Delete "${b.name}"?`, 'Its groups keep their own switches.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => run(() => api.deleteBundle(b.id), `Deleted ${b.name}`),
      },
    ]);
  }

  return (
    <Card className={cn(b.enabled && 'border-destructive/30')}>
      <CardHeader className="flex-row items-start gap-3">
        <View className="flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-x-2">
            <Icon as={PackageIcon} size={20} className="text-muted-foreground" />
            <CardTitle>{b.name}</CardTitle>
            {busy ? (
              <ActivityIndicator size="small" />
            ) : (
              <Text
                className={cn(
                  'text-sm font-semibold',
                  b.enabled ? 'text-destructive' : 'text-muted-foreground'
                )}>
                {b.enabled ? 'On' : 'Off'}
              </Text>
            )}
          </View>
          <CardDescription>
            {members.length === 0
              ? 'No groups yet.'
              : `${members.length} ${members.length === 1 ? 'group' : 'groups'} · ${b.enabled ? 'all blocked now' : 'switched off'}`}
          </CardDescription>
        </View>
        <Switch
          checked={b.enabled}
          onCheckedChange={toggle}
          disabled={busy || members.length === 0}
          aria-label={`Switch on ${b.name}`}
        />
      </CardHeader>
      <CardContent className="gap-4">
        {editing ? (
          <View className="gap-2">
            <Text className="text-sm font-medium">Groups in {b.name}</Text>
            <View className="rounded-xl border border-border p-1">
              {groups.map((g) => {
                const on = chosen.includes(g.id);
                return (
                  <Pressable
                    key={g.id}
                    role="checkbox"
                    aria-checked={on}
                    onPress={() =>
                      setChosen(on ? chosen.filter((id) => id !== g.id) : [...chosen, g.id])
                    }
                    className={cn(
                      'min-h-12 flex-row items-center gap-3 rounded-lg px-3 active:bg-muted',
                      on && 'bg-muted'
                    )}>
                    <Icon
                      as={on ? SquareCheckIcon : SquareIcon}
                      size={22}
                      className={on ? 'text-primary' : 'text-muted-foreground'}
                    />
                    <Text className="flex-1 font-medium">{g.name}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {g.builtin ? 'Category' : 'My group'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View className="flex-row gap-2 pt-2">
              <Button onPress={save} disabled={busy}>
                <Icon as={CheckIcon} size={18} />
                <Text>Save groups</Text>
              </Button>
              {b.groups.length > 0 && (
                <Button variant="ghost" onPress={() => setEditing(false)}>
                  <Text>Cancel</Text>
                </Button>
              )}
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row flex-wrap gap-2">
              {members.map((g) => (
                <Badge key={g.id} variant="secondary" className="px-3 py-1.5">
                  <Text className="text-sm">{g.name}</Text>
                </Badge>
              ))}
            </View>
            <View className="flex-row flex-wrap gap-2">
              <Button
                variant="outline"
                onPress={() => {
                  setChosen(b.groups);
                  setEditing(true);
                }}>
                <Icon as={PencilIcon} size={18} />
                <Text>Choose groups</Text>
              </Button>
              <Button variant="ghost" className="px-3" onPress={remove}>
                <Icon as={Trash2Icon} size={18} className="text-destructive" />
                <Text className="text-destructive">Delete</Text>
              </Button>
            </View>
          </>
        )}
      </CardContent>
    </Card>
  );
}
