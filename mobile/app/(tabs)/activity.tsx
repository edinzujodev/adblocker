import { Empty, ListSkeleton, PageHeader, Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { formatNumber, timeAgo } from '@/lib/format';
import { useApi } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { usePolled } from '@/lib/use-polled';
import type { Query } from '@easioprotect/api';
import * as React from 'react';
import { View } from 'react-native';

export default function ActivityScreen() {
  const { api, onError } = useApi();
  const toast = useToast();
  const recent = usePolled((api) => api.recentQueries({ blocked: true, limit: 500 }));
  const top = usePolled((api) => api.topBlocked());

  async function allow(domain: string) {
    try {
      await api.addTo('allowlist', domain);
      toast.show(`${domain} is always allowed`);
      await recent.reload();
    } catch (err) {
      onError(err);
    }
  }

  const max = top.data?.[0]?.count ?? 1;

  return (
    <Screen onRefresh={() => Promise.all([recent.reload(), top.reload()])}>
      <PageHeader
        title="Activity"
        description="Everything EasioProtect stopped in your home. Updates by itself."
      />

      <Card>
        <CardHeader>
          <CardTitle>Just blocked</CardTitle>
          <CardDescription>Something not working? Find it here and tap Allow.</CardDescription>
        </CardHeader>
        <CardContent>
          {!recent.data ? (
            <ListSkeleton />
          ) : recent.data.length === 0 ? (
            <Empty>Nothing blocked yet. Open a site with ads and check back.</Empty>
          ) : (
            groupByDomain(recent.data).map((q, i) => (
              <React.Fragment key={q.domain}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 py-3">
                  <View className="flex-1">
                    <Text className="font-medium">{q.domain}</Text>
                    <Text className="text-sm text-muted-foreground">
                      {timeAgo(q.time)} · device {q.client}
                      {q.count > 1 ? ` · ${q.count} times` : ''}
                    </Text>
                  </View>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => allow(q.domain)}
                    aria-label={`Allow ${q.domain}`}>
                    <Text>Allow</Text>
                  </Button>
                </View>
              </React.Fragment>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Blocked most often</CardTitle>
          <CardDescription>Since EasioProtect started.</CardDescription>
        </CardHeader>
        <CardContent className="gap-3">
          {!top.data ? (
            <ListSkeleton />
          ) : top.data.length === 0 ? (
            <Empty>Nothing blocked yet.</Empty>
          ) : (
            top.data.map((d) => (
              <View key={d.domain} className="gap-1.5">
                <View className="flex-row items-baseline justify-between gap-3">
                  <Text className="flex-1 font-medium">{d.domain}</Text>
                  <Text className="text-sm text-muted-foreground">{formatNumber(d.count)}×</Text>
                </View>
                <View className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <View
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${(100 * d.count) / max}%` }}
                  />
                </View>
              </View>
            ))
          )}
        </CardContent>
      </Card>
    </Screen>
  );
}

/**
 * A page load asks for the same domain several times (A + AAAA, retries), so
 * show each domain once, with its latest time and a count.
 */
function groupByDomain(queries: Query[], max = 50) {
  const seen = new Map<string, Query & { count: number }>();
  for (const q of queries) {
    const item = seen.get(q.domain);
    if (item) item.count++;
    else seen.set(q.domain, { ...q, count: 1 });
  }
  return [...seen.values()].slice(0, max);
}
