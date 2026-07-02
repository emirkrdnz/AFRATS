import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'react-toastify';
import { useAuth } from '../context/useAuth';
import notificationApi from '../api/notificationApi';
import {
  FiGrid,
  FiFileText,
  FiTrendingUp,
  FiAlertTriangle,
  FiBell,
  FiSettings,
  FiShield,
  FiUsers,
  FiZap,
  FiBarChart2,
  FiCpu,
  FiLogOut,
} from 'react-icons/fi';

// Sidebar role-split:
//   - Regular users: own transactions / risk / anomalies / notifications inbox.
//   - Admins: system-wide views only — they have no personal transaction data,
//     so the user pages would render empty/meaningless cards. Hiding them
//     prevents the "why is my dashboard empty?" confusion.
// Settings stays in both (Account + Security tabs are useful to admins too —
// Notifications + Danger Zone are gated inside Settings.jsx).
const userItems = [
  { to: '/',              icon: FiGrid,           label: 'Dashboard' },
  { to: '/transactions',  icon: FiFileText,       label: 'Transactions' },
  { to: '/risk',          icon: FiTrendingUp,     label: 'Risk Score' },
  { to: '/anomalies',     icon: FiAlertTriangle,  label: 'Anomalies' },
  { to: '/notifications', icon: FiBell,           label: 'Notifications' },
];

const adminItems = [
  { to: '/admin',           icon: FiBarChart2,  label: 'Admin Dashboard' },
  { to: '/admin/users',     icon: FiUsers,      label: 'Users' },
  { to: '/admin/ml-models', icon: FiCpu,        label: 'ML Models' },
  { to: '/admin/health',    icon: FiZap,        label: 'System Health' },
];

const settingsItem = { to: '/settings', icon: FiSettings, label: 'Settings' };

export default function MainLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // ── Global notification polling ────────────────────────────────────────
  // Layout-level mount → polling kullanıcı oturumu boyunca tek noktada.
  // Önceden NotificationList içindeydi; sadece /notifications açıkken çalışıyor
  // + sayfa her gir/çık'ta baseline=0'dan başlayıp ilk fetch'te delta=44 →
  // false-positive toast atıyordu. Burada:
  //   - İlk tick "baseline" — toast YOK, sadece prevCount set edilir
  //   - Sonraki tick'lerde next > prevCount → toast + window event dispatch
  //   - /notifications sayfası bu event'i dinleyip list reload tetikler
  // Interval 3s — kullanıcı "anında" hissetsin. Backend GetUnreadCount basit
  // count query, ölçek küçük (thesis demo); production'da SignalR/web-push
  // tercih edilir (v2 candidate). PrivateRoute zaten unauthorized'ları
  // engellediği için bu efekt sadece authenticated kullanıcıda çalışır.
  useEffect(() => {
    let cancelled = false;
    let baselineSet = false;
    let prevCount = 0;
    // Preference cache — InAppEnabled toggle'ı toast'ı gate eder. Polling
    // başlamadan önce bir kez fetch; preferences nadiren değiştiği için her
    // tick'te re-fetch gereksiz. Kullanıcı /settings'te değiştirip geri
    // dönerse, sayfa navigation MainLayout'u yeniden mount etmediği için
    // window event ile invalidate edilebilir (v2).
    let inAppToastEnabled = true;
    notificationApi.getPreferences?.()
      .then((res) => {
        inAppToastEnabled = res?.data?.inAppEnabled !== false; // default açık
      })
      .catch(() => { /* sessiz — default açık kalır */ });

    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await notificationApi.getUnreadCount();
        const next = res.data?.unreadCount ?? 0;
        if (!baselineSet) {
          prevCount = next;
          baselineSet = true;
          return;
        }
        if (next > prevCount) {
          const delta = next - prevCount;
          // Toast sadece kullanıcı InApp toggle'ını açıksa düşer.
          // Notification yine inbox'a yazıldı (backend her zaman kaydeder);
          // toggle off ise sessizce gelir, sayfa açıldığında görülür.
          if (inAppToastEnabled) {
            toast.info(`${delta} new notification${delta === 1 ? '' : 's'}`, { autoClose: 4000 });
          }
          // /notifications page mounted ise listesini tazelesin (toast off
          // olsa bile inbox güncellensin)
          window.dispatchEvent(new CustomEvent('afrats:notification:new'));
        }
        prevCount = next;
      } catch {
        // Network blip → polling'i durdurma, sessizce geç
      }
    };

    // İlk tick 1s'de — sayfa açar açmaz baseline kur (15s/3s beklemeden)
    const initial = setTimeout(tick, 1000);
    const id = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(id);
    };
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-100">
      <aside
        className="flex flex-col text-gray-300"
        style={{ width: 220, minWidth: 220, backgroundColor: 'var(--color-sidebar-bg)' }}
      >
        <div className="flex items-center gap-2 px-4 py-4 border-b border-white/10">
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center text-white text-xs font-medium shrink-0">
            AF
          </div>
          <span className="text-white font-medium text-sm">AFRATS</span>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
          {(isAdmin ? [...adminItems, settingsItem] : [...userItems, settingsItem]).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/' || item.to.startsWith('/admin')}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-secondary/20 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3 px-3 py-3 border-t border-white/10">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-white text-xs font-medium shrink-0">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm truncate">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="text-gray-500 text-xs">{user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-gray-500 hover:text-red-400 transition-colors shrink-0"
            title="Sign out"
          >
            <FiLogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Content shell stays fixed; only <main> scrolls. Sidebar remains in place. */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-6">
          <div className="af-page-enter" key={location.pathname}>
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
