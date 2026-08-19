import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarClock, Save } from "lucide-react";
import { toast } from "sonner";

export default function SeasonSettingsPanel() {
  const [form, setForm] = useState({ end_date: "", renewal_open_date: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/season-settings");
    setForm({
      end_date: data?.end_date?.slice(0, 10) || "",
      renewal_open_date: data?.renewal_open_date?.slice(0, 10) || "",
    });
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/season-settings", form);
      toast.success("Dates de saison enregistrées");
      // Reset flags so reminders can send again with new dates
      await api.put("/season-settings", { ...form, sent_end_reminder: false, sent_renewal_reminder: false });
    } catch { toast.error("Impossible d'enregistrer"); }
    finally { setBusy(false); }
  };

  return (
    <div className="paper-card p-6">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><CalendarClock size={22} strokeWidth={2.5} /></div>
        <div>
          <h3 className="font-display font-semibold text-lg text-slate-900">Rappels de saison</h3>
          <p className="text-sm text-slate-600">Un email est envoyé à tous vos adhérents 30 jours avant chaque date clé.</p>
        </div>
      </div>

      <div className="mt-6 grid sm:grid-cols-2 gap-4">
        <div>
          <Label>Fin de saison</Label>
          <Input type="date" value={form.end_date} onChange={(e) => setForm({...form, end_date: e.target.value})} className="mt-1 h-11" data-testid="season-end-date" />
          <div className="text-xs text-slate-500 mt-1">Un email "fin de saison approche" partira 30 jours avant cette date.</div>
        </div>
        <div>
          <Label>Ouverture des renouvellements</Label>
          <Input type="date" value={form.renewal_open_date} onChange={(e) => setForm({...form, renewal_open_date: e.target.value})} className="mt-1 h-11" data-testid="season-renewal-date" />
          <div className="text-xs text-slate-500 mt-1">Un email "renouvelez votre licence" partira 30 jours avant.</div>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={busy} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="season-save-btn">
          <Save size={16} className="mr-2" />Enregistrer
        </Button>
      </div>
    </div>
  );
}
