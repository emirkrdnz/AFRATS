import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useAuth } from '@/presentation/context/AuthContext';
import { AuthStack } from './AuthStack';
import { AppTabs } from './AppTabs';
import { navigationRef } from './navigationRef';
import { View, ActivityIndicator } from 'react-native';
import { colors } from '@/core/theme';

export const RootNavigator = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      {user ? <AppTabs /> : <AuthStack />}
    </NavigationContainer>
  );
};