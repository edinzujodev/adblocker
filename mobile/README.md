# EasioProtect mobile app

Expo (React Native) app for Android and iOS: expo-router, NativeWind and
react-native-reusables (shadcn/ui-style components). It talks to the
EasioProtect server over its JSON API using the shared client in
`../packages/api` (imported as `@easioprotect/api`).

## Run on your phone (Expo Go)

1. Install **Expo Go** from the Play Store / App Store.
2. Put the phone on the same Wi-Fi as this computer. In Windows, that network
   must be **Private** (Settings → Network & internet → Wi-Fi → your network).
3. Start EasioProtect (the Go server), then:

   ```powershell
   npm install
   npm run dev
   ```

4. Scan the QR code: Android with Expo Go, iPhone with the Camera app.
   Allow Node.js through the Windows firewall when asked.
5. In the app, enter the server address from EasioProtect's startup log
   (e.g. `192.168.0.197:8080`) and the password.

The server address and login token are stored with expo-secure-store.

## Notes

- The server speaks plain `http` on the home network. `app.json` allows that:
  Android `usesCleartextTraffic`, iOS `NSAllowsLocalNetworking` and a
  local-network permission text.
- The project is on Expo SDK 57 to match the Play Store Expo Go. Upgrade to
  SDK 58 (`npx expo install expo@~58.0.0 && npx expo install --fix`) once
  the store Expo Go supports it.
- Store builds (EAS) come later; Expo Go is enough for development.
