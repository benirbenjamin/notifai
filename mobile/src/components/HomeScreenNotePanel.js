import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

export default function HomeScreenNotePanel({ todayTasks = [], onToggleTask, onOpenApp }) {
  const pendingTasks = todayTasks.filter(t => !t.is_completed);

  return (
    <View style={styles.widgetContainer}>
      
      {/* Widget Header / Note Top Bar */}
      <View style={styles.widgetHeader}>
        <View style={styles.titleRow}>
          <View style={styles.dot} />
          <Text style={styles.widgetTitle}>TODAY'S TASKS</Text>
        </View>
        <Text style={styles.countBadge}>
          {pendingTasks.length} pending
        </Text>
      </View>

      {/* Note Body: List of uncompleted tasks */}
      <View style={styles.noteSheet}>
        {pendingTasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎉</Text>
            <Text style={styles.emptyText}>All today's tasks completed!</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollList} nestedScrollEnabled>
            {pendingTasks.slice(0, 5).map((task) => {
              const isUrgent = task.priority === 'urgent' || task.priority === 'high';
              return (
                <View key={task.id} style={styles.taskRow}>
                  {/* Quick Checkbox */}
                  <TouchableOpacity
                    style={styles.checkbox}
                    onPress={() => onToggleTask(task.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.checkboxBox} />
                  </TouchableOpacity>

                  <View style={styles.taskDetails}>
                    <Text style={styles.taskTitle} numberOfLines={1}>
                      {task.title}
                    </Text>

                    <View style={styles.metaBadgeRow}>
                      <View style={[styles.priorityPill, { backgroundColor: isUrgent ? '#ef4444' : '#0284c7' }]}>
                        <Text style={styles.priorityText}>{(task.priority || 'medium').toUpperCase()}</Text>
                      </View>

                      {task.due_date ? (
                        <Text style={styles.timeText}>
                          ⏰ {new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* Widget Footer */}
      <TouchableOpacity style={styles.widgetFooter} onPress={onOpenApp} activeOpacity={0.7}>
        <Text style={styles.footerText}>⚡ Notifai space Note Panel • Tap to view all</Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  widgetContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#334155',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    marginVertical: 12,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#38bdf8',
    marginRight: 8,
  },
  widgetTitle: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  countBadge: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  noteSheet: {
    padding: 12,
    minHeight: 120,
    maxHeight: 220,
    backgroundColor: '#1e293b',
  },
  scrollList: {
    flex: 1,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51, 65, 85, 0.5)',
  },
  checkbox: {
    marginRight: 12,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#64748b',
    backgroundColor: '#0f172a',
  },
  taskDetails: {
    flex: 1,
  },
  taskTitle: {
    color: '#f1f5f9',
    fontSize: 13,
    fontWeight: '600',
  },
  metaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  priorityPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  priorityText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  timeText: {
    color: '#94a3b8',
    fontSize: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  emptyEmoji: {
    fontSize: 24,
    marginBottom: 6,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '500',
  },
  widgetFooter: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
});
