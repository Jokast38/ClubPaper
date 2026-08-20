import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { HardDrive, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { GoogleDriveIcon } from "@/components/GoogleIcons";

export default function DrivePanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/drive/status");
      setStatus(data);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("drive_connected") === "1") {
      toast.success("Google Drive connecté ✅");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/drive/connect");
      window.location.href = data.authorization_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible de démarrer la connexion");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Déconnecter Google Drive ?")) return;
    setBusy(true);
    try {
      await api.post("/drive/disconnect");
      toast.success("Drive déconnecté");
      load();
    } finally { setBusy(false); }
  };

  if (!status) return null;

  return (
    <div className="paper-card p-6" data-testid="drive-panel">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center bg-white border border-slate-200 shrink-0"><GoogleDriveIcon size={24} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-semibold text-lg text-slate-900">Google Drive</h3>
            {status.club_connected ? (
              <span className="pill-tag status-paid"><CheckCircle2 size={12} className="inline mr-1" />Connecté</span>
            ) : status.platform_configured ? (
              <span className="pill-tag status-pending">Non connecté</span>
            ) : (
              <span className="pill-tag status-overdue"><XCircle size={12} className="inline mr-1" />Non configuré (clés OAuth manquantes)</span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Importez les certificats médicaux, licences et autres documents depuis votre Drive. Exportez automatiquement les reçus PDF vers un dossier "ClubPaper - {"{"}Votre club{"}"}".
          </p>
          {status.club_connected && status.connected_email && (
            <div className="text-xs text-slate-500 mt-2">Compte connecté : <b>{status.connected_email}</b></div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!status.club_connected && status.platform_configured && (
          <Button onClick={connect} disabled={busy} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="drive-connect-btn">
            <HardDrive size={16} className="mr-2" />{busy ? "Redirection…" : "Connecter mon Google Drive"}
          </Button>
        )}
        {status.club_connected && (
          <>
            <a href="https://drive.google.com" target="_blank" rel="noreferrer">
              <Button variant="outline" className="rounded-full h-11" data-testid="drive-open-btn"><ExternalLink size={16} className="mr-2" />Ouvrir Drive</Button>
            </a>
            <Button variant="outline" onClick={disconnect} disabled={busy} className="rounded-full h-11 text-red-600 hover:text-red-700" data-testid="drive-disconnect-btn">
              Déconnecter
            </Button>
          </>
        )}
        {!status.platform_configured && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            L'administrateur de la plateforme doit ajouter les clés <code>GOOGLE_CLIENT_ID</code> et <code>GOOGLE_CLIENT_SECRET</code> dans <code>/app/backend/.env</code> pour activer Google Drive.
          </div>
        )}
      </div>
    </div>
  );
}
