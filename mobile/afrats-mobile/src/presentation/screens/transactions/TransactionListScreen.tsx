import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { TransactionStackParamList } from '@/presentation/navigation/AppTabs';
import { transactionApi } from '@/data/api/transaction.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { formatCurrency, formatDate } from '@/core/utils';
import type { Transaction, Category } from '@/domain/entities';

const FILTERS = ['All', 'Income', 'Expense'] as const;
type Filter = typeof FILTERS[number];
type Nav = NativeStackNavigationProp<TransactionStackParamList>;
const PAGE_SIZE = 15;

export const TransactionListScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [filter, setFilter] = useState<Filter>('All');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [dateError, setDateError] = useState('');
  const [typeCounts, setTypeCounts] = useState<{ Income: number | null; Expense: number | null }>({ Income: null, Expense: null });

  const advancedActive = !!(categoryId || dateFrom || dateTo || minAmount || maxAmount);
  const validRange = !(dateFrom && dateTo && dateFrom > dateTo);

  // Base filter params shared by the list and the count queries.
  const baseParams = useCallback(() => {
    const p: any = {};
    if (filter !== 'All') p.type = filter;
    if (search.trim()) p.search = search.trim();
    if (categoryId) p.categoryId = categoryId;
    if (dateFrom && validRange) p.startDate = dateFrom;
    if (dateTo && validRange) p.endDate = dateTo;
    if (minAmount) p.minAmount = Number(minAmount);
    if (maxAmount) p.maxAmount = Number(maxAmount);
    return p;
  }, [filter, search, categoryId, dateFrom, dateTo, minAmount, maxAmount, validRange]);

  const fetchTransactions = useCallback(async (p = 1, reset = true) => {
    try {
      const params = { ...baseParams(), page: p, pageSize: PAGE_SIZE };
      const res = await transactionApi.getAll(params);
      // Dedupe on append: when rows are added/removed the page window shifts and
      // a later page can re-include an already-loaded row, causing duplicate
      // React keys. Drop ids we already have.
      setTransactions((prev) => {
        if (reset) return res.items;
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...res.items.filter((t) => !seen.has(t.id))];
      });
      setTotalPages(res.totalPages);
      setTotalCount(res.totalCount ?? 0);
      setPage(p);
    } catch {
    } finally {
      setLoading(false); setRefreshing(false); setLoadingMore(false);
    }
  }, [baseParams]);

  // Categories once.
  useEffect(() => { transactionApi.getCategories().then(setCategories).catch(() => {}); }, []);

  // Debounced search — avoid a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // List refetch when any filter changes.
  useEffect(() => {
    setLoading(true);
    fetchTransactions(1, true);
  }, [filter, search, categoryId, dateFrom, dateTo, minAmount, maxAmount]); // eslint-disable-line

  // Income/Expense counts for the pills — filter-aware, type-independent.
  useEffect(() => {
    let cancelled = false;
    const base: any = {};
    if (search.trim()) base.search = search.trim();
    if (categoryId) base.categoryId = categoryId;
    if (dateFrom && validRange) base.startDate = dateFrom;
    if (dateTo && validRange) base.endDate = dateTo;
    if (minAmount) base.minAmount = Number(minAmount);
    if (maxAmount) base.maxAmount = Number(maxAmount);
    Promise.all([
      transactionApi.getAll({ ...base, type: 'Income', page: 1, pageSize: 1 }),
      transactionApi.getAll({ ...base, type: 'Expense', page: 1, pageSize: 1 }),
    ]).then(([inc, exp]) => {
      if (!cancelled) setTypeCounts({ Income: inc.totalCount ?? 0, Expense: exp.totalCount ?? 0 });
    }).catch(() => { if (!cancelled) setTypeCounts({ Income: null, Expense: null }); });
    return () => { cancelled = true; };
  }, [search, categoryId, dateFrom, dateTo, minAmount, maxAmount, validRange]);

  const onRefresh = () => { setRefreshing(true); fetchTransactions(1, true); };
  const onLoadMore = () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    fetchTransactions(page + 1, false);
  };

  const onDateFrom = (v: string) => {
    setDateFrom(v);
    setDateError(v && dateTo && v > dateTo ? '"From" cannot be after "To".' : '');
  };
  const onDateTo = (v: string) => {
    setDateTo(v);
    setDateError(dateFrom && v && v < dateFrom ? '"To" cannot be before "From".' : '');
  };

  const clearAll = () => {
    setFilter('All'); setSearchInput(''); setSearch(''); setCategoryId(undefined);
    setDateFrom(''); setDateTo(''); setMinAmount(''); setMaxAmount(''); setDateError('');
  };

  const renderItem = ({ item }: { item: Transaction }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('TransactionForm', { transactionId: item.id })} activeOpacity={0.7}>
      <View style={[styles.typeIndicator, { backgroundColor: item.type === 'Income' ? colors.success : colors.danger }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.category}>{item.categoryName}</Text>
            {item.description ? <Text style={styles.description} numberOfLines={1}>{item.description}</Text> : null}
          </View>
          <View style={styles.cardRight}>
            <Text style={[styles.amount, { color: item.type === 'Income' ? colors.success : colors.danger }]}>
              {item.type === 'Income' ? '+' : '-'}{formatCurrency(item.amount)}
            </Text>
            <Text style={styles.date}>{formatDate(item.transactionDate)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const TypePill = ({ t }: { t: Filter }) => {
    const active = filter === t;
    const count = t === 'Income' ? typeCounts.Income : t === 'Expense' ? typeCounts.Expense : null;
    return (
      <TouchableOpacity style={[styles.pill, active && styles.pillActive]} onPress={() => setFilter(t)}>
        {t !== 'All' && <View style={[styles.pillDot, { backgroundColor: t === 'Income' ? colors.success : colors.danger }]} />}
        <Text style={[styles.pillText, active && styles.pillTextActive]}>{t}</Text>
        {t !== 'All' && (
          <View style={[styles.pillCount, active && styles.pillCountActive]}>
            <Text style={[styles.pillCountText, active && styles.pillCountTextActive]}>{count != null ? count : '—'}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Transactions</Text>
          <Text style={styles.subtitle}>View, filter and manage your transactions</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('TransactionForm')}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBox}>
        <TextInput style={styles.searchInput} placeholder="Search description or category…" placeholderTextColor={colors.textMuted} value={searchInput} onChangeText={setSearchInput} autoCorrect={false} />
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.pillsRow}>
          {FILTERS.map((t) => <TypePill key={t} t={t} />)}
        </View>
        <TouchableOpacity style={[styles.filtersBtn, (showFilters || advancedActive) && styles.filtersBtnActive]} onPress={() => setShowFilters((v) => !v)}>
          <Text style={[styles.filtersBtnText, (showFilters || advancedActive) && styles.filtersBtnTextActive]}>Filters</Text>
          {advancedActive && <View style={[styles.filtersDot, (showFilters || advancedActive) && { backgroundColor: '#fff' }]} />}
        </TouchableOpacity>
      </View>

      {showFilters && (
        <View style={styles.panel}>
          <View style={styles.panelHead}>
            <Text style={styles.panelTitle}>Filters</Text>
            {(advancedActive || filter !== 'All' || search) ? (
              <TouchableOpacity onPress={clearAll}><Text style={styles.clearAll}>✕ Clear all</Text></TouchableOpacity>
            ) : null}
          </View>

          <Text style={styles.fLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
            <TouchableOpacity style={[styles.catChip, !categoryId && styles.catChipActive]} onPress={() => setCategoryId(undefined)}>
              <Text style={[styles.catChipText, !categoryId && styles.catChipTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((c) => (
              <TouchableOpacity key={c.id} style={[styles.catChip, categoryId === c.id && styles.catChipActive]} onPress={() => setCategoryId(c.id)}>
                <Text style={[styles.catChipText, categoryId === c.id && styles.catChipTextActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={styles.twoCol}>
            <View style={styles.colItem}>
              <Text style={styles.fLabel}>From</Text>
              <TextInput style={[styles.fInput, !validRange && styles.fInputError]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={dateFrom} onChangeText={onDateFrom} autoCorrect={false} />
            </View>
            <View style={styles.colItem}>
              <Text style={styles.fLabel}>To</Text>
              <TextInput style={[styles.fInput, !validRange && styles.fInputError]} placeholder="YYYY-MM-DD" placeholderTextColor={colors.textMuted} value={dateTo} onChangeText={onDateTo} autoCorrect={false} />
            </View>
          </View>
          {dateError ? <Text style={styles.dateError}>{dateError}</Text> : null}

          <View style={styles.twoCol}>
            <View style={styles.colItem}>
              <Text style={styles.fLabel}>Min ₺</Text>
              <TextInput style={styles.fInput} placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={minAmount} onChangeText={setMinAmount} />
            </View>
            <View style={styles.colItem}>
              <Text style={styles.fLabel}>Max ₺</Text>
              <TextInput style={styles.fInput} placeholder="∞" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" value={maxAmount} onChangeText={setMaxAmount} />
            </View>
          </View>
        </View>
      )}

      <Text style={styles.recordCount}>{loading ? 'Loading…' : `${totalCount} record${totalCount !== 1 ? 's' : ''}`}</Text>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        onEndReached={onLoadMore}
        onEndReachedThreshold={0.3}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No transactions found</Text>
              {(advancedActive || filter !== 'All' || search) ? (
                <TouchableOpacity onPress={clearAll}><Text style={styles.clearLink}>Clear filters</Text></TouchableOpacity>
              ) : null}
            </View>
          ) : null
        }
        ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>Loading…</Text> : null}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: borderRadius.md },
  addBtnText: { color: '#fff', fontSize: fontSizes.sm, fontWeight: '700' },
  searchBox: { paddingHorizontal: spacing.md, marginTop: spacing.sm },
  searchInput: { backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, fontSize: fontSizes.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  controlsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, marginTop: spacing.sm, gap: spacing.sm },
  pillsRow: { flexDirection: 'row', gap: 6, flexShrink: 1, flexWrap: 'wrap' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 5, borderRadius: borderRadius.full, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillDot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  pillCount: { backgroundColor: '#EDEFF2', borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1 },
  pillCountActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
  pillCountText: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  pillCountTextActive: { color: '#fff' },
  filtersBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 2, borderColor: colors.border },
  filtersBtnActive: { backgroundColor: colors.secondary, borderColor: colors.secondary },
  filtersBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.textSecondary },
  filtersBtnTextActive: { color: '#fff' },
  filtersDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.secondary },
  panel: { backgroundColor: colors.surface, marginHorizontal: spacing.md, marginTop: spacing.sm, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  panelHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  panelTitle: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.textPrimary },
  clearAll: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '700' },
  fLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 5, marginTop: spacing.sm },
  catRow: { gap: 6, paddingRight: spacing.md },
  catChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  catChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  catChipText: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '500' },
  catChipTextActive: { color: '#fff' },
  twoCol: { flexDirection: 'row', gap: spacing.md },
  colItem: { flex: 1 },
  fInput: { backgroundColor: colors.background, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.sm, fontSize: fontSizes.sm, color: colors.textPrimary },
  fInputError: { borderColor: colors.danger },
  dateError: { color: colors.danger, fontSize: fontSizes.xs, marginTop: 6 },
  recordCount: { fontSize: fontSizes.xs, color: colors.textMuted, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.sm, overflow: 'hidden', ...shadows.sm },
  typeIndicator: { width: 4 },
  cardContent: { flex: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardLeft: { flex: 1, marginRight: spacing.sm },
  category: { fontSize: fontSizes.md, fontWeight: '600', color: colors.textPrimary },
  description: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  amount: { fontSize: fontSizes.md, fontWeight: '700' },
  date: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl, gap: spacing.sm },
  emptyText: { color: colors.textMuted, fontSize: fontSizes.md },
  clearLink: { color: colors.secondary, fontSize: fontSizes.sm, fontWeight: '600', textDecorationLine: 'underline' },
  loadingMore: { textAlign: 'center', color: colors.textMuted, padding: spacing.md },
});
