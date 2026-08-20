import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Joyride, STATUS, EVENTS, ACTIONS } from "react-joyride";
import { useAuth } from "@/lib/AuthContext";
import { api } from "@/lib/api";

const STEPS = [
  {
    route: "/app",
    target: "body",
    placement: "center",
    skipBeacon: true,
    content: (
      <div>
        <h3 className="font-display font-bold text-xl text-slate-900">Bienvenue sur ClubPaper 🎉</h3>
        <p className="mt-3 text-slate-600">On va faire le tour complet de l'application (2 minutes) : tableau de bord, adhérents, cotisations, planning, annonces et paramètres.</p>
      </div>
    ),
  },
  { route: "/app", target: '[data-testid="kpi-members"]', content: <div><b>Vos indicateurs clés.</b> D'un coup d'œil : nombre d'adhérents, encaissé, en attente et créneaux à venir.</div> },
  { route: "/app", target: '[data-testid="dashboard-payment-progress"]', content: <div><b>Progression des cotisations.</b> Le trésorier voit qui a payé, qui doit relancer. Code couleur simple.</div> },
  { route: "/app", target: '[data-testid="dashboard-public-page-card"]', content: <div><b>Votre page publique.</b> Générée automatiquement aux couleurs de votre club. À partager sur vos réseaux !</div> },

  { route: "/app/adherents", target: '[data-testid="members-add-btn"]', content: <div><b>Ajoutez vos adhérents.</b> Manuellement, ou en important votre fichier Excel/CSV existant via le bouton juste à côté.</div> },
  { route: "/app/adherents", target: '[data-testid="members-search"]', content: <div><b>Recherche instantanée.</b> Tapez un nom, un email : les suggestions arrivent directement depuis votre base d'adhérents.</div> },

  { route: "/app/cotisations", target: '[data-testid="fees-generate-btn"]', content: <div><b>Générer les cotisations.</b> Une ligne est créée pour chaque adhérent, avec le montant par défaut du club.</div> },
  { route: "/app/cotisations", target: '[data-testid="fees-remind-all-btn"]', content: <div><b>Relancez en 1 clic.</b> Emails automatiques J+7 / J+15 / J+30 pour toutes les cotisations impayées.</div> },

  { route: "/app/planning", target: '[data-testid="calendar-add-btn"]', content: <div><b>Créez un créneau.</b> Entraînement ou match : les adhérents concernés sont notifiés automatiquement par email/SMS.</div> },

  { route: "/app/annonces", target: '[data-testid="announcement-new-btn"]', content: <div><b>Publiez une annonce.</b> À tout le club ou à une seule équipe, avec envoi par email en option.</div> },

  { route: "/app/parametres", target: '[data-testid="settings-name"]', content: <div><b>Personnalisez votre club.</b> Logo, couleurs, signature du bureau, images de la page publique — tout se configure ici.</div> },
  { route: "/app/parametres", target: '[data-testid="drive-panel"]', content: <div><b>Connectez Google Drive et Google Agenda.</b> Import de documents, export des reçus et synchronisation du planning.</div> },

  {
    route: "/app/parametres",
    target: "body",
    placement: "center",
    content: (
      <div>
        <h3 className="font-display font-bold text-xl text-slate-900">C'est tout bon ! 🚀</h3>
        <p className="mt-3 text-slate-600">
          Vous pouvez retrouver ce tour à tout moment depuis <b>Aide</b>, et l'activer/désactiver au démarrage automatique dans cette même page.
        </p>
      </div>
    ),
  },
];

export default function OnboardingTour() {
  const { user, refresh } = useAuth() || {};
  const location = useLocation();
  const navigate = useNavigate();
  const [run, setRun] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  // Auto-start once per account (persisted server-side), only on the first /app visit.
  useEffect(() => {
    if (!user) return;
    if (location.pathname !== "/app") return;
    if (user.tour_enabled === false) return;
    if (user.tour_seen) return;
    const t = setTimeout(() => {
      setStepIndex(0);
      setRun(true);
      // Mark as seen the moment it actually starts — avoids it reappearing on
      // reconnection just because the user closed it via the X instead of finishing it.
      api.post("/auth/tour-seen").then(() => refresh?.()).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Manual restart trigger (the "Relancer le tour guidé" button on the Aide page).
  useEffect(() => {
    const handler = () => { setStepIndex(0); setRun(true); };
    window.addEventListener("cm:start-tour", handler);
    return () => window.removeEventListener("cm:start-tour", handler);
  }, []);

  // Whenever the active step belongs to a different page, follow it there.
  // Joyride stays mounted (run never toggles off mid-tour) and retries locating
  // the target itself once the new page renders — this is the pattern the
  // library expects for controlled multi-page tours.
  useEffect(() => {
    if (!run) return;
    const step = STEPS[stepIndex];
    if (step?.route && step.route !== location.pathname) {
      navigate(step.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, stepIndex]);

  const onEvent = (data) => {
    const { status, type, index, action } = data;
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRun(false);
      setStepIndex(0);
      return;
    }
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      onEvent={onEvent}
      locale={{ back: "Retour", close: "Fermer", last: "Terminer", next: "Suivant", skip: "Passer" }}
      options={{
        primaryColor: "var(--club-primary)",
        zIndex: 10000,
        textColor: "#0f172a",
        arrowColor: "#ffffff",
        showProgress: true,
        buttons: ["back", "close", "primary", "skip"],
      }}
      styles={{
        buttonPrimary: { borderRadius: 999, padding: "8px 18px", fontWeight: 600 },
        buttonBack: { color: "#475569" },
        buttonSkip: { color: "#94a3b8" },
        tooltip: { borderRadius: 16, padding: 20 },
      }}
    />
  );
}

export function startTour() {
  window.dispatchEvent(new Event("cm:start-tour"));
}
