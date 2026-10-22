import { Empty, ListSkeleton, Screen } from '@/components/screen';
import { Badge } from '@/components/ui/badge';
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

  return (
    <Screen onRefresh={() => Promise.all([recent.reload(), top.reload()])}>
      <Card>
        <CardHeader>
          <CardTitle>Recently blocked</CardTitle>
          <CardDescription>Updates every few seconds. Tap Allow if something you need was blocked.</CardDescription>
        </CardHeader>
        <CardContent>
          {!recent.data ? (
            <ListSkeleton />
          ) : recent.data.length === 0 ? (
            <Empty>Nothing blocked yet. Browse a site with ads and check back.</Empty>
          ) : (
            groupByDomain(recent.data).map((q, i) => (
              <React.Fragment key={q.domain}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 py-2.5">
                  <View className="flex-1">
                    <Text className="font-medium">{q.domain}</Text>
                    <Text className="text-xs text-muted-foreground">
                      {timeAgo(q.time)} · {q.client}
                      {q.count > 1 ? ` · ${q.count}×` : ''}
                    </Text>
                  </View>
                  <Button variant="outline" size="sm" onPress={() => allow(q.domain)}>
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
          <CardTitle>Most blocked</CardTitle>
          <CardDescription>Since EasioProtect started.</CardDescription>
        </CardHeader>
        <CardContent>
          {!top.data ? (
            <ListSkeleton />
          ) : top.data.length === 0 ? (
            <Empty>Nothing blocked yet.</Empty>
          ) : (
            top.data.map((d, i) => (
              <React.Fragment key={d.domain}>
                {i > 0 && <Separator />}
                <View className="flex-row items-center justify-between gap-3 py-2.5">
                  <Text className="flex-1 font-medium">{d.domain}</Text>
                  <Badge variant="secondary">
                    <Text>{formatNumber(d.count)}</Text>
                  </Badge>
                </View>
              </React.Fragment>
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
