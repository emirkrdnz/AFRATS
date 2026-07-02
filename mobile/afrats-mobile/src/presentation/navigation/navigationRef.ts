import { createNavigationContainerRef } from '@react-navigation/native';
import type { AppTabsParamList } from './AppTabs';

// Global navigation ref so things outside the screen tree (e.g. the in-app
// notification toast) can navigate.
export const navigationRef = createNavigationContainerRef<AppTabsParamList>();

// Mirrors NotificationListScreen's tap handling so a toast tap lands on the
// same destination as opening the notification from the inbox.
export function navigateToNotificationTarget(type: string, relatedId?: string) {
  if (!navigationRef.isReady()) return;
  if (type === 'AnomalyAlert' && relatedId) {
    navigationRef.navigate('Anomalies', {
      screen: 'AnomalyDetail',
      params: { transactionId: relatedId },
      initial: false,
    } as never);
  } else if (type === 'HighRisk') {
    navigationRef.navigate('Risk');
  } else {
    navigationRef.navigate('Dashboard', { screen: 'Notifications' } as never);
  }
}
