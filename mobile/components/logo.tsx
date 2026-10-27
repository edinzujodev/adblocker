import { THEME } from '@/lib/theme';
import { useColorScheme } from 'nativewind';
import Svg, { Path } from 'react-native-svg';

/** JoK shield. */
export function Logo({ size = 28 }: { size?: number }) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M32 4 8 13v17c0 15 10.2 26.6 24 30 13.8-3.4 24-15 24-30V13L32 4Z" fill={theme.primary} />
      <Path
        d="m21 21 22 22M43 21 21 43"
        stroke={theme.primaryForeground}
        strokeWidth={6}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
