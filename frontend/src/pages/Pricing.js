import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const features = [
  "Adhérents illimités",
  "Import CSV/Excel",
  "Cotisations & paiements en ligne (Stripe)",
  "Relances automatiques par email",
  "Planning multi-équipes avec notifications",
  "Annonces à toute la club ou à une équipe",
  "Landing page publique aux couleurs du club",
  "Tableau de bord trésorier",
  "Support par email",
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="font-display font-bold text-lg flex items-center gap-2" data-testid="pricing-logo">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white grid place-items-center">CP</span>
            ClubPaper
          </Link>
          <Link to="/inscription"><Button className="rounded-full bg-orange-600 hover:bg-orange-700" data-testid="pricing-register-btn">Créer mon club</Button></Link>
        </div>
      </header>

      <section className="max-w-3xl mx-auto px-4 lg:px-8 py-20 text-center">
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-slate-900">Un seul tarif. Simple.</h1>
        <p className="mt-4 text-lg text-slate-600">Sans limite d'adhérents, sans surprise. Résiliez quand vous voulez.</p>

        <div className="mt-12 paper-card p-8 lg:p-10 text-left border-2 border-orange-200">
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-display font-bold text-orange-600">19€</span>
            <span className="text-slate-500">/ mois par club</span>
          </div>
          <p className="mt-3 text-slate-600">30 jours d'essai gratuit — pas de carte bancaire requise.</p>

          <ul className="mt-8 space-y-3">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-3 text-slate-700">
                <Check size={20} className="text-emerald-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          <Link to="/inscription" data-testid="pricing-cta-btn">
            <Button className="mt-10 w-full rounded-full h-14 text-base bg-orange-600 hover:bg-orange-700">
              Démarrer 30 jours gratuits
            </Button>
          </Link>
        </div>

        <p className="mt-10 text-sm text-slate-500">Besoin d'une facture au nom de votre association ? Nous vous l'envoyons automatiquement.</p>
      </section>
    </div>
  );
}
