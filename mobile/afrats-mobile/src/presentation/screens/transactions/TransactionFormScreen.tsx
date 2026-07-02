import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { TransactionStackParamList } from '@/presentation/navigation/AppTabs';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { transactionApi } from '@/data/api/transaction.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { formatDate } from '@/core/utils';
import type { Category } from '@/domain/entities';

const schema = z.object({
  type: z.enum(['Income', 'Expense']),
  categoryId: z.string().min(1, 'Please select a category'),
  amount: z.string().min(1, 'Amount is required').refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Enter a valid amount'),
  description: z.string().optional(),
  transactionDate: z.string().min(1, 'Date is required'),
});

type FormData = z.infer<typeof schema>;
type Props = NativeStackScreenProps<TransactionStackParamList, 'TransactionForm'>;

export const TransactionFormScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<TransactionStackParamList>>();
  const route = useRoute<Props['route']>();
  const transactionId = route.params?.transactionId;
  const isEdit = !!transactionId;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [serverError, setServerError] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  const { control, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'Expense', categoryId: '', amount: '', description: '', transactionDate: today },
  });

  const selectedType = watch('type');
  const filteredCategories = categories.filter(c => c.type === selectedType);

  useEffect(() => {
    transactionApi.getCategories().then(cats => {
      setCategories(cats);
    }).finally(() => setLoadingCats(false));
  }, []);

  useEffect(() => {
    if (isEdit) {
      transactionApi.getById(transactionId).then(tx => {
        setValue('type', tx.type);
        setValue('categoryId', tx.categoryId);
        setValue('amount', tx.amount.toString());
        setValue('description', tx.description ?? '');
        setValue('transactionDate', tx.transactionDate.split('T')[0]);
      });
    }
  }, [isEdit]);

  const onSubmit = async (data: FormData) => {
    setServerError('');
    try {
      const payload = {
        type: data.type,
        categoryId: data.categoryId,
        amount: parseFloat(data.amount),
        description: data.description ?? '',
        transactionDate: new Date(data.transactionDate).toISOString(),
      };
      if (isEdit) {
        await transactionApi.update(transactionId, payload);
      } else {
        await transactionApi.create(payload);
      }
      navigation.goBack();
    } catch (e: any) {
      setServerError(e?.message ?? 'Something went wrong');
    }
  };

  const onDelete = () => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await transactionApi.delete(transactionId!);
          navigation.goBack();
        } catch (e: any) {
          setServerError(e?.message ?? 'Delete failed');
        }
      }},
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Transaction' : 'New Transaction'}</Text>
        {isEdit && (
          <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {serverError ? <View style={styles.errorBox}><Text style={styles.errorText}>{serverError}</Text></View> : null}

        {/* Type toggle */}
        <Text style={styles.label}>Type</Text>
        <Controller control={control} name="type" render={({ field: { value, onChange } }) => (
          <View style={styles.typeRow}>
            {(['Income', 'Expense'] as const).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.typeBtn, value === t && { backgroundColor: t === 'Income' ? colors.success : colors.danger, borderColor: t === 'Income' ? colors.success : colors.danger }]}
                onPress={() => {
                  if (value === t) return;
                  onChange(t);
                  // Income/Expense kategorileri ayrı — tip değişince seçim sıfırlanır.
                  setValue('categoryId', '');
                }}
              >
                <Text style={[styles.typeBtnText, value === t && styles.typeBtnTextActive]}>
                  {t === 'Income' ? '↑ Income' : '↓ Expense'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}/>

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <Controller control={control} name="amount" render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={[styles.input, errors.amount && styles.inputError]}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            onBlur={onBlur} onChangeText={onChange} value={value}
          />
        )}/>
        {errors.amount && <Text style={styles.fieldError}>{errors.amount.message}</Text>}

        {/* Date */}
        <Text style={styles.label}>Date</Text>
        <Controller control={control} name="transactionDate" render={({ field: { onChange, value } }) => (
          <>
            <TouchableOpacity
              style={[styles.input, styles.dateField, errors.transactionDate && styles.inputError]}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
            >
              <Text style={value ? styles.dateText : styles.datePlaceholder}>
                {value ? formatDate(value) : 'Select a date'}
              </Text>
              <Text style={styles.dateIcon}>▾</Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={value ? new Date(value) : new Date()}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                maximumDate={new Date()}
                onChange={(_, selected) => {
                  setShowDatePicker(false);
                  if (selected) onChange(selected.toISOString().split('T')[0]);
                }}
              />
            )}
          </>
        )}/>
        {errors.transactionDate && <Text style={styles.fieldError}>{errors.transactionDate.message}</Text>}

        {/* Category */}
        <Text style={styles.label}>Category</Text>
        {loadingCats ? <ActivityIndicator color={colors.primary}/> : (
          <Controller control={control} name="categoryId" render={({ field: { value, onChange } }) => (
            <View style={styles.categoryGrid}>
              {filteredCategories.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catBtn, value === cat.id && styles.catBtnActive]}
                  onPress={() => onChange(cat.id)}
                >
                  <Text style={[styles.catBtnText, value === cat.id && styles.catBtnTextActive]}>{cat.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}/>
        )}
        {errors.categoryId && <Text style={styles.fieldError}>{errors.categoryId.message}</Text>}

        {/* Description */}
        <Text style={styles.label}>Description <Text style={styles.optional}>(optional)</Text></Text>
        <Controller control={control} name="description" render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            style={[styles.input, styles.inputMulti]}
            placeholder="Add a note..."
            placeholderTextColor={colors.textMuted}
            multiline numberOfLines={3}
            onBlur={onBlur} onChangeText={onChange} value={value}
          />
        )}/>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting
            ? <ActivityIndicator color="#fff"/>
            : <Text style={styles.submitText}>{isEdit ? 'Save Changes' : 'Add Transaction'}</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backBtn: { marginRight: spacing.sm },
  backText: { fontSize: fontSizes.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { flex: 1, fontSize: fontSizes.lg, fontWeight: '700', color: colors.textPrimary },
  deleteBtn: { paddingHorizontal: spacing.sm },
  deleteText: { fontSize: fontSizes.sm, color: colors.danger, fontWeight: '600' },
  form: { padding: spacing.md, paddingBottom: spacing.xxl },
  errorBox: { backgroundColor: '#FEE2E2', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: spacing.md },
  errorText: { color: colors.danger, fontSize: fontSizes.sm },
  label: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textSecondary, marginBottom: 6, marginTop: spacing.md },
  optional: { fontWeight: '400', color: colors.textMuted },
  typeRow: { flexDirection: 'row', gap: spacing.sm },
  typeBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  typeBtnText: { fontSize: fontSizes.md, fontWeight: '600', color: colors.textSecondary },
  typeBtnTextActive: { color: '#fff' },
  input: { backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, fontSize: fontSizes.md, color: colors.textPrimary },
  inputError: { borderColor: colors.danger },
  inputMulti: { height: 80, textAlignVertical: 'top' },
  dateField: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateText: { fontSize: fontSizes.md, color: colors.textPrimary },
  datePlaceholder: { fontSize: fontSizes.md, color: colors.textMuted },
  dateIcon: { fontSize: fontSizes.md, color: colors.textMuted },
  fieldError: { color: colors.danger, fontSize: fontSizes.xs, marginTop: 4 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  catBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catBtnText: { fontSize: fontSizes.sm, color: colors.textSecondary, fontWeight: '500' },
  catBtnTextActive: { color: '#fff' },
  submitBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: fontSizes.md, fontWeight: '600' },
});
