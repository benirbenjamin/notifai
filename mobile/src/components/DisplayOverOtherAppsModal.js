import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, StatusBar } from 'react-native';
import { REMINDER_ACTIONS } from '../services/notificationService';

export default function DisplayOverOtherAppsModal({ visible, task, onAction }) {
  if (!visible || !task) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
    >
      <View style={styles.overlayContainer}>
        <View style={styles.card}>
          
          {/* Top Banner */}
          <View style={styles.header}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>⏰ DEADLINE ALERT</Text>
            </View>
            <Text style={styles.appName}>Notifai space</Text>
          </View>

          {/* Task Info */}
          <View style={styles.content}>
            <Text style={styles.title}>{task.title}</Text>
            {task.description ? (
              <Text style={styles.description}>{task.description}</Text>
            ) : null}

            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Priority:</Text>
              <Text style={[styles.metaValue, { color: task.priority === 'urgent' ? '#f43f5e' : '#38bdf8' }]}>
                {(task.priority || 'medium').toUpperCase()}
              </Text>
            </View>

            {task.due_date ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Deadline:</Text>
                <Text style={styles.metaValue}>
                  {new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.instruction}>
            Please confirm your action to dismiss this reminder:
          </Text>

          {/* 3 User Confirmation Action Buttons */}
          <View style={styles.actionsContainer}>
            
            {/* 1. Okay I know */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnOkay]}
              onPress={() => onAction(task.id, REMINDER_ACTIONS.OKAY_I_KNOW)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnOkayText}>✅ Okay I know</Text>
            </TouchableOpacity>

            {/* 2. Remind me in 30 minutes */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnSnooze]}
              onPress={() => onAction(task.id, REMINDER_ACTIONS.REMIND_30_MIN)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnSnoozeText}>⏰ Remind me in 30 minutes</Text>
            </TouchableOpacity>

            {/* 3. Don't remind */}
            <TouchableOpacity
              style={[styles.actionBtn, styles.btnDismiss]}
              onPress={() => onAction(task.id, REMINDER_ACTIONS.DONT_REMIND)}
              activeOpacity={0.8}
            >
              <Text style={styles.btnDismissText}>🔕 Don't remind</Text>
            </TouchableOpacity>

          </View>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#38bdf8',
    padding: 24,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 25,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 12,
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#f59e0b',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#0f172a',
    fontWeight: '800',
    fontSize: 11,
  },
  appName: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 13,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  description: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  metaLabel: {
    color: '#64748b',
    fontSize: 12,
  },
  metaValue: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  instruction: {
    color: '#cbd5e1',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: 10,
  },
  actionBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOkay: {
    backgroundColor: '#10b981',
  },
  btnOkayText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnSnooze: {
    backgroundColor: '#0284c7',
  },
  btnSnoozeText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  btnDismiss: {
    backgroundColor: '#334155',
  },
  btnDismissText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 13,
  },
});
