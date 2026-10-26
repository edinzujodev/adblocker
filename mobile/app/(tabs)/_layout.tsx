import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { StatusProvider, useStatus } from '@/lib/status';
import { THEME } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { Tabs } from 'expo-router';
import {
  ActivityIcon,
  HouseIcon,
  LayersIcon,
  ListChecksIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  type LucideIcon,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { View, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function tabIcon(icon: LucideIcon) {
  return function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View
        className={cn(
          'h-8 w-16 items-center justify-center rounded-full',
          focused && 'bg-primary/10'
        )}>
        <Icon as={icon} color={String(color)} size={22} />
      </View>
    );
  };
}

export default function TabsLayout() {
  return (
    <StatusProvider>
      <TabsNavigator />
    </StatusProvider>
  );
}

function TabsNavigator() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  const { signOut } = useSession();
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
        // Taller than the default for 48dp targets, kept clear of the gesture bar.
        tabBarStyle: {
          height: 68 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        headerStyle: { backgroundColor: theme.card },
        headerShadowVisible: false,
        headerTitle: () => (
          <View className="flex-row items-center gap-2">
            <Logo />
            <Text className="text-lg font-bold">EasioProtect</Text>
            <StatusPill />
          </View>
        ),
        headerTitleAlign: 'left',
        headerRight: () => (
          <Button
            variant="ghost"
            size="icon"
            onPress={signOut}
            aria-label="Log out"
            className="mr-1">
            <Icon as={LogOutIcon} className="text-muted-foreground" size={22} />
          </Button>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(HouseIcon) }} />
      <Tabs.Screen name="groups" options={{ title: 'Groups', tabBarIcon: tabIcon(LayersIcon) }} />
      <Tabs.Screen
        name="activity"
        options={{ title: 'Activity', tabBarIcon: tabIcon(ActivityIcon) }}
      />
      <Tabs.Screen
        name="lists"
        options={{ title: 'My lists', tabBarIcon: tabIcon(ListChecksIcon) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon(SettingsIcon) }}
      />
    </Tabs>
  );
}

/** Protection state on every tab, with an icon and words, not color alone. */
function StatusPill() {
  const { status } = useStatus();
  if (!status) return null;
  const on = status.enabled;
  return (
    <View
      className={cn(
        'flex-row items-center gap-1 rounded-full px-2.5 py-1',
        on ? 'bg-success/15' : 'bg-destructive/15'
      )}>
      <Icon
        as={on ? ShieldCheckIcon : ShieldOffIcon}
        size={14}
        className={on ? 'text-success' : 'text-destructive'}
      />
      <Text className={cn('text-xs font-bold', on ? 'text-success' : 'text-destructive')}>
        {on ? 'Protected' : 'Paused'}
      </Text>
    </View>
  );
}
