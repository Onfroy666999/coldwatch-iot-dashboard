import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { AlertCircle, AlertTriangle, Info, ChevronDown, ChevronUp, CheckCircle2, Filter } from 'lucide-react';

export default function Alerts() {
  const { alerts, acknowledgeAlert, resolveAlert, acknowledgeAllAlerts, addToast } = useApp();
  const [severityFilter, setSeverityFilter] = useState('all');
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [expandedAlert,  setExpandedAlert]  = useState<string | null>(null);

  const filteredAlerts = alerts.filter(a =>
    (severityFilter === 'all' || a.severity === severityFilter) &&
    (statusFilter   === 'all' || a.status   === statusFilter)
  );

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertCircle className="w-5 h-5" />;
      case 'warning':  return <AlertTriangle className="w-5 h-5" />;
      default:         return <Info className="w-5 h-5" />;
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: '#C0392B', lightBg: 'rgba(192,57,43,0.08)' };
      case 'warning':  return { bg: '#E67E22', lightBg: 'rgba(230,126,34,0.08)' };
      default:         return { bg: '#2979C8', lightBg: 'rgba(41,121,200,0.08)' };
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'new':          return { cls: 'bg-red-500/15 text-red-500',    label: 'New' };
      case 'acknowledged': return { cls: 'bg-orange-500/15 text-orange-400', label: 'Acknowledged' };
      case 'resolved':     return { cls: 'bg-green-500/15 text-green-500',   label: 'Resolved' };
      default:             return { cls: 'bg-muted text-muted-foreground', label: status };
    }
  };

  const selectClass = 'px-3 py-2.5 border border-border rounded-xl text-sm bg-muted text-foreground focus:border-[#2979C8] outline-none';

  return (
    <div className="space-y-5">

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total',        value: alerts.length,                                  color: '#2979C8' },
          { label: 'New',          value: alerts.filter(a => a.status === 'new').length,  color: '#C0392B' },
          { label: 'Acknowledged', value: alerts.filter(a => a.status === 'acknowledged').length, color: '#E67E22' },
          { label: 'Resolved',     value: alerts.filter(a => a.status === 'resolved').length,     color: '#27AE60' },
        ].map((stat, i) => (
          <div key={i} className="bg-card rounded-2xl p-4 shadow-sm border border-border">
            <p className="text-2xl font-semibold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-2xl p-4 md:p-5 shadow-sm border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={selectClass}>
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selectClass}>
              <option value="all">All Statuses</option>
              <option value="new">New</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
            </select>
            <span className="text-sm text-muted-foreground">{filteredAlerts.length} of {alerts.length}</span>
          </div>
          <button
            onClick={acknowledgeAllAlerts}
            disabled={!alerts.some(a => a.status === 'new')}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 active:scale-95 transition-all"
            style={{ backgroundColor: '#2979C8' }}
          >
            Acknowledge All
          </button>
        </div>
      </div>

      {/* Alert List */}
      {filteredAlerts.length === 0 ? (
        <div className="bg-card rounded-2xl p-16 shadow-sm border border-border text-center">
          <div className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(39,174,96,0.1)' }}>
            <CheckCircle2 className="w-10 h-10" style={{ color: '#27AE60' }} />
          </div>
          <h3 className="text-lg text-foreground font-medium mb-2">All Clear!</h3>
          <p className="text-muted-foreground text-sm">No alerts match your current filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map(alert => {
            const style      = getSeverityStyle(alert.severity);
            const statusBadge = getStatusBadge(alert.status);
            const isExpanded  = expandedAlert === alert.id;

            return (
              <div
                key={alert.id}
                className={`bg-card rounded-2xl shadow-sm border overflow-hidden transition-all cursor-pointer ${alert.status === 'new' ? 'border-l-4' : 'border-border'}`}
                style={alert.status === 'new' ? { borderLeftColor: style.bg } : {}}
                onClick={() => setExpandedAlert(isExpanded ? null : alert.id)}
              >
                <div className="p-4 md:p-5">
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 text-white" style={{ backgroundColor: style.bg }}>
                      {getSeverityIcon(alert.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-xs text-white uppercase font-medium" style={{ backgroundColor: style.bg }}>{alert.severity}</span>
                          <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${statusBadge.cls}`}>{statusBadge.label}</span>
                        </div>
                        <span className="text-muted-foreground flex-shrink-0">
                          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </span>
                      </div>
                      <p className="text-foreground text-sm">{alert.message}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>Device: {alert.deviceId}</span>
                        <span>&middot;</span>
                        <span>{alert.timestamp.toLocaleString('en-GB')}</span>
                      </div>

                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-border" onClick={e => e.stopPropagation()}>
                          <p className="text-sm text-muted-foreground mb-3">
                            This alert was triggered by values outside of acceptable thresholds. Immediate attention may be required to prevent spoilage of stored goods.
                          </p>
                          <div className="flex gap-2 flex-wrap">
                            {alert.status === 'new' && (
                              <button onClick={() => { acknowledgeAlert(alert.id); addToast({ id: `toast-${Date.now()}`, type: 'info', message: 'Alert acknowledged' }); }}
                                className="px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95" style={{ backgroundColor: '#E67E22' }}>
                                Acknowledge
                              </button>
                            )}
                            {alert.status !== 'resolved' && (
                              <button onClick={() => { resolveAlert(alert.id); addToast({ id: `toast-${Date.now()}`, type: 'success', message: 'Alert resolved' }); }}
                                className="px-4 py-2.5 rounded-xl text-white text-sm font-medium active:scale-95" style={{ backgroundColor: '#27AE60' }}>
                                Mark as Resolved
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}