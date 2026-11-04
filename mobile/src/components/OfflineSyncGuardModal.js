import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator } from 'react-native';

export default function OfflineSyncGuardModal({ visible, hoursSinceLastSync, onSyncNow, syncing }) {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
    >
      <View style={styles.overlayContainer}>
        <View style={styles.card}>
          
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⚠️</Text>
          </View>

          <Text style={styles.title}>3-Day Offline Limit Exceeded</Text>

          <Text style={styles.description}>
            You have been working offline for <Text style={styles.highlight}>{hoursSinceLastSync} hours</Text> (over the 72-hour limit).
          </Text>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              • Offline tasks and reminders are safely queued on your device.{'\n'}
              • Internet connection is required now to synchronize changes with your Neon DB account and verify your subscription limits.
            </Text>
          </View>

          <TouchableOpacity
            style={styles.syncBtn}
            onPress={onSyncNow}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.syncBtnText}>🔄 Connect & Sync Data Now</Text>
            )}
          </TouchableOpacity>

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#1e293b',
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#f59e0b',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 25,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 32,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    color: '#cbd5e1',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 18,
  },
  highlight: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  infoBox: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 14,
    width: '100%',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  infoText: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
  syncBtn: {
    backgroundColor: '#0284c7',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
});
