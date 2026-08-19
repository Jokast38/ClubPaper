import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Wallet, Send, CreditCard, CheckCircle2, Zap, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadPdf } from "@/lib/downloadPdf";

const STATUS_LABEL = { paid: "Payé", pending: "En attente", overdue: "En retard" };

export default function Payments() {
  const [fees, setFees] = useState([]);
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: f }, { data: s }] = await Promise.all([
      api.get("/fees"),
      api.get("/fees/summary"),
    ]);
    setFees(f);
    setSummary(s);
  };
  useEffect(() => { load(); }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/fees/generate");
      toast.success(`${data.created} cotisation${data.created > 1 ? "s" : ""} créée${data.created > 1 ? "s" : ""}`);
      load();
    } catch { toast.error("Impossible de générer"); }
    finally { setBusy(false); }
  };

  const markPaid = async (id) => {
    await api.post(`/fees/${id}/mark-paid`);
    toast.success("Cotisation marquée payée");
    load();
  };

  const remind = async (id) => {
    try {
      await api.post(`/fees/${id}/send-reminder`);
      toast.success("Relance envoyée");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Impossible d'envoyer"); }
  };

  const remindAll = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/fees/send-all-reminders");
      toast.success(`${data.sent} relance${data.sent > 1 ? "s" : ""} envoyée${data.sent > 1 ? "s" : ""}`);
    } finally { setBusy(false); }
  };

  const totalDue = (summary?.pending?.amount || 0) + (summary?.overdue?.amount || 0);
  const totalPaid = summary?.paid?.amount || 0;
  const totalAll = totalDue + totalPaid;
  const paidPct = totalAll > 0 ? Math.round((totalPaid / totalAll) * 100) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Cotisations</h1>
          <p className="mt-1 text-slate-600">Suivez les paiements et relancez les impayés en un clic.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={generate} disabled={busy} className="rounded-full h-11" data-testid="fees-generate-btn">
            <Zap size={18} className="mr-2" />Générer les cotisations
          </Button>
          <Button onClick={remindAll} disabled={busy || (summary?.pending?.count || 0) === 0} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="fees-remind-all-btn">
            <Send size={18} className="mr-2" />Tout relancer
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 grid sm:grid-cols-3 gap-4 stagger">
        <StatCard label="Encaissé" amount={totalPaid} count={summary?.paid?.count || 0} kind="paid" testId="stat-paid" />
        <StatCard label="En attente" amount={summary?.pending?.amount || 0} count={summary?.pending?.count || 0} kind="pending" testId="stat-pending" />
        <StatCard label="En retard" amount={summary?.overdue?.amount || 0} count={summary?.overdue?.count || 0} kind="overdue" testId="stat-overdue" />
      </div>

      <div className="mt-6 paper-card p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-slate-500 uppercase tracking-wide">Progression saison</div>
          <div className="font-display font-bold text-2xl text-slate-900">{paidPct}%</div>
        </div>
        <Progress value={paidPct} className="h-3" />
      </div>

      {/* List */}
      {fees.length === 0 ? (
        <div className="mt-10 paper-card p-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><Wallet size={28} strokeWidth={2.5} /></div>
          <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Aucune cotisation pour l'instant</h3>
          <p className="mt-2 text-slate-600 max-w-md mx-auto">Cliquez sur "Générer les cotisations" pour créer les cotisations de la saison pour tous vos adhérents.</p>
          <Button onClick={generate} className="mt-6 rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="empty-generate-fees">Générer maintenant</Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3 stagger">
          {fees.map((f) => (
            <li key={f.id} className="paper-card p-4 flex items-center gap-4" data-testid={`fee-row-${f.id}`}>
              <div className={`w-11 h-11 rounded-xl grid place-items-center shrink-0 ${f.status === "paid" ? "bg-emerald-100 text-emerald-700" : f.status === "overdue" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                {f.status === "paid" ? <CheckCircle2 size={20} strokeWidth={2.5} /> : <Wallet size={20} strokeWidth={2.5} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{f.member_name || "Adhérent"}</div>
                <div className="text-sm text-slate-500 truncate">
                  {f.amount.toFixed(2)} € · Échéance {f.due_date}
                  {f.reminders_sent > 0 && <span className="ml-2 text-xs text-slate-400">· {f.reminders_sent} relance{f.reminders_sent > 1 ? "s" : ""}</span>}
                </div>
                {f.member_team && <span className="pill-tag mt-2" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{f.member_team}</span>}
              </div>
              <div className="flex flex-wrap gap-2 shrink-0 items-center">
                <span className={`pill-tag ${f.status === "paid" ? "status-paid" : f.status === "overdue" ? "status-overdue" : "status-pending"}`}>{STATUS_LABEL[f.status]}</span>
                {f.status === "paid" && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => downloadPdf(`/pdf/receipt/${f.id}`, `recu-${f.id.slice(0,8)}.pdf`)} data-testid={`fee-receipt-${f.id}`}>
                    <Download size={14} className="mr-1" />Reçu PDF
                  </Button>
                )}
                {f.status !== "paid" && (
                  <>
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => remind(f.id)} data-testid={`fee-remind-${f.id}`}><Send size={14} className="mr-1" />Relancer</Button>
                    <Button size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={() => markPaid(f.id)} data-testid={`fee-mark-paid-${f.id}`}><CreditCard size={14} className="mr-1" />Marquer payé</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ label, amount, count, kind, testId }) {
  const cls = kind === "paid" ? "text-emerald-700 bg-emerald-50 border-emerald-200"
    : kind === "overdue" ? "text-red-700 bg-red-50 border-red-200"
    : "text-amber-800 bg-amber-50 border-amber-200";
  return (
    <div className={`p-5 border rounded-2xl ${cls}`} data-testid={testId}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-2 font-display font-bold text-3xl">{amount.toFixed(0)} €</div>
      <div className="text-xs opacity-70 mt-1">{count} cotisation{count > 1 ? "s" : ""}</div>
    </div>
  );
}
