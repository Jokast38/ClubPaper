import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, CheckCircle2, XCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";

const STATUS_LABEL = {
  sent: { label: "Envoyé", cls: "status-paid", icon: CheckCircle2 },
  simulated: { label: "Simulé", cls: "status-pending", icon: Clock },
  skipped: { label: "Ignoré", cls: "status-pending", icon: Clock },
  error: { label: "Échec", cls: "status-overdue", icon: XCircle },
};

const KIND_LABEL = {
  reminder: "Relance",
  reminder_auto: "Relance auto",
  announcement: "Annonce",
  session_change: "Créneau",
  season_end: "Fin saison",
  season_renewal: "Renouvellement",
  test: "Test",
};

export default function NotificationsPanel() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [days, setDays] = useState("30");
  const [filter, setFilter] = useState({ channel: "", status: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    try {
      const [s, l] = await Promise.all([
        api.get(`/notifications/stats?days=${days}`),
        api.get(`/notifications/logs?limit=50${filter.channel ? `&channel=${filter.channel}` : ""}${filter.status ? `&status=${filter.status}` : ""}`),
      ]);
      setStats(s.data);
      setLogs(l.data);
    } finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [days, filter.channel, filter.status]);

  if (!stats) return null;

  return (
    <div className="paper-card p-6" data-testid="notifications-panel">
      <div className="flex items-start gap-3 mb-6 flex-wrap">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Mail size={22} strokeWidth={2.5} /></div>
        <div className="flex-1">
          <h3 className="font-display font-semibold text-lg text-slate-900">Envois emails & SMS</h3>
          <p className="text-sm text-slate-600">Suivez le taux de succès de vos communications.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-10 w-[160px]" data-testid="notif-days"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 derniers jours</SelectItem>
              <SelectItem value="30">30 derniers jours</SelectItem>
              <SelectItem value="90">90 derniers jours</SelectItem>
              <SelectItem value="365">1 an</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={load} disabled={busy} className="rounded-md h-10" data-testid="notif-refresh"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <ChannelStat icon={Mail} title="Emails" data={stats.email} testId="stats-email" />
        <ChannelStat icon={MessageSquare} title="SMS" data={stats.sms} testId="stats-sms" />
      </div>

      <div className="mt-6 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-slate-700">Historique</span>
        <div className="flex-1" />
        <Select value={filter.channel || "all"} onValueChange={(v) => setFilter({...filter, channel: v === "all" ? "" : v})}>
          <SelectTrigger className="h-9 w-[130px]" data-testid="notif-channel-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous canaux</SelectItem>
            <SelectItem value="email">Emails</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.status || "all"} onValueChange={(v) => setFilter({...filter, status: v === "all" ? "" : v})}>
          <SelectTrigger className="h-9 w-[140px]" data-testid="notif-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="sent">Envoyés</SelectItem>
            <SelectItem value="simulated">Simulés</SelectItem>
            <SelectItem value="skipped">Ignorés</SelectItem>
            <SelectItem value="error">Échecs</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {logs.length === 0 ? (
        <div className="mt-4 text-center py-8 text-sm text-slate-500 border border-dashed rounded-xl">Aucun envoi pour l'instant</div>
      ) : (
        <ul className="mt-4 space-y-2 max-h-96 overflow-auto">
          {logs.map((l) => {
            const cfg = STATUS_LABEL[l.status] || STATUS_LABEL.simulated;
            const Icon = cfg.icon;
            return (
              <li key={l.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50" data-testid={`notif-log-${l.id}`}>
                <div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${l.channel === "email" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                  {l.channel === "email" ? <Mail size={16} /> : <MessageSquare size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-900 truncate">{l.to || "—"}</span>
                    <span className={`pill-tag ${cfg.cls}`}><Icon size={11} className="inline mr-1" />{cfg.label}</span>
                    {l.kind && <span className="pill-tag" style={{background: "var(--club-primary-soft)", color: "var(--club-primary)"}}>{KIND_LABEL[l.kind] || l.kind}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1 truncate">{l.subject || l.error || "—"}</div>
                  <div className="text-xs text-slate-400 mt-0.5">{new Date(l.created_at).toLocaleString("fr-FR")}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ChannelStat({ icon: Icon, title, data, testId }) {
  const successRate = data.success_rate;
  return (
    <div className="p-5 rounded-2xl border border-slate-200" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 grid place-items-center"><Icon size={18} strokeWidth={2.5} /></div>
          <div className="font-display font-semibold text-slate-900">{title}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-display font-bold text-slate-900">{data.total}</div>
          <div className="text-xs text-slate-500">envois</div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <StatMini label="Envoyés" value={data.sent} color="text-emerald-700" bg="bg-emerald-50" />
        <StatMini label="Simulés" value={data.simulated} color="text-slate-700" bg="bg-slate-50" />
        <StatMini label="Ignorés" value={data.skipped} color="text-amber-700" bg="bg-amber-50" />
        <StatMini label="Échecs" value={data.error} color="text-red-700" bg="bg-red-50" />
      </div>
      {successRate !== null && (
        <div className="mt-4 text-sm flex items-center gap-2">
          {successRate >= 90 ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-amber-600" />}
          <span className="text-slate-700">Taux de succès : <strong>{successRate}%</strong></span>
        </div>
      )}
    </div>
  );
}

function StatMini({ label, value, color, bg }) {
  return (
    <div className={`${bg} rounded-lg py-2`}>
      <div className={`font-display font-bold text-lg ${color}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}
