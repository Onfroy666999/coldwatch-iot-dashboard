import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';
import { usePageLoading, AlertsSkeleton } from '../components/Skeleton';
import {
  AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp,
  CheckCircle2, Filter, Zap, Clock, Droplets,
  TrendingUp, ShieldCheck, Bell,
} from 'lucide-react';
import type { Alert } from '../context/AppContext';

//  Helpers 

function timeAgo(d: Date) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60)   return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fmtDuration(mins?: number) {
  if (mins === undefined) return null;
  if (mins < 1)  return 'under 1 min';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

const SEVERITY_STYLE = {
  critical: { bg: '#C0392B', lightBg: 'rgba(192,57,43,0.08)', icon: <AlertCircle  className="w-5 h-5" /> },
  warning:  { bg: '#E67E22', lightBg: 'rgba(230,126,34,0.08)', icon: <AlertTriangle className="w-5 h-5" /> },
  info:     { bg: '#0984E3', lightBg: 'rgba(9,132,227,0.08)',   icon: <Info          className="w-5 h-5" /> },
};

const STATUS_BADGE = {
  new:           { cls: 'bg-red-500/15 text-red-500',       label: 'New' },
  acknowledged:  { cls: 'bg-orange-500/15 text-orange-400', label: 'Acknowledged' },
  resolved:      { cls: 'bg-green-500/15 text-green-500',   label: 'Resolved' },
  auto_resolved: { cls: 'bg-blue-500/15 text-blue-500',     label: 'Auto-resolved' },
};

// Timeline block shown inside expanded critical alerts 

function AlertTimeline({ alert, fmtTemp }: { alert: Alert; fmtTemp: (c: number) => string }) {
  const events: { icon: React.ReactNode; color: string; label: string; detail?: string }[] = [];

  events.push({
    icon:   <Bell className="w-3.5 h-3.5" />,
    color:  SEVERITY_STYLE[alert.severity].bg,
    label:  'Alert triggered',
    detail: alert.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  });

  if (alert.peakTempC != null) {
    events.push({
      icon:   <TrendingUp className="w-3.5 h-3.5" />,
      color:  '#C0392B',
      label:  `Peak temperature: ${fmtTemp(alert.peakTempC)}`,
      detail: 'Highest reading recorded',
    });
  }
  if (alert.peakHumidityPct != null) {
    events.push({
      icon:   <Droplets className="w-3.5 h-3.5" />,
      color:  '#E67E22',
      label:  `Peak humidity: ${alert.peakHumidityPct.toFixed(0)}%`,
      detail: 'Highest reading recorded',
    });
  }

  if (alert.systemAction) {
    events.push({
      icon:   <Zap className="w-3.5 h-3.5" />,
      color:  '#0984E3',
      label:  alert.systemAction,
      detail: 'System response',
    });
  }

  if (alert.resolvedAt) {
    events.push({
      icon:   <ShieldCheck className="w-3.5 h-3.5" />,
      color:  '#27AE60',
      label:  alert.autoResolved ? 'Auto-resolved' : 'Resolved',
      detail: alert.resolvedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    });
  }

  return (
    <div className="mt-4 pt-4 border-t border-[#E4E7EC]">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-3.5 h-3.5 text-[#6B7280]" />
        <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide">Event Timeline</p>
        {alert.durationMinutes !== undefined && (
          <span className="ml-auto text-xs text-[#6B7280]">
            Duration: {fmtDuration(alert.durationMinutes)}
          </span>
        )}
      </div>
      <div className="space-y-2.5 pl-1">
        {events.map((ev, i) => (
          <div key={i} className="flex items-start gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0 mt-0.5"
              style={{ backgroundColor: ev.color }}
            >
              {ev.icon}
            </div>
            <div>
              <p className="text-xs font-medium text-[#111827]">{ev.label}</p>
              {ev.detail && <p className="text-[11px] text-[#6B7280]">{ev.detail}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Single alert card 

function AlertCard({
  alert, isExpanded, onToggle, onAcknowledge, onResolve, fmtTemp,
}: {
  alert: Alert;
  isExpanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
  onResolve: () => void;
  fmtTemp: (c: number) => string;
}) {
  const style      = SEVERITY_STYLE[alert.severity];
  const statusBadge = STATUS_BADGE[alert.status] ?? STATUS_BADGE.acknowledged;
  const isAutoResolved = alert.status === 'auto_resolved';
  const showTimeline   = isExpanded && (alert.severity === 'critical' || isAutoResolved || alert.peakTempC != null || alert.peakHumidityPct != null);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white rounded-2xl shadow-sm border border-[#E4E7EC] overflow-hidden transition-colors ${
        alert.status === 'new' || isAutoResolved ? 'border-l-4' : ''
      } ${isAutoResolved ? 'border-l-blue-400' : ''}`}
      style={alert.status === 'new' ? { borderLeftColor: style.bg } : {}}
    >
      <button
        className="w-full p-4 md:p-5 text-left active:bg-[#F3F4F6]/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white"
            style={{ backgroundColor: isAutoResolved ? '#0984E3' : style.bg }}
          >
            {isAutoResolved ? <Zap className="w-5 h-5" /> : style.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="px-2 py-0.5 rounded-md text-xs text-white uppercase font-medium"
                  style={{ backgroundColor: style.bg }}
                >
                  {alert.severity}
                </span>
                <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
                {isAutoResolved && alert.durationMinutes !== undefined && (
                  <span className="text-[10px] text-[#6B7280] flex items-center gap-1">
                    <Clock className="w-3 h-3" />{fmtDuration(alert.durationMinutes)}
                  </span>
                )}
              </div>
              {isExpanded
                ? <ChevronUp   className="w-5 h-5 text-[#6B7280] flex-shrink-0" />
                : <ChevronDown className="w-5 h-5 text-[#6B7280] flex-shrink-0" />}
            </div>

            <p className="text-[#111827] text-sm">
              {alert.tempC != null
                ? alert.message.replace(/\d+\.?\d*°C/, fmtTemp(alert.tempC))
                : alert.message}
            </p>

            <div className="flex items-center gap-3 mt-2 text-xs text-[#6B7280]">
              <span>{alert.deviceName}</span>
              <span>&middot;</span>
              <span>{timeAgo(alert.timestamp)}</span>
              {isAutoResolved && alert.resolvedAt && (
                <>
                  <span>&middot;</span>
                  <span className="text-blue-500">Resolved {timeAgo(alert.resolvedAt)}</span>
                </>
              )}
            </div>

            {/* Auto-resolved summary line (collapsed) */}
            {!isExpanded && isAutoResolved && alert.systemAction && (
              <p className="mt-1.5 text-[11px] text-blue-500/80 flex items-center gap-1">
                <Zap className="w-3 h-3" />{alert.systemAction}
              </p>
            )}
          </div>
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 md:px-5 md:pb-5" onClick={e => e.stopPropagation()}>
              {/* Description */}
              <p className="text-sm text-[#6B7280] mb-4">
                {isAutoResolved
                  ? 'This alert was detected and resolved automatically while auto mode was active. Review the timeline and acknowledge when ready.'
                  : 'This alert was triggered by values outside acceptable thresholds. Review the timeline and take action below.'}
              </p>

              {/* Timeline */}
              {showTimeline && <AlertTimeline alert={alert} fmtTemp={fmtTemp} />}

              {/* Actions */}
              <div className="flex gap-2 flex-wrap mt-4">
                {(alert.status === 'new') && (
                  <button
                    onClick={onAcknowledge}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95 transition-all"
                    style={{ backgroundColor: '#E67E22' }}
                  >
                    Acknowledge
                  </button>
                )}
                {alert.status === 'auto_resolved' && (
                  <button
                    onClick={onAcknowledge}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95 transition-all flex items-center gap-2"
                    style={{ backgroundColor: '#0984E3' }}
                  >
                    <CheckCircle2 className="w-4 h-4" />Acknowledge Auto-resolve
                  </button>
                )}
                {alert.status !== 'resolved' && alert.status !== 'auto_resolved' && (
                  <button
                    onClick={onResolve}
                    className="px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95 transition-all"
                    style={{ backgroundColor: '#27AE60' }}
                  >
                    Mark as Resolved
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// Main page 

export default function Alerts() {
  const { alerts, acknowledgeAlert, resolveAlert, acknowledgeAllAlerts, addToast, settings } = useApp();

  const isFahrenheit = settings.tempUnit === 'F';
  const fmtTemp = (c: number) => isFahrenheit
    ? `${(c * 9 / 5 + 32).toFixed(1)}°F`
    : `${c.toFixed(1)}°C`;

  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [expandedAlert,  setExpandedAlert]  = useState<string | null>(null);
  const isLoading = usePageLoading();

  if (isLoading) return <AlertsSkeleton />;

  // Split into sections
  const needsAction   = alerts.filter(a => a.status === 'new');
  const autoResolved  = alerts.filter(a => a.status === 'auto_resolved');
  const pastAlerts    = alerts.filter(a => a.status === 'acknowledged' || a.status === 'resolved');

  const needsReview   = needsAction.length + autoResolved.length;
  const showBanner    = needsReview > 0;

  // Filtered view (used when filters are active)
  const filtersActive = severityFilter !== 'all' || statusFilter !== 'all';
  const filteredAlerts = filtersActive
    ? alerts.filter(a =>
        (severityFilter === 'all' || a.severity === severityFilter) &&
        (statusFilter   === 'all' || a.status   === statusFilter)
      )
    : null;

  const handleAcknowledge = (id: string) => {
    acknowledgeAlert(id);
    addToast({ id: `toast-${Date.now()}`, type: 'info', message: 'Alert acknowledged' });
  };
  const handleResolve = (id: string) => {
    resolveAlert(id);
    addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Alert resolved' });
  };

  const selectClass = 'px-3 py-2.5 border border-[#E4E7EC] rounded-xl text-sm bg-[#F3F4F6] text-[#111827] focus:border-[#0984E3] outline-none';

  const renderCard = (alert: Alert) => (
    <AlertCard
      key={alert.id}
      alert={alert}
      isExpanded={expandedAlert === alert.id}
      onToggle={() => setExpandedAlert(expandedAlert === alert.id ? null : alert.id)}
      onAcknowledge={() => handleAcknowledge(alert.id)}
      onResolve={() => handleResolve(alert.id)}
      fmtTemp={fmtTemp}
    />
  );

  return (
    <div className="space-y-5">

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total',         value: alerts.length,                                           color: '#0984E3' },
          { label: 'Needs Action',  value: needsAction.length,                                      color: '#C0392B' },
          { label: 'Auto-resolved', value: autoResolved.length,                                     color: '#0984E3' },
          { label: 'Resolved',      value: alerts.filter(a => a.status === 'resolved' || a.status === 'acknowledged').length, color: '#27AE60' },
        ].map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-[#E4E7EC]">
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-sm text-[#6B7280] mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Away Summary Banner */}
      <AnimatePresence>
        {showBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-2xl border overflow-hidden"
            style={{ borderColor: needsAction.length > 0 ? 'rgba(192,57,43,0.3)' : 'rgba(9,132,227,0.3)' }}
          >
            <div
              className="px-4 py-3.5 flex items-start justify-between gap-4"
              style={{ backgroundColor: needsAction.length > 0 ? 'rgba(192,57,43,0.06)' : 'rgba(9,132,227,0.06)' }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                  style={{ backgroundColor: needsAction.length > 0 ? '#C0392B' : '#0984E3' }}
                >
                  {needsAction.length > 0
                    ? <AlertCircle className="w-4 h-4" />
                    : <ShieldCheck className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#111827]">
                    {needsAction.length > 0
                      ? `${needsReview} event${needsReview > 1 ? 's' : ''} need your review`
                      : `${autoResolved.length} event${autoResolved.length > 1 ? 's' : ''} auto-resolved while away`}
                  </p>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    {needsAction.length > 0 && `${needsAction.length} need${needsAction.length > 1 ? '' : 's'} action · `}
                    {autoResolved.length > 0 && `${autoResolved.length} auto-resolved by system`}
                  </p>
                </div>
              </div>
              {needsReview > 0 && (
                <button
                  onClick={acknowledgeAllAlerts}
                  className="px-3 py-2 rounded-xl text-white text-xs font-semibold active:scale-95 transition-all flex-shrink-0"
                  style={{ backgroundColor: needsAction.length > 0 ? '#C0392B' : '#0984E3' }}
                >
                  Acknowledge All
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="bg-white rounded-2xl p-4 md:p-5 shadow-sm border border-[#E4E7EC]">
        <div className="flex flex-wrap items-center gap-3">
          <Filter className="w-4 h-4 text-[#6B7280]" />
          <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={selectClass}>
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="auto_resolved">Auto-resolved</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
          </select>
          <span className="text-sm text-[#6B7280]">
            {filteredAlerts ? `${filteredAlerts.length} of ${alerts.length}` : `${alerts.length} total`}
          </span>
        </div>
      </div>

      {/* ── Filtered view (when filters are active) ── */}
      {filteredAlerts ? (
        filteredAlerts.length === 0 ? (
          <div className="bg-white rounded-2xl p-16 shadow-sm border border-[#E4E7EC] text-center">
            <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(39,174,96,0.1)' }}>
              <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
            </div>
            <h3 className="text-lg text-[#111827] font-medium mb-2">No matches</h3>
            <p className="text-[#6B7280] text-sm">No alerts match your current filters.</p>
          </div>
        ) : (
          <div className="space-y-3">{filteredAlerts.map(renderCard)}</div>
        )
      ) : (
        /* ── Sectioned view (default) ── */
        <div className="space-y-6">

          {/* Needs Action */}
          {needsAction.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <h2 className="text-sm font-semibold text-[#111827]">Needs Your Attention</h2>
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold text-white bg-red-500">
                  {needsAction.length}
                </span>
              </div>
              <div className="space-y-3">{needsAction.map(renderCard)}</div>
            </section>
          )}

          {/* Auto-resolved */}
          {autoResolved.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-semibold text-[#111827]">Auto-Resolved by System</h2>
                <span className="ml-auto px-2 py-0.5 rounded-full text-xs font-bold text-white bg-blue-500">
                  {autoResolved.length}
                </span>
              </div>
              <p className="text-xs text-[#6B7280] mb-3">
                These events resolved on their own while auto mode was active. Review and acknowledge when ready.
              </p>
              <div className="space-y-3">{autoResolved.map(renderCard)}</div>
            </section>
          )}

          {/* All clear if nothing needs review */}
          {needsAction.length === 0 && autoResolved.length === 0 && pastAlerts.length === 0 && (
            <div className="bg-white rounded-2xl p-16 shadow-sm border border-[#E4E7EC] text-center">
              <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(39,174,96,0.1)' }}>
                <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
              </div>
              <h3 className="text-lg text-[#111827] font-medium mb-2">All Clear</h3>
              <p className="text-[#6B7280] text-sm">No active alerts. Your storage units are running within safe parameters.</p>
            </div>
          )}

          {/* Past alerts */}
          {pastAlerts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-[#6B7280]" />
                <h2 className="text-sm font-semibold text-[#6B7280]">Past Alerts</h2>
                <span className="ml-auto text-xs text-[#6B7280]">{pastAlerts.length}</span>
              </div>
              <div className="space-y-3">{pastAlerts.map(renderCard)}</div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}