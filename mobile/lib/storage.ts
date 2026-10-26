import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Small key-value store for the server address and login token. On a phone
 * it is expo-secure-store (Keychain / Keystore). expo-secure-store has no
 * web version, so in a browser it falls back to localStorage.
 */
export const storage =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key: string) => localStorage.getItem(key),
        setItemAsync: async (key: string, value: string) => localStorage.setItem(key, value),
        deleteItemAsync: async (key: string) => localStorage.removeItem(key),
      }
    : {
        getItemAsync: SecureStore.getItemAsync,
        setItemAsync: SecureStore.setItemAsync,
        deleteItemAsync: SecureStore.deleteItemAsync,
      };
