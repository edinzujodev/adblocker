import { PasswordInput } from '@/components/password-input';
import { PageHeader, Screen } from '@/components/screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { errorMessage, useApi, useSession } from '@/lib/session';
import { useToast } from '@/lib/toast';
import { MIN_PASSWORD_LENGTH } from '@jok/api';
import { KeyRoundIcon, LifeBuoyIcon, LogOutIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, View } from 'react-native';

export default function SettingsScreen() {
  const { signOut } = useSession();
  return (
    <Screen>
      <PageHeader
        title="Settings"
        description="Your password and how to get back in if you forget it."
      />
      <ChangePasswordCard />
      <Card>
        <CardHeader>
          <View className="flex-row items-center gap-2">
            <Icon as={LifeBuoyIcon} size={20} className="text-muted-foreground" />
            <CardTitle>Forgot your password?</CardTitle>
          </View>
          <CardDescription>
            On the login screen, enter the master password instead. It lets you set a new password.
            The master password can't be changed here.
          </CardDescription>
        </CardHeader>
      </Card>
      <Button variant="outline" onPress={signOut}>
        <Icon as={LogOutIcon} size={18} />
        <Text>Log out of this phone</Text>
      </Button>
    </Screen>
  );
}

function ChangePasswordCard() {
  const { api } = useApi();
  const toast = useToast();
  const [current, setCurrent] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    setError('');
    try {
      await api.changePassword(current, password);
      toast.show('Password changed. Other devices need to log in again.');
      setCurrent('');
      setPassword('');
      setConfirm('');
    } catch (err) {
      // Shown next to the form, not as a toast: a wrong current password
      // shouldn't sign this phone out.
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon as={KeyRoundIcon} size={20} className="text-muted-foreground" />
          <CardTitle>Change password</CardTitle>
        </View>
        <CardDescription>
          Everyone logs in with this password. Other devices will need the new one.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
        <View className="gap-2">
          <Label nativeID="current-password">Current password</Label>
          <PasswordInput
            labelledBy="current-password"
            value={current}
            onChangeText={setCurrent}
            autoComplete="current-password"
            returnKeyType="next"
          />
        </View>
        <View className="gap-2">
          <Label nativeID="new-password">New password</Label>
          <PasswordInput
            labelledBy="new-password"
            value={password}
            onChangeText={setPassword}
            autoComplete="new-password"
            returnKeyType="next"
          />
          <Text className="text-sm text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </Text>
        </View>
        <View className="gap-2">
          <Label nativeID="confirm-password">Type the new password again</Label>
          <PasswordInput
            labelledBy="confirm-password"
            value={confirm}
            onChangeText={setConfirm}
            autoComplete="new-password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
        </View>
        {!!error && (
          <Text role="alert" className="font-medium text-destructive">
            {error}
          </Text>
        )}
        <Button onPress={submit} disabled={busy || !current || !password} className="self-start">
          {busy && <ActivityIndicator color="white" />}
          <Text>Change password</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
