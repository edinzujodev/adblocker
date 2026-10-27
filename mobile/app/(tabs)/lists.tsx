import { Empty, ListSkeleton, PageHeader, Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import type { ListName } from '@easioprotect/api';
import { BanIcon, CircleCheckIcon, PlusIcon, XIcon, type LucideIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export default function ListsScreen() {
  const custom = usePolled((api) => api.list('custom'), 0);
  const allow = usePolled((api) => api.list('allowlist'), 0);

  return (
    <Screen onRefresh={() => Promise.all([custom.reload(), allow.reload()])}>
      <PageHeader
        title="My lists"
        description="Your own exceptions: websites to always block, and websites to always allow."
      />
      <DomainListCard
        list="custom"
        domains={custom.data}
        reload={custom.reload}
        icon={BanIcon}
        title="Always block"
        description="Blocking a website blocks all of it: instagram.com also covers www.instagram.com."
        label="Website or word to block"
        placeholder="tiktok.com or instagram"
        hint="Tip: type just a word, like instagram, to block every website with that word in its address."
        addLabel="Block"
        empty="You haven't blocked any sites yourself."
        added={(d) => `Blocked ${d}`}
        removed={(d) => `Unblocked ${d}`}
      />
      <DomainListCard
        list="allowlist"
        domains={allow.data}
        reload={allow.reload}
        icon={CircleCheckIcon}
        title="Always allow"
        description="These always work, even if a group or the ad filter would block them. Add a site here if something your family needs stops working."
        label="Website to allow"
        placeholder="example.com"
        addLabel="Allow"
        empty="Nothing here yet."
        added={(d) => `${d} is always allowed`}
        removed={(d) => `${d} removed from allowed`}
      />
    </Screen>
  );
}

interface DomainListCardProps {
  list: ListName;
  domains?: string[];
  reload: () => Promise<void>;
  icon: LucideIcon;
  title: string;
  description: string;
  label: string;
  placeholder: string;
  hint?: string;
  addLabel: string;
  empty: string;
  added: (domain: string) => string;
  removed: (domain: string) => string;
}

function DomainListCard(p: DomainListCardProps) {
  const { api, onError } = useApi();
  const toast = useToast();
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const labelId = `${p.list}-input`;

  async function add() {
    const domain = input.trim();
    if (!domain) return;
    setBusy(true);
    try {
      await api.addTo(p.list, domain);
      toast.show(p.added(domain));
      setInput('');
      await p.reload();
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(domain: string) {
    try {
      await api.removeFrom(p.list, domain);
      toast.show(p.removed(domain));
      await p.reload();
    } catch (err) {
      onError(err);
    }
  }

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon as={p.icon} size={20} className="text-muted-foreground" />
          <CardTitle>{p.title}</CardTitle>
        </View>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-4">
        <View className="gap-2">
          <Label nativeID={labelId}>{p.label}</Label>
          <View className="flex-row gap-2">
            <Input
              aria-labelledby={labelId}
              value={input}
              onChangeText={setInput}
              placeholder={p.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={add}
              className="flex-1"
            />
            <Button onPress={add} disabled={busy || !input.trim()}>
              <Icon as={PlusIcon} size={18} />
              <Text>{p.addLabel}</Text>
            </Button>
          </View>
          {!!p.hint && <Text className="text-sm text-muted-foreground">{p.hint}</Text>}
        </View>

        {!p.domains ? (
          <ListSkeleton />
        ) : p.domains.length === 0 ? (
          <Empty>{p.empty}</Empty>
        ) : (
          <View className="rounded-xl border border-border">
            {p.domains.map((d, i) => (
              <React.Fragment key={d}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 pl-4">
                  <Text className="flex-1 font-medium">{d}</Text>
                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() => remove(d)}
                    aria-label={`Remove ${d}`}>
                    <Icon as={XIcon} size={20} className="text-muted-foreground" />
                  </Button>
                </View>
              </React.Fragment>
            ))}
          </View>
        )}
      </CardContent>
    </Card>
  );
}
