import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Alert } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { authApi } from '@/data/api/auth.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { extractErrorMessage } from '@/core/errors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/presentation/navigation/AuthStack';

const schema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Enter a valid email'),
  password: z.string()
    .min(8, 'At least 8 characters')
    .regex(/[A-Z]/, 'Include an uppercase letter')
    .regex(/[a-z]/, 'Include a lowercase letter')
    .regex(/[0-9]/, 'Include a digit')
    .regex(/[^A-Za-z0-9]/, 'Include a special character'),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export const RegisterScreen = ({ navigation }: Props) => {
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      await authApi.register(data);
      Alert.alert('Account created', 'Your account is ready. You can sign in now.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch (e) {
      setServerError(extractErrorMessage(e));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.logoBox}><Text style={styles.logoText}>AF</Text></View>
          <Text style={styles.title}>Sign Up</Text>
          <Text style={styles.subtitle}>Create your AFRATS account</Text>
        </View>

        <View style={styles.card}>
          {serverError ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{serverError}</Text></View> : null}

          <View style={styles.row}>
            <View style={[styles.field, styles.rowItem]}>
              <Text style={styles.label}>First name</Text>
              <Controller control={control} name="firstName" render={({ field: { onChange, onBlur, value } }) => (
                <TextInput style={[styles.input, errors.firstName && styles.inputError]} placeholder="First name" placeholderTextColor={colors.textMuted} autoCapitalize="words" onBlur={onBlur} onChangeText={onChange} value={value}/>
              )}/>
              {errors.firstName && <Text style={styles.fieldError}>{errors.firstName.message}</Text>}
            </View>
            <View style={[styles.field, styles.rowItem]}>
              <Text style={styles.label}>Last name</Text>
              <Controller control={control} name="lastName" render={({ field: { onChange, onBlur, value } }) => (
                <TextInput style={[styles.input, errors.lastName && styles.inputError]} placeholder="Last name" placeholderTextColor={colors.textMuted} autoCapitalize="words" onBlur={onBlur} onChangeText={onChange} value={value}/>
              )}/>
              {errors.lastName && <Text style={styles.fieldError}>{errors.lastName.message}</Text>}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <Controller control={control} name="email" render={({ field: { onChange, onBlur, value } }) => (
              <TextInput style={[styles.input, errors.email && styles.inputError]} placeholder="example@email.com" placeholderTextColor={colors.textMuted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} onBlur={onBlur} onChangeText={onChange} value={value}/>
            )}/>
            {errors.email && <Text style={styles.fieldError}>{errors.email.message}</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <Controller control={control} name="password" render={({ field: { onChange, onBlur, value } }) => (
              <View style={styles.passwordWrap}>
                <TextInput style={[styles.input, styles.inputPassword, errors.password && styles.inputError]} placeholder="Enter a password" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value}/>
                <TouchableOpacity style={styles.toggle} onPress={() => setShowPassword(s => !s)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            )}/>
            {errors.password
              ? <Text style={styles.fieldError}>{errors.password.message}</Text>
              : <Text style={styles.hint}>Min 8 chars · 1 uppercase · 1 lowercase · 1 digit · 1 symbol</Text>}
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Confirm password</Text>
            <Controller control={control} name="confirmPassword" render={({ field: { onChange, onBlur, value } }) => (
              <TextInput style={[styles.input, errors.confirmPassword && styles.inputError]} placeholder="Re-enter password" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} autoCapitalize="none" onBlur={onBlur} onChangeText={onChange} value={value}/>
            )}/>
            {errors.confirmPassword && <Text style={styles.fieldError}>{errors.confirmPassword.message}</Text>}
          </View>

          <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit(onSubmit)} disabled={isSubmitting} activeOpacity={0.8}>
            {isSubmitting ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Sign Up</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
          <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Sign in</Text></Text>
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
  errorBox:{ backgroundColor:'#FEE2E2', borderRadius:borderRadius.sm, padding:spacing.sm, marginBottom:spacing.md },
  errorBoxText:{ color:colors.danger, fontSize:fontSizes.sm },
  row:{ flexDirection:'row', gap:spacing.sm },
  rowItem:{ flex:1 },
  field:{ marginBottom:spacing.md },
  label:{ fontSize:fontSizes.sm, color:colors.textSecondary, marginBottom:6, fontWeight:'500' },
  input:{ borderWidth:1, borderColor:colors.border, borderRadius:borderRadius.md, padding:spacing.sm+2, fontSize:fontSizes.md, color:colors.textPrimary, backgroundColor:colors.background },
  inputPassword:{ paddingRight:64 },
  passwordWrap:{ justifyContent:'center' },
  toggle:{ position:'absolute', right:spacing.sm+2, paddingHorizontal:4, paddingVertical:4 },
  toggleText:{ color:colors.secondary, fontSize:fontSizes.sm, fontWeight:'600' },
  inputError:{ borderColor:colors.danger },
  fieldError:{ color:colors.danger, fontSize:fontSizes.xs, marginTop:4 },
  hint:{ color:colors.textMuted, fontSize:fontSizes.xs, marginTop:4 },
  button:{ backgroundColor:colors.primary, borderRadius:borderRadius.md, padding:spacing.md, alignItems:'center', marginTop:spacing.sm },
  buttonDisabled:{ opacity:0.6 },
  buttonText:{ color:'#fff', fontSize:fontSizes.md, fontWeight:'600' },
  link:{ alignItems:'center', marginTop:spacing.lg },
  linkText:{ fontSize:fontSizes.sm, color:colors.textSecondary },
  linkBold:{ color:colors.primary, fontWeight:'600' },
});
