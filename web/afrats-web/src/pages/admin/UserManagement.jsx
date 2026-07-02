// src/pages/admin/UserManagement.jsx
// AFRATS — Admin User Management (Sprint AB5)
//
// Backend wire-up:
//   GET    /api/auth/admin/users                          → list (role=User sabit, pagination + filters)
//   PUT    /api/auth/admin/users/{id}/status              → activate / deactivate (IsActive)
//   DELETE /api/auth/admin/users/{id}                     → soft delete (IsDeleted=true)
//   GET    /api/ml/admin/users/{userId}/risk              → current risk + history (sparkline)
//   GET    /api/transactions/admin/{userId}/summary       → lifetime transaction count + totals
//   GET    /api/ml/admin/users/{userId}/anomaly-count     → total / confirmed / pending anomalies
//
// Tasarım notları:
//   - Liste her zaman role=User filtreli — admin kendisini deactivate/delete
//     edemez (defensive UI). Backend ek olarak self-deactivate'i BadRequest ile
//     engelliyor (UpdateUserStatusCommandHandler IK-02).
//   - Drawer'da: gauge + sparkline + activity tiles (transactions / anomalies).
//   - Deactivate = amber (geri alınabilir uyarı), Delete = red (yıkıcı).
//   - Sparkline noktasız, current risk level rengiyle boyalı, kronolojik sıralı.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  FiSearch, FiX, FiArrowUp, FiArrowDown,
  FiUserX, FiUser, FiMail, FiCalendar,
  FiTrash2, FiAlertTriangle, FiActivity,
} from 'react-icons/fi';

import adminApi from '../../api/adminApi';
import { extractErrorMessage } from '../../api/errorHelper';
import Drawer from '../../components/Drawer';
import Pagination from '../../components/Pagination';
import Badge, { riskLevelVariant } from '../../components/Badge';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';
import ConfirmDialog from '../../components/ConfirmDialog';
import { formatDate } from '../../utils/formatters';
import dayjs from 'dayjs';

// ──────────────────────────────────────────────────────────────────────────────
// Status helpers
// ──────────────────────────────────────────────────────────────────────────────

function isActiveToStatus(isActive) {
  return isActive === true ? 'Active' : 'Deactivated';
}

function statusToIsActive(status) {
  return status === 'Active';
}

function normalizeUser(raw) {
  return {
    ...raw,
    id:            raw.id          ?? raw.Id,
    firstName:     raw.firstName   ?? raw.FirstName   ?? '',
    lastName:      raw.lastName    ?? raw.LastName    ?? '',
    email:         raw.email       ?? raw.Email       ?? '',
    role:          raw.role        ?? raw.Role        ?? 'User',
    isActive:      raw.isActive    ?? raw.IsActive    ?? true,
    status:        isActiveToStatus(raw.isActive ?? raw.IsActive ?? true),
    createdAt:     raw.createdAt   ?? raw.CreatedAt,
    lastActiveAt:  raw.lastActiveAt ?? raw.LastActiveAt ?? raw.updatedAt ?? raw.UpdatedAt,
    riskScore:     raw.riskScore   ?? raw.RiskScore   ?? null,
    riskLevel:     raw.riskLevel   ?? raw.RiskLevel   ?? null,
    transactionCount: raw.transactionCount ?? raw.TransactionCount ?? null,
    anomalyCount:  raw.anomalyCount ?? raw.AnomalyCount ?? null,
  };
}

