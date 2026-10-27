import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export default function ClaimActivate() {
  const { claimId } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) { toast.error("Mot de passe trop court (6 caractères minimum)"); return; }
    if (password !== confirm) { toast.error("Les mots de passe ne correspondent pas"); return; }
    setBusy(true);
    try {
      const { data } = await api.post(`/public/annuaire/claim/${claimId}/activate`, { password });
      if (data.token) localStorage.setItem("cm_token", data.token);
      await refresh();
      toast.success("Votre compte est activé !");
      navigate("/app");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center px-4">
      <div className="max-w-md w-full paper-card p-8">
        <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><KeyRound size={22} strokeWidth={2.5} /></div>
        <h1 className="mt-4 font-display font-bold text-2xl text-slate-900">Activez votre compte</h1>
        <p className="mt-2 text-slate-600 text-sm">Votre revendication a été validée. Choisissez un mot de passe pour accéder à votre espace ClubPaper.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div><Label>Mot de passe *</Label><Input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-11" data-testid="activate-password" /></div>
          <div><Label>Confirmer le mot de passe *</Label><Input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 h-11" data-testid="activate-password-confirm" /></div>
          <Button type="submit" disabled={busy} className="w-full rounded-full h-12" style={{ background: "var(--club-primary, #EA580C)" }} data-testid="activate-submit-btn">
            {busy ? "Activation…" : "Activer mon compte"}
          </Button>
        </form>
      </div>
    </div>
  );
}
