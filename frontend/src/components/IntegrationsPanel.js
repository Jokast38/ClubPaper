import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Mail, CreditCard, MessageSquare, CheckCircle2, XCircle, Send } from "lucide-react";
import { toast } from "sonner";

export default function IntegrationsPanel() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [smsTo, setSmsTo] = useState("");
  const [smsBusy, setSmsBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/integrations");
    setStatus(data);
    setForm({
      resend_api_key: "",
      resend_sender: data.resend_sender || "",
      resend_enabled: data.resend_enabled,
      stripe_secret_key: "",
      stripe_publishable_key: "",
      stripe_enabled: data.stripe_enabled,
      twilio_account_sid: "",
      twilio_auth_token: "",
      twilio_phone_from: data.twilio_phone_from || "",
      twilio_enabled: data.twilio_enabled,
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = { ...form };
      // Only send non-empty secret fields (empty = keep existing)
      Object.keys(payload).forEach((k) => {
        if (typeof payload[k] === "string" && payload[k] === "" && k.match(/(key|token|sid)$/)) delete payload[k];
      });
      const { data } = await api.put("/integrations", payload);
      setStatus(data);
      toast.success("Intégrations enregistrées");
      // Clear secret input fields
      setForm({ ...form, resend_api_key: "", stripe_secret_key: "", stripe_publishable_key: "", twilio_account_sid: "", twilio_auth_token: "" });
    } catch { toast.error("Impossible d'enregistrer"); }
    finally { setBusy(false); }
  };

  const testSms = async () => {
    if (!smsTo) { toast.error("Numéro requis"); return; }
    setSmsBusy(true);
    try {
      const { data } = await api.post("/sms/test", { to: smsTo });
      if (data.status === "sent") toast.success("SMS envoyé ✅");
      else if (data.status === "simulated") toast.info("SMS simulé (Twilio pas encore actif)");
      else if (data.status === "skipped") toast.info("Twilio désactivé — activez la carte");
      else toast.error(data.error || "Échec");
    } catch (e) { toast.error(e.response?.data?.detail || "Impossible d'envoyer"); }
    finally { setSmsBusy(false); }
  };

  if (!status) return null;

  return (
    <div className="paper-card p-6">
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Intégrations</h3>
      <p className="text-sm text-slate-600 mb-6">Configurez vos propres clés. Laissez vide pour utiliser les valeurs de la plateforme.</p>

      <IntegrationCard
        icon={Mail}
        title="Resend — Emails transactionnels"
        configured={status.resend_configured}
        enabled={form.resend_enabled}
        onToggle={(v) => setForm({...form, resend_enabled: v})}
        testId="int-resend"
      >
        <div><Label>Clé API Resend</Label><Input type="password" placeholder={status.resend_configured ? "•••••••••• (configurée)" : "re_..."} value={form.resend_api_key} onChange={(e) => setForm({...form, resend_api_key: e.target.value})} data-testid="resend-key-input" className="mt-1 h-11" /></div>
        <div><Label>Adresse expéditeur</Label><Input placeholder="club@monclub.fr" value={form.resend_sender} onChange={(e) => setForm({...form, resend_sender: e.target.value})} data-testid="resend-sender-input" className="mt-1 h-11" /></div>
      </IntegrationCard>

      <IntegrationCard
        icon={CreditCard}
        title="Stripe — Paiements"
        configured={status.stripe_configured}
        enabled={form.stripe_enabled}
        onToggle={(v) => setForm({...form, stripe_enabled: v})}
        testId="int-stripe"
      >
        <div><Label>Clé secrète</Label><Input type="password" placeholder={status.stripe_configured ? "•••••••••• (configurée)" : "sk_live_..."} value={form.stripe_secret_key} onChange={(e) => setForm({...form, stripe_secret_key: e.target.value})} data-testid="stripe-secret-input" className="mt-1 h-11" /></div>
        <div><Label>Clé publique</Label><Input placeholder="pk_live_..." value={form.stripe_publishable_key} onChange={(e) => setForm({...form, stripe_publishable_key: e.target.value})} data-testid="stripe-pub-input" className="mt-1 h-11" /></div>
      </IntegrationCard>

      <IntegrationCard
        icon={MessageSquare}
        title="Twilio — SMS"
        configured={status.twilio_configured}
        enabled={form.twilio_enabled}
        onToggle={(v) => setForm({...form, twilio_enabled: v})}
        testId="int-twilio"
      >
        <div><Label>Account SID</Label><Input placeholder="ACxxxxxxxxxxxx" value={form.twilio_account_sid} onChange={(e) => setForm({...form, twilio_account_sid: e.target.value})} data-testid="twilio-sid-input" className="mt-1 h-11" /></div>
        <div><Label>Auth Token</Label><Input type="password" placeholder={status.twilio_configured ? "•••••••••• (configuré)" : ""} value={form.twilio_auth_token} onChange={(e) => setForm({...form, twilio_auth_token: e.target.value})} data-testid="twilio-token-input" className="mt-1 h-11" /></div>
        <div><Label>Numéro expéditeur</Label><Input placeholder="+33xxxxxxxxx" value={form.twilio_phone_from} onChange={(e) => setForm({...form, twilio_phone_from: e.target.value})} data-testid="twilio-phone-input" className="mt-1 h-11" /></div>
        <div className="sm:col-span-2 border-t border-slate-100 pt-3 mt-1">
          <Label>Envoyer un SMS de test</Label>
          <div className="mt-1 flex gap-2">
            <Input placeholder="+33612345678" value={smsTo} onChange={(e) => setSmsTo(e.target.value)} data-testid="sms-test-to" className="h-11" />
            <Button type="button" onClick={testSms} disabled={smsBusy} data-testid="sms-test-btn" variant="outline" className="h-11 rounded-md whitespace-nowrap">
              <Send size={14} className="mr-2" />{smsBusy ? "…" : "Test"}
            </Button>
          </div>
          <div className="text-xs text-slate-500 mt-1">Utilise les clés Twilio ci-dessus. Assurez-vous que la carte est activée.</div>
        </div>
      </IntegrationCard>

      <div className="mt-6 flex justify-end">
        <Button onClick={save} disabled={busy} className="rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="integrations-save-btn">
          {busy ? "Enregistrement…" : "Enregistrer les intégrations"}
        </Button>
      </div>
    </div>
  );
}

function IntegrationCard({ icon: Icon, title, configured, enabled, onToggle, children, testId }) {
  return (
    <div className="mt-4 border border-slate-200 rounded-2xl p-5" data-testid={testId}>
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Icon size={22} strokeWidth={2.5} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="font-display font-semibold text-slate-900">{title}</div>
            <span className={`pill-tag ${configured ? "status-paid" : "status-pending"}`}>{configured ? (<><CheckCircle2 size={12} className="inline mr-1" />Configurée</>) : (<><XCircle size={12} className="inline mr-1" />Non configurée</>)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-500">{enabled ? "Actif" : "Inactif"}</span>
          <Switch checked={!!enabled} onCheckedChange={onToggle} data-testid={`${testId}-toggle`} />
        </div>
      </div>
      <div className="mt-4 grid sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}
