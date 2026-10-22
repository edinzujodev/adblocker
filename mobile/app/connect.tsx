import { Logo } from '@/components/logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Text } from '@/components/ui/text';
import { errorMessage, useSession } from '@/lib/session';
import * as React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Server address + password. The address is remembered for next time. */
export default function ConnectScreen() {
  const { state, signIn } = useSession();
  const [server, setServer] = React.useState(state.status === 'signedOut' ? state.server.replace(/^http:\/\//, '') : '');
  const [password, setPassword] = React.useState('');
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
    <SafeAreaView className="flex-1 bg-muted/40">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerClassName="flex-grow justify-center p-4" keyboardShouldPersistTaps="handled">
          <Card>
            <CardHeader className="items-center gap-2">
              <Logo size={56} />
              <CardTitle className="text-2xl">EasioProtect</CardTitle>
              <CardDescription className="text-center">
                Connect to EasioProtect on your home network. The address and password are shown when the server starts.
              </CardDescription>
            </CardHeader>
            <CardContent className="gap-4">
              <View className="gap-1.5">
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
                  className="h-11"
                />
              </View>
              <View className="gap-1.5">
                <Label nativeID="password">Password</Label>
                <Input
                  aria-labelledby="password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                  className="h-11"
                />
              </View>
              <Button onPress={submit} disabled={busy || !server.trim() || !password} className="h-11">
                {busy && <ActivityIndicator color="white" />}
                <Text>Connect</Text>
              </Button>
              {!!error && <Text className="text-sm text-destructive">{error}</Text>}
            </CardContent>
          </Card>
          <Text className="mt-4 text-center text-sm text-muted-foreground">
            Your phone must be on the same Wi-Fi as the computer running EasioProtect.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
