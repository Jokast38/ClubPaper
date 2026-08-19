import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "lucide-react";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState("checking");
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (!sessionId) { setStatus("error"); return; }
    let mounted = true;
    let tries = 0;
    const poll = async () => {
      tries += 1;
      setAttempts(tries);
      try {
        const { data } = await api.get(`/payments/status/${sessionId}`);
        if (data.payment_status === "paid") {
          if (mounted) setStatus("paid");
          return;
        }
      } catch { /* ignore */ }
      if (tries < 15 && mounted) setTimeout(poll, 2000);
      else if (mounted) setStatus("timeout");
    };
    poll();
    return () => { mounted = false; };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
      <div className="paper-card p-10 max-w-md w-full text-center">
        {status === "paid" ? (
          <>
            <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 text-emerald-700 grid place-items-center">
              <CheckCircle2 size={36} strokeWidth={2.5} />
            </div>
            <h1 className="mt-4 font-display font-bold text-2xl text-slate-900">Paiement confirmé</h1>
            <p className="mt-2 text-slate-600">Merci pour votre règlement ! Un reçu vous sera envoyé par email.</p>
            <Link to="/app"><Button className="mt-6 rounded-full" style={{background:"var(--club-primary)"}} data-testid="success-back-btn">Retour au tableau de bord</Button></Link>
          </>
        ) : status === "timeout" || status === "error" ? (
          <>
            <h1 className="font-display font-bold text-2xl text-slate-900">Paiement en cours de traitement</h1>
            <p className="mt-2 text-slate-600">Nous confirmerons dès que possible. Rafraîchissez la page dans quelques instants.</p>
          </>
        ) : (
          <>
            <Loader2 size={32} className="mx-auto animate-spin text-orange-600" />
            <p className="mt-4 text-slate-600">Vérification du paiement… ({attempts})</p>
          </>
        )}
      </div>
    </div>
  );
}
