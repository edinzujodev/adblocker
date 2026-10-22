import { cn } from '@/lib/utils';
import * as SwitchPrimitives from '@rn-primitives/switch';
import { Platform } from 'react-native';

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root
      className={cn(
        // 28x48 track; hitSlop below brings the tap area to 48dp.
        'flex h-7 w-12 shrink-0 flex-row items-center rounded-full border border-transparent px-0.5',
        Platform.select({
          web: 'focus-visible:border-ring focus-visible:ring-ring/50 peer inline-flex outline-none transition-all focus-visible:ring-[3px] disabled:cursor-not-allowed',
        }),
        // The "off" track uses muted-foreground so it stays >= 3:1 against the card.
        props.checked ? 'bg-primary' : 'bg-muted-foreground',
        props.disabled && 'opacity-50',
        className
      )}
      hitSlop={10}
      {...props}>
      <SwitchPrimitives.Thumb
        className={cn(
          'size-6 rounded-full bg-white shadow-sm shadow-black/20 transition-transform',
          Platform.select({
            web: 'pointer-events-none block ring-0',
          }),
          props.checked
            ? 'dark:bg-primary-foreground translate-x-5'
            : 'translate-x-0'
        )}
      />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
