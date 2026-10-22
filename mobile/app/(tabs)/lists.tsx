import { Empty, ListSkeleton, Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import type { ListName } from '@easioprotect/api';
import { XIcon } from 'lucide-react-native';
import * as React from 'react';
import { View } from 'react-native';

export default function ListsScreen() {
  const custom = usePolled((api) => api.list('custom'), 0);
  const allow = usePolled((api) => api.list('allowlist'), 0);

  return (
    <Screen onRefresh={() => Promise.all([custom.reload(), allow.reload()])}>
      <DomainListCard
        list="custom"
        domains={custom.data}
        reload={custom.reload}
        title="My blocked sites"
        description="Sites you block yourself. Subdomains are included."
        placeholder="e.g. tiktok.com"
        addLabel="Block"
        empty="You haven't blocked any sites yourself."
        added={(d) => `Blocked ${d}`}
        removed={(d) => `Unblocked ${d}`}
      />
      <DomainListCard
        list="allowlist"
        domains={allow.data}
        reload={allow.reload}
        title="Always allowed"
        description="Never blocked, even if a blocklist contains them."
        placeholder="e.g. example.com"
        addLabel="Allow"
        empty="No always-allowed sites."
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
  title: string;
  description: string;
  placeholder: string;
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
        <CardTitle>{p.title}</CardTitle>
        <CardDescription>{p.description}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <View className="flex-row gap-2">
          <Input
            value={input}
            onChangeText={setInput}
            placeholder={p.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="done"
            onSubmitEditing={add}
            className="h-10 flex-1"
          />
          <Button onPress={add} disabled={busy || !input.trim()} className="h-10 px-4">
            <Text>{p.addLabel}</Text>
          </Button>
        </View>

        {!p.domains ? (
          <ListSkeleton />
        ) : p.domains.length === 0 ? (
          <Empty>{p.empty}</Empty>
        ) : (
          <View>
            {p.domains.map((d, i) => (
              <React.Fragment key={d}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 py-2">
                  <Text className="flex-1 font-medium">{d}</Text>
                  <Button variant="outline" size="sm" onPress={() => remove(d)} aria-label={`Remove ${d}`}>
                    <Icon as={XIcon} className="text-destructive" />
                    <Text className="text-destructive">Remove</Text>
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
