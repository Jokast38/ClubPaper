import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays, List, Plus, MapPin, Users, Edit3, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function CalendarPage() {
  const [sessions, setSessions] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [view, setView] = useState("calendar"); // calendar | list

  const load = async () => {
    const { data } = await api.get("/sessions");
    setSessions(data);
  };
  useEffect(() => { load(); }, []);

  const openNew = (prefill) => { setEditing({ kind: "training", ...(prefill || {}) }); setOpen(true); };
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
        <div className="flex flex-wrap gap-2">
          <div className="flex rounded-full border border-slate-200 p-1 bg-white">
            <button
              onClick={() => setView("calendar")}
              className={`h-9 px-3 rounded-full text-sm font-medium flex items-center gap-1.5 transition ${view === "calendar" ? "text-white" : "text-slate-600"}`}
              style={view === "calendar" ? {background:"var(--club-primary)"} : {}}
              data-testid="calendar-view-grid-btn"
            >
              <CalendarDays size={15} />Calendrier
            </button>
            <button
              onClick={() => setView("list")}
              className={`h-9 px-3 rounded-full text-sm font-medium flex items-center gap-1.5 transition ${view === "list" ? "text-white" : "text-slate-600"}`}
              style={view === "list" ? {background:"var(--club-primary)"} : {}}
              data-testid="calendar-view-list-btn"
            >
              <List size={15} />Liste
            </button>
          </div>
          <Button onClick={() => openNew()} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="calendar-add-btn">
            <Plus size={18} className="mr-2" />Créer un créneau
          </Button>
        </div>
      </div>

      {sessions.length === 0 ? (
        <EmptyCalendar onAdd={() => openNew()} />
      ) : view === "calendar" ? (
        <MonthCalendar sessions={sessions} onEdit={openEdit} onCreateOnDay={openNew} />
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

      <SessionDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} onDelete={remove} />
    </div>
  );
}

function dateKey(d) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function MonthCalendar({ sessions, onEdit, onCreateOnDay }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const today = new Date();

  const byDay = useMemo(() => {
    const map = {};
    for (const s of sessions) {
      const key = dateKey(new Date(s.start_at));
      (map[key] = map[key] || []).push(s);
    }
    for (const key in map) map[key].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    return map;
  }, [sessions]);

  const weeks = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    // Monday-first grid: shift so Monday = 0 ... Sunday = 6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const gridStart = new Date(year, month, 1 - startOffset);

    const days = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      days.push(d);
    }
    const rows = [];
    for (let i = 0; i < 6; i++) rows.push(days.slice(i * 7, i * 7 + 7));
    return rows;
  }, [cursor]);

  const monthLabel = cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  return (
    <div className="mt-6 paper-card p-4 sm:p-6" data-testid="calendar-month-grid">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-semibold text-xl text-slate-900 capitalize">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full h-9 w-9 p-0" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() - 1); return d; })} data-testid="calendar-prev-month">
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="outline" className="rounded-full h-9 px-3" onClick={() => { const d = new Date(); d.setDate(1); setCursor(d); }} data-testid="calendar-today-btn">
            Aujourd'hui
          </Button>
          <Button size="sm" variant="outline" className="rounded-full h-9 w-9 p-0" onClick={() => setCursor((c) => { const d = new Date(c); d.setMonth(d.getMonth() + 1); return d; })} data-testid="calendar-next-month">
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">
        {WEEKDAYS.map((w) => <div key={w} className="py-2">{w}</div>)}
      </div>

      <div className="grid grid-cols-7 gap-px bg-slate-200 rounded-xl overflow-hidden border border-slate-200">
        {weeks.flat().map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = dateKey(d) === dateKey(today);
          const dayEvents = byDay[dateKey(d)] || [];
          const visible = dayEvents.slice(0, 3);
          const extra = dayEvents.length - visible.length;
          return (
            <div
              key={i}
              onClick={() => onCreateOnDay({ start_at: dayDateTimeLocal(d, 17), end_at: dayDateTimeLocal(d, 18) })}
              className={`min-h-[110px] bg-white p-1.5 sm:p-2 cursor-pointer hover:bg-slate-50 transition flex flex-col ${inMonth ? "" : "opacity-40"}`}
              data-testid={`calendar-day-${dateKey(d)}`}
            >
              <div className={`text-xs font-semibold w-6 h-6 grid place-items-center rounded-full ${isToday ? "text-white" : "text-slate-700"}`} style={isToday ? {background:"var(--club-primary)"} : {}}>
                {d.getDate()}
              </div>
              <div className="mt-1 space-y-1 flex-1 min-w-0">
                {visible.map((s) => (
                  <button
                    key={s.id}
                    onClick={(e) => { e.stopPropagation(); onEdit(s); }}
                    className="w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded-md truncate font-medium"
                    style={{
                      background: s.kind === "match" ? "#FEE2E2" : "var(--club-primary-soft)",
                      color: s.kind === "match" ? "#B91C1C" : "var(--club-primary)",
                    }}
                    data-testid={`calendar-event-${s.id}`}
                    title={`${s.title} — ${new Date(s.start_at).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})}`}
                  >
                    {new Date(s.start_at).toLocaleTimeString("fr-FR", {hour:"2-digit",minute:"2-digit"})} {s.title}
                  </button>
                ))}
                {extra > 0 && <div className="text-[11px] text-slate-400 px-1.5">+{extra} de plus</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function dayDateTimeLocal(d, hour) {
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
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

function SessionDialog({ open, onOpenChange, editing, onSaved, onDelete }) {
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
        <DialogFooter className="flex items-center sm:justify-between gap-2">
          {editing?.id && (
            <Button
              variant="outline"
              className="rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 mr-auto"
              onClick={() => { onOpenChange(false); onDelete?.(editing.id); }}
              data-testid="session-dialog-delete-btn"
            >
              <Trash2 size={16} className="mr-1.5" />Supprimer
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
            <Button onClick={save} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="session-save-btn">Enregistrer</Button>
          </div>
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
