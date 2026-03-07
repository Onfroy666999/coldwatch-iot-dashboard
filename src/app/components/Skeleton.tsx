import { useState, useEffect } from 'react';

// ── usePageLoading ────────────────────────────────────────────────────────────
// Returns true for `ms` milliseconds after mount, then false.
// This gives skeletons a guaranteed window to appear even with local data,
// so the pattern is already wired up when real network latency arrives.
export function usePageLoading(ms = 700) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return loading;
}

// ── Shimmer keyframe injected once ───────────────────────────────────────────
const SHIMMER_STYLE = `
@keyframes cw-shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
.cw-bone {
  background: linear-gradient(
    90deg,
    var(--skeleton-base, #E5E7EB) 25%,
    var(--skeleton-shine, #F3F4F6) 50%,
    var(--skeleton-base, #E5E7EB) 75%
  );
  background-size: 800px 100%;
  animation: cw-shimmer 1.4s infinite linear;
  border-radius: 0.5rem;
}
.dark .cw-bone {
  --skeleton-base:  #1F2937;
  --skeleton-shine: #374151;
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const el = document.createElement('style');
  el.textContent = SHIMMER_STYLE;
  document.head.appendChild(el);
}

// ── Bone — the atomic shimmer element ─────────────────────────────────────────
export function Bone({
  w = '100%', h = 16, radius = 8, className = '', style = {},
}: {
  w?: string | number; h?: number; radius?: number;
  className?: string; style?: React.CSSProperties;
}) {
  injectStyle();
  return (
    <div
      className={`cw-bone ${className}`}
      style={{ width: w, height: h, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Row({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center gap-3 ${className}`}>{children}</div>;
}
function Col({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-2 ${className}`}>{children}</div>;
}
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E4E7EC] p-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

// ── Stat card skeleton — used in Dashboard ────────────────────────────────────
function StatCardSkeleton() {
  return (
    <Card>
      <Row className="mb-4">
        <Bone w={44} h={44} radius={12} />
        <Bone w={40} h={14} />
      </Row>
      <Bone w="55%" h={32} radius={6} className="mb-1" />
      <Bone w="40%" h={12} className="mb-4" />
      <Bone w="100%" h={6} radius={99} />
    </Card>
  );
}

// ── Chart card skeleton ───────────────────────────────────────────────────────
function ChartCardSkeleton({ height = 160 }: { height?: number }) {
  return (
    <Card>
      <Row className="mb-4">
        <Bone w={10} h={10} radius={99} />
        <Bone w="35%" h={14} />
        <div className="ml-auto"><Bone w={60} h={24} radius={8} /></div>
      </Row>
      <Bone w="100%" h={height} radius={10} />
    </Card>
  );
}

// ── Alert row skeleton ────────────────────────────────────────────────────────
function AlertRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5 border-b border-[#E4E7EC] last:border-0">
      <Bone w={4} h={48} radius={99} style={{ flexShrink: 0 }} />
      <Bone w={40} h={40} radius={10} style={{ flexShrink: 0 }} />
      <Col className="flex-1">
        <Bone w="80%" h={13} />
        <Bone w="50%" h={11} />
        <Row>
          <Bone w={70} h={18} radius={99} />
          <Bone w={50} h={11} />
        </Row>
      </Col>
    </div>
  );
}

// ── Device card skeleton ──────────────────────────────────────────────────────
function DeviceCardSkeleton() {
  return (
    <Card className="flex items-center gap-4">
      <Bone w={48} h={48} radius={12} style={{ flexShrink: 0 }} />
      <Col className="flex-1">
        <Bone w="60%" h={14} />
        <Bone w="45%" h={11} />
        <Row>
          <Bone w={60} h={18} radius={99} />
          <Bone w={50} h={18} radius={99} />
        </Row>
      </Col>
      <Bone w={24} h={24} radius={99} style={{ flexShrink: 0 }} />
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// PAGE SKELETONS
// ────────────────────────────────────────────────────────────────────────────

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      {/* Welcome banner */}
      <Bone w="100%" h={96} radius={16} />

      {/* Device selector */}
      <Card>
        <Row className="mb-3">
          <Bone w="30%" h={12} />
          <div className="ml-auto"><Bone w={70} h={22} radius={99} /></div>
        </Row>
        <Row>
          <Bone w={160} h={60} radius={12} style={{ flexShrink: 0 }} />
          <Bone w={160} h={60} radius={12} style={{ flexShrink: 0 }} />
          <Bone w={160} h={60} radius={12} style={{ flexShrink: 0 }} />
        </Row>
      </Card>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>

      {/* Produce mode selector */}
      <Card>
        <Row className="mb-3">
          <Bone w={48} h={48} radius={12} style={{ flexShrink: 0 }} />
          <Col className="flex-1">
            <Bone w="50%" h={14} />
            <Bone w="70%" h={11} />
          </Col>
        </Row>
        <Bone w="100%" h={48} radius={12} />
      </Card>

      {/* Charts + control panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Time range header */}
          <Row>
            <Bone w="30%" h={14} />
            <div className="ml-auto flex gap-1.5">
              {[0,1,2].map(i => <Bone key={i} w={40} h={36} radius={10} />)}
            </div>
          </Row>
          <ChartCardSkeleton height={160} />
          <ChartCardSkeleton height={160} />
          {/* Alerts preview */}
          <Card className="p-0 overflow-hidden">
            <Row className="px-4 py-3.5 border-b border-[#E4E7EC]">
              <Bone w={24} h={24} radius={99} style={{ flexShrink: 0 }} />
              <Bone w="30%" h={14} />
              <div className="ml-auto"><Bone w={60} h={14} /></div>
            </Row>
            <AlertRowSkeleton />
            <AlertRowSkeleton />
            <AlertRowSkeleton />
          </Card>
        </div>
        {/* Control panel */}
        <Card>
          <Row className="mb-4">
            <Bone w={32} h={32} radius={8} style={{ flexShrink: 0 }} />
            <Bone w="40%" h={14} />
            <div className="ml-auto"><Bone w={64} h={24} radius={99} /></div>
          </Row>
          {/* Mode tabs */}
          <Bone w="100%" h={48} radius={12} className="mb-4" />
          {/* Arc gauge placeholder */}
          <Bone w={240} h={160} radius={999} className="mx-auto mb-4" />
          {/* Stepper */}
          <Row className="mb-4">
            <Bone w={48} h={48} radius={12} style={{ flexShrink: 0 }} />
            <Bone w="100%" h={64} radius={12} />
            <Bone w={48} h={48} radius={12} style={{ flexShrink: 0 }} />
          </Row>
          {/* Presets grid */}
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {[0,1,2,3,4,5].map(i => <Bone key={i} h={44} radius={12} />)}
          </div>
          <Bone w="100%" h={48} radius={12} />
        </Card>
      </div>
    </div>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export function AlertsSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <Row>
        <Col>
          <Bone w={180} h={22} />
          <Bone w={140} h={13} />
        </Col>
        <div className="ml-auto flex gap-2">
          <Bone w={80} h={36} radius={10} />
          <Bone w={80} h={36} radius={10} />
        </div>
      </Row>

      {/* Filter tabs */}
      <Row className="overflow-x-auto pb-1">
        {[0,1,2,3].map(i => <Bone key={i} w={90} h={36} radius={99} style={{ flexShrink: 0 }} />)}
      </Row>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        {[0,1,2].map(i => (
          <Card key={i} className="text-center">
            <Bone w={40} h={28} radius={6} className="mx-auto mb-1" />
            <Bone w="70%" h={11} radius={4} className="mx-auto" />
          </Card>
        ))}
      </div>

      {/* Alert list */}
      <Card className="p-0 overflow-hidden">
        {[0,1,2,3,4].map(i => <AlertRowSkeleton key={i} />)}
      </Card>
    </div>
  );
}

// ── Devices ───────────────────────────────────────────────────────────────────
export function DevicesSkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <Row>
        <Col>
          <Bone w={160} h={22} />
          <Bone w={200} h={13} />
        </Col>
        <div className="ml-auto"><Bone w={100} h={40} radius={12} /></div>
      </Row>

      {/* Summary chips */}
      <Row>
        {[0,1,2].map(i => <Bone key={i} w={100} h={36} radius={99} style={{ flexShrink: 0 }} />)}
      </Row>

      {/* Device cards */}
      <Col className="gap-3">
        <DeviceCardSkeleton />
        <DeviceCardSkeleton />
        <DeviceCardSkeleton />
      </Col>
    </div>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
export function HistorySkeleton() {
  return (
    <div className="space-y-5">
      {/* Header */}
      <Row>
        <Col>
          <Bone w={140} h={22} />
          <Bone w={180} h={13} />
        </Col>
        <div className="ml-auto flex gap-2">
          <Bone w={80} h={36} radius={10} />
          <Bone w={80} h={36} radius={10} />
        </div>
      </Row>

      {/* Device selector */}
      <Card>
        <Bone w="30%" h={12} className="mb-3" />
        <Row>
          <Bone w={160} h={56} radius={12} style={{ flexShrink: 0 }} />
          <Bone w={160} h={56} radius={12} style={{ flexShrink: 0 }} />
          <Bone w={160} h={56} radius={12} style={{ flexShrink: 0 }} />
        </Row>
      </Card>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[0,1,2,3].map(i => (
          <Card key={i}>
            <Bone w="40%" h={11} className="mb-2" />
            <Bone w="60%" h={26} radius={6} className="mb-1" />
            <Bone w="35%" h={11} />
          </Card>
        ))}
      </div>

      {/* View toggle */}
      <Row>
        <Bone w="30%" h={14} />
        <div className="ml-auto flex gap-2">
          <Bone w={80} h={36} radius={10} />
          <Bone w={80} h={36} radius={10} />
        </div>
      </Row>

      {/* Main chart */}
      <ChartCardSkeleton height={280} />
    </div>
  );
}

// ── Settings ──────────────────────────────────────────────────────────────────
export function SettingsSkeleton({ isAdvancedUser = false }: { isAdvancedUser?: boolean }) {
  // Farmers/transporters see 3 rows (display, notifications, security).
  // Warehouse managers see all 6 (+ thresholds, devices, data).
  const rowCount = isAdvancedUser ? 6 : 3;
  return (
    <div className="space-y-5">
      {/* Header */}
      <Col>
        <Bone w={120} h={22} />
        <Bone w={200} h={13} />
      </Col>

      {/* Single menu card — row count matches the visible rows for this role */}
      <Card className="p-0 overflow-hidden">
        {Array.from({ length: rowCount }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 border-b border-[#E4E7EC] last:border-0">
            <Bone w={40} h={40} radius={10} style={{ flexShrink: 0 }} />
            <Col className="flex-1">
              <Bone w="45%" h={13} />
              <Bone w="65%" h={11} />
            </Col>
            <Bone w={16} h={16} radius={4} style={{ flexShrink: 0 }} />
          </div>
        ))}
      </Card>
    </div>
  );
}