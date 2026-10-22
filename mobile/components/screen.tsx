import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

/** Scrollable tab content with pull-to-refresh. */
export function Screen({ children, onRefresh }: { children: React.ReactNode; onRefresh?: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        await onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;

  return (
    <ScrollView
      className="flex-1 bg-muted/40"
      contentContainerClassName="gap-4 p-4 pb-8"
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {children}
      <Text className="text-center text-sm text-muted-foreground">
        Changes apply right away, but devices may remember old answers for a few minutes.
      </Text>
    </ScrollView>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text className="py-4 text-center text-sm text-muted-foreground">{children}</Text>;
}

export function ListSkeleton() {
  return (
    <View className="gap-3 py-1">
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
      <Skeleton className="h-9" />
    </View>
  );
}
