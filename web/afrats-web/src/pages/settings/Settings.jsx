// src/pages/settings/Settings.jsx
// AFRATS — Settings page
//
// Single source of truth for account-level preferences. Sidebar nav reaches
// here via /settings; the legacy /profile route still redirects in for
// backwards-compatible bookmarks.
//
// Tabs: Account · Notifications · Security · Danger Zone
// Backend: authApi.updateProfile, authApi.changePassword, authApi.deleteAccount,
//          notificationApi.getPreferences, notificationApi.updatePreferences.

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { toast } from 'react-toastify';
import { formatMonthYear } from '../../utils/formatters';
import {
  FiUser, FiLock, FiAlertTriangle, FiCheck,
  FiMail, FiCalendar, FiShield, FiEdit2, FiKey,
  FiBell, FiMonitor,
} from 'react-icons/fi';
import { useAuth } from '../../context/useAuth';
import authApi from '../../api/authApi';
import notificationApi from '../../api/notificationApi';
import { extractErrorMessage, extractFieldErrors } from '../../api/errorHelper';
import Card from '../../components/Card';
import ConfirmDialog from '../../components/ConfirmDialog';
import Skeleton from '../../components/Skeleton';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  navy:         'var(--color-primary)',
  blue:         'var(--color-secondary)',
  green:        'var(--color-income)',
  red:          'var(--color-expense)',
  orange:       'var(--color-warning-strong)',
  purple:       'var(--color-accent)',
  textPrimary:  'var(--color-text)',
  textSecondary:'var(--color-text-secondary)',
  textMuted:    'var(--color-text-muted)',
  borderBase:   'var(--color-border)',
  borderSubtle: 'var(--color-border-subtle)',
  cardBg:       'var(--color-surface)',
  pageBg:       'var(--color-page)',
};

// ─── Global styles ────────────────────────────────────────────────────────────
function SettingsStyles() {
  return (
    <style>{`
      @keyframes af-fadeUp  { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes af-bar     { from{width:0} }
      @keyframes af-pop     { 0%{transform:scale(0.92);opacity:0} 100%{transform:scale(1);opacity:1} }

      .af-fadeUp { animation: af-fadeUp .4s cubic-bezier(.22,1,.36,1) both; }
      .af-e1 { animation-delay:   0ms; }
      .af-e2 { animation-delay:  60ms; }
      .af-e3 { animation-delay: 120ms; }
      .af-e4 { animation-delay: 180ms; }

      /* Hero card — compact, single band */
      .st-hero {
        background: #fff;
        border: 1px solid var(--color-border);
        border-radius: 14px;
        box-shadow: 0 1px 6px rgba(15,23,42,.06);
        overflow: hidden;
        position: relative;
      }
      .st-hero::before {
        content: '';
        position: absolute; inset: 0 0 auto 0; height: 4px;
        background: linear-gradient(90deg, ${T.navy}, ${T.blue});
      }

      /* Pill tabs — unified neutral active style */
      .af-tab-pill {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 8px 16px; border-radius: 10px;
        font-size: 13px; font-weight: 600;
        cursor: pointer; border: 1.5px solid var(--color-border);
        background: var(--color-surface); color: #64748B;
        transition: all .15s;
        white-space: nowrap;
      }
      .af-tab-pill:hover:not([data-active]) { background: #F8FAFC; border-color: #CBD5E1; color: ${T.textPrimary}; }
      .af-tab-pill[data-active="true"] { background: ${T.navy}; border-color: ${T.navy}; color: #fff; }
      .af-tab-pill[data-active="true"][data-variant="danger"] { background: ${T.red}; border-color: ${T.red}; }

      /* Sub-section card (lighter than main Card) */
      .st-sub {
        background: #fff;
        border: 1px solid var(--color-border-subtle);
        border-radius: 10px;
        overflow: hidden;
      }
      .st-sub-head {
        padding: 12px 16px;
        border-bottom: 1px solid var(--color-border-subtle);
        background: #FAFBFC;
      }
      .st-sub-title { font-size: 13px; font-weight: 700; color: ${T.textPrimary}; margin: 0; letter-spacing: -0.1px; }
      .st-sub-desc  { font-size: 11px; color: ${T.textMuted}; margin: 2px 0 0; }
      .st-row {
        display: flex; align-items: center; justify-content: space-between;
        gap: 14px; padding: 14px 16px;
        border-top: 1px solid var(--color-border-subtle);
      }
      .st-row:first-of-type { border-top: none; }

      /* Toggle */
      .st-toggle {
        position: relative; display: inline-flex; align-items: center;
        height: 22px; width: 40px; border-radius: 999px;
        border: none; cursor: pointer; transition: background .15s;
        flex-shrink: 0;
      }
      .st-toggle[data-on="true"]  { background: ${T.navy}; }
      .st-toggle[data-on="false"] { background: #CBD5E1; }
      .st-toggle[disabled] { opacity: .4; cursor: not-allowed; }
      .st-toggle-knob {
        position: absolute; top: 3px; left: 3px;
        width: 16px; height: 16px; border-radius: 50%;
        background: #fff; transition: transform .18s cubic-bezier(.22,1,.36,1);
        box-shadow: 0 1px 3px rgba(0,0,0,.2);
      }
      .st-toggle[data-on="true"] .st-toggle-knob { transform: translateX(18px); }

      .af-bar-grow { animation: af-bar .7s cubic-bezier(.34,1.56,.64,1) both; animation-delay: 100ms; }
      .af-pop      { animation: af-pop .35s cubic-bezier(.22,1,.36,1) both; }

      /* Input focus ring */
      .st-input:focus { outline: none; border-color: ${T.blue}; box-shadow: var(--shadow-focus-ring); }
      .st-input-err:focus { border-color: ${T.red}; box-shadow: 0 0 0 3px rgba(231,76,60,.12); }
    `}</style>
  );
}

