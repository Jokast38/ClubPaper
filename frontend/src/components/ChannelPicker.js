import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Mail, MessageSquare, Send } from "lucide-react";

export const CHANNEL_META = {
  email: { label: "Email", icon: Mail, off: "" },
  sms: { label: "SMS", icon: MessageSquare, off: "SMS non disponible avec votre plan (voir Paramètres → SMS)" },
  telegram: { label: "Telegram", icon: Send, off: "Ajoutez le groupe Telegram des adhérents dans Paramètres → Intégrations" },
};

/** Charge les canaux disponibles et les défauts du club pour un type de message. */
export function useChannels(kind) {
  const [view, setView] = useState(null);
  const [value, setValue] = useState([]);
  useEffect(() => {
    api.get("/notification-channels").then(({ data }) => {
      setView(data);
      setValue((data.kinds[kind]?.selected || []).filter((c) => data.available[c]));
    }).catch(() => {});
  }, [kind]);
  return { view, value, setValue, allowed: view?.kinds[kind]?.allowed || [], available: view?.available || {} };
}

/** Boutons à bascule Email / SMS / Telegram. */
export default function ChannelPicker({ value, onChange, allowed, available, testId = "channel-picker" }) {
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {allowed.map((c) => {
        const meta = CHANNEL_META[c];
        const on = value.includes(c);
        const ok = available[c];
        return (
          <button
            key={c}
            type="button"
            disabled={!ok}
            title={ok ? "" : meta.off}
            onClick={() => toggle(c)}
            data-testid={`${testId}-${c}`}
            className={`flex items-center gap-2 px-3.5 h-10 rounded-full border-2 text-sm font-medium transition ${
              !ok ? "border-slate-100 text-slate-300 cursor-not-allowed"
                : on ? "text-white" : "border-slate-200 text-slate-600 hover:border-slate-300"
            }`}
            style={on && ok ? { background: "var(--club-primary)", borderColor: "var(--club-primary)" } : undefined}
          >
            <meta.icon size={15} />{meta.label}
          </button>
        );
      })}
    </div>
  );
}
