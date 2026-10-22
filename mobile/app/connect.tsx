import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { errorMessage, useSession } from '@/lib/session';
import { EyeIcon, EyeOffIcon } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Server address + password. The address is remembered for next time. */
export default function ConnectScreen() {
  const { state, signIn } = useSession();
  const [server, setServer] = React.useState(
    state.status === 'signedOut' ? state.server.replace(/^http:\/\//, '') : ''
  );
  const [password, setPassword] = React.useState('');
  const [show, setShow] = React.useState(false);
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!server.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      await signIn(server, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1">
        <ScrollView
          contentContainerClassName="flex-grow justify-center gap-6 p-4"
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

          <Card>
            <CardContent className="gap-5">
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
                <View>
                  <Input
                    aria-labelledby="password"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!show}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="current-password"
                    returnKeyType="go"
                    onSubmitEditing={submit}
                    className="pr-14"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onPress={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-0 top-0">
                    <Icon
                      as={show ? EyeOffIcon : EyeIcon}
                      size={20}
                      className="text-muted-foreground"
                    />
                  </Button>
                </View>
                <Text className="text-sm text-muted-foreground">
                  Printed in the EasioProtect window when it starts, and saved in
                  admin-password.txt.
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
          <Text className="text-center text-sm text-muted-foreground">
            Your phone must be on the same Wi-Fi as the computer running EasioProtect.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
