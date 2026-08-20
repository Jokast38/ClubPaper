import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CalendarDays, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { GoogleCalendarIcon } from "@/components/GoogleIcons";

export default function CalendarSyncPanel() {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/calendar/status");
      setStatus(data);
    } catch { /* ignore */ }
  };
  useEffect(() => {
    load();
    if (new URLSearchParams(window.location.search).get("calendar_connected") === "1") {
      toast.success("Google Agenda connecté ✅");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/calendar/connect");
      window.location.href = data.authorization_url;
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible de démarrer la connexion");
      setBusy(false);
    }
  };

  const resync = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/calendar/resync");
      toast.success(`${data.synced}/${data.total} créneau(x) à venir synchronisé(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible de resynchroniser");
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!window.confirm("Déconnecter Google Agenda ?")) return;
    setBusy(true);
    try {
      await api.post("/calendar/disconnect");
      toast.success("Agenda déconnecté");
      load();
    } finally { setBusy(false); }
  };

  if (!status) return null;

  return (
    <div className="paper-card p-6" data-testid="calendar-sync-panel">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center bg-white border border-slate-200 shrink-0"><GoogleCalendarIcon size={24} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display font-semibold text-lg text-slate-900">Google Agenda</h3>
            {status.club_connected ? (
              <span className="pill-tag status-paid"><CheckCircle2 size={12} className="inline mr-1" />Connecté</span>
            ) : status.platform_configured ? (
              <span className="pill-tag status-pending">Non connecté</span>
            ) : (
              <span className="pill-tag status-overdue"><XCircle size={12} className="inline mr-1" />Non configuré (clés OAuth manquantes)</span>
            )}
          </div>
          <p className="text-sm text-slate-600 mt-1">
            Synchronise automatiquement les créneaux (entraînements, matchs) du Planning vers votre agenda Google — création, modification et suppression.
          </p>
          {status.club_connected && status.connected_email && (
            <div className="text-xs text-slate-500 mt-2">Compte connecté : <b>{status.connected_email}</b></div>
          )}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {!status.club_connected && status.platform_configured && (
          <Button onClick={connect} disabled={busy} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="calendar-connect-btn">
            <CalendarDays size={16} className="mr-2" />{busy ? "Redirection…" : "Connecter mon Google Agenda"}
          </Button>
        )}
        {status.club_connected && (
          <>
            <Button variant="outline" onClick={resync} disabled={busy} className="rounded-full h-11" data-testid="calendar-resync-btn">
              <RefreshCw size={16} className="mr-2" />Resynchroniser le planning
            </Button>
            <Button variant="outline" onClick={disconnect} disabled={busy} className="rounded-full h-11 text-red-600 hover:text-red-700" data-testid="calendar-disconnect-btn">
              Déconnecter
            </Button>
          </>
        )}
        {!status.platform_configured && (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            L'administrateur de la plateforme doit ajouter les clés <code>GOOGLE_CLIENT_ID</code> et <code>GOOGLE_CLIENT_SECRET</code> dans <code>/backend/.env</code> pour activer la synchronisation.
          </div>
        )}
      </div>
    </div>
  );
}
