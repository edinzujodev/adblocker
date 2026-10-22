import { Skeleton } from '@/components/ui/skeleton';
import { Text } from '@/components/ui/text';
import * as React from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

/** Scrollable tab content with pull-to-refresh. */
export function Screen({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh?: () => Promise<unknown>;
}) {
  const [refreshing, setRefreshing] = React.useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        await onRefresh().finally(() => setRefreshing(false));
      }
    : undefined;

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="gap-5 px-4 pb-10 pt-5"
      keyboardShouldPersistTaps="handled"
      refreshControl={refresh && <RefreshControl refreshing={refreshing} onRefresh={refresh} />}>
      {children}
      <Text className="text-center text-sm text-muted-foreground">
        Changes apply right away. Devices can take a few minutes to notice.
      </Text>
    </ScrollView>
  );
}

/** Title and one-line explanation at the top of a tab. */
export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <View className="gap-1">
      <Text role="heading" aria-level={1} className="text-2xl font-bold tracking-tight">
        {title}
      </Text>
      <Text className="text-muted-foreground">{description}</Text>
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text className="py-4 text-center text-sm text-muted-foreground">{children}</Text>;
}

export function ListSkeleton() {
  return (
    <View className="gap-3 py-1">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </View>
  );
}
