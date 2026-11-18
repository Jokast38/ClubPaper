import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Radio } from "lucide-react";
import { toast } from "sonner";
import ChannelPicker, { CHANNEL_META } from "@/components/ChannelPicker";

const HINTS = {
  announcement: "Publication d'une annonce (modifiable à chaque annonce).",
  fee_request: "Envoi du lien de paiement quand vous générez les cotisations de la saison.",
  fee_reminder: "Relances des cotisations impayées (manuelles et automatiques J+7 / J+15 / J+30).",
  session_change: "Création, modification ou annulation d'un créneau.",
  season: "Fin de saison et ouverture des réinscriptions.",
};

export default function NotificationChannelsPanel() {
  const [view, setView] = useState(null);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/notification-channels").then(({ data }) => {
      setView(data);
      setDraft(Object.fromEntries(Object.entries(data.kinds).map(([k, v]) => [k, v.selected])));
    }).catch(() => {});
  }, []);
  if (!view) return null;

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/notification-channels", draft);
      setView(data);
      toast.success("Canaux d'envoi enregistrés");
    } catch { toast.error("Impossible d'enregistrer"); }
    finally { setBusy(false); }
  };

  const missing = Object.entries(view.available).filter(([, ok]) => !ok).map(([c]) => CHANNEL_META[c]);

  return (
    <div className="paper-card p-6" data-testid="notification-channels-panel">
      <div className="flex items-start gap-4">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{ background: "var(--club-primary)" }}><Radio size={22} strokeWidth={2.5} /></div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-semibold text-lg text-slate-900">Canaux d'envoi</h3>
          <p className="text-sm text-slate-600 mt-1">Choisissez comment vos adhérents sont prévenus pour chaque type de message.</p>
          {missing.length > 0 && (
            <ul className="mt-2 text-xs text-slate-500 list-disc pl-4">{missing.map((m) => <li key={m.label}>{m.off}</li>)}</ul>
          )}

          <div className="mt-5 divide-y divide-slate-100">
            {Object.entries(view.kinds).map(([kind, k]) => (
              <div key={kind} className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-[200px] flex-1">
                  <div className="font-medium text-slate-900">{k.label}</div>
                  <div className="text-xs text-slate-500">{HINTS[kind]}</div>
                </div>
                <ChannelPicker value={draft[kind] || []} onChange={(v) => setDraft({ ...draft, [kind]: v })} allowed={k.allowed} available={view.available} testId={`channels-${kind}`} />
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-500">Telegram publie un seul message dans le groupe des adhérents (pas de message individuel). Les relances et demandes de cotisation sont personnelles : email ou SMS uniquement.</p>

          <div className="mt-4 flex justify-end">
            <Button onClick={save} disabled={busy} className="rounded-full h-11 px-6" style={{ background: "var(--club-primary)" }} data-testid="channels-save-btn">
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
