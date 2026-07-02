// src/pages/admin/SystemHealth.jsx
//
// Sıfırdan tasarım — kullanıcıyla adım adım Q&A sonucu (Sprint V).
//
// Karar matrisi:
//   - Ad: System Health (sağlık odaklı, mimari yardımcı)
//   - Yapı: 2 sütun (sol mimari diyagram, sağ 4 servis kartı)
//   - Diyagram: top-down vertikal, tam detay (External → Gateway → 4 service →
//     Broker → SQL Server + 4 DB chip)
//   - Sağ panel: sabit (click yok), 4 servis kartı
//   - Kart içeriği: status pill + latency rakamı + sparkline + port + db
//   - Animasyon: yalnız status dot pulse
//   - Renk: brand (indigo) + status (g/y/r) + nötr griler
//   - Üst özet: yok (sayfa direkt 2 sütun)

import { FiShield, FiActivity, FiCpu, FiBell, FiInbox, FiDatabase, FiServer, FiMonitor, FiSmartphone } from 'react-icons/fi';

import { useHealthMonitor } from '../../context/HealthMonitorContext';

// ── Sabitler ───────────────────────────────────────────────────────────────
// Health verisi global HealthMonitorContext'ten gelir (admin login olduğu
// andan itibaren 3sn'de bir background poll). Bu sayfa sadece statik
// metadata (label/db/port/theme) + live state'i merge'leyip render eder.

const SERVICES = [
  { key: 'auth',  label: 'AuthService',         db: 'afrats_auth',  port: 5001, Icon: FiShield,   themeColor: '#8E44AD' }, // mor
  { key: 'txn',   label: 'TransactionService',  db: 'afrats_txn',   port: 5002, Icon: FiActivity, themeColor: '#2E86C1' }, // mavi
  { key: 'ml',    label: 'MLService',           db: 'afrats_ml',    port: 8000, Icon: FiCpu,      themeColor: '#16A085' }, // teal
  { key: 'notif', label: 'NotificationService', db: 'afrats_notif', port: 5004, Icon: FiBell,     themeColor: '#F39C12' }, // amber
];

// Tek brand + 3 status rengi.
const COLORS = {
  brand:    '#4F46E5',  // indigo
  good:     '#10B981',  // green
  warn:     '#F59E0B',  // yellow
  bad:      '#EF4444',  // red
  text:     '#111827',
  muted:    '#6B7280',
  border:   '#E5E7EB',
  bgSubtle: '#F9FAFB',
};

// ── Helpers ────────────────────────────────────────────────────────────────

function parseHealthStatus(raw) {
  const d = raw?.data ?? raw;
  const s = (d?.status ?? '').toLowerCase();
  if (s === 'healthy')  return 'healthy';
  if (s === 'degraded') return 'degraded';
  return 'unhealthy';
}

function statusColor(s) {
  if (s === 'healthy')  return COLORS.good;
  if (s === 'degraded') return COLORS.warn;
  if (s === 'loading')  return COLORS.muted;
  return COLORS.bad;
}

function statusLabel(s) {
  if (s === 'healthy')  return 'Healthy';
  if (s === 'degraded') return 'Degraded';
  if (s === 'loading')  return 'Checking';
  return 'Down';
}

// ── Sparkline: line + subtle area fill ────────────────────────────────────