// ─── Form primitives ─────────────────────────────────────────────────────────

function FieldWrap({ label, required, error, hint, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: T.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}{required && <span style={{ color: T.red, marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint  && !error && <p style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{hint}</p>}
      {error && <p style={{ fontSize: 11, color: T.red, marginTop: 4 }}>{error}</p>}
    </div>
  );
}

function PfInput({ hasError, ...props }) {
  return (
    <input
      {...props}
      className={hasError ? 'st-input st-input-err' : 'st-input'}
      style={{
        width: '100%', padding: '9px 12px', fontSize: 13,
        border: `1.5px solid ${hasError ? T.red : T.borderBase}`,
        borderRadius: 8, background: '#fff', color: T.textPrimary,
        boxSizing: 'border-box', fontFamily: 'inherit', transition: 'border-color .15s',
      }}
    />
  );
}

function Toggle({ checked, onChange, disabled = false, ariaLabel }) {
  return (
    <button
      type="button"
      className="st-toggle"
      data-on={checked ? 'true' : 'false'}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
    >
      <span className="st-toggle-knob" />
    </button>
  );
}

// Reusable sub-section block inside a tab
function SubSection({ title, description, children }) {
  return (
    <div className="st-sub">
      <div className="st-sub-head">
        <p className="st-sub-title">{title}</p>
        {description && <p className="st-sub-desc">{description}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// ─── Compact hero ─────────────────────────────────────────────────────────────

function CompactHero({ user }) {
  const initials    = `${user?.firstName?.[0] || ''}${user?.lastName?.[0] || ''}`.toUpperCase() || '?';
  const memberSince = formatMonthYear(user?.createdAt);
  const fullName    = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '—';

  return (
    <div className="st-hero af-fadeUp af-e1" style={{ padding: '18px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: `linear-gradient(135deg, ${T.blue}, ${T.navy})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 19, fontWeight: 800, color: '#fff', letterSpacing: '-1px',
          boxShadow: '0 3px 10px rgba(27,79,114,.3)',
          userSelect: 'none', flexShrink: 0,
        }}>
          {initials}
        </div>

        {/* Identity + meta */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: T.textPrimary, letterSpacing: '-0.3px', margin: 0, lineHeight: 1.2 }}>
            {fullName}
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.textSecondary }}>
              <FiMail size={12} style={{ color: T.textMuted }} />
              {user?.email}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.textSecondary }}>
              <FiShield size={12} style={{ color: T.textMuted }} />
              {user?.role || 'User'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: T.textSecondary }}>
              <FiCalendar size={12} style={{ color: T.textMuted }} />
              Member since {memberSince}
            </span>
          </div>
        </div>

        {/* Status */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: 'rgba(39,174,96,.1)', color: T.green,
          border: '1.5px solid rgba(39,174,96,.25)', letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, display: 'inline-block' }} />
          ACTIVE
        </span>
      </div>
    </div>
  );
}

