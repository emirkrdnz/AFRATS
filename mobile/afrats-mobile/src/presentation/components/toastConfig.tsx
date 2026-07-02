import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import type { ToastConfig, ToastConfigParams } from 'react-native-toast-message';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';

export interface ToastProps {
  color?: string;
  icon?: string;
  onPress?: () => void;
}

const WIDTH = Dimensions.get('window').width - spacing.md * 2;

// A compact top banner: colored stripe + icon chip + title/message. Mirrors the
// web toast that slides in and auto-dismisses on a new notification.
const Banner = ({ text1, text2, props }: ToastConfigParams<ToastProps>) => {
  const color = props?.color ?? colors.primary;
  return (
    <TouchableOpacity activeOpacity={0.9} onPress={props?.onPress} style={styles.card}>
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={[styles.iconBox, { backgroundColor: color + '1A' }]}>
        <Text style={[styles.icon, { color }]}>{props?.icon ?? '•'}</Text>
      </View>
      <View style={styles.body}>
        {!!text1 && <Text style={styles.title} numberOfLines={1}>{text1}</Text>}
        {!!text2 && <Text style={styles.msg} numberOfLines={2}>{text2}</Text>}
      </View>
    </TouchableOpacity>
  );
};

export const toastConfig: ToastConfig = {
  afrats: (params) => <Banner {...(params as ToastConfigParams<ToastProps>)} />,
};

const styles = StyleSheet.create({
  card: {
    width: WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingRight: spacing.md,
    overflow: 'hidden',
    ...shadows.md,
  },
  stripe: { width: 4, alignSelf: 'stretch' },
  iconBox: {
    width: 36, height: 36, borderRadius: borderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
    marginHorizontal: spacing.sm + 2, marginVertical: spacing.sm,
  },
  icon: { fontSize: fontSizes.lg, fontWeight: '800' },
  body: { flex: 1, paddingVertical: spacing.sm },
  title: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  msg: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2, lineHeight: 16 },
});
