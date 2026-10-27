import * as React from 'react';
import { AccessibilityInfo, Animated, Easing, type ViewStyle } from 'react-native';

/**
 * A ring that slowly pulses outward from behind its parent's centre, like
 * the web app's "You're protected" shield. Only transform and opacity
 * animate, on the native driver. It stays still when the system asks for
 * reduced motion (Android: Remove animations).
 */
export function PulseRing({ size, color }: { size: number; color: string }) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = React.useState(true);

  React.useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 2100,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(500),
      ]),
      { resetBeforeIteration: true }
    );
    loop.start();
    return () => {
      loop.stop();
      progress.setValue(0);
    };
  }, [progress, reduceMotion]);

  if (reduceMotion) return null;

  const style: Animated.WithAnimatedObject<ViewStyle> = {
    position: 'absolute',
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: color,
    // Starts as a soft tint (like bg-success/15 at its peak) and fades out.
    opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0] }),
    transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
  };
  return <Animated.View pointerEvents="none" aria-hidden style={style} />;
}
