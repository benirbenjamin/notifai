import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateTaskLocally } from './offlineStorage';

// Configure foreground notification presentation
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const REMINDER_ACTIONS = {
  OKAY_I_KNOW: 'OKAY_I_KNOW',
  REMIND_30_MIN: 'REMIND_30_MIN',
  DONT_REMIND: 'DONT_REMIND',
};

/**
 * Configure Android Notification Channel and Register Interactive Action Buttons
 */
export async function setupNotificationChannelsAndCategories() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('task-reminders', {
      name: 'Task Deadlines & Overlays',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#38bdf8',
      sound: 'default',
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
    });
  }

  // Define Category with 3 specified action buttons:
  // 1. "Okay I know"
  // 2. "Remind me in 30 minutes"
  // 3. "Don't remind"
  await Notifications.setNotificationCategoryAsync('TASK_REMINDER_CATEGORY', [
    {
      identifier: REMINDER_ACTIONS.OKAY_I_KNOW,
      buttonTitle: '✅ Okay I know',
      options: {
        opensAppToForeground: true,
      },
    },
    {
      identifier: REMINDER_ACTIONS.REMIND_30_MIN,
      buttonTitle: '⏰ Remind me in 30 min',
      options: {
        opensAppToForeground: false,
      },
    },
    {
      identifier: REMINDER_ACTIONS.DONT_REMIND,
      buttonTitle: "🔕 Don't remind",
      options: {
        opensAppToForeground: false,
        isDestructive: true,
      },
    },
  ]);
}

/**
 * Handle user tapping on action button
 */
export async function handleReminderAction(taskId, actionIdentifier, onDisplayOverlay = null) {
  console.log(`[Notification Action] Task: ${taskId}, Action: ${actionIdentifier}`);

  if (actionIdentifier === REMINDER_ACTIONS.OKAY_I_KNOW) {
    await updateTaskLocally(taskId, {
      reminder_action: REMINDER_ACTIONS.OKAY_I_KNOW,
      snoozed_until: null,
    });
    if (onDisplayOverlay) onDisplayOverlay(null);
  } else if (actionIdentifier === REMINDER_ACTIONS.REMIND_30_MIN) {
    const snoozedTime = new Date(Date.now() + 30 * 60 * 1000); // + 30 Minutes
    await updateTaskLocally(taskId, {
      reminder_action: REMINDER_ACTIONS.REMIND_30_MIN,
      snoozed_until: snoozedTime.toISOString(),
    });

    // Schedule local notification 30 minutes in future
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Snoozed Deadline Alert',
        body: '30 minutes have passed since your reminder.',
        data: { taskId, type: 'TASK_REMINDER_OVERLAY' },
        categoryIdentifier: 'TASK_REMINDER_CATEGORY',
        sound: 'default',
        channelId: 'task-reminders',
      },
      trigger: {
        seconds: 30 * 60,
      },
    });

    if (onDisplayOverlay) onDisplayOverlay(null);
  } else if (actionIdentifier === REMINDER_ACTIONS.DONT_REMIND) {
    await updateTaskLocally(taskId, {
      reminder_action: REMINDER_ACTIONS.DONT_REMIND,
      snoozed_until: null,
    });
    if (onDisplayOverlay) onDisplayOverlay(null);
  }
}

/**
 * Schedule a local deadline reminder for a task
 */
export async function scheduleTaskReminder(task) {
  if (!task.due_date && !task.reminder_time) return null;

  const targetDate = task.reminder_time ? new Date(task.reminder_time) : new Date(task.due_date);
  const now = new Date();

  const secondsUntil = Math.max(1, Math.floor((targetDate.getTime() - now.getTime()) / 1000));

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `⏰ Task Deadline: ${task.title}`,
      body: task.description || 'Task deadline reminder from Notifai space',
      data: {
        taskId: task.id,
        title: task.title,
        priority: task.priority,
        type: 'TASK_REMINDER_OVERLAY',
      },
      categoryIdentifier: 'TASK_REMINDER_CATEGORY',
      sound: 'default',
      channelId: 'task-reminders',
    },
    trigger: {
      seconds: secondsUntil,
    },
  });

  return id;
}
