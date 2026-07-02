import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth } from '@/presentation/context/AuthContext';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { extractErrorMessage } from '@/core/errors';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '@/presentation/navigation/AuthStack';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});
type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export const LoginScreen = ({ navigation }: Props) => {
  const { login } = useAuth();
  const [serverError, setServerError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try { await login(data.email, data.password); }
    catch (e) { setServerError(extractErrorMessage(e)); }
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
          <Text style={styles.formTitle}>Sign In</Text>
          {serverError ? <View style={styles.errorBox}><Text style={styles.errorBoxText}>{serverError}</Text></View> : null}
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
                <TextInput style={[styles.input, styles.inputPassword, errors.password && styles.inputError]} placeholder="Enter your password" placeholderTextColor={colors.textMuted} secureTextEntry={!showPassword} onBlur={onBlur} onChangeText={onChange} value={value}/>
                <TouchableOpacity style={styles.toggle} onPress={() => setShowPassword(s => !s)} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={styles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
                </TouchableOpacity>
              </View>
            )}/>
            {errors.password && <Text style={styles.fieldError}>{errors.password.message}</Text>}
          </View>
          <TouchableOpacity style={[styles.button, isSubmitting && styles.buttonDisabled]} onPress={handleSubmit(onSubmit)} disabled={isSubmitting} activeOpacity={0.8}>
            {isSubmitting ? <ActivityIndicator color="#fff"/> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgot} activeOpacity={0.7}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('Register')} style={styles.link}>
          <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Sign up</Text></Text>
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
  formTitle:{ fontSize:fontSizes.lg, fontWeight:'600', color:colors.textPrimary, marginBottom:spacing.md },
  errorBox:{ backgroundColor:'#FEE2E2', borderRadius:borderRadius.sm, padding:spacing.sm, marginBottom:spacing.md },
  errorBoxText:{ color:colors.danger, fontSize:fontSizes.sm },
  field:{ marginBottom:spacing.md },
  label:{ fontSize:fontSizes.sm, color:colors.textSecondary, marginBottom:6, fontWeight:'500' },
  input:{ borderWidth:1, borderColor:colors.border, borderRadius:borderRadius.md, padding:spacing.sm+2, fontSize:fontSizes.md, color:colors.textPrimary, backgroundColor:colors.background },
  inputPassword:{ paddingRight:64 },
  passwordWrap:{ justifyContent:'center' },
  toggle:{ position:'absolute', right:spacing.sm+2, paddingHorizontal:4, paddingVertical:4 },
  toggleText:{ color:colors.secondary, fontSize:fontSizes.sm, fontWeight:'600' },
  inputError:{ borderColor:colors.danger },
  fieldError:{ color:colors.danger, fontSize:fontSizes.xs, marginTop:4 },
  button:{ backgroundColor:colors.primary, borderRadius:borderRadius.md, padding:spacing.md, alignItems:'center', marginTop:spacing.sm },
  buttonDisabled:{ opacity:0.6 },
  buttonText:{ color:'#fff', fontSize:fontSizes.md, fontWeight:'600' },
  forgot:{ alignItems:'center', marginTop:spacing.md },
  forgotText:{ color:colors.textSecondary, fontSize:fontSizes.sm },
  link:{ alignItems:'center', marginTop:spacing.lg },
  linkText:{ fontSize:fontSizes.sm, color:colors.textSecondary },
  linkBold:{ color:colors.primary, fontWeight:'600' },
});