function Sparkline({ values, width = 260, height = 42, color = COLORS.brand }) {
  // Henüz veri yok / tek ölçüm — sparkline yerine düz yatay placeholder çizgi.
  // Global polling 3sn'de bir veri eklediği için bu durum çok kısa.
  if (!values || values.length < 2) {
    const y = height / 2;
    return (
      <svg width={width} height={height} style={{ display: 'block' }}>
        <line
          x1={2} y1={y} x2={width - 2} y2={y}
          stroke={COLORS.muted}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.3}
        />
      </svg>
    );
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((v - min) / range) * (height - 8);
    return `${x},${y}`;
  });
  const areaPath = `M${points[0]} L${points.join(' L')} L${width - 2},${height - 2} L2,${height - 2} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path d={areaPath} fill={color} opacity={0.1} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Mimari diyagram — top-down, hibrit tasarım:
//   - minimal taban (sade kutu/çizgi)
//   - servise özgü renk vurgusu (ikon + accent)
//   - status border (sağlık durumu)
//   - akan noktalar (flowing dots) connection'larda
// External → Gateway → 4 Service → Broker (async) + SQL Server → 4 Database
// ─────────────────────────────────────────────────────────────────────────

const BROKER_COLOR = '#F37A20';  // RabbitMQ orange
const SQL_COLOR    = '#374151';  // dark gray
const GW_COLOR     = COLORS.brand; // indigo

// Akan nokta — path boyunca BIDIRECTIONAL hareket. Her bağlantıda iki dot:
// biri ileri (request gönderiliyor), biri geri (response geliyor), farklı
// timing ve boyut. Bu sayede mikroservis trafiği gerçekçi: "veri akıyor /
// cevap dönüyor" karışık hissi.
function FlowDot({ path, color, dur = 2.4, delay = 0, r = 2.4 }) {
  return (
    <>
      {/* Forward — request akışı (ana yön) */}
      <circle r={r} fill={color} opacity={0.85}>
        <animateMotion
          dur={`${dur}s`}
          repeatCount="indefinite"
          path={path}
          begin={`${delay}s`}
        />
      </circle>
      {/* Reverse — response akışı (geri yönde, daha küçük + sönük) */}
      <circle r={r * 0.7} fill={color} opacity={0.55}>
        <animateMotion
          dur={`${dur * 1.15}s`}
          repeatCount="indefinite"
          path={path}
          begin={`${delay + dur * 0.45}s`}
          keyPoints="1;0"
          keyTimes="0;1"
        />
      </circle>
    </>
  );
}

// SVG içinde React ikonu render etmek için foreignObject wrapper.
function SvgIcon({ Icon, x, y, size = 14, color }) {
  return (
    <foreignObject x={x} y={y} width={size} height={size} style={{ overflow: 'visible' }}>
      <div style={{
        width: size, height: size, color, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={size} />
      </div>
    </foreignObject>
  );
}

function ArchitectureDiagram({ services, broker }) {
  // 4 service eşit aralıklı (geniş gap), Broker services'in altında Tx-ML
  // ortasında konumlandırılır. Service → DB direkt dik iner — broker'la
  // çakışmaz çünkü broker services satırının altında ve column-arası
  // boşluğa oturuyor. Broker → Notif çizgisi ML'in altından geçer (matematik
  // ile hesaplanmış, ML kutusuyla overlap yok).
  const W = 1000;
  const H = 490;

  const COL_W = 116, SVC_H = 64;
  const COL_GAP = 150;
  const TOTAL_GRID = 4 * COL_W + 3 * COL_GAP;          // 464 + 450 = 914
  const GRID_LEFT  = (W - TOTAL_GRID) / 2;             // 43 (her kenarda padding)
  const xCol = (i) => GRID_LEFT + i * (COL_W + COL_GAP);
  const xMid = (i) => xCol(i) + COL_W / 2;

  const SVC_Y = 170;

  // External / Gateway
  const EXT_W = 240, EXT_H = 46, EXT_X = (W - EXT_W) / 2, EXT_Y = 16;
  const GW_W = 280,  GW_H = 52, GW_X = (W - GW_W) / 2,  GW_Y = 90;

  // Broker — Tx (i=1) ile ML (i=2) ORTASINDA, services satırının altında
  const BR_W = 200;
  const BR_H = 70;
  const BR_X = (xMid(1) + xMid(2)) / 2 - BR_W / 2;
  const BR_Y = SVC_Y + SVC_H + 28;

  // SQL container — 4 DB chip'i sarmalayan büyük dörtgen
  const DB_W = COL_W;
  const DB_H = 52;
  const DB_Y = BR_Y + BR_H + 60;        // brokerın altında, çakışmaz

  const SQL_PAD = 18;
  const SQL_X = xCol(0) - SQL_PAD;
  const SQL_W = (xCol(3) + COL_W + SQL_PAD) - SQL_X;
  const SQL_Y = DB_Y - SQL_PAD - 12;
  const SQL_H = (DB_Y + DB_H + SQL_PAD) - SQL_Y;


  const brokerOk = broker?.status === 'connected';
  const brokerStroke = brokerOk ? BROKER_COLOR : COLORS.bad;
  const brokerFlow   = brokerOk ? BROKER_COLOR : COLORS.muted;

  // Path string helper'ları akan noktalar için
  const lineP = (x1, y1, x2, y2) => `M ${x1} ${y1} L ${x2} ${y2}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: 'block', maxHeight: 490 }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Arrow marker tanımı — service → DB oklu çizgileri için */}
      <defs>
        {services.map((s) => (
          <marker
            key={`arr-${s.key}`}
            id={`arr-${s.key}`}
            viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="6" markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={s.themeColor} opacity={0.85} />
          </marker>
        ))}
      </defs>

      {/* ─── Web & Mobile clients (gerçek: afrats-web + afrats-mobile RN app) ─── */}
      {/* Renk: #1B4F72 brand primary lacivert — Gateway indigodan farklı, AFRATS brand kimliği */}
      <g>
        <rect x={EXT_X} y={EXT_Y} width={EXT_W} height={EXT_H} rx={8}
              fill="white" stroke="#1B4F72" strokeWidth={1.5} />
        {/* Sol: monitor + smartphone iki ikon yan yana, lacivert */}
        <SvgIcon Icon={FiMonitor}    x={EXT_X + 12} y={EXT_Y + EXT_H/2 - 8} size={14} color="#1B4F72" />
        <SvgIcon Icon={FiSmartphone} x={EXT_X + 30} y={EXT_Y + EXT_H/2 - 8} size={14} color="#1B4F72" />
        <text x={EXT_X + EXT_W/2} y={EXT_Y + 20}
              textAnchor="middle" fontSize="12" fontWeight="600" fill={COLORS.text}>
          Web &amp; Mobile
        </text>
        <text x={EXT_X + EXT_W/2} y={EXT_Y + 35}
              textAnchor="middle" fontSize="9.5" fill={COLORS.muted}>
          HTTPS
        </text>
      </g>

      {/* Web & Mobile → Gateway (akan nokta — lacivert, client kimliği) */}
      <line x1={W/2} y1={EXT_Y + EXT_H} x2={W/2} y2={GW_Y}
            stroke={COLORS.border} strokeWidth={1.3} />
      <FlowDot path={lineP(W/2, EXT_Y + EXT_H, W/2, GW_Y)} color="#1B4F72" dur={2} />

      {/* ─── API Gateway ─── */}
      <g>
        <rect x={GW_X} y={GW_Y} width={GW_W} height={GW_H} rx={8}
              fill="white" stroke={GW_COLOR} strokeWidth={1.8} />
        <SvgIcon Icon={FiServer} x={GW_X + 14} y={GW_Y + GW_H/2 - 8} size={16} color={GW_COLOR} />
        <text x={GW_X + GW_W/2} y={GW_Y + 22}
              textAnchor="middle" fontSize="13" fontWeight="700" fill={COLORS.text}>
          API Gateway
        </text>
        <text x={GW_X + GW_W/2} y={GW_Y + 38}
              textAnchor="middle" fontSize="10" fill={COLORS.muted}>
          YARP · JWT validated
        </text>
      </g>

      {/* Gateway → each service (her birinde akan nokta, kademeli delay) */}
      {services.map((s, i) => {
        const x1 = W/2, y1 = GW_Y + GW_H;
        const x2 = xMid(i), y2 = SVC_Y;
        return (
          <g key={`gw-${s.key}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={COLORS.border} strokeWidth={1.3} />
            <FlowDot path={lineP(x1, y1, x2, y2)} color={s.themeColor} dur={2.4} delay={i * 0.5} />
          </g>
        );
      })}

      {/* ─── 4 Services ─── */}
      {services.map((s, i) => {
        const statusC = statusColor(s.status);
        const Icon = s.Icon;
        return (
          <g key={`svc-${s.key}`}>
            {/* Border = servisin tema rengi (kimlik); sağlık zaten status dot ile belli */}
            <rect x={xCol(i)} y={SVC_Y} width={COL_W} height={SVC_H} rx={8}
                  fill="white" stroke={s.themeColor} strokeWidth={1.8} />

            {/* Servise özgü ikon (sol üst) */}
            <SvgIcon Icon={Icon} x={xCol(i) + 8} y={SVC_Y + 8} size={14} color={s.themeColor} />

            {/* Status dot (sağ üst) — yeşil=healthy, kırmızı=down */}
            <circle cx={xCol(i) + COL_W - 10} cy={SVC_Y + 13} r={3.5} fill={statusC} />

            {/* Servis adı */}
            <text x={xCol(i) + COL_W / 2} y={SVC_Y + 32}
                  textAnchor="middle" fontSize="11.5" fontWeight="700" fill={COLORS.text}>
              {s.label.replace('Service', '')}
            </text>
            {/* Latency */}
            <text x={xCol(i) + COL_W / 2} y={SVC_Y + 46}
                  textAnchor="middle" fontSize="11" fontWeight="600" fill={statusC}>
              {s.latencyMs != null ? `${s.latencyMs}ms` : '—'}
            </text>
            {/* Port */}
            <text x={xCol(i) + COL_W / 2} y={SVC_Y + 57}
                  textAnchor="middle" fontSize="9" fill={COLORS.muted}>
              :{s.port}
            </text>
          </g>
        );
      })}

      {/* ─── Broker connections (kısa diagonal, çakışmasız) ─── */}
      {/* Servisler 4-2-2 column'larında, broker column 2'de hemen altta.
          Tx (col 1) → Broker (col 2): kısa diagonal sağa-aşağı
          ML (col 3) → Broker (col 2): kısa diagonal sola-aşağı
          Broker → Notif (col 4): kısa diagonal sağa-yukarı */}
      {(() => {
        const tx_x  = xMid(1), tx_y  = SVC_Y + SVC_H;
        const ml_x  = xMid(2), ml_y  = SVC_Y + SVC_H;
        const no_x  = xMid(3), no_y  = SVC_Y + SVC_H;
        const br_lx = BR_X + 14,         br_ty = BR_Y;
        const br_rx = BR_X + BR_W - 14,  br_ry = BR_Y;
        const br_rmx = BR_X + BR_W,      br_rmy = BR_Y + BR_H/2;
        return (
          <>
            {/* Tx → Broker (diagonal sağ-aşağı) */}
            <line x1={tx_x} y1={tx_y} x2={br_lx} y2={br_ty}
                  stroke={brokerStroke} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.7} />
            {brokerOk && <FlowDot path={lineP(tx_x, tx_y, br_lx, br_ty)} color={brokerFlow} dur={2} delay={0} />}

            {/* ML → Broker (diagonal sol-aşağı) */}
            <line x1={ml_x} y1={ml_y} x2={br_rx} y2={br_ry}
                  stroke={brokerStroke} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.7} />
            {brokerOk && <FlowDot path={lineP(ml_x, ml_y, br_rx, br_ry)} color={brokerFlow} dur={2} delay={0.6} />}

            {/* Broker → Notif (kısa diagonal sağ-yukarı, ML'in altından geçmiyor çünkü broker col 2'de, Notif col 4'te direkt erişiyor) */}
            <line x1={br_rmx} y1={br_rmy} x2={no_x} y2={no_y}
                  stroke={brokerStroke} strokeWidth={1.4} strokeDasharray="5 4" opacity={0.7} />
            {brokerOk && <FlowDot path={lineP(br_rmx, br_rmy, no_x, no_y)} color={brokerFlow} dur={2} delay={1.2} />}
          </>
        );
      })()}

      {/* ─── RabbitMQ Broker (services'in altında, Tx-ML ortasında) ─── */}
      {/* Sade kart — başlık + status + queue özeti. Detay queue isimleri
          RabbitMQ Management UI'da zaten görünür, burada minimal tutuldu. */}
      <g>
        <rect x={BR_X} y={BR_Y} width={BR_W} height={BR_H} rx={8}
              fill="white" stroke={brokerStroke} strokeWidth={1.8} />
        <SvgIcon Icon={FiInbox} x={BR_X + 12} y={BR_Y + 12} size={14} color={BROKER_COLOR} />
        {/* Status dot — yeşil=connected, kırmızı=down (servis kartlarıyla aynı pattern) */}
        <circle cx={BR_X + BR_W - 12} cy={BR_Y + 17} r={3.5}
                fill={brokerOk ? COLORS.good : COLORS.bad} />
        <text x={BR_X + BR_W / 2} y={BR_Y + 36}
              textAnchor="middle" fontSize="12" fontWeight="700" fill={COLORS.text}>
          RabbitMQ Broker
        </text>
        <text x={BR_X + BR_W / 2} y={BR_Y + 54}
              textAnchor="middle" fontSize="10" fill={COLORS.muted}>
          {brokerOk
            ? `${broker?.objectTotals?.queues ?? 4} queues · async events`
            : 'disconnected'}
        </text>
      </g>

      {/* ─── Service → DB chip (DİK düz, OKLU çizgi) ─── */}
      {/* 5-column layout sayesinde her servis kendi column'unda DİK aşağı iner.
          Broker column 2'de — diğer column'larla çakışmaz. Oklu çizgi
          (arrow marker) DB chip'in üst kenarına işaret eder. */}
      {services.map((s, i) => {
        const x = xMid(i);
        const y1 = SVC_Y + SVC_H;
        const y2 = DB_Y - 2;
        const pathD = `M ${x} ${y1} L ${x} ${y2}`;
        return (
          <g key={`sql-${s.key}`}>
            <line x1={x} y1={y1} x2={x} y2={y2}
                  stroke={s.themeColor}
                  strokeWidth={1.8}
                  opacity={0.7}
                  markerEnd={`url(#arr-${s.key})`} />
            <FlowDot path={pathD} color={s.themeColor} dur={3} delay={i * 0.6} r={2.4} />
          </g>
        );
      })}

      {/* ─── SQL Server outer container (4 DB'yi sarmalayan dashed dörtgen) ─── */}
      {/* Saydam fill + dashed border — gerçek SQL Server Docker container'ı
          temsil eder. Üst sol köşede küçük etiket. DB chip'ler içinde durur. */}
      <g>
        <rect x={SQL_X} y={SQL_Y} width={SQL_W} height={SQL_H} rx={12}
              fill={SQL_COLOR}
              fillOpacity={0.04}
              stroke={SQL_COLOR}
              strokeWidth={1.4}
              strokeDasharray="6 4"
              strokeOpacity={0.5} />

        {/* Üst sol köşede SQL Server etiketi — genişletilmiş, yazı sığar */}
        <g transform={`translate(${SQL_X + 14}, ${SQL_Y - 11})`}>
          <rect x={0} y={0} width={210} height={22} rx={4}
                fill="white" stroke={SQL_COLOR} strokeWidth={1} opacity={1} />
          <SvgIcon Icon={FiServer} x={7} y={4} size={14} color={SQL_COLOR} />
          <text x={26} y={15} fontSize="11" fontWeight="700" fill={COLORS.text}>
            SQL Server
          </text>
          <text x={97} y={15} fontSize="10" fill={COLORS.muted}>
            · 4 isolated databases
          </text>
        </g>
      </g>

      {/* ─── 4 Database chips (container içinde) ─── */}
      {services.map((s, i) => (
        <g key={`db-${s.key}`}>
          <rect x={xCol(i)} y={DB_Y} width={DB_W} height={DB_H} rx={7}
                fill="white"
                stroke={s.themeColor}
                strokeWidth={1.4} />
          <SvgIcon Icon={FiDatabase} x={xCol(i) + 10} y={DB_Y + 9} size={13} color={s.themeColor} />
          <text x={xCol(i) + DB_W / 2 + 7} y={DB_Y + 21}
                textAnchor="middle"
                fontSize="11" fontWeight="700"
                fontFamily="ui-monospace, monospace" fill={COLORS.text}>
            {s.db}
          </text>
          <text x={xCol(i) + DB_W / 2 + 7} y={DB_Y + 36}
                textAnchor="middle"
                fontSize="9" fill={COLORS.muted}>
            database
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Servis kartı (sağ kolon) ──────────────────────────────────────────────

function ServiceCard({ svc, history }) {
  const c = statusColor(svc.status);
  return (
    <div
      style={{
        background: 'white',
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${c}`,
        borderRadius: 8,
        padding: 16,
        display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      {/* Header — name + status pill */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.text }}>
            {svc.label}
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
            port :{svc.port} ·{' '}
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{svc.db}</span>
          </div>
        </div>
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 999,
            background: `${c}15`, color: c,
            fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
          }}
        >
          <span
            className="sysh-pulse-dot"
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: c, display: 'inline-block',
            }}
          />
          {statusLabel(svc.status)}
        </span>
      </div>

      {/* Latency + sparkline row */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, lineHeight: 1 }}>
            {svc.latencyMs != null ? svc.latencyMs : '—'}
          </span>
          <span style={{ fontSize: 12, color: COLORS.muted }}>ms</span>
        </div>
        <Sparkline values={history} width={180} height={36} color={c} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page — global HealthMonitorContext'ten okur, kendi polling'i yok.
// Background polling admin login olduğu andan itibaren çalışır.
// ─────────────────────────────────────────────────────────────────────────

export default function SystemHealth() {
  // Context HMR/Provider edge case'lerine karşı defensive — null dönerse
  // boş initial state ile devam et (sayfa beyaz kalmaz).
  const monitor      = useHealthMonitor();
  const liveServices = monitor?.services ?? {};
  const broker       = monitor?.broker   ?? { data: null, loading: true, error: null };
  const history      = monitor?.history  ?? {};

  // Statik metadata + live state birleştir.
  const services = SERVICES.map((s) => ({
    ...s,
    ...(liveServices[s.key] ?? { status: 'loading', latencyMs: null, checkedAt: null }),
  }));

  return (
    <div className="space-y-5">
      {/* Page-wide pulse keyframe — sadece status dot için */}
      <style>{`
        @keyframes sysh-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.45; transform: scale(1.35); }
        }
        .sysh-pulse-dot {
          animation: sysh-pulse 1.6s ease-in-out infinite;
        }
      `}</style>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">System Health</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Live service status · auto-refreshing every 3s
        </p>
      </div>

      {/* 2 columns 70/30: architecture (left) · services (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-[7fr_3fr] gap-5">
        {/* LEFT: Architecture (~%70) */}
        <div
          style={{
            background: 'white', border: `1px solid ${COLORS.border}`,
            borderRadius: 10, padding: 18,
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.text }}>
              System architecture
            </div>
            <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>
              Service boxes colored by status
            </div>
          </div>
          <ArchitectureDiagram services={services} broker={broker.data} />
        </div>

        {/* RIGHT: Services (~%30) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map((s) => (
            <ServiceCard
              key={s.key}
              svc={s}
              history={history[s.key] ?? []}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
