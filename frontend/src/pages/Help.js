import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Search, Users, Wallet, CalendarDays, Megaphone, HardDrive, Newspaper, Settings as SettingsIcon, PlayCircle, MessageCircle, Mail, ArrowRight } from "lucide-react";
import { startTour } from "@/components/OnboardingTour";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

// Screenshots (captured from the actual app, stored under public/help/)
const SHOT = (name) => `/help/${name}`;

const SECTIONS = [
  {
    id: "getting-started",
    icon: PlayCircle,
    title: "Premiers pas",
    intro: "Créez votre club en 5 minutes et invitez vos adhérents.",
    steps: [
      { title: "Créer votre compte", body: "Depuis la page d'accueil, cliquez sur 'Créer mon club'. Renseignez votre nom, email et mot de passe. Aucune carte bancaire n'est demandée.", shot: "01-register.jpg" },
      { title: "L'assistant en 3 étapes", body: "Nom du club, logo (les couleurs sont extraites automatiquement !), description publique. C'est prêt.", shot: "02-onboarding.jpg" },
      { title: "Découvrir le tableau de bord", body: "Vos indicateurs clés en un coup d'œil. Cliquez sur le bouton ci-dessous pour relancer le tour guidé à tout moment.", shot: "03-dashboard.jpg" },
    ],
  },
  {
    id: "members",
    icon: Users,
    title: "Gérer les adhérents",
    intro: "Ajoutez vos adhérents un par un ou importez votre liste Excel/CSV existante.",
    steps: [
      { title: "Ajouter un adhérent", body: "Menu Adhérents → Ajouter. Renseignez le nom, l'email, l'équipe, le statut de licence et le certificat médical.", shot: "04-members.jpg" },
      { title: "Importer depuis Excel/CSV", body: "Cliquez sur 'Importer CSV / Excel'. En-têtes acceptés : Prénom, Nom, Email, Téléphone, Équipe, Date_naissance.", shot: "05-import.jpg" },
      { title: "Joindre les documents", body: "Icône Documents (📄) sur chaque ligne : uploadez le certificat médical, la licence, etc. Le statut se met à jour automatiquement.", shot: "06-docs.jpg" },
      { title: "Générer un PDF", body: "Icônes Fiche PDF et Attestation licence sur chaque ligne — logo et couleurs du club appliqués automatiquement.", shot: "07-pdf.jpg" },
    ],
  },
  {
    id: "fees",
    icon: Wallet,
    title: "Cotisations & paiements",
    intro: "Générez les cotisations de la saison, encaissez en ligne, relancez automatiquement.",
    steps: [
      { title: "Générer les cotisations", body: "Menu Cotisations → Générer les cotisations. Une ligne est créée pour chaque adhérent avec le montant par défaut du club.", shot: "08-fees.jpg" },
      { title: "Paiement en ligne (Stripe)", body: "Les adhérents payent en 2 clics via le lien envoyé par email. Le reçu PDF est disponible dès que le paiement est confirmé.", shot: "09-pay.jpg" },
      { title: "Relances automatiques", body: "J+7, J+15, J+30 après création : email + SMS (si Twilio activé) envoyés automatiquement chaque matin à 9h.", shot: "10-reminders.jpg" },
    ],
  },
  {
    id: "planning",
    icon: CalendarDays,
    title: "Planning & créneaux",
    intro: "Créez entraînements et matchs, les concernés sont prévenus automatiquement.",
    steps: [
      { title: "Créer un créneau", body: "Menu Planning → Créer un créneau. Titre, horaires, lieu, équipe. Un email + SMS est envoyé à tous les membres concernés.", shot: "11-planning.jpg" },
      { title: "Modifier ou annuler", body: "Les membres reçoivent une notification 'créneau modifié / annulé' dès la modification enregistrée.", shot: "11b-planning-edit.jpg" },
    ],
  },
  {
    id: "communication",
    icon: Megaphone,
    title: "Annonces & communication",
    intro: "Diffusez des annonces à tout le club ou à une équipe précise, avec mise en forme riche.",
    steps: [
      { title: "Publier une annonce", body: "Menu Annonces → Nouvelle annonce. Éditeur riche (gras, listes, titres, liens). Choisissez l'audience (tout le club ou une équipe) et cochez 'Envoyer par email'.", shot: "12-announcements.jpg" },
    ],
  },
  {
    id: "blog",
    icon: Newspaper,
    title: "Blog public (SEO)",
    intro: "Publiez actualités, bilans de saison et infos disciplines sur votre page publique.",
    steps: [
      { title: "Écrire un article", body: "Menu Blog → Écrire un article. Ajoutez une image de couverture (uploadée dans le stockage sécurisé) et rédigez avec l'éditeur riche.", shot: "13-blog.jpg" },
      { title: "Consultable publiquement", body: "Les articles publiés apparaissent sur /c/votre-club-slug. Excellent pour le référencement Google local.", shot: "14-public.jpg" },
    ],
  },
  {
    id: "drive",
    icon: HardDrive,
    title: "Google Drive",
    intro: "Connectez le Drive du club pour importer/exporter les documents en 1 clic.",
    steps: [
      { title: "Connecter votre Drive", body: "Paramètres → Google Drive → Connecter mon Google Drive. Autorisez l'accès via Google. Le compte connecté s'affiche.", shot: "15-drive.jpg" },
      { title: "Ce que ça fait", body: "Import : depuis une fiche adhérent, récupérez un fichier de votre Drive comme document (certif médical, licence…). Export : les reçus PDF sont automatiquement classés dans un dossier 'ClubPaper - Nom de votre club'.", shot: "15b-drive-flow.jpg" },
    ],
  },
  {
    id: "settings",
    icon: SettingsIcon,
    title: "Paramètres & intégrations",
    intro: "Thème, dates de saison, clés Resend/Stripe/Twilio — tout se configure ici.",
    steps: [
      { title: "Personnaliser le thème", body: "Ré-uploadez le logo à tout moment. Les couleurs sont ré-extraites automatiquement. Ajustez manuellement si besoin.", shot: "16-theme.jpg" },
      { title: "Dates clés de la saison", body: "Renseignez la fin de saison et l'ouverture des renouvellements. Un email est envoyé à tous vos adhérents 30 jours avant chaque date.", shot: "17-season.jpg" },
      { title: "Suivi email/SMS", body: "Le panneau 'Envois emails & SMS' montre le taux de succès et l'historique de tous vos envois. Filtrez par canal et statut.", shot: "18-notifications.jpg" },
      { title: "Vos clés d'intégration", body: "Ajoutez vos propres clés Resend (email), Stripe (paiement) et Twilio (SMS). Un bouton de test SMS est fourni pour valider.", shot: "19-integrations.jpg" },
    ],
  },
];

