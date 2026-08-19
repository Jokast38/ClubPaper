import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, Plus, MapPin, Users, Edit3, Trash2 } from "lucide-react";
import { toast } from "sonner";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";

export default function CalendarPage() {
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await api.get("/sessions");
    setSessions(data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing({ kind: "training" }); setOpen(true); };
  const openEdit = (s) => { setEditing(s); setOpen(true); };
  const remove = async (id) => {
    if (!window.confirm("Supprimer ce créneau ? Les membres seront prévenus.")) return;
    await api.delete(`/sessions/${id}`);
    toast.success("Créneau supprimé");
    load();
  };

  const now = new Date();
  const grouped = sessions.reduce((acc, s) => {
    const d = new Date(s.start_at);
    const isPast = d < now;
    const key = isPast ? "past" : "upcoming";
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});
  const upcoming = (grouped.upcoming || []).sort((a,b) => new Date(a.start_at) - new Date(b.start_at));
  const past = (grouped.past || []).sort((a,b) => new Date(b.start_at) - new Date(a.start_at)).slice(0, 10);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Planning</h1>
          <p className="mt-1 text-slate-600">Entraînements et matchs de la saison</p>
        </div>
        <Button onClick={openNew} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="calendar-add-btn">
          <Plus size={18} className="mr-2" />Créer un créneau
        </Button>
      </div>

      {sessions.length === 0 ? (
        <EmptyCalendar onAdd={openNew} />
      ) : (
        <div className="mt-6 space-y-8">
          <Section title="À venir" testId="calendar-upcoming">
            {upcoming.length === 0 ? <p className="text-slate-500 text-sm">Aucun créneau à venir.</p> : (
              <ul className="space-y-3 stagger">
                {upcoming.map((s) => <SessionCard key={s.id} s={s} onEdit={openEdit} onDelete={remove} />)}
              </ul>
            )}
          </Section>
          {past.length > 0 && (
            <Section title="Historique" testId="calendar-past">
              <ul className="space-y-3 stagger opacity-70">
                {past.map((s) => <SessionCard key={s.id} s={s} onEdit={openEdit} onDelete={remove} />)}
              </ul>
            </Section>
          )}
        </div>
      )}

      <SessionDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function Section({ title, children, testId }) {
  return (
    <section data-testid={testId}>
      <h2 className="font-display font-semibold text-xl text-slate-900 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function SessionCard({ s, onEdit, onDelete }) {
  const d = new Date(s.start_at);
  const end = new Date(s.end_at);
  return (
    <li className="paper-card p-4 flex items-start gap-4" data-testid={`session-${s.id}`}>
      <div className="w-14 h-14 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}>
        <div className="text-center">
          <div className="text-[10px] uppercase font-bold opacity-90">{d.toLocaleDateString("fr-FR", { month: "short" })}</div>
          <div className="text-lg font-display font-bold leading-none">{d.getDate()}</div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-medium text-slate-900 truncate">{s.title}</div>
          <span className="pill-tag" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{s.kind === "match" ? "Match" : "Entraînement"}</span>
        </div>
        <div className="text-sm text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
          <span>{d.toLocaleString("fr-FR", { weekday: "long", hour: "2-digit", minute: "2-digit" })} → {end.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          {s.place && <span className="flex items-center gap-1"><MapPin size={12} />{s.place}</span>}
          {s.team && <span className="flex items-center gap-1"><Users size={12} />{s.team}</span>}
        </div>
        {s.notes && <p className="mt-2 text-sm text-slate-600">{s.notes}</p>}
      </div>
      <div className="flex gap-1 shrink-0">
        <Button size="sm" variant="ghost" onClick={() => onEdit(s)} data-testid={`session-edit-${s.id}`}><Edit3 size={16} /></Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(s.id)} className="text-red-600" data-testid={`session-delete-${s.id}`}><Trash2 size={16} /></Button>
      </div>
    </li>
  );
}

function EmptyCalendar({ onAdd }) {
  return (
    <div className="mt-10 paper-card p-10 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><CalendarDays size={28} strokeWidth={2.5} /></div>
      <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Aucun créneau pour l'instant</h3>
      <p className="mt-2 text-slate-600">Créez un entraînement ou un match, vos membres seront prévenus automatiquement.</p>
      <Button onClick={onAdd} className="mt-6 rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="empty-add-session">
        <Plus size={18} className="mr-2" />Créer un créneau
      </Button>
    </div>
  );
}

function SessionDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({});
  useEffect(() => {
    setForm(editing ? {
      ...editing,
      start_at: toLocalInput(editing.start_at),
      end_at: toLocalInput(editing.end_at),
    } : { kind: "training" });
  }, [editing, open]);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  const save = async () => {
    if (!form.title || !form.start_at || !form.end_at) {
      toast.error("Merci de remplir titre + horaires");
      return;
    }
    const payload = {
      ...form,
      start_at: new Date(form.start_at).toISOString(),
      end_at: new Date(form.end_at).toISOString(),
    };
    try {
      if (editing?.id) {
        await api.put(`/sessions/${editing.id}`, payload);
        toast.success("Créneau mis à jour");
      } else {
        await api.post("/sessions", payload);
        toast.success("Créneau créé");
      }
      onSaved();
    } catch { toast.error("Impossible d'enregistrer"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-lg"
        data-testid="session-dialog"
        onInteractOutside={(e) => {
          if (e.target.closest?.(".pac-container")) e.preventDefault();
        }}
      >
        <DialogHeader><DialogTitle>{editing?.id ? "Modifier le créneau" : "Nouveau créneau"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Titre *</Label><Input value={form.title || ""} onChange={upd("title")} data-testid="session-title" className="mt-1 h-11" placeholder="Ex. Entraînement U11" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Début *</Label><Input type="datetime-local" value={form.start_at || ""} onChange={upd("start_at")} data-testid="session-start" className="mt-1 h-11" /></div>
            <div><Label>Fin *</Label><Input type="datetime-local" value={form.end_at || ""} onChange={upd("end_at")} data-testid="session-end" className="mt-1 h-11" /></div>
          </div>
          <div>
            <Label>Lieu</Label>
            <PlaceAutocompleteInput
              value={form.place}
              onChange={(v) => setForm({ ...form, place: v })}
              placeholder="Ex. Gymnase municipal"
              testId="session-place"
              className="mt-1 h-11"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Équipe</Label><Input value={form.team || ""} onChange={upd("team")} data-testid="session-team" className="mt-1 h-11" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.kind || "training"} onValueChange={(v) => setForm({...form, kind: v})}>
                <SelectTrigger className="mt-1 h-11" data-testid="session-kind"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="training">Entraînement</SelectItem>
                  <SelectItem value="match">Match</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Note</Label><Textarea rows={2} value={form.notes || ""} onChange={upd("notes")} data-testid="session-notes" className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button onClick={save} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="session-save-btn">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toLocalInput(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch { return ""; }
}
