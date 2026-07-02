import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '@/core/theme';
import { DashboardScreen } from '@/presentation/screens/dashboard/DashboardScreen';
import { RiskDetailScreen } from '@/presentation/screens/risk/RiskDetailScreen';
import { TransactionListScreen } from '@/presentation/screens/transactions/TransactionListScreen';
import { TransactionFormScreen } from '@/presentation/screens/transactions/TransactionFormScreen';
import { AnomalyListScreen } from '@/presentation/screens/anomalies/AnomalyListScreen';
import { AnomalyDetailScreen } from '@/presentation/screens/anomalies/AnomalyDetailScreen';
import { NotificationListScreen } from '@/presentation/screens/notifications/NotificationListScreen';
import { ProfileScreen } from '@/presentation/screens/profile/ProfileScreen';
import { NotificationWatcher } from '@/presentation/components/NotificationWatcher';

export type AppTabsParamList = {
  Dashboard: undefined;
  TransactionsStack: undefined;
  Anomalies: undefined;
  Risk: undefined;
  Profile: undefined;
};

// Notifications is no longer a tab — it's pushed from the Dashboard bell.
export type DashboardStackParamList = {
  DashboardHome: undefined;
  Notifications: undefined;
};

export type TransactionStackParamList = {
  TransactionList: undefined;
  TransactionForm: { transactionId?: string } | undefined;
};

export type AnomalyStackParamList = {
  AnomalyList: undefined;
  AnomalyDetail: { transactionId: string };
};

const Tab = createBottomTabNavigator<AppTabsParamList>();
const DashStack = createNativeStackNavigator<DashboardStackParamList>();
const TxStack = createNativeStackNavigator<TransactionStackParamList>();
const AnStack = createNativeStackNavigator<AnomalyStackParamList>();

type IconProps = { color: string; size?: number };

const HomeIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5Z"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </Svg>
);

const TxIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Rect x={3} y={6} width={18} height={13} rx={2.5} stroke={color} strokeWidth={2} />
    <Path d="M3 10h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Path d="M7 15h4" stroke={color} strokeWidth={2} strokeLinecap="round" />
  </Svg>
);

const AlertIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Path d="M12 9v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
    <Circle cx={12} cy={17} r={1} fill={color} />
  </Svg>
);

const RiskIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 3 5 6v5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6l-7-3Z"
      stroke={color}
      strokeWidth={2}
      strokeLinejoin="round"
    />
    <Path d="M9 12l2 2 4-4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const SettingsIcon = ({ color, size = 24 }: IconProps) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={12} r={3} stroke={color} strokeWidth={2} />
    <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const TabIcon = ({
  Icon, focused,
}: { Icon: React.ComponentType<IconProps>; focused: boolean }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Icon color={focused ? colors.primary : colors.textMuted} />
  </View>
);

const DashboardStack = () => (
  <DashStack.Navigator screenOptions={{ headerShown: false }}>
    <DashStack.Screen name="DashboardHome" component={DashboardScreen} />
    <DashStack.Screen name="Notifications" component={NotificationListScreen} />
  </DashStack.Navigator>
);

const TransactionsStack = () => (
  <TxStack.Navigator screenOptions={{ headerShown: false }}>
    <TxStack.Screen name="TransactionList" component={TransactionListScreen} />
    <TxStack.Screen name="TransactionForm" component={TransactionFormScreen} />
  </TxStack.Navigator>
);

const AnomaliesStack = () => (
  <AnStack.Navigator screenOptions={{ headerShown: false }}>
    <AnStack.Screen name="AnomalyList" component={AnomalyListScreen} />
    <AnStack.Screen name="AnomalyDetail" component={AnomalyDetailScreen} />
  </AnStack.Navigator>
);

export const AppTabs = () => {
  const insets = useSafeAreaInsets();
  return (
    <>
      <NotificationWatcher />
      <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          height: 60 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{
          title: 'Home',
          // Leaving a tab pops its nested stack back to the root screen, so a
          // deep-linked detail (e.g. from a notification) doesn't persist.
          popToTopOnBlur: true,
          tabBarIcon: ({ focused }) => <TabIcon Icon={HomeIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="TransactionsStack"
        component={TransactionsStack}
        options={{
          title: 'Transactions',
          popToTopOnBlur: true,
          tabBarIcon: ({ focused }) => <TabIcon Icon={TxIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Anomalies"
        component={AnomaliesStack}
        options={{
          title: 'Anomalies',
          popToTopOnBlur: true,
          tabBarIcon: ({ focused }) => <TabIcon Icon={AlertIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Risk"
        component={RiskDetailScreen}
        options={{
          title: 'Risk',
          tabBarIcon: ({ focused }) => <TabIcon Icon={RiskIcon} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <TabIcon Icon={SettingsIcon} focused={focused} />,
        }}
      />
      </Tab.Navigator>
    </>
  );
};