const FAQ = [
  { q: "Combien coûte ClubPaper ?", a: "19€/mois par club, avec 30 jours d'essai gratuit sans carte bancaire. Adhérents illimités." },
  { q: "Mes données restent-elles privées ?", a: "Oui. Chaque club a ses données isolées. Aucune donnée n'est partagée entre clubs." },
  { q: "Puis-je exporter mes données si je pars ?", a: "Oui, tous vos adhérents et cotisations sont exportables au format CSV/Excel. Les reçus PDF restent téléchargeables." },
  { q: "Les SMS partent-ils depuis mon numéro ?", a: "Oui, si vous configurez Twilio dans Paramètres → Intégrations avec votre propre numéro Twilio." },
  { q: "Comment fonctionne l'extraction des couleurs ?", a: "Quand vous uploadez votre logo, ClubPaper analyse l'image (algorithme k-means) et extrait les 3 couleurs dominantes. Vous pouvez les ajuster manuellement." },
  { q: "Que se passe-t-il après l'essai gratuit ?", a: "Vous êtes prévenu par email. Aucun paiement automatique — vous choisissez d'activer l'abonnement quand vous voulez." },
  { q: "Puis-je avoir plusieurs coachs / secrétaires ?", a: "Fonctionnalité prévue prochainement. Aujourd'hui, un compte administrateur par club." },
  { q: "Est-ce compatible mobile ?", a: "Oui — l'app est mobile-first avec une barre d'onglets en bas d'écran. Fonctionne aussi bien sur téléphone que sur ordinateur." },
];

