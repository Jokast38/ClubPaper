import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const features = [
  "Adhérents illimités",
  "Import CSV/Excel",
  "Cotisations & paiements en ligne (Stripe)",
  "Relances automatiques par email et SMS",
  "Planning multi-équipes avec notifications",
  "Annonces à tout le club ou à une équipe",
  "Landing page publique aux couleurs du club",
  "Tableau de bord trésorier",
  "Support par email",
];

const PLANS = [
  { id: "club", name: "Club", tagline: "L'essentiel pour gérer le club sans paperasse.", price: "19,99€", season: "79,96€",
    extras: ["50 SMS/mois inclus (relances, annonces, changements de créneau)"] },
  { id: "pro", name: "Pro", tagline: "Pour les clubs qui communiquent beaucoup par SMS.", price: "29,99€", season: "119,96€", highlight: true,
    extras: ["300 SMS/mois inclus", "Idéal pour les annonces SMS à tout le club"] },
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

      <section className="max-w-5xl mx-auto px-4 lg:px-8 py-20 text-center">
        <h1 className="font-display text-4xl lg:text-5xl font-bold text-slate-900">Deux formules. Simples.</h1>
        <p className="mt-4 text-lg text-slate-600">Sans limite d'adhérents, sans surprise. 30 jours d'essai gratuit, sans carte bancaire.</p>

        <div className="mt-12 grid md:grid-cols-2 gap-6 text-left">
          {PLANS.map((p) => (
            <div key={p.id} className={`paper-card p-8 border-2 flex flex-col ${p.highlight ? "border-orange-300 shadow-lg" : "border-slate-200"}`} data-testid={`pricing-plan-${p.id}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold text-slate-900">{p.name}</h2>
                {p.highlight && <span className="text-xs font-semibold px-3 py-1 rounded-full bg-orange-100 text-orange-700">Le plus complet</span>}
              </div>
              <p className="mt-1 text-sm text-slate-500">{p.tagline}</p>
              <div className="mt-5 flex items-baseline gap-2">
                <span className="text-5xl font-display font-bold text-orange-600">{p.price}</span>
                <span className="text-slate-500">/ mois par club</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">Engagement 1 saison (6 mois) — ou {p.season} la saison payée en une fois (2 mois offerts)</p>

              <ul className="mt-8 space-y-3 flex-1">
                {[...features, ...p.extras].map((f) => (
                  <li key={f} className="flex items-start gap-3 text-slate-700">
                    <Check size={20} className="text-emerald-600 mt-0.5 shrink-0" strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Link to="/inscription" data-testid={`pricing-cta-${p.id}`}>
                <Button className={`mt-10 w-full rounded-full h-14 text-base ${p.highlight ? "bg-orange-600 hover:bg-orange-700" : "bg-slate-900 hover:bg-slate-800"}`}>
                  Démarrer 30 jours gratuits
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="mt-10 text-sm text-slate-600">
          Pas prêt à vous engager ? Après l'essai, un <b>plan gratuit</b> reste disponible sans engagement : 25 adhérents, 2 annonces par mois, sans paiement en ligne ni SMS.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Plus de SMS ? Connectez votre propre compte <b>Twilio</b> ou <b>Brevo</b> pour des envois illimités, ou contactez-nous pour un partenariat (ligues, tournois, clubs multi-sections).
        </p>
        <p className="mt-3 text-sm text-slate-500">Besoin d'une facture au nom de votre association ? Nous vous l'envoyons automatiquement.</p>
      </section>
    </div>
  );
}