function statusVariantClass(status) {
  switch (status) {
    case 'Active':      return 'bg-income/10 text-[#1E8449] border-income/30';
    case 'Deactivated': return 'bg-expense/10 text-[#C0392B] border-expense/30';
    default:            return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Risk visualizations (drawer içi mini)
// ──────────────────────────────────────────────────────────────────────────────

const RISK_COLORS = { Low: '#27AE60', Medium: '#F39C12', High: '#E74C3C' };

// Half-circle gauge — current risk score. SVG inline (no Chart.js, minimal).
function MiniGauge({ score, level }) {
  const safeScore = Math.max(0, Math.min(100, Number(score) || 0));
  const color = RISK_COLORS[level] || '#1B4F72';
  const W = 120, H = 70, R = 50, CX = W / 2, CY = H - 6;
  // Half circle: 180deg arc, sweep at safeScore%.
  const angle = Math.PI * (safeScore / 100);
  const endX = CX - R * Math.cos(angle);
  const endY = CY - R * Math.sin(angle);
  const largeArc = 0;
  // Background arc (full half-circle)
  const bgPath = `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`;
  // Filled arc
  const fillPath = `M ${CX - R} ${CY} A ${R} ${R} 0 ${largeArc} 1 ${endX} ${endY}`;
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={bgPath} fill="none" stroke="#F3F4F6" strokeWidth={10} strokeLinecap="round" />
      <path d={fillPath} fill="none" stroke={color} strokeWidth={10} strokeLinecap="round" />
      <text x={CX} y={CY - 8} textAnchor="middle" fontSize="20" fontWeight="700" fill={color}>
        {Math.round(safeScore)}
      </text>
    </svg>
  );
}

// Mini SVG sparkline — risk score trend. Sade çizgi (nokta yok), current
// risk level rengiyle boyalı. Caller history'i kronolojik (eski → yeni) verir.
function MiniSparkline({ history, level, width = 240, height = 50 }) {
  if (!history || history.length < 2) {
    return (
      <div style={{
        width, height, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, color: '#9CA3AF', fontStyle: 'italic',
      }}>
        No history yet
      </div>
    );
  }
  const color = RISK_COLORS[level] || '#1B4F72';
  const scores = history.map((h) => Number(h.score) || 0);
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = Math.max(1, max - min);
  const pts = scores.map((v, i) => {
    const x = (i / (scores.length - 1)) * (width - 8) + 4;
    const y = height - 6 - ((v - min) / range) * (height - 12);
    return `${x},${y}`;
  });
  const area = `M${pts[0]} L${pts.join(' L')} L${width - 4},${height - 4} L4,${height - 4} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={area} fill={color} opacity={0.1} />
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// URL params
// ──────────────────────────────────────────────────────────────────────────────

const DEFAULT_PAGE_SIZE = 20;

function readFiltersFromParams(params) {
  return {
    page:     Number(params.get('page'))     || 1,
    pageSize: Number(params.get('pageSize')) || DEFAULT_PAGE_SIZE,
    sortBy:   params.get('sortBy')           || 'createdAt',
    sortDir:  params.get('sortDir')          || 'desc',
    search:   params.get('search')           || undefined,
    status:   params.get('status')           || undefined,
  };
}

function writeFiltersToParams(filters) {
  const out = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v == null || v === '' || v === undefined) continue;
    if (k === 'page'     && v === 1)                 continue;
    if (k === 'pageSize' && v === DEFAULT_PAGE_SIZE)  continue;
    if (k === 'sortBy'   && v === 'createdAt')        continue;
    if (k === 'sortDir'  && v === 'desc')             continue;
    out[k] = String(v);
  }
  return out;
}

function filtersToApiParams(filters) {
  // Sprint AB5: User Management sadece son kullanıcıları (Role=User) gösterir.
  // Admin'ler listede gözükmez — bu sayede admin kendisini deactivate/delete
  // edemez (UI seviyesinde sıfır risk). Backend ayrıca self-deactivate'i
  // BadRequest ile engelliyor (defense-in-depth).
  const params = { page: filters.page, pageSize: filters.pageSize, role: 'User' };
  if (filters.search) params.searchTerm = filters.search;
  if (filters.status === 'Active')      params.isActive = true;
  if (filters.status === 'Deactivated') params.isActive = false;
  return params;
}

// ──────────────────────────────────────────────────────────────────────────────
// Sortable header
// ──────────────────────────────────────────────────────────────────────────────

function SortableTh({ label, sortKey, currentSortBy, currentSortDir, onSort }) {
  const isActive = currentSortBy === sortKey;
  return (
    <th className="px-4 py-2.5 text-left">
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide ${
          isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
        }`}
      >
        {label}
        {isActive && (
          currentSortDir === 'asc'
            ? <FiArrowUp className="w-3 h-3" />
            : <FiArrowDown className="w-3 h-3" />
        )}
      </button>
    </th>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// User detail drawer
// ──────────────────────────────────────────────────────────────────────────────

function UserDetailDrawer({ user, open, onClose, onUpdated }) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [risk,         setRisk]         = useState({ data: null, loading: false, error: null });
  const [summary,      setSummary]      = useState({ data: null, loading: false, error: null });
  const [anomalyCount, setAnomalyCount] = useState({ data: null, loading: false, error: null });

  // Drawer açıldığında / user değiştiğinde 3 paralel fetch:
  // risk (current + history), transaction summary, anomaly count.
  // AbortController ile drawer kapanırsa istekler iptal edilir.
  useEffect(() => {
    if (!user?.id || !open) {
      setRisk({ data: null, loading: false, error: null });
      setSummary({ data: null, loading: false, error: null });
      setAnomalyCount({ data: null, loading: false, error: null });
      return undefined;
    }
    setRisk({ data: null, loading: true, error: null });
    setSummary({ data: null, loading: true, error: null });
    setAnomalyCount({ data: null, loading: true, error: null });

    const ctrl = new AbortController();
    const cfg = { signal: ctrl.signal };

    adminApi.getUserRisk(user.id, 20, cfg)
      .then((res) => setRisk({ data: res.data ?? res, loading: false, error: null }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setRisk({ data: null, loading: false, error: extractErrorMessage(err) });
      });

    adminApi.getUserSummary(user.id, cfg)
      .then((res) => setSummary({ data: res.data ?? res, loading: false, error: null }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setSummary({ data: null, loading: false, error: extractErrorMessage(err) });
      });

    adminApi.getUserAnomalyCount(user.id, cfg)
      .then((res) => setAnomalyCount({ data: res.data ?? res, loading: false, error: null }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setAnomalyCount({ data: null, loading: false, error: extractErrorMessage(err) });
      });

    return () => ctrl.abort();
  }, [user?.id, open]);

  if (!user) return null;

  const initials = `${user.firstName?.[0] || '?'}${user.lastName?.[0] || '?'}`.toUpperCase();

  const handleStatusChange = async (newStatus) => {
    setIsUpdating(true);
    try {
      await adminApi.updateUserStatus(user.id, statusToIsActive(newStatus));
      toast.success(`User ${newStatus === 'Active' ? 'activated' : 'deactivated'}`);
      onUpdated();
    } catch (e) {
      toast.error(extractErrorMessage(e) || 'Update failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    setIsUpdating(true);
    try {
      await adminApi.deleteUser(user.id);
      toast.success('User deleted');
      setConfirmDelete(false);
      onUpdated();
    } catch (e) {
      toast.error(extractErrorMessage(e) || 'Delete failed');
    } finally {
      setIsUpdating(false);
    }
  };

  const r       = risk.data;
  const current = r?.current;
  // Backend history'i DESC döner (yeniden eskiye). Sparkline için kronolojik
  // (eski → yeni) sıraya çeviriyoruz. Pencere artık count-based: son N risk
  // score eventi (zamansız) — sparkline'da sabit X-ekseni.
  const history = (r?.history ?? []).slice().reverse();

  return (
    <>
    <Drawer open={open} onClose={onClose} title="User Details" subtitle={user.email} width="max-w-md">
      {/* Identity */}
      <div className="flex items-center gap-3 mb-5 pb-5 border-b border-gray-100">
        <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-semibold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-semibold text-gray-900 truncate">
            {user.firstName} {user.lastName}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${statusVariantClass(user.status)}`}>
              {user.status}
            </span>
          </div>
        </div>
      </div>

      {/* Risk Profile — gauge + sparkline (Sprint AB4) */}
      <div className="border border-gray-200 rounded-md p-4 mb-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Risk Profile
          </span>
          {history.length > 1 && (
            <span className="text-[10px] text-gray-400">
              Last {history.length} scores
            </span>
          )}
        </div>
        {risk.loading ? (
          <Skeleton height={120} />
        ) : risk.error ? (
          <div className="text-xs text-gray-400 italic py-2">
            Risk data unavailable: {risk.error}
          </div>
        ) : current ? (
          <div className="flex items-center gap-4">
            {/* Gauge */}
            <div className="shrink-0">
              <MiniGauge score={current.score} level={current.level} />
              <div className="flex justify-center mt-1">
                {current.level && (
                  <Badge variant={riskLevelVariant(current.level)}>{current.level}</Badge>
                )}
              </div>
            </div>
            {/* Sparkline */}
            <div className="flex-1 min-w-0">
              <MiniSparkline history={history} level={current.level} width={180} height={50} />
              {current.calculatedAt && (
                <div className="text-[10px] text-gray-400 mt-1.5">
                  Last calculated {dayjs(current.calculatedAt).format('MMM D, HH:mm')}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-xs text-gray-400 italic py-2">
            No risk score yet.
          </div>
        )}
      </div>

      {/* Activity tiles — lifetime transaction + anomaly counts (Sprint AB5) */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        <div className="border border-gray-200 rounded-md p-3">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <FiActivity className="w-3 h-3" /> Transactions
          </div>
          {summary.loading ? (
            <Skeleton height={22} width={60} />
          ) : (
            <div className="text-xl font-semibold text-gray-900">
              {summary.data?.transactionCount != null
                ? Number(summary.data.transactionCount).toLocaleString()
                : '—'}
            </div>
          )}
        </div>
        <div className="border border-gray-200 rounded-md p-3">
          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <FiAlertTriangle className="w-3 h-3" /> Anomalies
          </div>
          {anomalyCount.loading ? (
            <Skeleton height={22} width={60} />
          ) : (
            <div className="text-xl font-semibold text-gray-900">
              {anomalyCount.data?.totalAnomalies ?? '—'}
            </div>
          )}
          {!anomalyCount.loading && (anomalyCount.data?.totalAnomalies ?? 0) > 0 && (
            <div className="text-[10px] text-gray-400 mt-0.5">
              {anomalyCount.data.confirmedAnomalies} confirmed
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="space-y-2 mb-5 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-gray-500 flex items-center gap-1.5"><FiMail className="w-3.5 h-3.5" /> Email</span>
          <span className="text-gray-900 truncate ml-3">{user.email}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500 flex items-center gap-1.5"><FiCalendar className="w-3.5 h-3.5" /> Joined</span>
          <span className="text-gray-900">{formatDate(user.createdAt)}</span>
        </div>
        {user.lastActiveAt && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 flex items-center gap-1.5"><FiUser className="w-3.5 h-3.5" /> Last active</span>
            <span className="text-gray-900">{formatDate(user.lastActiveAt)}</span>
          </div>
        )}
      </div>

      {/* Admin actions */}
      <div className="border-t border-gray-100 pt-4">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">Admin Actions</div>
        <div className="space-y-2">
          {user.status !== 'Active' ? (
            <button
              onClick={() => handleStatusChange('Active')}
              disabled={isUpdating}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#1E8449] hover:bg-green-50 rounded-md transition-colors disabled:opacity-50"
            >
              <FiUser className="w-3.5 h-3.5" /> Activate user
            </button>
          ) : (
            // Amber renk seçimi: Deactivate = geri alınabilir uyarı eylemi,
            // Delete = geri alınamaz yıkıcı. Görsel ayrım kullanıcıyı korur.
            <button
              onClick={() => handleStatusChange('Deactivated')}
              disabled={isUpdating}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#D97706] hover:bg-amber-50 rounded-md transition-colors disabled:opacity-50"
            >
              <FiUserX className="w-3.5 h-3.5" /> Deactivate user
            </button>
          )}
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={isUpdating}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#991B1B] hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
          >
            <FiTrash2 className="w-3.5 h-3.5" /> Delete user
          </button>
        </div>
      </div>
    </Drawer>
    <ConfirmDialog
      open={confirmDelete}
      title="Delete this user?"
      message={`${user.firstName} ${user.lastName} (${user.email}) will be soft-deleted. They won't appear in the user list anymore, but their data is preserved.`}
      confirmLabel="Delete"
      onConfirm={handleDelete}
      onCancel={() => setConfirmDelete(false)}
      destructive
    />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Filters bar
// ──────────────────────────────────────────────────────────────────────────────

function UserFilters({ filters, onChange, onReset }) {
  const [searchInput, setSearchInput] = useState(filters.search || '');

  useEffect(() => { setSearchInput(filters.search || ''); }, [filters.search]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== (filters.search || '')) {
        onChange({ search: searchInput || undefined });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const hasActive = filters.search || filters.status;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-60">
          <label className="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <div className="relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Name or email…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary"
            />
          </div>
        </div>

        <div className="w-40">
          <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select
            value={filters.status || ''}
            onChange={(e) => onChange({ status: e.target.value || undefined })}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-secondary focus:border-secondary"
          >
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Deactivated">Deactivated</option>
          </select>
        </div>

        {hasActive && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md transition-colors"
          >
            <FiX className="w-4 h-4" /> Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────────

export default function UserManagement() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => readFiltersFromParams(searchParams), [searchParams]);

  const [users,      setUsers]      = useState({ items: [], totalCount: 0, loading: true, error: null });
  const [drawerUser,  setDrawerUser]  = useState(null);

  const updateFilters = useCallback((partial) => {
    const next = { ...filters, ...partial };
    const isPagingOrSort = 'page' in partial || 'sortBy' in partial || 'sortDir' in partial || 'pageSize' in partial;
    if (!isPagingOrSort) next.page = 1;
    setSearchParams(writeFiltersToParams(next));
  }, [filters, setSearchParams]);

  const resetFilters = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const fetchUsers = useCallback(async (cancelled) => {
    try {
      const res = await adminApi.getUsers(filtersToApiParams(filters));
      if (cancelled?.value) return;
      const payload = res.data ?? res;
      const items = (payload.items ?? []).map(normalizeUser);
      setUsers({ items, totalCount: payload.totalCount ?? items.length, loading: false, error: null });
    } catch (e) {
      if (cancelled?.value) return;
      setUsers({ items: [], totalCount: 0, loading: false, error: extractErrorMessage(e) });
    }
  }, [filters]);

  useEffect(() => {
    const cancelled = { value: false };
    setUsers((prev) => ({ ...prev, loading: true }));
    fetchUsers(cancelled);
    return () => { cancelled.value = true; };
  }, [fetchUsers]);

  const reload = useCallback(() => fetchUsers({ value: false }), [fetchUsers]);

  const handleSort = (sortKey) => {
    if (filters.sortBy === sortKey) {
      updateFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' });
    } else {
      updateFilters({ sortBy: sortKey, sortDir: 'desc' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">User Management</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and manage all platform users</p>
      </div>

      <UserFilters filters={filters} onChange={updateFilters} onReset={resetFilters} />

      {/* Error */}
      {users.error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          <FiAlertTriangle className="w-4 h-4 shrink-0" /> {users.error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">User</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                <SortableTh label="Joined" sortKey="createdAt" currentSortBy={filters.sortBy} currentSortDir={filters.sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {users.loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td colSpan={3} className="px-4 py-3">
                      <Skeleton height={16} />
                    </td>
                  </tr>
                ))
              ) : users.items.length === 0 ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState
                      icon={<FiUser size={22} />}
                      title="No users match your filters"
                      description="Try clearing the search or status filter."
                    />
                  </td>
                </tr>
              ) : (
                users.items.map((u) => {
                  const initials = `${u.firstName?.[0] || '?'}${u.lastName?.[0] || '?'}`.toUpperCase();
                  return (
                    <tr
                      key={u.id}
                      className="border-b border-gray-100 last:border-0 cursor-pointer transition-colors hover:bg-gray-50"
                      onClick={() => setDrawerUser(u)}
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-semibold shrink-0">
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{u.firstName} {u.lastName}</div>
                            <div className="text-xs text-gray-500 truncate">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${statusVariantClass(u.status)}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {formatDate(u.createdAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {!users.loading && users.totalCount > 0 && (
          <div className="border-t border-gray-100 px-4">
            <Pagination
              page={filters.page}
              pageSize={filters.pageSize}
              totalCount={users.totalCount}
              onPageChange={(p) => updateFilters({ page: p })}
              onPageSizeChange={(s) => updateFilters({ pageSize: s, page: 1 })}
            />
          </div>
        )}
      </div>

      <UserDetailDrawer
        user={drawerUser}
        open={!!drawerUser}
        onClose={() => setDrawerUser(null)}
        onUpdated={() => { reload(); setDrawerUser(null); }}
      />
    </div>
  );
}
