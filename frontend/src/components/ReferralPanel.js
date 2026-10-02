import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Gift, Copy } from "lucide-react";
import { toast } from "sonner";

export default function ReferralPanel() {
  const [data, setData] = useState(null);

  const load = async () => {
    try {
      const { data } = await api.get("/clubs/me/referrals");
      setData(data);
    } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, []);

  if (!data) return null;

  const link = `${window.location.origin}/inscription?ref=${data.referral_code}`;
  const copyLink = () => {
    navigator.clipboard.writeText(link);
    toast.success("Lien copié !");
  };

  return (
    <div className="paper-card p-6" data-testid="referral-panel">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Gift size={22} strokeWidth={2.5} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg text-slate-900">Parrainez un club</h3>
          <p className="text-sm text-slate-600 mt-1">
            Partagez votre lien : dès qu'un club inscrit via ce lien choisit l'abonnement, vous recevez <b>un mois offert</b> automatiquement.
          </p>
          <div className="mt-3 flex gap-2">
            <Input value={link} readOnly className="h-11 text-sm" data-testid="referral-link-input" />
            <Button variant="outline" className="rounded-full h-11 shrink-0" onClick={copyLink} data-testid="referral-copy-btn">
              <Copy size={16} className="mr-2" />Copier
            </Button>
          </div>
          <div className="mt-4 flex gap-6 text-sm">
            <div><span className="font-display font-bold text-xl text-slate-900">{data.referral_credits_months}</span> <span className="text-slate-500">mois offert{data.referral_credits_months > 1 ? "s" : ""} appliqué{data.referral_credits_months > 1 ? "s" : ""}</span></div>
            {data.referral_pending_credits > 0 && (
              <div><span className="font-display font-bold text-xl text-amber-600">{data.referral_pending_credits}</span> <span className="text-slate-500">en attente</span></div>
            )}
          </div>

          {data.referred_clubs.length > 0 && (
            <div className="mt-4 space-y-2">
              {data.referred_clubs.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50">
                  <span className="text-slate-700">{c.name}</span>
                  <span className={`pill-tag ${c.plan === "paid" ? "status-paid" : "status-pending"}`}>{c.plan === "paid" ? "Converti" : "En attente"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
