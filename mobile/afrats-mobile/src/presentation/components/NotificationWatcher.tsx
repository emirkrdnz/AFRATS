import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { notificationApi } from '@/data/api/notification.api';
import { colors } from '@/core/theme';
import { navigateToNotificationTarget } from '@/presentation/navigation/navigationRef';

const POLL_MS = 20000;

// Type → toast accent + glyph. Matches NotificationListScreen's TYPE_META.
const META: Record<string, { color: string; icon: string }> = {
  AnomalyAlert: { color: colors.danger, icon: '!' },
  HighRisk: { color: colors.warning, icon: '↗' },
  System: { color: colors.secondary, icon: 'i' },
};
const metaFor = (t: string) => META[t] ?? { color: colors.textMuted, icon: '•' };

interface Noti { id: string; type: string; title: string; message: string; relatedId?: string; createdAt: string; }

// Polls for new notifications while the app is foregrounded and shows a
// top banner toast for anything newer than what was present on mount. Renders
// nothing. Mounted only inside the authenticated tab tree.
export const NotificationWatcher = () => {
  const insets = useSafeAreaInsets();
  // Latest createdAt we've already accounted for. Set on the first poll so we
  // never toast notifications that existed before this session.
  const seenAtRef = useRef<number | null>(null);
  const inAppEnabledRef = useRef(true);

  useEffect(() => {
    let cancelled = false;

    notificationApi.getPreferences()
      .then((p) => { inAppEnabledRef.current = p?.inAppEnabled !== false; })
      .catch(() => {});

    const showToast = (n: Noti) => {
      const { color, icon } = metaFor(n.type);
      Toast.show({
        type: 'afrats',
        text1: n.title,
        text2: n.message,
        position: 'top',
        topOffset: insets.top + 8,
        visibilityTime: 4000,
        props: {
          color,
          icon,
          onPress: () => {
            Toast.hide();
            navigateToNotificationTarget(n.type, n.relatedId);
          },
        },
      });
    };

    const poll = async () => {
      try {
        const res: any = await notificationApi.getAll({ page: 1, pageSize: 10 });
        const items: Noti[] = res?.items ?? [];
        if (cancelled || !items.length) return;
        const sorted = [...items].sort(
          (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
        );
        const newestAt = +new Date(sorted[0].createdAt);

        if (seenAtRef.current == null) {
          seenAtRef.current = newestAt; // baseline — don't toast history
          return;
        }
        const fresh = sorted.filter((n) => +new Date(n.createdAt) > seenAtRef.current!);
        if (fresh.length) {
          seenAtRef.current = newestAt;
          if (inAppEnabledRef.current) showToast(fresh[0]); // newest only — no spam
        }
      } catch { /* offline / token refresh — try again next tick */ }
    };

    poll();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') poll();
    }, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') poll(); });

    return () => { cancelled = true; clearInterval(timer); sub.remove(); };
  }, [insets.top]);

  return null;
};
