import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/data/api/auth.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { extractErrorMessage } from '@/core/errors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/presentation/navigation/AuthStack';

const schema = z.object({ email: z.string().email('Enter a valid email') });
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export const ForgotPasswordScreen = ({ navigation }: Props) => {
  const [serverError, setServerError] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await authApi.forgotPassword(data.email);
      // Backend always returns the same response (account-enumeration protection).
      setSentTo(data.email);
    } catch (e) {
      setServerError(extractErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBox}><Text style={styles.logoText}>AF</Text></View>
          <Text style={styles.title}>AFRATS</Text>
          <Text style={styles.subtitle}>Financial Risk Analysis System</Text>
        </View>
        <View style={styles.card}>
          {sentTo ? (
            <>
              <Text style={styles.formTitle}>Check your email</Text>
              <Text style={styles.bodyText}>
                If an account exists for <Text style={styles.bodyStrong}>{sentTo}</Text>, we've sent a password reset link. It may take a few minutes to arrive.
              </Text>
              <View style={styles.successBox}><Text style={styles.successBoxText}>Email sent. Check your inbox (and spam folder).</Text></View>
            </>
          ) : (
            <>
              <Text style={styles.formTitle}>Forgot password</Text>
              <Text style={styles.bodyText}>Enter your email and we'll send you a password reset link.</Text>
              {serverError ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{serverError}</Text></View> : null}
              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <Controller control={control} name="email" render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput style={[styles.input, errors.email && styles.inputError]} placeholder="example@email.com" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onBlur={onBlur} onChangeText={onChange} value={value}/>
                )}/>
                {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
              </View>
              <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit(onSubmit)} disabled={isSubmitting} activeOpacity={0.8}>
                {isSubmitting ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Send reset link</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
          <Text style={styles.linkText}>← Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container:{ flex:1, backgroundColor:colors.background },
  inner:{ flexGrow:1, justifyContent:'center', padding:spacing.lg },
  header:{ alignItems:'center', marginBottom:spacing.xl },
  logoBox:{ width:64, height:64, borderRadius:borderRadius.lg, backgroundColor:colors.primary, alignItems:'center', justifyContent:'center', marginBottom:spacing.md },
  logoText:{ color:'#fff', fontSize:fontSizes.xl, fontWeight:'700' },
  title:{ fontSize:fontSizes.xxl, fontWeight:'700', color:colors.textPrimary },
  subtitle:{ fontSize:fontSizes.sm, color:colors.textSecondary, marginTop:4 },
  card:{ backgroundColor:colors.surface, borderRadius:borderRadius.lg, padding:spacing.lg, ...shadows.md },
  formTitle:{ fontSize:fontSizes.lg, fontWeight:'600', color:colors.textPrimary, marginBottom:spacing.sm },
  bodyText:{ fontSize:fontSizes.sm, color:colors.textSecondary, marginBottom:spacing.md, lineHeight:20 },
  bodyStrong:{ color:colors.textPrimary, fontWeight:'600' },
  errorBox:{ backgroundColor:'#FEE2E2', borderRadius:borderRadius.sm, padding:spacing.sm, marginBottom:spacing.md },
  errorBoxText:{ color:colors.danger, fontSize:fontSizes.sm },
  successBox:{ backgroundColor:'#DCFCE7', borderRadius:borderRadius.sm, padding:spacing.sm },
  successBoxText:{ color:'#15803D', fontSize:fontSizes.sm },
  field:{ marginBottom:spacing.md },
  label:{ fontSize:fontSizes.sm, color:colors.textSecondary, marginBottom:6, fontWeight:'500' },
  input:{ borderWidth:1, borderColor:colors.border, borderRadius:borderRadius.md, padding:spacing.sm+2, fontSize:fontSizes.md, color:colors.textPrimary, backgroundColor:colors.background },
  inputError:{ borderColor:colors.danger },
  fieldError:{ color:colors.danger, fontSize:fontSizes.xs, marginTop:4 },
  button:{ backgroundColor:colors.primary, borderRadius:borderRadius.md, padding:spacing.md, alignItems:'center', marginTop:spacing.sm },
  buttonDisabled:{ opacity:0.6 },
  buttonText:{ color:'#fff', fontSize:fontSizes.md, fontWeight:'600' },
  link:{ alignItems:'center', marginTop:spacing.lg },
  linkText:{ fontSize:fontSizes.sm, color:colors.secondary, fontWeight:'600' },
});
