import { THEME } from '@/lib/theme';
import { useColorScheme } from 'nativewind';
import Svg, { Path, Rect } from 'react-native-svg';

/** JoK logo: a shield with a "no entry" bar. "Jok" means "no". */
export function Logo({ size = 28 }: { size?: number }) {
  const { colorScheme } = useColorScheme();
  const theme = THEME[colorScheme ?? 'light'];
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path
        d="M32 4 8 13v17c0 15 10.2 26.6 24 30 13.8-3.4 24-15 24-30V13L32 4Z"
        fill={theme.primary}
      />
      <Rect x={17} y={27.5} width={30} height={9} rx={4.5} fill={theme.primaryForeground} />
    </Svg>
  );
}
