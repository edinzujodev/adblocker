import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { EyeIcon, EyeOffIcon } from 'lucide-react-native';
import * as React from 'react';
import { View, type TextInputProps } from 'react-native';

interface Props {
  labelledBy: string;
  value: string;
  onChangeText: (value: string) => void;
  autoComplete: 'current-password' | 'new-password';
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: () => void;
}

/** Password field with a show/hide button. Works with password managers. */
export function PasswordInput({ labelledBy, autoComplete, ...props }: Props) {
  const [show, setShow] = React.useState(false);
  return (
    <View>
      <Input
        aria-labelledby={labelledBy}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoComplete}
        textContentType={autoComplete === 'new-password' ? 'newPassword' : 'password'}
        className="pr-14"
        {...props}
      />
      <Button
        variant="ghost"
        size="icon"
        onPress={() => setShow(!show)}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute right-0 top-0">
        <Icon as={show ? EyeOffIcon : EyeIcon} size={20} className="text-muted-foreground" />
      </Button>
    </View>
  );
}
