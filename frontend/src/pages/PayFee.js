import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { applyClubTheme } from "@/lib/colorExtractor";
import { Button } from "@/components/ui/button";
import { CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

export default function PayFee() {
  const { feeId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/public/fees/${feeId}`).then(({ data }) => {
      setData(data);
      if (data.club?.theme) applyClubTheme(data.club.theme);
    }).catch(() => setError(true));
  }, [feeId]);

  const pay = async () => {
    setBusy(true);
    try {
      const { data: res } = await api.post("/payments/checkout", {
        fee_id: feeId,
        origin_url: window.location.origin,
      });
      window.location.href = res.checkout_url;
    } catch { toast.error("Impossible de démarrer le paiement"); setBusy(false); }
  };

  if (error) return <div className="min-h-screen grid place-items-center text-slate-600">Cotisation introuvable.</div>;
  if (!data) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;

  const paid = data.fee.status === "paid";
  const primary = data.club.theme?.primary || "#EA580C";

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
      <div className="paper-card p-8 max-w-md w-full text-center">
        {data.club.logo_data_url && <img src={data.club.logo_data_url} alt="" className="w-16 h-16 mx-auto rounded-2xl object-contain bg-slate-50 p-1" />}
        <div className="mt-4 text-sm uppercase tracking-wide text-slate-500">{data.club.name}</div>
        <h1 className="mt-1 font-display font-bold text-2xl text-slate-900">Cotisation saison {data.fee.season}</h1>
        <p className="mt-2 text-slate-600">{data.member.first_name} {data.member.last_name}</p>

        <div className="mt-6 p-6 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="text-sm text-slate-500">Montant à régler</div>
          <div className="font-display font-bold text-5xl mt-1" style={{color: primary}}>{data.fee.amount.toFixed(2)} €</div>
          <div className="text-xs text-slate-400 mt-2">Échéance : {data.fee.due_date}</div>
        </div>

        {paid ? (
          <div className="mt-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2 justify-center">
            <CheckCircle2 size={20} /> Déjà réglée — merci !
          </div>
        ) : (
          <Button disabled={busy} onClick={pay} className="mt-6 w-full h-14 rounded-full text-base" style={{background: primary}} data-testid="pay-fee-btn">
            <CreditCard size={20} className="mr-2" />
            {busy ? "Redirection…" : "Payer par carte bancaire"}
          </Button>
        )}
        <p className="mt-4 text-xs text-slate-400">Paiement sécurisé propulsé par Stripe</p>
      </div>
    </div>
  );
}