// ─── Tab navigation ───────────────────────────────────────────────────────────

function TabNav({ active, onChange, tabs }) {
  return (
    <div className="af-fadeUp af-e2" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {tabs.map(({ value, label, icon: Icon, variant }) => (
        <button
          key={value}
          className="af-tab-pill"
          data-active={active === value ? 'true' : undefined}
          data-variant={variant}
          onClick={() => onChange(value)}
        >
          <Icon size={13} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Section card shell ───────────────────────────────────────────────────────

function SectionCard({ accent, title, subtitle, icon: Icon, children, action }) {
  return (
    <Card
      className="af-fadeUp af-e3"
      accent={accent}
      title={title}
      subtitle={subtitle}
      headerIcon={Icon ? <Icon size={18} /> : null}
      action={action}
      padding="lg"
    >
      {children}
    </Card>
  );
}

// ─── Account tab ─────────────────────────────────────────────────────────────

function AccountTab({ user }) {
  const { refreshUser } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const { register, handleSubmit, formState: { errors, isDirty }, reset, setError } = useForm({
    defaultValues: { firstName: user?.firstName || '', lastName: user?.lastName || '' },
  });

  useEffect(() => {
    if (user) reset({ firstName: user.firstName || '', lastName: user.lastName || '' });
  }, [user, reset]);

  const submit = async (values) => {
    setIsSaving(true);
    try {
      await authApi.updateProfile(values);
      await refreshUser();
      toast.success('Account updated');
      reset(values);
    } catch (e) {
      const fieldErrors = extractFieldErrors(e);
      const keys = Object.keys(fieldErrors);
      for (const field of keys) {
        setError(field, { type: 'server', message: fieldErrors[field] });
      }
      if (keys.length === 0) {
        toast.error(extractErrorMessage(e, 'Could not save changes.'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      accent={`linear-gradient(90deg, ${T.navy}, ${T.blue})`}
      title="Account"
      subtitle="Personal information shown across AFRATS"
      icon={FiEdit2}
    >
      <SubSection
        title="Personal information"
        description="Your display name appears in headers, comments, and reports."
      >
        <div style={{ padding: 16 }}>
          <form onSubmit={handleSubmit(submit)}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
              <FieldWrap label="First Name" required error={errors.firstName?.message}>
                <PfInput
                  hasError={!!errors.firstName}
                  {...register('firstName', {
                    required: 'First name is required',
                    maxLength: { value: 50, message: 'Too long' },
                  })}
                />
              </FieldWrap>

              <FieldWrap label="Last Name" required error={errors.lastName?.message}>
                <PfInput
                  hasError={!!errors.lastName}
                  {...register('lastName', {
                    required: 'Last name is required',
                    maxLength: { value: 50, message: 'Too long' },
                  })}
                />
              </FieldWrap>
            </div>

            <FieldWrap
              label="Email Address"
              hint="Email cannot be changed. Contact support if needed."
            >
              <PfInput
                type="email"
                value={user?.email || ''}
                disabled
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13,
                  border: `1.5px solid ${T.borderSubtle}`,
                  borderRadius: 8, background: T.pageBg, color: T.textMuted,
                  boxSizing: 'border-box', fontFamily: 'inherit',
                  cursor: 'not-allowed',
                }}
              />
            </FieldWrap>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, paddingTop: 18, marginTop: 18, borderTop: `1px solid ${T.borderSubtle}` }}>
              {isDirty && !isSaving && (
                <span style={{ fontSize: 12, color: T.textMuted }}>Unsaved changes</span>
              )}
              <button
                type="submit"
                disabled={!isDirty || isSaving}
                style={{
                  padding: '9px 20px', fontSize: 13, fontWeight: 700,
                  borderRadius: 8, border: 'none', cursor: isDirty && !isSaving ? 'pointer' : 'not-allowed',
                  background: isDirty && !isSaving ? T.navy : T.borderBase,
                  color: isDirty && !isSaving ? '#fff' : T.textMuted,
                  transition: 'all .15s',
                }}
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </SubSection>
    </SectionCard>
  );
}

// ─── Notifications tab (moved from /notifications?tab=preferences) ───────────

function SaveStatusPill({ status }) {
  if (status === 'saving') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.textMuted }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.blue }} className="animate-pulse" />
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.green }}>
        <FiCheck size={13} />
        Saved
      </span>
    );
  }
  return <span style={{ fontSize: 12, color: T.textMuted }}>All changes saved</span>;
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const isInitialized = useRef(false);

  useEffect(() => {
    let cancelled = false;
    notificationApi.getPreferences()
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.data);
        setTimeout(() => { isInitialized.current = true; }, 0);
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(extractErrorMessage(e) || 'Failed to load preferences');
      });
    return () => { cancelled = true; };
  }, []);

  // Debounced auto-save on user change. Same flow as the old PreferencesTab,
  // preserved so muscle memory stays intact for anyone who used it before.
  useEffect(() => {
    if (!prefs || !isInitialized.current) return;
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try {
        await notificationApi.updatePreferences(prefs);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 1500);
      } catch (e) {
        toast.error(extractErrorMessage(e) || 'Failed to save preferences');
        setSaveStatus('idle');
      }
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs]);

  const setFlag = (key, value) => setPrefs((p) => ({ ...p, [key]: value }));

  // Push channel UI'dan kaldırıldı — backend'de NotificationChannel.Push
  // enum'u var ama hiçbir handler/consumer Push tipinde notification
  // üretmiyor. Toggle açıkken de hiçbir push gelmediği için kullanıcıya
  // yalan söyleniyordu. Email + In-app çalışan 2 kanal.
  const channels = [
    { key: 'emailEnabled', label: 'Email',   icon: FiMail,    desc: 'Receive notifications at your email address' },
    { key: 'inAppEnabled', label: 'In-app',  icon: FiMonitor, desc: 'Show notifications inside AFRATS' },
  ];

  return (
    <SectionCard
      accent={`linear-gradient(90deg, ${T.blue}, #3498DB)`}
      title="Notifications"
      subtitle="Choose how and when AFRATS reaches out to you"
      icon={FiBell}
      action={prefs ? <SaveStatusPill status={saveStatus} /> : null}
    >
      {!prefs ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton height={128} rounded={10} />
          <Skeleton height={96}  rounded={10} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SubSection
            title="Delivery channels"
            description="Master switches for each delivery method."
          >
            {channels.map(({ key, label, icon: Icon, desc }) => (
              <div key={key} className="st-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 8,
                    background: 'var(--color-primary-50)',
                    color: T.navy,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={15} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>{label}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{desc}</div>
                  </div>
                </div>
                <Toggle
                  checked={prefs[key] === true}
                  onChange={(v) => setFlag(key, v)}
                  ariaLabel={`Toggle ${label} notifications`}
                />
              </div>
            ))}
          </SubSection>

          {/* "Email filtering: High-risk only" toggle kaldırıldı — backend
              halihazırda sadece HighRisk için email gönderiyor (AnomalyAlert
              hiç email üretmez), ayrı toggle redundant kalıyordu. */}
        </div>
      )}
    </SectionCard>
  );
}