export default function Help() {
  const { user, refresh } = useAuth() || {};
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(SECTIONS[0].id);
  const tourEnabled = user?.tour_enabled !== false;

  const onToggleTour = async (checked) => {
    try {
      await api.post("/auth/tour-toggle", { enabled: checked });
      await refresh?.();
      toast.success(checked ? "Tutoriel automatique activé" : "Tutoriel automatique désactivé");
    } catch {
      toast.error("Impossible de mettre à jour ce réglage");
    }
  };

  const results = useMemo(() => {
    if (!q) return SECTIONS;
    const needle = q.toLowerCase();
    return SECTIONS.map((s) => ({
      ...s,
      steps: s.steps.filter((st) => (st.title + " " + st.body).toLowerCase().includes(needle)),
    })).filter((s) => s.steps.length > 0 || s.title.toLowerCase().includes(needle) || s.intro.toLowerCase().includes(needle));
  }, [q]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl lg:text-4xl text-slate-900">Centre d'aide</h1>
          <p className="mt-1 text-slate-600">Tout ce qu'il faut savoir pour tirer le meilleur de ClubPaper.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 pl-4 pr-1 h-11 rounded-full border border-slate-200 bg-white" data-testid="help-tour-toggle">
            <Label htmlFor="tour-toggle" className="text-sm text-slate-700 cursor-pointer">Tutoriel auto. à la connexion</Label>
            <Switch id="tour-toggle" checked={tourEnabled} onCheckedChange={onToggleTour} />
          </div>
          <Button onClick={startTour} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="help-restart-tour">
            <PlayCircle size={18} className="mr-2" />Relancer le tour guidé
          </Button>
        </div>
      </div>

      <div className="mt-6 relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input placeholder="Rechercher dans l'aide (ex. import, relance, SMS…)" value={q} onChange={(e) => setQ(e.target.value)} className="pl-12 h-12" data-testid="help-search" />
      </div>

      {/* Quick tiles */}
      <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SECTIONS.slice(0, 4).map((s) => (
          <a key={s.id} href={`#${s.id}`} onClick={() => setOpen(s.id)} className="paper-card p-4 flex items-center gap-3 hover:-translate-y-0.5 transition-transform" data-testid={`help-tile-${s.id}`}>
            <div className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><s.icon size={20} strokeWidth={2.5} /></div>
            <div className="min-w-0">
              <div className="font-medium text-slate-900 truncate">{s.title}</div>
              <div className="text-xs text-slate-500 truncate">{s.intro}</div>
            </div>
          </a>
        ))}
      </div>

      {/* Sections accordion */}
      <div className="mt-10 space-y-6">
        {results.map((s) => (
          <section key={s.id} id={s.id} className="paper-card p-6" data-testid={`help-section-${s.id}`}>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><s.icon size={22} strokeWidth={2.5} /></div>
              <div>
                <h2 className="font-display font-semibold text-xl text-slate-900">{s.title}</h2>
                <p className="text-sm text-slate-600 mt-0.5">{s.intro}</p>
              </div>
            </div>
            <div className="mt-6 grid md:grid-cols-2 gap-4">
              {s.steps.map((st, i) => (
                <div key={i} className="border border-slate-100 rounded-2xl overflow-hidden" data-testid={`help-step-${s.id}-${i}`}>
                  <div className="bg-slate-50 h-40 flex items-center justify-center overflow-hidden">
                    <img src={SHOT(st.shot)} alt={st.title}
                         className="w-full h-full object-cover"
                         onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = `<div class='text-xs text-slate-400 p-4 text-center'>📸 Capture bientôt disponible</div>`; }} />
                  </div>
                  <div className="p-4">
                    <div className="text-xs uppercase tracking-wide font-medium mb-1" style={{color:"var(--club-primary)"}}>Étape {i + 1}</div>
                    <div className="font-medium text-slate-900">{st.title}</div>
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">{st.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* FAQ */}
      <section className="mt-12 paper-card p-6" data-testid="help-faq">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-xl grid place-items-center text-white" style={{background:"var(--club-primary)"}}><MessageCircle size={22} strokeWidth={2.5} /></div>
          <h2 className="font-display font-semibold text-xl text-slate-900">Questions fréquentes</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {FAQ.map((f, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left" data-testid={`faq-${i}`}>{f.q}</AccordionTrigger>
              <AccordionContent className="text-slate-600 leading-relaxed">{f.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* Contact */}
      <section className="mt-10 mb-8 paper-card p-6 text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><Mail size={24} strokeWidth={2.5} /></div>
        <h3 className="mt-4 font-display font-semibold text-lg text-slate-900">Vous avez d'autres questions ?</h3>
        <p className="mt-2 text-slate-600">Écrivez-nous, on vous répond dans la journée (jours ouvrés).</p>
        <a href="mailto:jokast2023@gmail.com"><Button className="mt-4 rounded-full" style={{background:"var(--club-primary)"}} data-testid="help-contact-btn">Contacter le support <ArrowRight size={14} className="ml-2" /></Button></a>
      </section>
    </div>
  );
}
