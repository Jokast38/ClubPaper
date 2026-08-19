import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Users, Wallet, CalendarDays, ArrowRight, UserPlus, Send, Plus, Globe } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { club } = useAuth();
  const [summary, setSummary] = useState(null);
  const [upcoming, setUpcoming] = useState([]);
  const [prospects, setProspects] = useState(0);

  const load = async () => {
    try {
      const [{ data: s }, { data: sessions }, { data: p }] = await Promise.all([
        api.get("/fees/summary"),
        api.get("/sessions"),
        api.get("/prospects"),
      ]);
      setSummary(s);
      setUpcoming(sessions.slice(0, 4));
      setProspects(p.filter((x) => x.status === "new").length);
    } catch (e) {
      // silent
    }
  };

  useEffect(() => { load(); }, []);

  const totalDue = (summary?.pending?.amount || 0) + (summary?.overdue?.amount || 0);
  const totalPaid = summary?.paid?.amount || 0;
  const totalAll = totalDue + totalPaid;
  const paidPct = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;

  const publicUrl = club ? `${window.location.origin}/c/${club.slug}` : "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          {club?.logo_data_url && (
            <img src={club.logo_data_url} alt="Logo" className="w-14 h-14 rounded-2xl object-contain bg-slate-50 p-1.5 border border-slate-100" />
          )}
          <div>
            <h1 className="font-display font-bold text-3xl lg:text-4xl text-slate-900">Bonjour {club?.name} 👋</h1>
            <p className="mt-1 text-slate-600">Voici un aperçu de votre club aujourd'hui.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/adherents"><Button variant="outline" className="rounded-full h-11" data-testid="dashboard-add-member-btn"><UserPlus size={18} className="mr-2" />Ajouter un adhérent</Button></Link>
          <Link to="/app/cotisations"><Button className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="dashboard-remind-btn"><Send size={18} className="mr-2" />Envoyer une relance</Button></Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        <KpiCard icon={Users} title="Adhérents" value={summary?.total_members || 0} tint="orange" testId="kpi-members" />
        <KpiCard icon={Wallet} title="Encaissé" value={`${totalPaid.toFixed(0)} €`} tint="emerald" testId="kpi-collected" />
        <KpiCard icon={Wallet} title="En attente" value={`${totalDue.toFixed(0)} €`} tint="amber" testId="kpi-due" />
        <KpiCard icon={CalendarDays} title="Créneaux à venir" value={upcoming.length} tint="slate" testId="kpi-upcoming" />
      </div>

      {/* Payment progress */}
      <div className="mt-6 paper-card p-6" data-testid="dashboard-payment-progress">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-slate-500 uppercase tracking-wide">Cotisations perçues</div>
            <div className="mt-1 font-display font-bold text-2xl text-slate-900">{paidPct}%</div>
          </div>
          <Link to="/app/cotisations" className="text-sm font-medium" style={{color:"var(--club-primary)"}}>Voir le détail <ArrowRight size={14} className="inline" /></Link>
        </div>
        <Progress value={paidPct} className="h-3" />
        <div className="mt-3 flex gap-4 text-sm">
          <span className="pill-tag status-paid">Payé : {summary?.paid?.count || 0}</span>
          <span className="pill-tag status-pending">En attente : {summary?.pending?.count || 0}</span>
          {summary?.overdue?.count > 0 && <span className="pill-tag status-overdue">En retard : {summary.overdue.count}</span>}
        </div>
      </div>

      <div className="mt-6 grid lg:grid-cols-2 gap-6">
        {/* Upcoming */}
        <div className="paper-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-lg text-slate-900">Prochains créneaux</h3>
            <Link to="/app/planning"><Button size="sm" variant="ghost" className="rounded-full" data-testid="dashboard-add-session"><Plus size={16} className="mr-1" />Ajouter</Button></Link>
          </div>
          {upcoming.length === 0 ? (
            <EmptyMini label="Aucun créneau prévu" cta="Créer un créneau" to="/app/planning" />
          ) : (
            <ul className="space-y-3">
              {upcoming.map((s) => (
                <li key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                  <div className="w-10 h-10 rounded-lg text-white grid place-items-center shrink-0" style={{background:"var(--club-primary)"}}>
                    <CalendarDays size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{s.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{formatWhen(s.start_at)} · {s.place || "Lieu à définir"}</div>
                    {s.team && <span className="pill-tag mt-2" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{s.team}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Public page + prospects */}
        <div className="space-y-6">
          <div className="paper-card p-6" data-testid="dashboard-public-page-card">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Globe size={22} strokeWidth={2.5} /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold text-slate-900">Page publique de votre club</h3>
                <p className="text-sm text-slate-600 mt-1">Partagez cette page pour attirer de nouveaux adhérents.</p>
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm font-medium truncate" style={{color:"var(--club-primary)"}} data-testid="dashboard-public-url">{publicUrl}</a>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => { navigator.clipboard.writeText(publicUrl); toast.success("Lien copié !"); }} data-testid="dashboard-copy-url">Copier</Button>
                </div>
              </div>
            </div>
          </div>

          {prospects > 0 && (
            <Link to="/app/prospects" className="block paper-card p-6 hover:-translate-y-0.5 transition-transform" data-testid="dashboard-prospects-card">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 grid place-items-center"><UserPlus size={22} strokeWidth={2.5} /></div>
                <div>
                  <div className="font-display font-semibold text-slate-900">{prospects} demande{prospects > 1 ? "s" : ""} d'inscription</div>
                  <div className="text-sm text-slate-600">De nouveaux membres attendent votre validation.</div>
                </div>
              </div>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, title, value, tint, testId }) {
  const tints = {
    orange: "bg-orange-100 text-orange-700",
    emerald: "bg-emerald-100 text-emerald-700",
    amber: "bg-amber-100 text-amber-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="paper-card p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-500 font-medium">{title}</div>
        <div className={`w-9 h-9 rounded-lg grid place-items-center ${tints[tint]}`}><Icon size={18} strokeWidth={2.5} /></div>
      </div>
      <div className="mt-3 font-display font-bold text-3xl text-slate-900">{value}</div>
    </div>
  );
}

function EmptyMini({ label, cta, to }) {
  return (
    <div className="text-center py-6">
      <div className="text-slate-500 text-sm">{label}</div>
      <Link to={to}><Button size="sm" className="mt-3 rounded-full" style={{background:"var(--club-primary)"}}>{cta}</Button></Link>
    </div>
  );
}

function formatWhen(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