// ─── Password strength meter ──────────────────────────────────────────────────

function StrengthMeter({ password }) {
  if (!password) return null;

  const checks = {
    length:     password.length >= 8,
    upperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    number:     /\d/.test(password),
    symbol:     /[^a-zA-Z0-9]/.test(password),
  };
  const score = Object.values(checks).filter(Boolean).length;

  const LEVELS = [
    { label: 'Too short', color: T.red,    pct: 10  },
    { label: 'Weak',      color: T.red,    pct: 30  },
    { label: 'Fair',      color: T.orange, pct: 55  },
    { label: 'Good',      color: T.green,  pct: 80  },
    { label: 'Strong',    color: T.green,  pct: 100 },
  ];
  const lv = LEVELS[score];

  const CHECKLIST = [
    { ok: checks.length,     text: 'At least 8 characters' },
    { ok: checks.upperLower, text: 'Upper and lower case' },
    { ok: checks.number,     text: 'At least one number' },
    { ok: checks.symbol,     text: 'At least one symbol' },
  ];

  return (
    <div className="af-pop" style={{ marginTop: 10, padding: '12px 14px', borderRadius: 10, background: T.pageBg, border: `1px solid ${T.borderSubtle}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Strength</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: lv.color }}>{lv.label}</span>
      </div>
      <div style={{ height: 5, background: T.borderSubtle, borderRadius: 3, overflow: 'hidden', marginBottom: 10 }}>
        <div className="af-bar-grow" style={{ height: '100%', width: `${lv.pct}%`, background: lv.color, borderRadius: 3 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px' }}>
        {CHECKLIST.map(({ ok, text }) => (
          <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: ok ? T.green : T.textMuted }}>
            <FiCheck size={11} style={{ opacity: ok ? 1 : 0.3, flexShrink: 0 }} />
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Security tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const [isSaving, setIsSaving] = useState(false);
  const { register, handleSubmit, watch, reset, setError, formState: { errors } } = useForm({
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = watch('newPassword');

  const submit = async (values) => {
    setIsSaving(true);
    try {
      await authApi.changePassword(
        values.currentPassword,
        values.newPassword,
        values.confirmPassword,
      );
      toast.success('Password changed successfully');
      reset();
    } catch (e) {
      const fieldErrors = extractFieldErrors(e);
      const keys = Object.keys(fieldErrors);
      for (const field of keys) {
        setError(field, { type: 'server', message: fieldErrors[field] });
      }
      if (keys.length === 0) {
        toast.error(extractErrorMessage(e, 'Could not change password.'));
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SectionCard
      accent={`linear-gradient(90deg, ${T.blue}, #3498DB)`}
      title="Security"
      subtitle="Protect access to your account"
      icon={FiLock}
    >
      <SubSection
        title="Change password"
        description="Use a unique password that you don't use elsewhere."
      >
        <div style={{ padding: 16 }}>
          <form onSubmit={handleSubmit(submit)}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 420 }}>
              <FieldWrap label="Current Password" required error={errors.currentPassword?.message}>
                <PfInput
                  type="password"
                  autoComplete="current-password"
                  hasError={!!errors.currentPassword}
                  {...register('currentPassword', { required: 'Current password is required' })}
                />
              </FieldWrap>

              <FieldWrap label="New Password" required error={errors.newPassword?.message}>
                <PfInput
                  type="password"
                  autoComplete="new-password"
                  hasError={!!errors.newPassword}
                  {...register('newPassword', {
                    required: 'New password is required',
                    minLength: { value: 8, message: 'Must be at least 8 characters' },
                  })}
                />
                <StrengthMeter password={newPassword} />
              </FieldWrap>

              <FieldWrap label="Confirm New Password" required error={errors.confirmPassword?.message}>
                <PfInput
                  type="password"
                  autoComplete="new-password"
                  hasError={!!errors.confirmPassword}
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (v) => v === newPassword || 'Passwords do not match',
                  })}
                />
              </FieldWrap>

              <div style={{ paddingTop: 6 }}>
                <button
                  type="submit"
                  disabled={isSaving}
                  style={{
                    padding: '9px 20px', fontSize: 13, fontWeight: 700,
                    borderRadius: 8, border: 'none', cursor: isSaving ? 'not-allowed' : 'pointer',
                    background: isSaving ? T.borderBase : T.blue,
                    color: isSaving ? T.textMuted : '#fff',
                    transition: 'all .15s',
                  }}
                >
                  {isSaving ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </SubSection>
    </SectionCard>
  );
}

