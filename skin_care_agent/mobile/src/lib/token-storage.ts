import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const REFRESH_TOKEN_KEY = 'skin-care-agent.refresh-token';
let webMemoryToken: string | null = null;

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadRefreshToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return webMemoryToken;
  }
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY, options);
}

export async function saveRefreshToken(refreshToken: string): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryToken = refreshToken;
    return;
  }
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken, options);
}

export async function clearRefreshToken(): Promise<void> {
  if (Platform.OS === 'web') {
    webMemoryToken = null;
    return;
  }
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY, options);
}
