import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useSession } from '@/lib/session';
import { THEME } from '@/lib/theme';
import { Tabs } from 'expo-router';
import { ActivityIcon, ListIcon, LogOutIcon, ShieldIcon, type LucideIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import { View, type ColorValue } from 'react-native';

function tabIcon(icon: LucideIcon) {
  return ({ color, size }: { color: ColorValue; size: number }) => <Icon as={icon} color={String(color)} size={size} />;
}

export default function TabsLayout() {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  const { signOut } = useSession();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
        headerTitle: () => (
          <View className="flex-row items-center gap-2">
            <Logo />
            <Text className="text-lg font-semibold">EasioProtect</Text>
          </View>
        ),
        headerTitleAlign: 'left',
        headerRight: () => (
          <Button variant="ghost" size="sm" onPress={signOut} className="mr-2">
            <Icon as={LogOutIcon} className="text-foreground" />
            <Text>Log out</Text>
          </Button>
        ),
      }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: tabIcon(ShieldIcon) }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: tabIcon(ActivityIcon) }} />
      <Tabs.Screen name="lists" options={{ title: 'Lists', tabBarIcon: tabIcon(ListIcon) }} />
    </Tabs>
  );
}
