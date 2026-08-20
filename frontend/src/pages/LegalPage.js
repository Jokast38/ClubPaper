import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const DOCS = {
  mentions: {
    title: "Mentions légales",
    sections: [
      {
        h: "Éditeur du site",
        body: `ClubPaper est édité par [Nom de la société / auto-entrepreneur], [forme juridique], au capital de [montant] €,
immatriculée au RCS de [ville] sous le numéro [SIREN/SIRET], dont le siège social est situé [adresse complète].
Numéro de TVA intracommunautaire : [numéro].
Directeur de la publication : [nom].
Contact : [email de contact].`,
      },
      { h: "Hébergement", body: `Le site est hébergé par [nom de l'hébergeur, ex. Render / Vercel], [adresse de l'hébergeur].` },
      { h: "Propriété intellectuelle", body: `L'ensemble des contenus présents sur ce site (textes, logos, éléments graphiques) est la propriété de ClubPaper, sauf mention contraire, et ne peut être reproduit sans autorisation préalable.` },
    ],
  },
  cgu: {
    title: "Conditions Générales d'Utilisation et de Vente",
    sections: [
      { h: "1. Objet", body: `Les présentes conditions générales régissent l'utilisation du service ClubPaper, une application de gestion de club sportif (adhérents, cotisations, planning, communication).` },
      { h: "2. Accès au service", body: `L'accès au service est réservé aux clubs et associations. Un essai gratuit de 30 jours est proposé sans engagement ni carte bancaire. À l'issue de l'essai, l'accès complet nécessite un abonnement payant tel que présenté sur la page Tarifs.` },
      { h: "3. Compte utilisateur", body: `L'utilisateur est responsable de la confidentialité de ses identifiants de connexion et de toute activité réalisée depuis son compte.` },
      { h: "4. Résiliation", body: `L'abonnement peut être résilié à tout moment depuis les Paramètres du compte. La résiliation prend effet à la fin de la période en cours, sans remboursement au prorata sauf disposition légale contraire.` },
      { h: "5. Disponibilité et responsabilité", body: `ClubPaper met en œuvre les moyens raisonnables pour assurer la disponibilité du service, sans garantie de continuité absolue. ClubPaper ne saurait être tenu responsable des dommages indirects résultant de l'utilisation du service.` },
      { h: "6. Droit applicable", body: `Les présentes CGU/CGV sont soumises au droit français. Tout litige relève des tribunaux compétents du ressort du siège social de l'éditeur.` },
    ],
  },
  confidentialite: {
    title: "Politique de confidentialité",
    sections: [
      {
        h: "Responsable du traitement",
        body: `Le responsable du traitement des données personnelles collectées sur ClubPaper est [Nom de la société], joignable à [email de contact], conformément au Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi Informatique et Libertés, sous le contrôle de la CNIL.`,
      },
      {
        h: "Données collectées",
        body: `Selon votre usage du service, nous collectons : les données de compte (nom, email), les données du club (nom, adresse, logo), et les données des adhérents que vous saisissez vous-même (nom, email, téléphone, date de naissance, statut de licence, certificat médical). En tant que club/association, vous êtes responsable de traitement pour les données de vos adhérents ; ClubPaper agit alors en tant que sous-traitant au sens du RGPD.`,
      },
      {
        h: "Finalités",
        body: `Ces données sont utilisées pour : la fourniture du service (gestion des adhérents, cotisations, planning), l'envoi de communications liées au club (annonces, relances de cotisation), et l'amélioration du service. Aucune donnée n'est vendue à des tiers.`,
      },
      {
        h: "Base légale",
        body: `Le traitement repose sur l'exécution du contrat (fourniture du service), l'intérêt légitime (amélioration, sécurité) et, le cas échéant, le consentement (ex. connexion Google, intégrations optionnelles Drive/Agenda).`,
      },
      {
        h: "Sous-traitants et intégrations tierces",
        body: `Selon les intégrations activées par le club, des données peuvent être transmises à : Stripe (paiement), Resend (email), Twilio (SMS), Google (Drive, Agenda, connexion) — chacun sous sa propre politique de confidentialité et dans la limite des autorisations accordées par le club.`,
      },
      {
        h: "Durée de conservation",
        body: `Les données sont conservées pendant la durée d'utilisation du service, puis supprimées ou anonymisées dans un délai raisonnable après la clôture du compte, sauf obligation légale de conservation plus longue.`,
      },
      {
        h: "Vos droits",
        body: `Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de vos données. Pour l'exercer, contactez [email de contact]. Vous pouvez également introduire une réclamation auprès de la CNIL (www.cnil.fr).`,
      },
      {
        h: "Cookies",
        body: `ClubPaper utilise uniquement des cookies strictement nécessaires au fonctionnement du service (session de connexion). Aucun cookie publicitaire ou de tracking tiers n'est déposé sans consentement préalable.`,
      },
    ],
  },
};

export default function LegalPage() {
  const { doc } = useParams();
  const data = DOCS[doc] || DOCS.mentions;

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-12">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800" data-testid="legal-back-link">
          <ArrowLeft size={16} />Retour à l'accueil
        </Link>
        <h1 className="mt-6 font-display font-bold text-3xl text-slate-900">{data.title}</h1>
        <div className="mt-8 space-y-8">
          {data.sections.map((s) => (
            <section key={s.h}>
              <h2 className="font-display font-semibold text-lg text-slate-900">{s.h}</h2>
              <p className="mt-2 text-slate-600 leading-relaxed whitespace-pre-line">{s.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-12 text-xs text-slate-400">
          Document type à adapter avec les informations réelles de votre structure avant mise en production.
        </p>
      </div>
    </div>
  );
}
