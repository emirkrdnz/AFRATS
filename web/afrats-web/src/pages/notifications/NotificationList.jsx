// src/pages/notifications/NotificationList.jsx
// AFRATS — Notifications page (Inbox only)
//
// Preferences tab was moved into /profile?tab=notifications so account
// settings live in one place. Header has a small CTA linking there.
//
// Backend contract:
//   GET    /api/notifications?page&pageSize&isRead    → PagedResult<NotificationDto>
//   GET    /api/notifications/unread-count            → { unreadCount }
//   PUT    /api/notifications/:id/read                → ok
//   PUT    /api/notifications/read-all                → { updatedCount }
//
// NotificationType enum (PascalCase strings): AnomalyAlert | HighRisk | System
// NotificationChannel enum:                   InApp | Email | Push

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  FiBell, FiCheckCircle, FiAlertTriangle, FiTrendingUp, FiInfo,
  FiCheck, FiChevronLeft, FiChevronRight, FiArrowRight,
} from 'react-icons/fi';
import notificationApi from '../../api/notificationApi';
import { extractErrorMessage } from '../../api/errorHelper';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';

dayjs.extend(relativeTime);

const PAGE_SIZE = 20;

// ──────────────────────────────────────────────────────────────────────────────
// Type metadata — keyed by backend NotificationType enum value
// ──────────────────────────────────────────────────────────────────────────────

const TYPE_META = {
  // Hex literals retained because consumers concat alpha ('${meta.color}1A').
  AnomalyAlert: { icon: FiAlertTriangle, color: '#E74C3C', label: 'Anomaly' },
  HighRisk:     { icon: FiTrendingUp,    color: '#F39C12', label: 'Risk' },
  System:       { icon: FiCheckCircle,   color: '#2E86C1', label: 'System' },
};
const FALLBACK_META = { icon: FiInfo, color: '#7F8C8D', label: 'Info' };
const getMeta = (type) => TYPE_META[type] || FALLBACK_META;

// Client-side grouping scope — sadece bu tip'ler "× N" badge'ine sığar.
// AnomalyAlert dışarıda: her instance farklı transaction (relatedId), tek
// satıra toplamak yanıltıcı (× 7 → click → sadece 1 tx'in detayı).
// Module-level constant — render-time Set identity değişmesin (useMemo dep).
const GROUP_TYPES = new Set(['HighRisk']);

// ──────────────────────────────────────────────────────────────────────────────
// Notification list item
// ──────────────────────────────────────────────────────────────────────────────

// Quick action CTA — type'a göre "View / Review" label. Click handler aynı
// route'a gider, ama affordance açık: kullanıcı satırın tıklanabilir olduğunu
// + nereye götürdüğünü baştan bilir. Row click'i ile aynı işi yapar (oraya da
// stopPropagation gerek yok; onClick zaten parent yerine bu butona deliver
// edilir — handler'da ikincil navigate yapılmaz, parent click'i tetiklenir).
const CTA_LABEL = {
  HighRisk:     'View risk',
  AnomalyAlert: 'Review',
  System:       null,
};

