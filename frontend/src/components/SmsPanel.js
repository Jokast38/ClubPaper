import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MessageSquare, Send, Rocket, Zap, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const TIER_LABEL = { trial: "Essai", club: "Plan Club", pro: "Plan Pro", free: "Plan gratuit" };
const PROVIDER_LABEL = { gateway: "SMS inclus ClubPaper", twilio: "Votre compte Twilio", brevo: "Votre compte Brevo" };
const OPTIONS = [
  { id: "pro", title: "Passer au plan Pro", desc: "Quota de SMS inclus plus élevé, sans rien configurer." },
  { id: "twilio", title: "Twilio", desc: "Votre propre compte : envois illimités, facturés à l'usage par Twilio (~0,08 €/SMS)." },
  { id: "brevo", title: "Brevo", desc: "Votre propre compte : SMS avec le nom du club comme expéditeur, crédits prépayés." },
  { id: "partenariat", title: "Partenariat ClubPaper", desc: "Gros volume (ligue, tournoi, multi-sections) : on étudie une offre sur mesure." },
];

export default function SmsPanel() {
  const { club, refresh } = useAuth();
  const [usage, setUsage] = useState(null);
  const [open, setOpen] = useState(false);
  const [req, setReq] = useState({ option: "pro", monthly_volume: "", message: "" });
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState("");

  const load = () => api.get("/clubs/me/sms-usage").then((r) => setUsage(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!usage || !club) return null;

  const unlimited = usage.quota === null;
  const pct = unlimited || !usage.quota ? 0 : Math.min(100, (usage.used / usage.quota) * 100);
  const low = !unlimited && usage.quota > 0 && pct >= 80;

  const upgrade = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/clubs/me/upgrade-pro", { origin_url: window.location.origin });
      if (data.checkout_url) { window.location.href = data.checkout_url; return; }
      toast.success("Bienvenue au plan Pro 🚀");
      await refresh(); await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Passage au plan Pro impossible"); }
    finally { setBusy(false); }
  };

  const sendRequest = async () => {
    setBusy(true);
    try {
      await api.post("/clubs/me/sms-volume-request", { ...req, monthly_volume: parseInt(req.monthly_volume, 10) || 0 });
      toast.success("Demande envoyée — nous revenons vers vous rapidement");
      setOpen(false); await load();
    } catch (e) { toast.error(e.response?.data?.detail || "Envoi impossible"); }
    finally { setBusy(false); }
  };

  const test = async () => {
    if (!to) { toast.error("Numéro requis"); return; }
    try {
      const { data } = await api.post("/sms/test", { to });
      if (data.status === "sent") toast.success("SMS envoyé ✅");
      else if (data.status === "queued") toast.success("SMS en file d'envoi : il part dans quelques instants");
      else if (data.reason === "quota") toast.error("Quota SMS du mois atteint");
      else if (data.status === "skipped") toast.info("SMS non disponible avec votre plan");
      else toast.error(data.error || "Échec");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Impossible d'envoyer"); }
  };

  return (
    <div className="paper-card p-6" data-testid="sms-panel">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{ background: "var(--club-primary)" }}><MessageSquare size={22} strokeWidth={2.5} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display font-semibold text-lg text-slate-900">SMS aux adhérents</h3>
            <span className="pill-tag status-pending">{TIER_LABEL[usage.tier] || usage.tier}</span>
            {usage.provider && <span className="pill-tag status-paid"><CheckCircle2 size={12} className="inline mr-1" />{PROVIDER_LABEL[usage.provider]}</span>}
          </div>

          {!usage.provider ? (
            <p className="text-sm text-slate-600 mt-1">
              {usage.tier === "free"
                ? "Les SMS (relances de cotisation, annonces, changements de créneau) sont inclus dans les plans payants."
                : "Les SMS ne sont pas encore disponibles. Contactez-nous ou connectez votre compte Twilio / Brevo dans les intégrations."}
            </p>
          ) : unlimited ? (
            <p className="text-sm text-slate-600 mt-1">
              Envois illimités via votre compte {usage.provider === "brevo" ? "Brevo" : "Twilio"} ({usage.used} SMS inclus ClubPaper ce mois-ci). Les SMS vous sont facturés directement par le fournisseur.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="text-slate-600">SMS utilisés ce mois-ci</span>
                <span className="font-display font-bold text-slate-900">{usage.used} / {usage.quota}</span>
              </div>
              <div className="h-2.5 rounded-full bg-slate-100 mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : low ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-start gap-1.5">
                <Clock size={13} className="mt-0.5 shrink-0" />
                Les SMS partent un par un (environ {usage.pacing.per_hour}/heure au maximum, pas d'envoi {usage.pacing.quiet_hours}) : une annonce à tout le club peut prendre quelques minutes. Un SMS long (plus de 160 caractères ou avec emoji) compte pour plusieurs.
              </p>
              {pct >= 100 && <p className="text-sm text-red-600 mt-2">Quota atteint : les SMS sont suspendus jusqu'au 1er du mois prochain (les emails continuent de partir).</p>}
            </>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {usage.tier === "club" && !unlimited && (
              <Button onClick={upgrade} disabled={busy} className="rounded-full" style={{ background: "var(--club-primary)" }} data-testid="sms-upgrade-pro-btn">
                <Rocket size={15} className="mr-2" />Passer Pro — {usage.quotas.pro} SMS/mois
              </Button>
            )}
            {usage.tier !== "free" && (
              <Button variant="outline" onClick={() => setOpen(true)} className="rounded-full" data-testid="sms-volume-request-btn">
                <Zap size={15} className="mr-2" />Besoin de plus de SMS ?
              </Button>
            )}
          </div>
          {usage.pending_request && (
            <p className="text-xs text-slate-500 mt-2">Demande en cours ({OPTIONS.find((o) => o.id === usage.pending_request.option)?.title}) — nous vous recontactons.</p>
          )}

          {usage.provider && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <Label>Envoyer un SMS de test</Label>
              <div className="mt-1 flex gap-2 max-w-md">
                <Input placeholder="06 12 34 56 78" value={to} onChange={(e) => setTo(e.target.value)} className="h-11" data-testid="sms-panel-test-to" />
                <Button variant="outline" onClick={test} className="h-11 rounded-md whitespace-nowrap" data-testid="sms-panel-test-btn"><Send size={14} className="mr-2" />Test</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Plus de SMS pour votre club</DialogTitle></DialogHeader>
          <div className="space-y-2">
            {OPTIONS.filter((o) => o.id !== "pro" || usage.tier !== "pro").map((o) => (
              <button key={o.id} type="button" onClick={() => setReq({ ...req, option: o.id })}
                className={`w-full text-left rounded-xl border-2 p-3 transition ${req.option === o.id ? "border-orange-400 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}>
                <div className="font-medium text-slate-900">{o.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">{o.desc}</div>
              </button>
            ))}
          </div>
          <div className="grid gap-3 mt-2">
            <div><Label>Volume estimé (SMS / mois)</Label><Input type="number" min={0} value={req.monthly_volume} onChange={(e) => setReq({ ...req, monthly_volume: e.target.value })} className="mt-1 h-11" placeholder="500" /></div>
            <div><Label>Précisions (optionnel)</Label><Textarea rows={3} value={req.message} onChange={(e) => setReq({ ...req, message: e.target.value })} className="mt-1" placeholder="Ex. : tournoi en juin, 3 sections, rappels hebdomadaires…" /></div>
            {(req.option === "twilio" || req.option === "brevo") && (
              <p className="text-xs text-slate-500">Vous pouvez aussi saisir directement vos clés {req.option === "twilio" ? "Twilio" : "Brevo"} dans « Intégrations » ci-dessous : les SMS passeront alors par votre compte, sans limite de quota.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">Annuler</Button>
            <Button onClick={sendRequest} disabled={busy} className="rounded-full" style={{ background: "var(--club-primary)" }} data-testid="sms-volume-request-submit">Envoyer la demande</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