// ─── Danger Zone tab ─────────────────────────────────────────────────────────

function DangerZoneTab({ user, onDeleted }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting,  setIsDeleting]  = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await authApi.deleteAccount();
      toast.success('Account deleted');
      setConfirmOpen(false);
      onDeleted();
    } catch (e) {
      toast.error(extractErrorMessage(e, 'Delete failed'));
      setIsDeleting(false);
    }
  };

  return (
    <SectionCard
      accent={T.red}
      title="Danger Zone"
      subtitle="Irreversible account actions"
      icon={FiAlertTriangle}
    >
      <div style={{
        border: `1.5px solid rgba(231,76,60,.25)`,
        background: 'rgba(231,76,60,.04)',
        borderRadius: 10,
        padding: 16,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 4 }}>Delete Account</div>
          <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.6, maxWidth: 480 }}>
            Permanently deletes your AFRATS account, all transactions, anomaly history, risk scores,
            and notifications. <strong style={{ color: T.red }}>This action cannot be undone.</strong>
          </div>
        </div>

        <button
          onClick={() => setConfirmOpen(true)}
          style={{
            flexShrink: 0, padding: '8px 18px', fontSize: 13, fontWeight: 600,
            borderRadius: 8, cursor: 'pointer',
            border: `1.5px solid ${T.red}`, background: '#fff', color: T.red,
            transition: 'all .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${T.red}10`; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
        >
          Delete my account
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        message="This permanently deletes your account, transactions, anomaly history, risk scores, and notifications. This action cannot be undone."
        confirmLabel="Delete my account"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
        requireText={user?.email}
        requireTextLabel={`Type "${user?.email}" to confirm`}
        requireTextPlaceholder={user?.email}
      />
    </SectionCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// Tabs are role-gated. Admins don't get Notifications (they never receive
// alerts — high-risk events fire on transaction owners, admins have none) and
// don't get Danger Zone (admin self-delete is blocked server-side in
// DeleteProfileCommandHandler; hiding the UI keeps surface area honest).
const USER_TABS = [
  { value: 'account',       label: 'Account',       icon: FiUser          },
  { value: 'notifications', label: 'Notifications', icon: FiBell          },
  { value: 'security',      label: 'Security',      icon: FiKey           },
  { value: 'danger',        label: 'Danger Zone',   icon: FiAlertTriangle, variant: 'danger' },
];
const ADMIN_TABS = [
  { value: 'account',  label: 'Account',  icon: FiUser },
  { value: 'security', label: 'Security', icon: FiKey  },
];

export default function Settings() {
  const { user, logout, isAdmin } = useAuth();
  const navigate               = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabs                   = isAdmin ? ADMIN_TABS : USER_TABS;
  const validValues            = tabs.map((t) => t.value);
  const rawTab                 = searchParams.get('tab') || 'account';
  // If admin hits /settings?tab=notifications (old bookmark) → fall back to
  // account instead of 404'ing a hidden tab.
  const activeTab              = validValues.includes(rawTab) ? rawTab : 'account';

  const setTab = (tab) => {
    const next = new URLSearchParams(searchParams);
    if (tab === 'account') next.delete('tab'); else next.set('tab', tab);
    setSearchParams(next);
  };

  const handleAccountDeleted = async () => {
    await logout?.();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <SettingsStyles />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '4px 0' }}>

        {/* Page title */}
        <div className="af-fadeUp af-e1">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.textPrimary, margin: 0, letterSpacing: '-0.5px' }}>
            Settings
          </h1>
          <p style={{ fontSize: 13, color: T.textMuted, margin: '4px 0 0' }}>
            {isAdmin ? 'Account and security' : 'Account, notifications, and security in one place'}
          </p>
        </div>

        {/* Compact hero */}
        <CompactHero user={user} />

        {/* Tab pills */}
        <TabNav active={activeTab} onChange={setTab} tabs={tabs} />

        {/* Tab content */}
        {activeTab === 'account'       && <AccountTab       user={user} />}
        {activeTab === 'notifications' && <NotificationsTab />}
        {activeTab === 'security'      && <SecurityTab      />}
        {activeTab === 'danger'        && <DangerZoneTab    user={user} onDeleted={handleAccountDeleted} />}

      </div>
    </>
  );
}
