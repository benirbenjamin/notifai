import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity, 
  TextInput, 
  StatusBar,
  Alert,
  Modal,
  ActivityIndicator
} from 'react-native';
import * as Notifications from 'expo-notifications';

import { 
  checkOfflineStatus, 
  getLocalTasks, 
  saveTaskLocally, 
  toggleTaskLocally, 
  deleteTaskLocally 
} from './src/services/offlineStorage';
import { performSync } from './src/services/syncEngine';
import { 
  setupNotificationChannelsAndCategories, 
  handleReminderAction, 
  scheduleTaskReminder,
  REMINDER_ACTIONS 
} from './src/services/notificationService';

import DisplayOverOtherAppsModal from './src/components/DisplayOverOtherAppsModal';
import HomeScreenNotePanel from './src/components/HomeScreenNotePanel';
import OfflineSyncGuardModal from './src/components/OfflineSyncGuardModal';

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [offlineStatus, setOfflineStatus] = useState({ isExpired: false, hoursRemaining: 72, hoursSinceLastSync: 0 });
  
  // Overlay Modal State
  const [activeReminderTask, setActiveReminderTask] = useState(null);
  
  // Quick Add Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newDueDateMinutes, setNewDueDateMinutes] = useState('1'); // for easy deadline test

  const refreshAll = async () => {
    setLoading(true);
    try {
      const status = await checkOfflineStatus();
      setOfflineStatus(status);

      const localTasks = await getLocalTasks();
      setTasks(localTasks);
    } catch (err) {
      console.error('Error refreshing tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setupNotificationChannelsAndCategories();
    refreshAll();

    // Listen for incoming notifications to show full-screen overlay over other apps
    const notificationListener = Notifications.addNotificationReceivedListener(notification => {
      const data = notification.request.content.data;
      if (data && data.type === 'TASK_REMINDER_OVERLAY') {
        setActiveReminderTask({
          id: data.taskId,
          title: data.title || notification.request.content.title,
          priority: data.priority || 'medium',
          description: notification.request.content.body,
          due_date: new Date().toISOString()
        });
      }
    });

    // Listen for user interaction with notification actions (e.g. from lockscreen or notification tray)
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const actionId = response.actionIdentifier;
      const data = response.notification.request.content.data;
      if (data && data.taskId) {
        handleReminderAction(data.taskId, actionId, setActiveReminderTask);
        refreshAll();
      }
    });

    return () => {
      Notifications.removeNotificationSubscription(notificationListener);
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, []);

  const handleSyncPress = async () => {
    setSyncing(true);
    const res = await performSync();
    setSyncing(false);

    if (res.success) {
      Alert.alert('✅ Sync Complete', 'Your local tasks and 3-day offline grace period have been refreshed with Neon DB.');
    } else if (res.isOffline) {
      Alert.alert('📡 Offline Mode', 'No internet connection detected. You can continue working offline for up to 3 days.');
    } else {
      Alert.alert('Sync Notice', res.reason || 'Sync completed.');
    }
    refreshAll();
  };

  const handleToggle = async (taskId) => {
    await toggleTaskLocally(taskId);
    refreshAll();
  };

  const handleDelete = async (taskId) => {
    await deleteTaskLocally(taskId);
    refreshAll();
  };

  const handleAddTask = async () => {
    if (!newTitle.trim()) return;

    try {
      // Calculate a due date (e.g. current time + minutes)
      const dueDate = new Date(Date.now() + parseInt(newDueDateMinutes || '5', 10) * 60 * 1000).toISOString();

      const created = await saveTaskLocally({
        title: newTitle.trim(),
        priority: newPriority,
        due_date: dueDate,
        type: 'general',
      });

      // Schedule local alert
      await scheduleTaskReminder(created);

      setNewTitle('');
      setIsAddModalOpen(false);
      refreshAll();
    } catch (err) {
      Alert.alert('Notice', err.message);
    }
  };

  const handleReminderOverlayAction = async (taskId, action) => {
    await handleReminderAction(taskId, action, setActiveReminderTask);
    setActiveReminderTask(null);
    refreshAll();
  };

  // Test trigger for the user to instantly view the Display Over Other Apps Overlay
  const triggerTestReminderOverlay = (task) => {
    setActiveReminderTask(task || {
      id: 'test_task_1',
      title: 'Review Project Deliverables',
      description: 'Make sure the client receives the updated APK and Neon DB documentation.',
      priority: 'urgent',
      due_date: new Date().toISOString()
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>⚡ Notifai space</Text>
          <Text style={styles.subTitle}>Offline-First Task Companion</Text>
        </View>

        <TouchableOpacity 
          style={styles.syncBtn} 
          onPress={handleSyncPress}
          disabled={syncing}
          activeOpacity={0.7}
        >
          {syncing ? (
            <ActivityIndicator size="small" color="#38bdf8" />
          ) : (
            <Text style={styles.syncBtnText}>🔄 Sync</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Offline Status & 3-Day Grace Pill */}
      <View style={styles.gracePillRow}>
        <View style={[
          styles.gracePill, 
          { backgroundColor: offlineStatus.isExpired ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)' }
        ]}>
          <Text style={[
            styles.gracePillText,
            { color: offlineStatus.isExpired ? '#f87171' : '#34d399' }
          ]}>
            {offlineStatus.isExpired 
              ? '⚠️ Offline Limit Exceeded (>72h)' 
              : `🟢 Offline OK (${offlineStatus.hoursRemaining}h remaining)`}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.testAlertBtn}
          onPress={() => triggerTestReminderOverlay(tasks[0])}
          activeOpacity={0.7}
        >
          <Text style={styles.testAlertText}>🔔 Test Overlay</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Android Home Screen Note Widget Panel */}
        <HomeScreenNotePanel 
          todayTasks={tasks} 
          onToggleTask={handleToggle}
          onOpenApp={() => Alert.alert('Note Panel', 'Showing all uncompleted tasks for today.')}
        />

        {/* Task List Header */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>All Tasks ({tasks.length})</Text>
          <TouchableOpacity 
            style={styles.addBtn}
            onPress={() => setIsAddModalOpen(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.addBtnText}>+ Add Task</Text>
          </TouchableOpacity>
        </View>

        {/* Task Cards */}
        {loading ? (
          <ActivityIndicator color="#38bdf8" style={{ marginTop: 24 }} />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No tasks saved locally</Text>
            <Text style={styles.emptySub}>Tap "+ Add Task" to create one. Works offline for up to 3 days!</Text>
          </View>
        ) : (
          tasks.map(task => (
            <View key={task.id} style={styles.taskCard}>
              <TouchableOpacity 
                style={styles.checkCircle}
                onPress={() => handleToggle(task.id)}
              >
                {task.is_completed ? (
                  <View style={styles.checkedCircle} />
                ) : null}
              </TouchableOpacity>

              <View style={styles.cardInfo}>
                <Text style={[styles.cardTitle, task.is_completed && styles.cardTitleDone]}>
                  {task.title}
                </Text>
                
                <View style={styles.cardBadges}>
                  <Text style={[
                    styles.badgeText, 
                    { color: task.priority === 'urgent' ? '#f43f5e' : '#38bdf8' }
                  ]}>
                    {(task.priority || 'medium').toUpperCase()}
                  </Text>
                  
                  {task.due_date ? (
                    <Text style={styles.dateText}>
                      ⏰ {new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  ) : null}

                  {task._sync_status && task._sync_status !== 'synced' ? (
                    <Text style={styles.unsyncedBadge}>Queued Offline</Text>
                  ) : null}
                </View>
              </View>

              <TouchableOpacity 
                onPress={() => handleDelete(task.id)}
                style={styles.deleteBtn}
              >
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Quick Add Task Modal */}
      <Modal visible={isAddModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>New Task</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Task Title (e.g. Submit Report)"
              placeholderTextColor="#64748b"
              value={newTitle}
              onChangeText={setNewTitle}
            />

            <Text style={styles.label}>Priority:</Text>
            <View style={styles.pillRow}>
              {['low', 'medium', 'high', 'urgent'].map(p => (
                <TouchableOpacity
                  key={p}
                  style={[styles.pill, newPriority === p && styles.pillActive]}
                  onPress={() => setNewPriority(p)}
                >
                  <Text style={[styles.pillText, newPriority === p && styles.pillTextActive]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Deadline Reminder in (Minutes from now):</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Minutes (e.g. 1, 5, 30)"
              placeholderTextColor="#64748b"
              keyboardType="numeric"
              value={newDueDateMinutes}
              onChangeText={setNewDueDateMinutes}
            />

            <View style={styles.modalBtnRow}>
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={() => setIsAddModalOpen(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.confirmBtn} 
                onPress={handleAddTask}
              >
                <Text style={styles.confirmBtnText}>Save Task</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 1. Display Over Other Apps Confirmation Overlay Modal */}
      <DisplayOverOtherAppsModal
        visible={!!activeReminderTask}
        task={activeReminderTask}
        onAction={handleReminderOverlayAction}
      />

      {/* 2. 3-Day Offline Limit Guard Modal (Blocks if offline > 72 hours) */}
      <OfflineSyncGuardModal
        visible={offlineStatus.isExpired}
        hoursSinceLastSync={offlineStatus.hoursSinceLastSync}
        onSyncNow={handleSyncPress}
        syncing={syncing}
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  appTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
  },
  subTitle: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  syncBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  syncBtnText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
  },
  gracePillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
  },
  gracePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  gracePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  testAlertBtn: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  testAlertText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 16,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  addBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  addBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  taskCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#64748b',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkedCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  cardTitleDone: {
    textDecorationLine: 'line-through',
    color: '#64748b',
  },
  cardBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  dateText: {
    color: '#94a3b8',
    fontSize: 10,
  },
  unsyncedBadge: {
    color: '#f59e0b',
    fontSize: 10,
    fontStyle: 'italic',
  },
  deleteBtn: {
    padding: 6,
  },
  deleteBtnText: {
    color: '#64748b',
    fontSize: 14,
  },
  emptyCard: {
    backgroundColor: '#1e293b',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySub: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 12,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 6,
    fontWeight: '600',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
  },
  pillActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  pillText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  modalBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 13,
  },
  confirmBtn: {
    backgroundColor: '#0284c7',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  confirmBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});
