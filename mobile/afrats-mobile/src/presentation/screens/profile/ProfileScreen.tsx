import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { useAuth } from '@/presentation/context/AuthContext';
import { authApi } from '@/data/api/auth.api';
import { notificationApi } from '@/data/api/notification.api';
import { extractErrorMessage } from '@/core/errors';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';

type TabKey = 'account' | 'notifications' | 'security' | 'danger';
const TABS: ReadonlyArray<{ key: TabKey; label: string; danger?: boolean }> = [
  { key: 'account', label: 'Account' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'security', label: 'Security' },
  { key: 'danger', label: 'Danger Zone', danger: true },
];

const accountSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
});
type AccountForm = z.infer<typeof accountSchema>;

const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Add an uppercase letter')
    .regex(/[a-z]/, 'Add a lowercase letter')
    .regex(/[0-9]/, 'Add a digit')
    .regex(/[^A-Za-z0-9]/, 'Add a special character'),
  confirmPassword: z.string(),
}).refine((d) => d.newPassword === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
type PasswordForm = z.infer<typeof passwordSchema>;

const Toggle = ({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) => (
  <TouchableOpacity activeOpacity={0.8} onPress={() => onValueChange(!value)} style={[styles.toggle, { backgroundColor: value ? colors.primary : '#CBD5E1' }]}>
    <View style={[styles.toggleKnob, value && { transform: [{ translateX: 18 }] }]} />
  </TouchableOpacity>
);

const StrengthMeter = ({ password }: { password: string }) => {
  if (!password) return null;
  const checks = {
    length: password.length >= 8,
    upperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;
  const LEVELS = [
    { l: 'Too short', c: colors.danger, p: 10 },
    { l: 'Weak', c: colors.danger, p: 30 },
    { l: 'Fair', c: colors.warning, p: 55 },
    { l: 'Good', c: colors.success, p: 80 },
    { l: 'Strong', c: colors.success, p: 100 },
  ];
  const lv = LEVELS[score];
  const CHECKLIST = [
    { ok: checks.length, t: 'At least 8 characters' },
    { ok: checks.upperLower, t: 'Upper and lower case' },
    { ok: checks.number, t: 'At least one number' },
    { ok: checks.symbol, t: 'At least one symbol' },
  ];
  return (
    <View style={styles.strength}>
      <View style={styles.strengthTop}>
        <Text style={styles.strengthCap}>Strength</Text>
        <Text style={[styles.strengthLevel, { color: lv.c }]}>{lv.l}</Text>
      </View>
      <View style={styles.strengthTrack}><View style={{ height: 5, width: `${lv.p}%`, backgroundColor: lv.c, borderRadius: 3 }} /></View>
      <View style={styles.checkGrid}>
        {CHECKLIST.map((c) => (
          <View key={c.t} style={styles.checkItem}>
            <Text style={[styles.checkMark, { color: c.ok ? colors.success : colors.textMuted, opacity: c.ok ? 1 : 0.4 }]}>✓</Text>
            <Text style={[styles.checkText, { color: c.ok ? colors.success : colors.textMuted }]}>{c.t}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const SubSection = ({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) => (
  <View style={styles.subSection}>
    <View style={styles.subHead}>
      <Text style={styles.subTitle}>{title}</Text>
      {description ? <Text style={styles.subDesc}>{description}</Text> : null}
    </View>
    <View style={styles.subBody}>{children}</View>
  </View>
);

export const ProfileScreen = () => {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<TabKey>('account');

  // Account
  const accountForm = useForm<AccountForm>({ resolver: zodResolver(accountSchema), defaultValues: { firstName: user?.firstName ?? '', lastName: user?.lastName ?? '' } });
  const [accountMsg, setAccountMsg] = useState('');
  const onSaveAccount = async (data: AccountForm) => {
    setAccountMsg('');
    try { await authApi.updateProfile(data); accountForm.reset(data); setAccountMsg('Account updated'); }
    catch (e) { setAccountMsg(extractErrorMessage(e)); }
  };

  // Notifications
  const [prefs, setPrefs] = useState<{ emailEnabled: boolean; inAppEnabled: boolean } | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const inited = useRef(false);
  useEffect(() => {
    notificationApi.getPreferences().then((p) => { setPrefs(p); setTimeout(() => { inited.current = true; }, 0); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (!prefs || !inited.current) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try { await notificationApi.updatePreferences(prefs); setSaveStatus('saved'); setTimeout(() => setSaveStatus('idle'), 1500); }
      catch { setSaveStatus('idle'); }
    }, 500);
    return () => clearTimeout(t);
  }, [prefs]);

  // Security
  const pwForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema), defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const [pwMsg, setPwMsg] = useState('');
  const newPassword = pwForm.watch('newPassword');
  const onChangePassword = async (data: PasswordForm) => {
    setPwMsg('');
    try { await authApi.changePassword({ currentPassword: data.currentPassword, newPassword: data.newPassword }); pwForm.reset(); setPwMsg('Password changed successfully'); }
    catch (e) { setPwMsg(extractErrorMessage(e)); }
  };

  // Danger
  const [confirmEmail, setConfirmEmail] = useState('');
  const [deleting, setDeleting] = useState(false);
  const canDelete = !!user?.email && confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const onDelete = () => {
    Alert.alert('Delete your account?', 'This permanently deletes your account, transactions, anomaly history, risk scores, and notifications. This action cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete my account', style: 'destructive', onPress: async () => {
        setDeleting(true);
        try { await authApi.deleteAccount(); await logout(); }
        catch (e) { setDeleting(false); Alert.alert('Delete failed', extractErrorMessage(e)); }
      } },
    ]);
  };

  const onLogout = () => Alert.alert('Sign Out', 'Are you sure?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: logout },
  ]);

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase() || '?';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}><Text style={styles.logoutText}>Sign Out</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroName}>{[user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—'}</Text>
            <Text style={styles.heroMeta}>{user?.email}</Text>
            <Text style={styles.heroMeta}>{user?.role ?? 'User'} · Member since {user?.createdAt ? dayjs(user.createdAt).format('MMM YYYY') : '—'}</Text>
          </View>
          <View style={styles.activeBadge}><View style={styles.activeDot} /><Text style={styles.activeText}>ACTIVE</Text></View>
        </View>

        {/* Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} onPress={() => setTab(t.key)}
                style={[styles.tabPill, active && (t.danger ? styles.tabPillDanger : styles.tabPillActive)]}>
                <Text style={[styles.tabPillText, active && styles.tabPillTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ACCOUNT */}
        {tab === 'account' && (
          <SubSection title="Personal information" description="Your display name appears across AFRATS.">
            {accountMsg ? <Text style={styles.infoMsg}>{accountMsg}</Text> : null}
            {(['firstName', 'lastName'] as const).map((f) => (
              <View key={f} style={styles.field}>
                <Text style={styles.label}>{f === 'firstName' ? 'First Name' : 'Last Name'}</Text>
                <Controller control={accountForm.control} name={f} render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput style={[styles.input, accountForm.formState.errors[f] && styles.inputError]} onBlur={onBlur} onChangeText={onChange} value={value} autoCapitalize="words" />
                )} />
                {accountForm.formState.errors[f] && <Text style={styles.fieldError}>{accountForm.formState.errors[f]?.message}</Text>}
              </View>
            ))}
            <View style={styles.field}>
              <Text style={styles.label}>Email <Text style={styles.muted}>(cannot be changed)</Text></Text>
              <View style={styles.inputReadOnly}><Text style={styles.inputReadOnlyText}>{user?.email}</Text></View>
            </View>
            <View style={styles.saveRow}>
              {accountForm.formState.isDirty && <Text style={styles.dirty}>Unsaved changes</Text>}
              <TouchableOpacity style={[styles.btn, (!accountForm.formState.isDirty || accountForm.formState.isSubmitting) && styles.btnDisabled]} disabled={!accountForm.formState.isDirty || accountForm.formState.isSubmitting} onPress={accountForm.handleSubmit(onSaveAccount)}>
                {accountForm.formState.isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </SubSection>
        )}

        {/* NOTIFICATIONS */}
        {tab === 'notifications' && (
          <SubSection title="Delivery channels" description="How AFRATS reaches out to you.">
            {!prefs ? <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} /> : (
              <>
                {([
                  { key: 'emailEnabled' as const, label: 'Email', desc: 'Receive notifications at your email address' },
                  { key: 'inAppEnabled' as const, label: 'In-app', desc: 'Show notifications inside AFRATS' },
                ]).map((ch) => (
                  <View key={ch.key} style={styles.toggleRow}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <Text style={styles.toggleLabel}>{ch.label}</Text>
                      <Text style={styles.toggleDesc}>{ch.desc}</Text>
                    </View>
                    <Toggle value={prefs[ch.key] === true} onValueChange={(v) => setPrefs((p) => p ? { ...p, [ch.key]: v } : p)} />
                  </View>
                ))}
                <Text style={styles.saveStatus}>
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : 'All changes saved'}
                </Text>
              </>
            )}
          </SubSection>
        )}

        {/* SECURITY */}
        {tab === 'security' && (
          <SubSection title="Change password" description="Use a unique password you don't use elsewhere.">
            {pwMsg ? <Text style={styles.infoMsg}>{pwMsg}</Text> : null}
            {(['currentPassword', 'newPassword', 'confirmPassword'] as const).map((f) => (
              <View key={f} style={styles.field}>
                <Text style={styles.label}>{{ currentPassword: 'Current Password', newPassword: 'New Password', confirmPassword: 'Confirm New Password' }[f]}</Text>
                <Controller control={pwForm.control} name={f} render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput style={[styles.input, pwForm.formState.errors[f] && styles.inputError]} secureTextEntry autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value} />
                )} />
                {f === 'newPassword' && <StrengthMeter password={newPassword} />}
                {pwForm.formState.errors[f] && <Text style={styles.fieldError}>{pwForm.formState.errors[f]?.message}</Text>}
              </View>
            ))}
            <TouchableOpacity style={[styles.btn, { marginTop: spacing.sm }, pwForm.formState.isSubmitting && styles.btnDisabled]} disabled={pwForm.formState.isSubmitting} onPress={pwForm.handleSubmit(onChangePassword)}>
              {pwForm.formState.isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Update Password</Text>}
            </TouchableOpacity>
          </SubSection>
        )}

        {/* DANGER ZONE */}
        {tab === 'danger' && (
          <View style={styles.dangerBox}>
            <Text style={styles.dangerTitle}>Delete Account</Text>
            <Text style={styles.dangerDesc}>
              Permanently deletes your AFRATS account, all transactions, anomaly history, risk scores, and notifications. <Text style={styles.dangerStrong}>This action cannot be undone.</Text>
            </Text>
            <Text style={[styles.label, { marginTop: spacing.md }]}>Type "{user?.email}" to confirm</Text>
            <TextInput style={styles.input} value={confirmEmail} onChangeText={setConfirmEmail} placeholder={user?.email} placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
            <TouchableOpacity style={[styles.deleteBtn, (!canDelete || deleting) && styles.btnDisabled]} disabled={!canDelete || deleting} onPress={onDelete}>
              {deleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteBtnText}>Delete my account</Text>}
            </TouchableOpacity>
          </View>
        )}
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  title: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  logoutBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.danger },
  logoutText: { fontSize: fontSizes.sm, color: colors.danger, fontWeight: '600' },
  scroll: { padding: spacing.md, paddingTop: spacing.sm },
  hero: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, ...shadows.sm },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: spacing.md },
  avatarText: { color: '#fff', fontSize: fontSizes.lg, fontWeight: '800' },
  heroName: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  heroMeta: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2 },
  activeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.success + '18', borderColor: colors.success + '40', borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, borderRadius: borderRadius.full },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  activeText: { fontSize: 10, fontWeight: '800', color: colors.success, letterSpacing: 0.5 },
  tabRow: { gap: spacing.sm, paddingVertical: spacing.md, paddingRight: spacing.md },
  tabPill: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  tabPillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabPillDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  tabPillText: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary },
  tabPillTextActive: { color: '#fff' },
  subSection: { backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  subHead: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FAFBFC' },
  subTitle: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.textPrimary },
  subDesc: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  subBody: { padding: spacing.md },
  infoMsg: { fontSize: fontSizes.sm, color: colors.success, marginBottom: spacing.sm, fontWeight: '600' },
  field: { marginBottom: spacing.md },
  label: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  muted: { fontWeight: '400', textTransform: 'none', color: colors.textMuted },
  input: { backgroundColor: colors.background, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: fontSizes.md, color: colors.textPrimary },
  inputError: { borderColor: colors.danger },
  inputReadOnly: { backgroundColor: '#F1F5F9', borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  inputReadOnlyText: { fontSize: fontSizes.md, color: colors.textMuted },
  fieldError: { color: colors.danger, fontSize: fontSizes.xs, marginTop: 4 },
  saveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  dirty: { fontSize: fontSizes.xs, color: colors.textMuted },
  btn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm + 2, alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '700' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  toggleLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },
  toggleDesc: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  toggle: { width: 40, height: 22, borderRadius: 11, justifyContent: 'center' },
  toggleKnob: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', marginLeft: 3, ...shadows.sm },
  saveStatus: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: spacing.md, textAlign: 'right' },
  strength: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: borderRadius.sm, backgroundColor: colors.background, borderWidth: 1, borderColor: '#F1F5F9' },
  strengthTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  strengthCap: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  strengthLevel: { fontSize: fontSizes.xs, fontWeight: '700' },
  strengthTrack: { height: 5, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: spacing.sm },
  checkGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '50%', marginBottom: 3 },
  checkMark: { fontSize: 11, fontWeight: '800' },
  checkText: { fontSize: 11 },
  dangerBox: { backgroundColor: colors.danger + '0A', borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.danger + '40', padding: spacing.md },
  dangerTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  dangerDesc: { fontSize: fontSizes.sm, color: colors.textSecondary, lineHeight: 20 },
  dangerStrong: { color: colors.danger, fontWeight: '700' },
  deleteBtn: { backgroundColor: colors.danger, borderRadius: borderRadius.md, paddingVertical: spacing.sm + 2, alignItems: 'center', marginTop: spacing.md },
  deleteBtnText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '700' },
});
