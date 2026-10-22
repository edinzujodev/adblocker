import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Kind = 'success' | 'error';

const ToastContext = React.createContext<{ show: (message: string, kind?: Kind) => void } | null>(null);

/** A minimal toast: one message at a time, at the top, fades out after 2.5 s. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = React.useState<{ message: string; kind: Kind } | null>(null);
  const opacity = React.useRef(new Animated.Value(0)).current;
  const timer = React.useRef<ReturnType<typeof setTimeout>>(undefined);
  const insets = useSafeAreaInsets();

  const show = React.useCallback(
    (message: string, kind: Kind = 'success') => {
      clearTimeout(timer.current);
      setToast({ message, kind });
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
      }, 2500);
    },
    [opacity]
  );

  const value = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="none"
          style={{ opacity, position: 'absolute', left: 16, right: 16, top: insets.top + 8 }}>
          <View
            className={cn(
              'rounded-xl border px-4 py-3 shadow-lg shadow-black/10',
              toast.kind === 'error' ? 'border-destructive/30 bg-card' : 'border-border bg-card'
            )}>
            <Text className={cn('text-sm font-medium', toast.kind === 'error' && 'text-destructive')}>
              {toast.message}
            </Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