function NotificationItem({ notification, onClick, groupCount = 0 }) {
  const meta = getMeta(notification.type);
  const Icon = meta.icon;
  const ctaLabel = CTA_LABEL[notification.type] ?? null;
  const isGrouped = groupCount > 1;

  // Sol kenar accent kaldırıldı — kullanıcı "hata bayrağı gibi" diye yorumladı,
  // yanıltıcı sinyaldi. İkon + ikon arka plan rengi + unread bg + CTA pill
  // zaten tip'i + okunmamışlığı ayırt ediyor, ekstra şeride gerek yok.
  return (
    <div
      onClick={() => onClick(notification)}
      className={`group flex items-start gap-3 p-4 border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
        notification.isRead ? 'bg-white hover:bg-gray-50' : 'bg-blue-50/30 hover:bg-blue-50/50'
      }`}
    >
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${meta.color}1A` }}
      >
        <Icon className="w-4 h-4" style={{ color: meta.color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h4 className={`text-sm truncate ${notification.isRead ? 'font-normal text-gray-700' : 'font-semibold text-gray-900'}`}>
            {notification.title}
          </h4>
          {isGrouped && (
            <span
              className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${meta.color}1A`, color: meta.color }}
              title={`Grouped: ${groupCount} similar notifications`}
            >
              × {groupCount}
            </span>
          )}
          {!notification.isRead && (
            <span className="w-2 h-2 rounded-full bg-secondary shrink-0" aria-label="Unread" />
          )}
        </div>
        <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{notification.message}</p>
      </div>

      <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-20">
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {dayjs(notification.createdAt).fromNow()}
        </span>
        {/* CTA pill — neutral gri. Severity'yi sol ikon + sol kenar (HighRisk
            accent) zaten iletiyor; CTA renginin de kırmızı/turuncu olması
            görsel olarak fazla bağırıyordu, kullanıcı "her satır acil mi"
            algısına düşüyordu. Standart secondary action tonu daha sade. */}
        {ctaLabel && (
          <span
            className="flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-medium rounded-full bg-gray-100 text-gray-700 transition-colors"
            title={`Click row to ${ctaLabel.toLowerCase()}`}
          >
            {ctaLabel} <FiArrowRight className="w-3 h-3" />
          </span>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Inbox tab
// ──────────────────────────────────────────────────────────────────────────────

function NotificationsTab() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // UI bu 4 değeri sunuyor: all, unread, AnomalyAlert, HighRisk. Eski URL'ler
  // (read, System) ya da typo'lardan gelirse 'all'a normalize et — boş ekrana
  // takılıp "neden hiç yok" sorusu doğmasın.
  const VALID_FILTERS = ['all', 'unread', 'AnomalyAlert', 'HighRisk'];
  const rawFilter = searchParams.get('filter') || 'all';
  const filter = VALID_FILTERS.includes(rawFilter) ? rawFilter : 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [data, setData] = useState({
    items: [], totalCount: 0, totalPages: 1,
    loading: true, error: null,
  });
  const [unreadTotal, setUnreadTotal] = useState(0);

  const setFilter = useCallback((newFilter) => {
    const params = new URLSearchParams(searchParams);
    if (newFilter === 'all') params.delete('filter');
    else params.set('filter', newFilter);
    params.delete('page'); // reset to page 1 on filter change
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const setPage = useCallback((newPage) => {
    const params = new URLSearchParams(searchParams);
    if (newPage === 1) params.delete('page');
    else params.set('page', String(newPage));
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  // Backend filter is `isRead` only. Type filtering is client-side.
  // 'read' filter UI'dan kaldırıldı (All - Unread zaten tarif ediyor); URL
  // normalize edici 'read' geldiğinde 'all'a düşürür, bu branch artık dead.
  const apiParams = useMemo(() => {
    const params = { page, pageSize: PAGE_SIZE };
    if (filter === 'unread') params.isRead = false;
    return params;
  }, [page, filter]);

  const typeFilter = useMemo(
    () => (filter in TYPE_META ? filter : null),
    [filter]
  );

  const reloadList = useCallback(async () => {
    try {
      const res = await notificationApi.getAll(apiParams);
      const paged = res.data;
      setData({
        items: paged.items || [],
        totalCount: paged.totalCount || 0,
        totalPages: paged.totalPages || 1,
        loading: false,
        error: null,
      });
    } catch (e) {
      setData({ items: [], totalCount: 0, totalPages: 1, loading: false, error: e });
    }
  }, [apiParams]);

  const reloadUnreadTotal = useCallback(async () => {
    try {
      const res = await notificationApi.getUnreadCount();
      setUnreadTotal(res.data.unreadCount || 0);
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    setData((prev) => ({ ...prev, loading: true }));
    reloadList();
    reloadUnreadTotal();
  }, [reloadList, reloadUnreadTotal]);

  // Global polling MainLayout'a taşındı (her sayfada çalışır + baseline-silent).
  // Burada sadece: MainLayout "yeni notification" event dispatch ederse listeyi
  // ve unread sayacını tazele. Sayfa açıkken anlık feedback için yeterli;
  // sayfa kapalıysa zaten görmeye gerek yok (mount'taki ilk fetch tazeler).
  useEffect(() => {
    const handler = () => {
      reloadList();
      reloadUnreadTotal();
    };
    window.addEventListener('afrats:notification:new', handler);
    return () => window.removeEventListener('afrats:notification:new', handler);
  }, [reloadList, reloadUnreadTotal]);

  // Sadece GROUP_TYPES (yukarıda module-level) içindeki tip'ler için grouping.
  // AnomalyAlert gruplama dışı: her anomaly farklı bir transaction → tek
  // "× 7" satırı "7 anomaly aynı şey" yanılsaması yaratır, oysa 7 ayrı tx.
  // HighRisk için gruplama anlamlı çünkü sinyal aynı ("user High band'da"),
  // backend dedup çoğunu süzer ama eski kayıtlar için client-side toparlama
  // hâlâ değerli. Type filter aktifse önce filter, sonra group.
  const renderedGroups = useMemo(() => {
    const filtered = !typeFilter
      ? data.items
      : data.items.filter((n) => n.type === typeFilter);

    // GROUP_TYPES → bucket'lara topla; diğerleri her item kendi grup.
    const buckets = new Map();
    const singletons = [];
    for (const n of filtered) {
      if (!GROUP_TYPES.has(n.type)) {
        singletons.push({ representative: n, count: 1, allIds: [n.id] });
        continue;
      }
      const normTitle = (n.title || '').replace(/[\d.,]+/g, '_').trim();
      const key = `${n.type}|${normTitle}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(n);
    }
    const grouped = Array.from(buckets.values()).map((items) => {
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return { representative: items[0], count: items.length, allIds: items.map(i => i.id) };
    });

    return [...singletons, ...grouped].sort(
      // En yeni temsilci üstte (singleton ve grouped karışık doğru sırada)
      (a, b) => new Date(b.representative.createdAt) - new Date(a.representative.createdAt)
    );
  }, [data.items, typeFilter]);

  // markIds: tek notification için [id], group için tüm member id'ler.
  // Grouped click davranışı: "× 3" görüp tıklayan kullanıcı 3'ünün de read
  // olmasını bekler — yoksa sonraki ziyarette aynı grup yine "× 3" gözükür
  // ve UX kırılır. Bulk markAsRead Promise.all ile paralel; tek başarısızlık
  // toast'a yansır, diğerleri devam eder.
  const markIdsAsRead = async (ids) => {
    const unique = [...new Set(ids)];
    await Promise.all(unique.map((id) =>
      notificationApi.markAsRead(id).catch(() => null) // swallow per-id failures
    ));
    await Promise.all([reloadList(), reloadUnreadTotal()]);
  };

  const handleClick = async (n, groupIds = null) => {
    const idsToMark = (groupIds && groupIds.length > 0 ? groupIds : [n.id])
      .filter(() => !n.isRead || (groupIds && groupIds.length > 1));
    if (idsToMark.length > 0) {
      try {
        await markIdsAsRead(idsToMark);
      } catch (e) {
        toast.error(extractErrorMessage(e) || 'Failed to mark as read');
      }
    }
    if (n.type === 'AnomalyAlert' && n.relatedId) {
      navigate(`/anomalies/${n.relatedId}`);
    } else if (n.type === 'HighRisk') {
      navigate('/risk');
    }
    // System: stay on page
  };


  const handleMarkAllRead = async () => {
    try {
      const res = await notificationApi.markAllAsRead();
      const updated = res.data?.updatedCount ?? 0;
      toast.success(`${updated} notification${updated !== 1 ? 's' : ''} marked as read`);
      await Promise.all([reloadList(), reloadUnreadTotal()]);
    } catch (e) {
      toast.error(extractErrorMessage(e) || 'Failed');
    }
  };

  // İki grup: read-state pill'leri (All/Unread) ve type chip'leri (Anomalies/Risk).
  // "Read" pill'i kaldırıldı (All - Unread zaten Read'i tarif ediyor, ayrı buton
  // ek kavramsal yük). "System" pill'i kaldırıldı (NotificationType.System enum
  // değeri var ama backend'de hiçbir producer üretmiyor — dead filter, hep boş
  // çıkıyordu). Type chip'leri görsel divider ile read-state'ten ayrı; ikisi de
  // querystring'deki tek `filter` parametresini güncelliyor (state hâlâ tek source).
  const readStatePills = [
    { value: 'all',    label: 'All' },
    { value: 'unread', label: `Unread${unreadTotal > 0 ? ` (${unreadTotal})` : ''}` },
  ];
  const typeChips = [
    { value: 'AnomalyAlert', label: 'Anomalies' },
    { value: 'HighRisk',     label: 'Risk' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {readStatePills.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === t.value
                  ? 'bg-primary text-white'
                  : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
          {/* Visual divider — daha kalın + koyu: 2px width, gray-400, h-7
              ile pill'lerden net ayrım. 1px'lik ince çizgi göze değmiyordu. */}
          <span className="mx-3 w-0.5 h-7 bg-gray-400 rounded-full" aria-hidden="true" />
          {typeChips.map((t) => (
            <button
              key={t.value}
              onClick={() => setFilter(t.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === t.value
                  ? 'bg-primary text-white'
                  : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {unreadTotal > 0 && (
          <button
            onClick={handleMarkAllRead}
            // Proper filled button — eski "text + hover bg" stili "tıklanabilir
            // metin" gibi okunuyordu. Solid background + border ile button
            // affordance net; ikon ile pekiştirme.
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 rounded-md transition-colors shadow-sm"
          >
            <FiCheck className="w-3.5 h-3.5" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {data.loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={48} />
            ))}
          </div>
        ) : data.error ? (
          <div className="p-12 text-center text-sm text-expense">
            Failed to load notifications
          </div>
        ) : renderedGroups.length === 0 ? (
          <EmptyState
            icon={<FiBell size={22} />}
            title={
              filter === 'unread'
                ? 'No unread notifications'
                : typeFilter
                  ? `No ${getMeta(typeFilter).label.toLowerCase()} notifications on this page`
                  : 'No notifications to show'
            }
          />
        ) : (
          renderedGroups.map((g) => (
            <NotificationItem
              key={g.representative.id}
              notification={g.representative}
              groupCount={g.count}
              // Click handler closure'u g.allIds'i bilir → tüm group member'ları
              // bulk mark-read + navigate. Per-row ✓ butonu kaldırıldı; row
              // tek başına read+go primary action.
              onClick={(n) => handleClick(n, g.allIds)}
            />
          ))
        )}
      </div>

      {/* Pagination — hidden under client-side type filter to avoid inconsistent counts */}
      {!data.loading && !data.error && data.totalPages > 1 && !typeFilter && (
        <div className="flex items-center justify-between text-xs text-gray-600">
          <span>
            Page {page} of {data.totalPages} · {data.totalCount} total
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1}
              className="px-2 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              <FiChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= data.totalPages}
              className="px-2 py-1.5 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              <FiChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Main page — Inbox only. Preferences moved to /profile?tab=notifications.
// ──────────────────────────────────────────────────────────────────────────────

export default function NotificationList() {
  // Legacy URL support: /notifications?tab=preferences → redirect to Settings.
  // Anyone with that link bookmarked lands on the new home automatically.
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  useEffect(() => {
    if (searchParams.get('tab') === 'preferences') {
      navigate('/settings?tab=notifications', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Notifications</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Stay updated on anomalies, risk changes, and system events
        </p>
      </div>

      <NotificationsTab />
    </div>
  );
}