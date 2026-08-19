import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Zap, ShieldCheck, Users, Wallet, CalendarDays, Sparkles } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white stadium-grain">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-bold text-lg" data-testid="logo-link">
            <span className="w-8 h-8 rounded-lg bg-orange-600 text-white grid place-items-center">CP</span>
            ClubPaper
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/tarifs" className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2" data-testid="nav-pricing">Tarifs</Link>
            <Link to="/login" className="text-sm font-medium text-slate-700 hover:text-slate-900 px-3 py-2" data-testid="nav-login">Se connecter</Link>
            <Link to="/inscription" data-testid="nav-register">
              <Button className="rounded-full h-11 px-5 bg-orange-600 hover:bg-orange-700">Créer mon club</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 pt-16 pb-24 grid lg:grid-cols-2 gap-12 items-center">
        <div className="stagger">
          <span className="pill-tag" style={{background:"#FFEDD5", color:"#9A3412"}}>Pour clubs amateurs français</span>
          <h1 className="mt-6 text-4xl sm:text-5xl lg:text-6xl font-display font-bold tracking-tight text-slate-900">
            Fini Excel, WhatsApp et Doodle.<br/>
            <span className="text-orange-600">Votre club, en un seul endroit.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-600 leading-relaxed max-w-xl">
            ClubPaper rassemble les licences, les cotisations, les créneaux et les annonces
            dans une application pensée pour les bénévoles pressés. Pas de jargon, pas de manuel : ça marche tout seul.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/inscription" data-testid="hero-cta-register">
              <Button className="rounded-full h-14 px-8 text-base bg-orange-600 hover:bg-orange-700">
                Créer mon club — 30 jours offerts
              </Button>
            </Link>
            <Link to="/tarifs" data-testid="hero-cta-pricing">
              <Button variant="outline" className="rounded-full h-14 px-8 text-base border-slate-300">Voir les tarifs</Button>
            </Link>
          </div>
          <div className="mt-8 flex items-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Sans carte bancaire</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-600" /> Configuration en 5 min</span>
          </div>
        </div>
        <div className="relative">
          <div className="absolute -inset-4 bg-orange-100 rounded-3xl -rotate-2"></div>
          <img src="https://images.unsplash.com/photo-1526232761682-d26e03ac148e" alt="Enfants qui jouent au foot" className="relative rounded-3xl shadow-xl object-cover w-full h-[440px]" />
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 py-24">
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Tout ce dont votre club a vraiment besoin.</h2>
            <p className="mt-4 text-slate-600 text-lg">Chaque écran est pensé pour un bénévole pressé, pas pour un pro de la gestion.</p>
          </div>
          <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
            <FeatureCard icon={Users} title="Licences & adhérents" desc="Fiche complète, import Excel/CSV en un clic, recherche par équipe ou statut de licence." />
            <FeatureCard icon={Wallet} title="Cotisations & paiements" desc="Génération automatique, paiement en ligne en 2 clics, relances email programmées." />
            <FeatureCard icon={CalendarDays} title="Planning des créneaux" desc="Le coach crée un entraînement, tous les parents sont prévenus. Fini les groupes WhatsApp." />
            <FeatureCard icon={Sparkles} title="Landing page du club" desc="Une page publique aux couleurs de votre logo, générée automatiquement. Prête à partager." />
            <FeatureCard icon={ShieldCheck} title="Trésorier tranquille" desc="Tableau de bord clair : qui a payé, qui doit relancer. Barres de progression, pas de tableau Excel." />
            <FeatureCard icon={Zap} title="Zéro jargon" desc="Pensé pour les bénévoles, pas pour les geeks. Actions principales toujours accessibles." />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-24 text-center">
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Prêt à sortir du chaos administratif ?</h2>
        <p className="mt-4 text-slate-600 text-lg">Lancez votre club en 5 minutes. Essai gratuit 30 jours, sans engagement.</p>
        <Link to="/inscription" data-testid="footer-cta-register">
          <Button className="mt-8 rounded-full h-14 px-10 text-base bg-orange-600 hover:bg-orange-700">Créer mon club maintenant</Button>
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-8 text-center text-sm text-slate-500">
        © 2026 ClubPaper — Fait avec passion pour les clubs amateurs.
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }) {
  return (
    <div className="paper-card p-6 hover:-translate-y-0.5 transition-transform">
      <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-700 grid place-items-center">
        <Icon size={22} strokeWidth={2.5} />
      </div>
      <h3 className="mt-4 font-display font-semibold text-lg text-slate-900">{title}</h3>
      <p className="mt-2 text-slate-600 text-sm leading-relaxed">{desc}</p>
    </div>
  );
}
