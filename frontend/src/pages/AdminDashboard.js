import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Building2, Users, TrendingUp, Wallet, Mail, MessageSquare, CheckCircle2, RefreshCw, Trash2, Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [clubs, setClubs] = useState({ items: [], total: 0 });
  const [notifications, setNotifications] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [tab, setTab] = useState("overview");

  const loadStats = async () => {
    const { data } = await api.get("/admin/stats");
    setStats(data);
  };
  const loadClubs = async () => {
    const { data } = await api.get("/admin/clubs", { params: { page_size: 50 } });
    setClubs(data);
  };
  const loadNotifications = async () => {
    const { data } = await api.get("/admin/notifications", { params: { limit: 100 } });
    setNotifications(data);
  };
  const loadTickets = async () => {
    const { data } = await api.get("/admin/support");
    setTickets(data);
  };

  useEffect(() => { loadStats(); loadClubs(); loadNotifications(); loadTickets(); }, []);

  const updateSubscription = async (clubId, status) => {
    try {
      await api.put(`/admin/clubs/${clubId}/subscription`, { status });
      toast.success("Abonnement mis à jour");
      loadClubs();
      loadStats();
    } catch { toast.error("Impossible de mettre à jour"); }
  };

  const resolveTicket = async (id) => {
    try {
      await api.put(`/admin/support/${id}`, { status: "resolved" });
      toast.success("Ticket marqué résolu");
      loadTickets();
    } catch { toast.error("Impossible de mettre à jour"); }
  };

  const replyTicket = async (id, message) => {
    await api.post(`/admin/support/${id}/reply`, { message });
    toast.success("Réponse envoyée");
    loadTickets();
  };

  const deleteClub = async (clubId) => {
    try {
      await api.delete(`/admin/clubs/${clubId}`);
      toast.success("Club supprimé");
      loadClubs();
      loadStats();
    } catch { toast.error("Impossible de supprimer"); }
  };

  const TABS = [
    { id: "overview", label: "Vue d'ensemble" },
    { id: "clubs", label: "Clubs & abonnements" },
    { id: "notifications", label: "Emails / SMS" },
    { id: "support", label: `Réclamations${tickets.filter(t => t.status === "new").length ? ` (${tickets.filter(t => t.status === "new").length})` : ""}` },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Admin plateforme</h1>
          <p className="mt-1 text-slate-600">Vue globale ClubPaper — tous clubs confondus.</p>
        </div>
        <Button variant="outline" className="rounded-full h-11" onClick={() => { loadStats(); loadClubs(); loadNotifications(); loadTickets(); }} data-testid="admin-refresh-btn">
          <RefreshCw size={16} className="mr-2" />Actualiser
        </Button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${tab === t.id ? "border-orange-600 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            data-testid={`admin-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && <Overview stats={stats} />}
      {tab === "clubs" && <ClubsTab clubs={clubs} onUpdateStatus={updateSubscription} onDelete={deleteClub} />}
      {tab === "notifications" && <NotificationsTab notifications={notifications} />}
      {tab === "support" && <SupportTab tickets={tickets} onResolve={resolveTicket} onReply={replyTicket} />}
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, tint }) {
  const tints = {
    orange: "bg-orange-100 text-orange-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="paper-card p-5">
      <div className={`w-10 h-10 rounded-xl grid place-items-center ${tints[tint]}`}><Icon size={18} strokeWidth={2.5} /></div>
      <div className="mt-3 text-sm text-slate-500">{label}</div>
      <div className="mt-1 font-display font-bold text-2xl text-slate-900">{value}</div>
    </div>
  );
}

