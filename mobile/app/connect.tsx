import { Logo } from '@/components/logo';
import { PasswordInput } from '@/components/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { errorMessage, useSession } from '@/lib/session';
import { MIN_PASSWORD_LENGTH } from '@easioprotect/api';
import { CircleCheckIcon, KeyRoundIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Server address + password. The address is remembered for next time. */
export default function ConnectScreen() {
  const { state } = useSession();
  const [server, setServer] = React.useState(
    state.status === 'signedOut' ? state.server.replace(/^http:\/\//, '') : ''
  );
  // Set when the master password was used: the next step is a new password.
  const [resetToken, setResetToken] = React.useState('');
  const [notice, setNotice] = React.useState('');

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentContainerClassName="w-full max-w-md flex-grow justify-center gap-6 self-center p-4"
          keyboardShouldPersistTaps="handled">
          <View className="items-center gap-3">
            <Logo size={64} />
            <View className="gap-1">
              <Text role="heading" aria-level={1} className="text-center text-2xl font-bold">
                EasioProtect
              </Text>
              <Text className="text-center text-muted-foreground">
                Ad and site blocking for your home network
              </Text>
            </View>
          </View>

          {resetToken ? (
            <NewPasswordCard
              server={server}
              resetToken={resetToken}
              onDone={(message) => {
                setResetToken('');
                setNotice(message);
              }}
            />
          ) : (
            <LoginCard
              server={server}
              setServer={setServer}
              notice={notice}
              onReset={setResetToken}
            />
          )}

          <Text className="text-center text-sm text-muted-foreground">
            Your phone must be on the same Wi-Fi as the computer running EasioProtect.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function LoginCard({
  server,
  setServer,
  notice,
  onReset,
}: {
  server: string;
  setServer: (s: string) => void;
  notice: string;
  onReset: (resetToken: string) => void;
}) {
  const { signIn } = useSession();
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!server.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const r = await signIn(server, password);
      if (r) {
        setPassword('');
        onReset(r.resetToken);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="gap-5">
        {!!notice && (
          <View role="status" className="flex-row items-start gap-2 rounded-lg bg-success/10 p-3">
            <Icon as={CircleCheckIcon} size={18} className="text-success" />
            <Text className="flex-1 text-sm font-medium text-success">{notice}</Text>
          </View>
        )}
        <View className="gap-2">
          <Label nativeID="server">Server address</Label>
          <Input
            aria-labelledby="server"
            value={server}
            onChangeText={setServer}
            placeholder="192.168.0.197:8080"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />
          <Text className="text-sm text-muted-foreground">
            The “on your phone” address from the EasioProtect window. It ends in :8080.
          </Text>
        </View>
        <View className="gap-2">
          <Label nativeID="password">Password</Label>
          <PasswordInput
            labelledBy="password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
          <Text className="text-sm text-muted-foreground">
            Forgot it? Enter the master password to set a new one.
          </Text>
        </View>
        {!!error && (
          <Text role="alert" className="font-medium text-destructive">
            {error}
          </Text>
        )}
        <Button size="lg" onPress={submit} disabled={busy || !server.trim() || !password}>
          {busy && <ActivityIndicator color="white" />}
          <Text>Connect</Text>
        </Button>
      </CardContent>
    </Card>
  );
}

/** After a master-password login: choose the new password. */
function NewPasswordCard({
  server,
  resetToken,
  onDone,
}: {
  server: string;
  resetToken: string;
  onDone: (message: string) => void;
}) {
  const { resetPassword } = useSession();
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH)
      return setError(`Use at least ${MIN_PASSWORD_LENGTH} characters.`);
    if (password !== confirm) return setError("The two passwords don't match.");
    setBusy(true);
    setError('');
    try {
      await resetPassword(server, resetToken, password);
      onDone('Your new password is set. Log in with it.');
    } catch (err) {
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
          <CardTitle>Set a new password</CardTitle>
        </View>
        <CardDescription>
          You used the master password. Choose the password everyone will log in with from now on.
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-5">
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
          <Label nativeID="confirm-password">Type it again</Label>
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
        <Button size="lg" onPress={submit} disabled={busy}>
          {busy && <ActivityIndicator color="white" />}
          <Text>Save new password</Text>
        </Button>
        <Button variant="ghost" onPress={() => onDone('')}>
          <Text>Cancel</Text>
        </Button>
      </CardContent>
    </Card>
  );
}
