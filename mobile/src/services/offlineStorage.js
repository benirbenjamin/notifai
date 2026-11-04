import AsyncStorage from '@react-native-async-storage/async-storage';

const TASKS_STORAGE_KEY = '@notifai_offline_tasks';
const SYNC_METADATA_KEY = '@notifai_sync_metadata';
const QUOTA_STORAGE_KEY = '@notifai_user_quota';

const MAX_OFFLINE_HOURS = 72; // 3 Days

/**
 * Check if the 3-day offline grace period has expired.
 * If user hasn't synced within 72 hours, offline task modification is locked.
 */
export async function checkOfflineStatus() {
  try {
    const rawMeta = await AsyncStorage.getItem(SYNC_METADATA_KEY);
    const meta = rawMeta ? JSON.parse(rawMeta) : null;

    if (!meta || !meta.lastSyncedAt) {
      // First run: establish current time as baseline
      const now = new Date().toISOString();
      await AsyncStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({ lastSyncedAt: now }));
      return {
        isExpired: false,
        hoursSinceLastSync: 0,
        hoursRemaining: MAX_OFFLINE_HOURS,
        canModify: true
      };
    }

    const lastSyncTime = new Date(meta.lastSyncedAt).getTime();
    const now = Date.now();
    const elapsedHours = (now - lastSyncTime) / (1000 * 60 * 60);

    const isExpired = elapsedHours >= MAX_OFFLINE_HOURS;
    const hoursRemaining = Math.max(0, MAX_OFFLINE_HOURS - elapsedHours);

    return {
      isExpired,
      hoursSinceLastSync: Math.floor(elapsedHours),
      hoursRemaining: Math.floor(hoursRemaining),
      canModify: !isExpired,
      lastSyncedAt: meta.lastSyncedAt
    };
  } catch (error) {
    console.error('Error checking offline status:', error);
    return { isExpired: false, hoursRemaining: MAX_OFFLINE_HOURS, canModify: true };
  }
}

/**
 * Fetch all local tasks (filters out soft-deleted)
 */
export async function getLocalTasks() {
  try {
    const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
    const tasks = raw ? JSON.parse(raw) : [];
    return tasks.filter(t => t._sync_status !== 'pending_delete');
  } catch (error) {
    console.error('Error fetching local tasks:', error);
    return [];
  }
}

/**
 * Save new task locally (Works 100% without internet for up to 3 days)
 */
export async function saveTaskLocally(taskData) {
  const status = await checkOfflineStatus();
  if (status.isExpired) {
    throw new Error('OFFLINE_LIMIT_EXPIRED: You have been offline for over 3 days. Connect to the internet to sync data before adding tasks.');
  }

  const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const newTask = {
    ...taskData,
    id: localId,
    localId,
    is_completed: false,
    _sync_status: 'pending_create',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const tasks = await getLocalTasks();
  tasks.unshift(newTask);
  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  return newTask;
}

/**
 * Update task locally
 */
export async function updateTaskLocally(id, updates) {
  const status = await checkOfflineStatus();
  if (status.isExpired) {
    throw new Error('OFFLINE_LIMIT_EXPIRED: 3-day offline limit reached. Connect to the internet to sync data.');
  }

  const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  let tasks = raw ? JSON.parse(raw) : [];

  tasks = tasks.map(t => {
    if (t.id === id || t.localId === id) {
      return {
        ...t,
        ...updates,
        _sync_status: t._sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
        updated_at: new Date().toISOString()
      };
    }
    return t;
  });

  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Toggle task completion locally
 */
export async function toggleTaskLocally(id) {
  const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  let tasks = raw ? JSON.parse(raw) : [];

  tasks = tasks.map(t => {
    if (t.id === id || t.localId === id) {
      const isCompleted = !t.is_completed;
      return {
        ...t,
        is_completed: isCompleted,
        completed_at: isCompleted ? new Date().toISOString() : null,
        _sync_status: t._sync_status === 'pending_create' ? 'pending_create' : 'pending_update',
        updated_at: new Date().toISOString()
      };
    }
    return t;
  });

  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Delete task locally
 */
export async function deleteTaskLocally(id) {
  const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  let tasks = raw ? JSON.parse(raw) : [];

  tasks = tasks.map(t => {
    if (t.id === id || t.localId === id) {
      return { ...t, _sync_status: 'pending_delete' };
    }
    return t;
  });

  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
}

/**
 * Get pending offline changes for bidirectional sync
 */
export async function getPendingSyncChanges() {
  const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  const tasks = raw ? JSON.parse(raw) : [];

  const created = tasks.filter(t => t._sync_status === 'pending_create');
  const updated = tasks.filter(t => t._sync_status === 'pending_update');
  const deletedIds = tasks.filter(t => t._sync_status === 'pending_delete').map(t => t.id);

  return { created, updated, deletedIds };
}

/**
 * Reconcile sync result from server: update IDs, merge server updates, update lastSyncedAt
 */
export async function commitSyncSuccess(syncResult) {
  const { serverTime, idMappings = {}, serverChanges = [], quota } = syncResult;

  // 1. Fetch current local
  const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
  let tasks = raw ? JSON.parse(raw) : [];

  // Remove pending deletes
  tasks = tasks.filter(t => t._sync_status !== 'pending_delete');

  // Remap localIds to Neon DB server UUIDs
  tasks = tasks.map(t => {
    if (t.localId && idMappings[t.localId]) {
      return {
        ...t,
        id: idMappings[t.localId],
        _sync_status: 'synced'
      };
    }
    if (t._sync_status === 'pending_update') {
      return { ...t, _sync_status: 'synced' };
    }
    return t;
  });

  // Merge server changes
  const taskMap = new Map();
  tasks.forEach(t => taskMap.set(t.id, t));

  serverChanges.forEach(serverTask => {
    taskMap.set(serverTask.id, {
      ...serverTask,
      _sync_status: 'synced'
    });
  });

  const merged = Array.from(taskMap.values());
  await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(merged));

  // 2. Update Sync Metadata (Refreshes the 3-day grace period!)
  await AsyncStorage.setItem(SYNC_METADATA_KEY, JSON.stringify({
    lastSyncedAt: serverTime || new Date().toISOString()
  }));

  // 3. Save Quota Info
  if (quota) {
    await AsyncStorage.setItem(QUOTA_STORAGE_KEY, JSON.stringify(quota));
  }
}
