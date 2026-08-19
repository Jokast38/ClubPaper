import { useEffect, useState } from "react";
import { Joyride, STATUS } from "react-joyride";
import { useAuth } from "@/lib/AuthContext";

const STEPS = [
  {
    target: "body",
    placement: "center",
    disableBeacon: true,
    content: (
      <div>
        <h3 className="font-display font-bold text-xl text-slate-900">Bienvenue sur ClubPaper 🎉</h3>
        <p className="mt-3 text-slate-600">On va faire un tour rapide (30 secondes) pour te montrer l'essentiel.</p>
      </div>
    ),
  },
  {
    target: '[data-testid="kpi-members"]',
    content: <div><b>Vos indicateurs clés.</b> D'un coup d'œil : nombre d'adhérents, encaissé, en attente et créneaux à venir.</div>,
  },
  {
    target: '[data-testid="dashboard-payment-progress"]',
    content: <div><b>Progression des cotisations.</b> Le trésorier voit qui a payé, qui doit relancer. Code couleur simple.</div>,
  },
  {
    target: '[data-testid="dashboard-add-member-btn"]',
    content: <div><b>Ajoutez vos adhérents.</b> Manuellement ou en important votre fichier Excel/CSV existant.</div>,
  },
  {
    target: '[data-testid="dashboard-remind-btn"]',
    content: <div><b>Relancez en 1 clic.</b> Emails automatiques J+7 / J+15 / J+30 pour les cotisations impayées.</div>,
  },
  {
    target: '[data-testid="dashboard-public-page-card"], [data-testid="dashboard-public-url"]',
    content: <div><b>Votre page publique.</b> Générée automatiquement aux couleurs de votre club. À partager sur vos réseaux !</div>,
  },
  {
    target: '[data-testid="sidebar-nav-adhérents"], [data-testid="tab-adhérents"]',
    content: <div><b>Menu principal.</b> Adhérents, cotisations, planning, annonces, blog. Tout est à portée de clic.</div>,
  },
  {
    target: "body",
    placement: "center",
    content: (
      <div>
        <h3 className="font-display font-bold text-xl text-slate-900">Prêt !</h3>
        <p className="mt-3 text-slate-600">Vous pouvez retrouver ce tour + la FAQ dans <b>Aide</b> à tout moment.</p>
      </div>
    ),
  },
];

const STORAGE_KEY = "cm_tour_seen_v1";

export default function OnboardingTour() {
  const { user } = useAuth() || {};
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Auto-start once per user, only on /app
    if (window.location.pathname !== "/app") return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => setRun(true), 900);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    const handler = () => setRun(true);
    window.addEventListener("cm:start-tour", handler);
    return () => window.removeEventListener("cm:start-tour", handler);
  }, []);

  const onCallback = (data) => {
    const finished = [STATUS.FINISHED, STATUS.SKIPPED].includes(data.status);
    if (finished) {
      localStorage.setItem(STORAGE_KEY, "1");
      setRun(false);
    }
  };

  if (!run) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableScrolling={false}
      callback={onCallback}
      locale={{ back: "Retour", close: "Fermer", last: "Terminer", next: "Suivant", skip: "Passer" }}
      styles={{
        options: {
          primaryColor: "var(--club-primary)",
          zIndex: 10000,
          textColor: "#0f172a",
          arrowColor: "#ffffff",
        },
        buttonNext: { borderRadius: 999, padding: "8px 18px", fontWeight: 600 },
        buttonBack: { color: "#475569" },
        buttonSkip: { color: "#94a3b8" },
        tooltip: { borderRadius: 16, padding: 20 },
      }}
    />
  );
}

export function startTour() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event("cm:start-tour"));
}
