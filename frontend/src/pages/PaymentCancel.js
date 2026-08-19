import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PaymentCancel() {
  return (
    <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
      <div className="paper-card p-10 max-w-md w-full text-center">
        <h1 className="font-display font-bold text-2xl text-slate-900">Paiement annulé</h1>
        <p className="mt-2 text-slate-600">Aucun montant n'a été débité. Vous pouvez réessayer quand vous voulez.</p>
        <Link to="/app"><Button variant="outline" className="mt-6 rounded-full" data-testid="cancel-back-btn">Retour</Button></Link>
      </div>
    </div>
  );
}
