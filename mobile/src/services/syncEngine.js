import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPendingSyncChanges, commitSyncSuccess } from './offlineStorage';

// Configurable API base URL (can point to local IP or deployed Render/Neon URL)
const DEFAULT_API_URL = 'http://10.0.2.2:5000/api'; // Standard Android emulator localhost; or Render URL

export async function getApiUrl() {
  const custom = await AsyncStorage.getItem('@notifai_api_url');
  return custom || DEFAULT_API_URL;
}

export async function setApiUrl(url) {
  await AsyncStorage.setItem('@notifai_api_url', url);
}

/**
 * Perform Bidirectional Sync with Notifai space Backend
 */
export async function performSync() {
  try {
    const token = await AsyncStorage.getItem('@notifai_auth_token');
    if (!token) {
      return { success: false, reason: 'NO_AUTH_TOKEN' };
    }

    const apiUrl = await getApiUrl();
    const rawMeta = await AsyncStorage.getItem('@notifai_sync_metadata');
    const meta = rawMeta ? JSON.parse(rawMeta) : {};

    const changes = await getPendingSyncChanges();

    const response = await axios.post(`${apiUrl}/sync`, {
      lastSyncedAt: meta.lastSyncedAt || null,
      clientTime: new Date().toISOString(),
      changes
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.data && response.data.success) {
      await commitSyncSuccess(response.data);
      return {
        success: true,
        quota: response.data.quota,
        syncGracePeriod: response.data.syncGracePeriod
      };
    } else {
      return { success: false, reason: response.data?.message || 'Sync failed' };
    }
  } catch (error) {
    console.warn('Sync connection skipped or failed (will work offline):', error.message);
    return { success: false, isOffline: true, message: error.message };
  }
}