function Overview({ stats }) {
  return (
    <div className="mt-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={Building2} label="Clubs inscrits" value={stats.total_clubs} tint="orange" />
        <KpiCard icon={Users} label="Comptes utilisateurs" value={stats.total_users} tint="slate" />
        <KpiCard icon={TrendingUp} label="Clubs actifs (payants)" value={stats.active_clubs} tint="emerald" />
        <KpiCard icon={Wallet} label="CA mensuel estimé" value={`${stats.mrr_estimate.toFixed(0)} €`} tint="amber" />
      </div>

      <div className="mt-6 paper-card p-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h3 className="font-display font-semibold text-lg text-slate-900">Évolution — inscriptions & CA estimé (12 derniers mois)</h3>
          <span className="text-xs text-slate-400">CA estimé = clubs actifs × 19€/mois, pas un export comptable réel</span>
        </div>
        <div className="mt-6 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.chart}>
              <defs>
                <linearGradient id="mrrGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EA580C" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#EA580C" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis yAxisId="left" tick={{ fontSize: 12, fill: "#64748B" }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: "#64748B" }} />
              <Tooltip />
              <Area yAxisId="right" type="monotone" dataKey="estimated_mrr" name="CA estimé (€)" stroke="#EA580C" fill="url(#mrrGradient)" strokeWidth={2} />
              <Area yAxisId="left" type="monotone" dataKey="signups" name="Nouveaux clubs" stroke="#0F172A" fill="transparent" strokeWidth={2} strokeDasharray="4 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-3 gap-4">
        <div className="paper-card p-5">
          <div className="text-sm text-slate-500">En essai gratuit</div>
          <div className="mt-1 font-display font-bold text-xl text-slate-900">{stats.trial_clubs}</div>
        </div>
        <div className="paper-card p-5">
          <div className="text-sm text-slate-500">Paiement en retard</div>
          <div className="mt-1 font-display font-bold text-xl text-red-600">{stats.past_due_clubs}</div>
        </div>
        <div className="paper-card p-5">
          <div className="text-sm text-slate-500">Adhérents (tous clubs)</div>
          <div className="mt-1 font-display font-bold text-xl text-slate-900">{stats.total_members}</div>
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL = { trial: "Essai", active: "Actif", past_due: "En retard" };
const STATUS_CLASS = { trial: "status-pending", active: "status-paid", past_due: "status-overdue" };

function ClubsTab({ clubs, onUpdateStatus, onDelete }) {
  const [confirming, setConfirming] = useState(null);
  return (
    <div className="mt-6">
      <div className="text-sm text-slate-500 mb-3">{clubs.total} club{clubs.total > 1 ? "s" : ""} au total</div>
      <div className="space-y-3">
        {clubs.items.map((c) => (
          <div key={c.id} className="paper-card p-4 flex flex-wrap items-center gap-4" data-testid={`admin-club-${c.id}`}>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900 truncate">{c.name}</div>
              <div className="text-sm text-slate-500 truncate">{c.owner_email} · {c.members_count} adhérent{c.members_count > 1 ? "s" : ""} · {c.sport}{c.city ? ` · ${c.city}` : ""}</div>
            </div>
            <span className={`pill-tag ${STATUS_CLASS[c.subscription_status] || "status-pending"}`}>{STATUS_LABEL[c.subscription_status] || c.subscription_status}</span>
            <Select value={c.subscription_status} onValueChange={(v) => onUpdateStatus(c.id, v)}>
              <SelectTrigger className="h-10 w-[160px]" data-testid={`admin-club-status-${c.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="trial">Essai</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="past_due">En retard</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm" variant="outline"
              className="rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirming(c)}
              data-testid={`admin-club-delete-${c.id}`}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ))}
        {clubs.items.length === 0 && <p className="text-slate-500 text-sm">Aucun club pour l'instant.</p>}
      </div>

      {confirming && (
        <ConfirmDeleteClub
          club={confirming}
          onCancel={() => setConfirming(null)}
          onConfirm={async () => { await onDelete(confirming.id); setConfirming(null); }}
        />
      )}
    </div>
  );
}

function ConfirmDeleteClub({ club, onCancel, onConfirm }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()} data-testid="admin-delete-club-dialog">
        <h3 className="font-display font-semibold text-lg text-red-600">Supprimer {club.name} ?</h3>
        <p className="text-sm text-slate-600 mt-2">Supprime définitivement le club, ses adhérents, cotisations, documents et le compte du propriétaire ({club.owner_email}). Irréversible.</p>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tapez SUPPRIMER"
          className="mt-3 w-full h-11 px-3 rounded-lg border border-slate-300"
          data-testid="admin-delete-club-confirm-input"
        />
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" className="rounded-full" onClick={onCancel}>Annuler</Button>
          <Button
            className="rounded-full bg-red-600 hover:bg-red-700"
            disabled={text !== "SUPPRIMER" || busy}
            onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}
            data-testid="admin-delete-club-confirm-btn"
          >
            {busy ? "Suppression…" : "Supprimer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function NotificationsTab({ notifications }) {
  const [filter, setFilter] = useState("");
  const filtered = filter ? notifications.filter((n) => n.status === filter) : notifications;
  return (
    <div className="mt-6">
      <div className="flex items-center gap-3 mb-4">
        <Mail size={18} className="text-slate-400" />
        <span className="text-sm text-slate-600">{notifications.length} envoi(s) récents, tous clubs</span>
        <Select value={filter || "all"} onValueChange={(v) => setFilter(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 w-[160px] ml-auto" data-testid="admin-notif-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="sent">Envoyés</SelectItem>
            <SelectItem value="simulated">Simulés</SelectItem>
            <SelectItem value="error">Erreurs</SelectItem>
            <SelectItem value="skipped">Ignorés</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4">Date</th>
              <th className="py-2 pr-4">Club</th>
              <th className="py-2 pr-4">Canal</th>
              <th className="py-2 pr-4">Destinataire</th>
              <th className="py-2 pr-4">Sujet</th>
              <th className="py-2 pr-4">Statut</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n, i) => (
              <tr key={i} className="border-b border-slate-100" data-testid={`admin-notif-row-${i}`}>
                <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{new Date(n.created_at).toLocaleString("fr-FR")}</td>
                <td className="py-2 pr-4">{n.club_name || "—"}</td>
                <td className="py-2 pr-4 uppercase text-xs font-medium">{n.channel}</td>
                <td className="py-2 pr-4 truncate max-w-[220px]">{n.to}</td>
                <td className="py-2 pr-4 truncate max-w-[260px]">{n.subject || n.kind}</td>
                <td className="py-2 pr-4">
                  <span className={`pill-tag ${n.status === "sent" ? "status-paid" : n.status === "error" ? "status-overdue" : "status-pending"}`}>{n.status}</span>
                  {n.error && <span className="block text-xs text-red-600 mt-1 max-w-[220px] truncate" title={n.error}>{n.error}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <p className="text-slate-500 text-sm py-6 text-center">Aucun envoi.</p>}
      </div>
    </div>
  );
}

const TICKET_STATUS_LABEL = { new: "Nouveau", replied: "Répondu", resolved: "Résolu" };
const TICKET_STATUS_CLASS = { new: "status-pending", replied: "status-paid", resolved: "status-paid" };

function SupportTab({ tickets, onResolve, onReply }) {
  return (
    <div className="mt-6 space-y-3">
      {tickets.length === 0 && <p className="text-slate-500 text-sm">Aucune réclamation pour l'instant.</p>}
      {tickets.map((t) => <SupportTicketCard key={t.id} ticket={t} onResolve={onResolve} onReply={onReply} />)}
    </div>
  );
}

function SupportTicketCard({ ticket: t, onResolve, onReply }) {
  const [replying, setReplying] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!message.trim()) return;
    setSending(true);
    try {
      await onReply(t.id, message);
      setMessage("");
      setReplying(false);
    } catch {
      toast.error("Impossible d'envoyer la réponse");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="paper-card p-5" data-testid={`admin-ticket-${t.id}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <MessageSquare size={16} className="text-orange-600" />
            <span className="font-medium text-slate-900">{t.subject}</span>
            <span className={`pill-tag ${TICKET_STATUS_CLASS[t.status] || "status-pending"}`}>{TICKET_STATUS_LABEL[t.status] || t.status}</span>
          </div>
          <div className="text-xs text-slate-500 mt-1">{t.user_name} ({t.user_email}){t.club_name ? ` · ${t.club_name}` : ""} · {new Date(t.created_at).toLocaleString("fr-FR")}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReplying((v) => !v)} data-testid={`admin-reply-toggle-${t.id}`}>
            <Send size={14} className="mr-1.5" />Répondre
          </Button>
          {t.status !== "resolved" && (
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onResolve(t.id)} data-testid={`admin-resolve-${t.id}`}>
              <CheckCircle2 size={14} className="mr-1.5" />Marquer résolu
            </Button>
          )}
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-xl p-3">{t.message}</p>

      {(t.replies || []).map((r, i) => (
        <div key={i} className="mt-3 text-sm text-slate-700 whitespace-pre-line bg-orange-50 border border-orange-100 rounded-xl p-3">
          <div className="text-xs font-medium text-orange-700 mb-1">{r.author || "Équipe ClubPaper"} · {new Date(r.created_at).toLocaleString("fr-FR")}</div>
          {r.message}
        </div>
      ))}

      {replying && (
        <div className="mt-3">
          <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Votre réponse (envoyée par email au demandeur)…" data-testid={`admin-reply-message-${t.id}`} />
          <div className="mt-2 flex justify-end gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setReplying(false)}>Annuler</Button>
            <Button size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={send} disabled={sending} data-testid={`admin-reply-send-${t.id}`}>
              {sending ? "Envoi…" : "Envoyer"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
