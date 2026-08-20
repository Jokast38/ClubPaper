import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { CheckCircle2, Zap, ShieldCheck, Users, Wallet, CalendarDays, Sparkles, Clock, HeartHandshake, TrendingUp, Wallet as WalletIcon } from "lucide-react";

const FAQ_ITEMS = [
  { q: "Est-ce vraiment gratuit pendant 1 mois ?", a: "Oui. Vous créez votre club et accédez à toutes les fonctionnalités pendant 30 jours, sans carte bancaire à renseigner. Vous ne payez que si vous décidez de continuer." },
  { q: "Mes données sont-elles hébergées en conformité avec le RGPD ?", a: "Oui, ClubPaper respecte le Règlement Général sur la Protection des Données (RGPD) et les recommandations de la CNIL. Vous restez propriétaire des données de vos adhérents et pouvez les exporter ou les supprimer à tout moment. Voir notre Politique de confidentialité en bas de page." },
  { q: "Faut-il des compétences techniques pour l'utiliser ?", a: "Aucune. ClubPaper est pensé pour des bénévoles, pas des informaticiens. La prise en main se fait en quelques minutes, avec un tutoriel intégré à la première connexion." },
  { q: "Puis-je importer ma liste d'adhérents existante ?", a: "Oui, via un fichier Excel ou CSV, en quelques clics depuis la page Adhérents." },
  { q: "Puis-je résilier à tout moment ?", a: "Oui, sans engagement ni frais cachés, directement depuis les Paramètres du compte." },
  { q: "Mes adhérents peuvent-ils payer leur cotisation en ligne ?", a: "Oui, via un lien de paiement sécurisé Stripe envoyé automatiquement, avec relances programmées en cas de retard." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white stadium-grain">
      {/* Announcement bar */}
      <div className="bg-slate-900 text-white text-center text-sm py-2 px-4">
        🎉 <b>1 mois gratuit</b> pour tous les nouveaux clubs — sans carte bancaire, sans engagement.
      </div>

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
                Créer mon club — 1 mois gratuit
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

      {/* Benefits */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Ce que ça change concrètement pour votre club.</h2>
          <p className="mt-4 text-slate-600 text-lg">Pas juste des fonctionnalités : du temps et de la sérénité retrouvés pour le bureau.</p>
        </div>
        <div className="mt-14 grid md:grid-cols-2 lg:grid-cols-4 gap-6 stagger">
          <BenefitCard icon={Clock} title="Des heures gagnées" desc="Plus de tableurs à jour manuellement ni de relances une par une. Ce qui prenait une soirée prend 10 minutes." />
          <BenefitCard icon={TrendingUp} title="Moins d'impayés" desc="Relances automatiques par email : les cotisations en retard baissent sans que le trésorier ait à y penser." />
          <BenefitCard icon={HeartHandshake} title="Des parents mieux informés" desc="Créneaux, annonces et actualités arrivent directement aux familles, sans groupe WhatsApp qui s'essouffle." />
          <BenefitCard icon={WalletIcon} title="Une image plus pro" desc="Une page publique aux couleurs du club, des reçus et attestations générés automatiquement." />
        </div>
      </section>

      {/* Screenshot / preview */}
      <section className="bg-slate-50 py-24">
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">À quoi ça ressemble ?</h2>
            <p className="mt-4 text-slate-600 text-lg">Un tableau de bord clair, pensé pour être compris en un coup d'œil.</p>
          </div>
          <div className="mt-12 flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-6">
            <img
              src="/screenshots/cp-screenshot-1.png"
              alt="Tableau de bord ClubPaper sur ordinateur"
              className="w-full max-w-3xl rounded-2xl shadow-xl border border-slate-200"
              data-testid="landing-screenshot-desktop"
            />
            <img
              src="/screenshots/cp-ipad-screenshot.png"
              alt="ClubPaper sur tablette"
              className="w-full max-w-[280px] rounded-2xl shadow-xl"
              data-testid="landing-screenshot-tablet"
            />
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="max-w-3xl mx-auto px-4 lg:px-8 py-24">
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900 text-center">Questions fréquentes</h2>
        <Accordion type="single" collapsible className="mt-10">
          {FAQ_ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`faq-${i}`} data-testid={`faq-item-${i}`}>
              <AccordionTrigger className="text-left font-display font-semibold text-slate-900">{item.q}</AccordionTrigger>
              <AccordionContent className="text-slate-600 leading-relaxed">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="max-w-6xl mx-auto px-4 lg:px-8 py-24 text-center">
        <h2 className="font-display text-3xl lg:text-4xl font-bold text-slate-900">Prêt à sortir du chaos administratif ?</h2>
        <p className="mt-4 text-slate-600 text-lg">Lancez votre club en 5 minutes. 1 mois gratuit, sans engagement.</p>
        <Link to="/inscription" data-testid="footer-cta-register">
          <Button className="mt-8 rounded-full h-14 px-10 text-base bg-orange-600 hover:bg-orange-700">Créer mon club maintenant</Button>
        </Link>
      </section>

      <footer className="border-t border-slate-100 py-12 text-sm text-slate-500">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 font-display font-bold text-slate-900">
              <span className="w-7 h-7 rounded-lg bg-orange-600 text-white grid place-items-center text-xs">CP</span>
              ClubPaper
            </div>
            <p className="mt-3 text-slate-500">Le club, sans la paperasse.</p>
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-3">Produit</div>
            <ul className="space-y-2">
              <li><Link to="/tarifs" className="hover:text-slate-800">Tarifs</Link></li>
              <li><a href="#faq" className="hover:text-slate-800">FAQ</a></li>
              <li><Link to="/inscription" className="hover:text-slate-800">Créer mon club</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-3">Légal</div>
            <ul className="space-y-2">
              <li><Link to="/legal/mentions" className="hover:text-slate-800" data-testid="footer-legal-mentions">Mentions légales</Link></li>
              <li><Link to="/legal/cgu" className="hover:text-slate-800" data-testid="footer-legal-cgu">CGU / CGV</Link></li>
              <li><Link to="/legal/confidentialite" className="hover:text-slate-800" data-testid="footer-legal-privacy">Politique de confidentialité (RGPD)</Link></li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-slate-800 mb-3">Conformité</div>
            <p className="text-slate-500 leading-relaxed">
              Données hébergées en conformité avec le RGPD, sous le contrôle de la CNIL. Vous restez propriétaire des données de vos adhérents.
            </p>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-4 lg:px-8 mt-10 pt-6 border-t border-slate-100">
          © 2026 ClubPaper — Fait avec passion pour les clubs amateurs.
        </div>
      </footer>
    </div>
  );
}

function BenefitCard({ icon: Icon, title, desc }) {
  return (
    <div className="p-2">
      <div className="w-11 h-11 rounded-xl bg-slate-900 text-white grid place-items-center">
        <Icon size={20} strokeWidth={2.5} />
      </div>
      <h3 className="mt-4 font-display font-semibold text-base text-slate-900">{title}</h3>
      <p className="mt-2 text-slate-600 text-sm leading-relaxed">{desc}</p>
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
