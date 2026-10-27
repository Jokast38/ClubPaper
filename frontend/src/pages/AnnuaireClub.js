import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, MapPin, ArrowLeft, BadgeCheck, MailCheck } from "lucide-react";

const ROLE_LABEL = { president: "Président(e)", tresorier: "Trésorier(ère)", secretaire: "Secrétaire", autre: "Autre" };

export default function AnnuaireClub() {
  const { slug } = useParams();
  const [club, setClub] = useState(null);
  const [error, setError] = useState(false);
  const [step, setStep] = useState("view"); // view, form, code, done
  const [claimId, setClaimId] = useState("");
  const [form, setForm] = useState({ name: "", role: "president", email: "", phone: "" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/annuaire/${slug}`).then(({ data }) => {
      setClub(data);
      document.title = `${data.name} — Annuaire ClubPaper`;
    }).catch(() => setError(true));
  }, [slug]);

  const submitClaim = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/public/annuaire/${slug}/claim`, form);
      setClaimId(data.claim_id);
      setStep("code");
      toast.success("Un code de vérification vous a été envoyé par email");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  const verifyCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/public/annuaire/claim/${claimId}/verify`, { code });
      setStep("done");
      toast.success("Email confirmé, votre demande est en cours de vérification");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  if (error) return <div className="min-h-screen grid place-items-center text-slate-400">Fiche introuvable.</div>;
  if (!club) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;

  const alreadyClaimed = club.claim_status === "revendique";

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <Link to="/annuaire" className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-4"><ArrowLeft size={14} />Retour à l'annuaire</Link>

        <div className="paper-card p-7">
          <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><Building2 size={22} strokeWidth={2.5} /></div>
          <h1 className="mt-4 font-display font-bold text-2xl text-slate-900">{club.name}</h1>
          <div className="mt-1 text-slate-500 flex items-center gap-1.5"><MapPin size={14} />{club.sport}{club.city ? ` · ${club.city}` : ""}</div>
          {club.description && <p className="mt-4 text-slate-600 text-sm">{club.description}</p>}

          {alreadyClaimed ? (
            <div className="mt-6 flex items-center gap-2 text-emerald-700 bg-emerald-50 rounded-xl p-4" data-testid="annuaire-claimed-badge">
              <BadgeCheck size={18} />
              <span className="text-sm">Ce club est déjà présent sur ClubPaper.{club.claimed_club_slug && <> <a href={`/c/${club.claimed_club_slug}`} className="underline font-medium">Voir sa page</a>.</>}</span>
            </div>
          ) : (
            <>
              {step === "view" && (
                <Button className="mt-6 rounded-full h-12" style={{ background: "var(--club-primary, #EA580C)" }} onClick={() => setStep("form")} data-testid="annuaire-claim-start">
                  C'est mon club — revendiquer cette fiche
                </Button>
              )}

              {step === "form" && (
                <form onSubmit={submitClaim} className="mt-6 space-y-4">
                  <p className="text-sm text-slate-500">Confirmez votre rôle dans le club pour revendiquer cette fiche. Un email de vérification vous sera envoyé.</p>
                  <div><Label>Votre nom *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-11" data-testid="claim-name" /></div>
                  <div>
                    <Label>Votre rôle *</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                      <SelectTrigger className="mt-1 h-11" data-testid="claim-role"><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(ROLE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Email *</Label><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-11" data-testid="claim-email" /></div>
                  <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-11" data-testid="claim-phone" /></div>
                  <Button type="submit" disabled={busy} className="w-full rounded-full h-12" style={{ background: "var(--club-primary, #EA580C)" }} data-testid="claim-submit-btn">
                    {busy ? "Envoi…" : "Recevoir mon code de vérification"}
                  </Button>
                </form>
              )}

              {step === "code" && (
                <form onSubmit={verifyCode} className="mt-6 space-y-4">
                  <div className="flex items-center gap-2 text-slate-600 text-sm"><MailCheck size={16} />Code envoyé à {form.email}</div>
                  <div><Label>Code de vérification *</Label><Input required value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-11 text-center text-xl tracking-widest" maxLength={6} data-testid="claim-code-input" /></div>
                  <Button type="submit" disabled={busy} className="w-full rounded-full h-12" style={{ background: "var(--club-primary, #EA580C)" }} data-testid="claim-verify-btn">
                    {busy ? "Vérification…" : "Confirmer"}
                  </Button>
                </form>
              )}

              {step === "done" && (
                <div className="mt-6 bg-emerald-50 text-emerald-700 rounded-xl p-4 text-sm" data-testid="claim-done-message">
                  Merci ! Votre email est confirmé. Notre équipe vérifie votre demande et vous recontactera très vite pour activer votre compte.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
