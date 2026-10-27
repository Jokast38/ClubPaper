import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Phone, Search, Upload, Mail, Send, ChevronLeft, ChevronRight, UserCircle2, Users as UsersIcon, Sparkles, Trash2, Flame, ShieldOff, Clock, Pencil, X, Check, CalendarPlus } from "lucide-react";
import { toast } from "sonner";

const STATUS_LABEL = {
  nouveau: "Nouveau", a_appeler: "À appeler", contacte: "Contacté", interesse: "Intéressé",
  rdv_planifie: "RDV planifié", essai_demarre: "Essai démarré", club_actif: "Club actif",
  client_payant: "Client payant", refus: "Refus", injoignable: "Injoignable",
};
const STATUS_CLASS = {
  nouveau: "status-pending", a_appeler: "status-pending", contacte: "status-pending", interesse: "status-paid",
  rdv_planifie: "status-paid", essai_demarre: "status-paid", club_actif: "status-paid",
  client_payant: "status-paid", refus: "status-overdue", injoignable: "status-overdue",
};
const REJECTION_REASON_LABEL = {
  trop_cher: "Trop cher", deja_equipe: "Déjà équipé", pas_le_temps: "Pas le temps",
  decision_bureau: "Décision du bureau", pas_interesse: "Pas intéressé", autre: "Autre",
};
const CURRENT_TOOL_LABEL = { excel: "Excel", whatsapp: "WhatsApp", helloasso: "HelloAsso", assoconnect: "AssoConnect", footclubs: "Footclubs", autre: "Autre" };
const DECISION_MAKER_LABEL = { president: "Président(e)", tresorier: "Trésorier(ère)", secretaire: "Secrétaire", autre: "Autre" };
const INTEREST_LABEL = { froid: "Froid", tiede: "Tiède", chaud: "Chaud" };
const HORIZON_LABEL = { maintenant: "Maintenant", avant_saison: "Avant la nouvelle saison", plus_tard: "Plus tard" };
const NOTE_TYPE_LABEL = { appel: "Appel", email: "Email", visite: "Visite", interne: "Interne" };
const CALL_OUTCOME_LABEL = { no_answer: "Pas de réponse", voicemail: "Messagerie", reached: "Contact joint", callback: "Rappel programmé", refus: "Refus", interesse: "Intéressé" };
const APPOINTMENT_TYPE_LABEL = {
  appel_decouverte: "Appel découverte", demo_visio: "Démo visio",
  installation_distance: "Installation à distance", installation_sur_place: "Installation sur place",
};
const WEEKDAY_LABEL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const PAGE_SIZE = 30;

function fmtDateTime(iso) {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

export default function LeadsWorkspace() {
  const { user } = useAuth() || {};
  const [leads, setLeads] = useState({ items: [], total: 0, counts_by_status: {} });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [hasPhone, setHasPhone] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [q, setQ] = useState("");
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState("queue"); // queue | admin
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [callbacks, setCallbacks] = useState({ overdue: [], today: [] });

  const loadCallbacks = async () => {
    try {
      const { data } = await api.get("/admin/leads/callbacks");
      setCallbacks(data);
    } catch { /* non-blocking */ }
  };

  useEffect(() => { loadCallbacks(); }, []);

  const load = async (opts = {}) => {
    const { data } = await api.get("/admin/leads", {
      params: {
        page: opts.page || page, page_size: PAGE_SIZE,
        status, has_phone: hasPhone, assigned_to_me: assignedToMe, q,
      },
    });
    setLeads(data);
  };

  useEffect(() => { load({ page: 1 }); setPage(1); }, [status, hasPhone, assignedToMe]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load({ page: 1 }); }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const { data } = await api.post("/admin/leads/import", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${data.imported} lead(s) importé(s), ${data.skipped_duplicates} doublon(s) ignoré(s)${data.errors ? `, ${data.errors} erreur(s)` : ""}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Import impossible");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const sendCampaign = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Envoyer l'email de présentation à ${selected.size} lead(s) ?`)) return;
    try {
      const { data } = await api.post("/admin/leads/campaign", { lead_ids: Array.from(selected) });
      toast.success(`${data.sent} email(s) envoyé(s)${data.skipped_no_email ? `, ${data.skipped_no_email} sans email` : ""}`);
      setSelected(new Set());
      load();
    } catch { toast.error("Impossible d'envoyer la campagne"); }
  };

  const [enriching, setEnriching] = useState(false);
  const enrichSelected = async () => {
    if (selected.size === 0) return;
    setEnriching(true);
    try {
      const { data } = await api.post("/admin/leads/enrich", { lead_ids: Array.from(selected) });
      toast.success(`${data.enriched} lead(s) enrichi(s), ${data.unchanged} sans résultat Google`);
      setSelected(new Set());
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Impossible d'enrichir ces leads");
    } finally { setEnriching(false); }
  };

  const deleteLead = async (id) => {
    if (!window.confirm("Supprimer ce lead ?")) return;
    try {
      await api.delete(`/admin/leads/${id}`);
      toast.success("Lead supprimé");
      setSelected((prev) => { const n = new Set(prev); n.delete(id); return n; });
      load();
    } catch { toast.error("Impossible de supprimer"); }
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer définitivement ${selected.size} lead(s) ?`)) return;
    try {
      const { data } = await api.post("/admin/leads/bulk-delete", { lead_ids: Array.from(selected) });
      toast.success(`${data.deleted} lead(s) supprimé(s)`);
      setSelected(new Set());
      load();
    } catch { toast.error("Impossible de supprimer"); }
  };

  const totalPages = Math.max(1, Math.ceil(leads.total / PAGE_SIZE));
  const counts = leads.counts_by_status || {};

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Espace commercial</h1>
          <p className="mt-1 text-slate-600 flex items-center gap-2">
            <UserCircle2 size={16} />Connecté en tant que <b>{user?.name}</b>
          </p>
        </div>
        <div className="flex rounded-full border border-slate-200 p-1 bg-white">
          <button onClick={() => setTab("queue")} className={`h-9 px-3 rounded-full text-sm font-medium transition ${tab === "queue" ? "text-white" : "text-slate-600"}`} style={tab === "queue" ? {background:"var(--club-primary)"} : {}} data-testid="leads-tab-queue">File d'appel</button>
          <button onClick={() => setTab("agenda")} className={`h-9 px-3 rounded-full text-sm font-medium transition ${tab === "agenda" ? "text-white" : "text-slate-600"}`} style={tab === "agenda" ? {background:"var(--club-primary)"} : {}} data-testid="leads-tab-agenda">Mon agenda</button>
          {user?.is_platform_admin && (
            <button onClick={() => setTab("admin")} className={`h-9 px-3 rounded-full text-sm font-medium transition ${tab === "admin" ? "text-white" : "text-slate-600"}`} style={tab === "admin" ? {background:"var(--club-primary)"} : {}} data-testid="leads-tab-admin">Import & équipe</button>
          )}
        </div>
      </div>

      {tab === "admin" && user?.is_platform_admin && (
        <AdminPanel fileInputRef={fileInputRef} onImport={onImport} importing={importing} />
      )}

      {tab === "agenda" && <AgendaPanel user={user} />}

      {tab === "queue" && (
        <>
          {(callbacks.overdue.length > 0 || callbacks.today.length > 0) && (
            <div className="mt-6 paper-card p-4 border-l-4" style={{ borderLeftColor: callbacks.overdue.length ? "#DC2626" : "var(--club-primary)" }} data-testid="leads-callback-banner">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <Clock size={16} />
                Rappels du jour ({callbacks.overdue.length + callbacks.today.length})
                {callbacks.overdue.length > 0 && <span className="pill-tag status-overdue">{callbacks.overdue.length} en retard</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {[...callbacks.overdue, ...callbacks.today].slice(0, 8).map((l) => (
                  <button key={l.id} onClick={() => setDetail(l)} className="pill-tag status-pending" data-testid={`leads-callback-${l.id}`}>
                    {l.name} · {fmtDateTime(l.callback_at)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Status counters */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
            {["nouveau", "a_appeler", "contacte", "interesse", "rdv_planifie"].map((s) => (
              <button key={s} onClick={() => setStatus(status === s ? "" : s)} className={`paper-card p-3 text-left transition ${status === s ? "ring-2 ring-offset-1" : ""}`} style={status === s ? {"--tw-ring-color": "var(--club-primary)"} : {}} data-testid={`leads-count-${s}`}>
                <div className="text-xs text-slate-500">{STATUS_LABEL[s]}</div>
                <div className="font-display font-bold text-xl text-slate-900">{counts[s] ?? 0}</div>
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input placeholder="Rechercher un club, une ville…" className="pl-9 h-10" value={q} onChange={(e) => setQ(e.target.value)} data-testid="leads-search" />
            </div>
            <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
              <SelectTrigger className="h-10 w-[170px]" data-testid="leads-status-filter"><SelectValue placeholder="Tous statuts" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={hasPhone} onChange={(e) => setHasPhone(e.target.checked)} />Avec téléphone
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={assignedToMe} onChange={(e) => setAssignedToMe(e.target.checked)} />Mes leads
            </label>
            {selected.size > 0 && user?.is_platform_admin && (
              <div className="flex gap-2 ml-auto">
                <Button size="sm" variant="outline" className="rounded-full" onClick={enrichSelected} disabled={enriching} data-testid="leads-enrich-btn">
                  <Sparkles size={14} className="mr-1.5" />{enriching ? "Enrichissement…" : `Enrichir (${selected.size})`}
                </Button>
                <Button size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={sendCampaign} data-testid="leads-send-campaign-btn">
                  <Send size={14} className="mr-1.5" />Envoyer campagne ({selected.size})
                </Button>
                <Button size="sm" variant="outline" className="rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={deleteSelected} data-testid="leads-delete-selected-btn">
                  <Trash2 size={14} className="mr-1.5" />Supprimer ({selected.size})
                </Button>
              </div>
            )}
          </div>

          {/* Select all (current page) */}
          {user?.is_platform_admin && leads.items.length > 0 && (
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600 px-1">
              <input
                type="checkbox"
                className="w-4 h-4"
                checked={leads.items.every((l) => selected.has(l.id))}
                onChange={() => {
                  setSelected((prev) => {
                    const allSelected = leads.items.every((l) => prev.has(l.id));
                    const next = new Set(prev);
                    leads.items.forEach((l) => (allSelected ? next.delete(l.id) : next.add(l.id)));
                    return next;
                  });
                }}
                data-testid="leads-select-all"
              />
              Tout sélectionner sur cette page ({leads.items.length})
            </label>
          )}

          {/* List */}
          <div className="mt-2 space-y-2">
            {leads.items.length === 0 && (
              <div className="paper-card p-10 text-center">
                <UsersIcon size={28} className="mx-auto text-slate-300" />
                <p className="mt-3 text-slate-500">Aucun lead pour ces filtres.</p>
              </div>
            )}
            {leads.items.map((lead) => (
              <div
                key={lead.id}
                className="paper-card p-4 flex items-center gap-3 cursor-pointer hover:-translate-y-0.5 transition-transform"
                onClick={() => setDetail(lead)}
                title={lead.notes || ""}
                data-testid={`lead-row-${lead.id}`}
              >
                {user?.is_platform_admin && (
                  <input
                    type="checkbox"
                    className="w-4 h-4 shrink-0"
                    checked={selected.has(lead.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(lead.id)}
                    data-testid={`lead-select-${lead.id}`}
                  />
                )}
                {lead.priority_score > 0 && (
                  <span className="shrink-0 flex items-center gap-1 text-xs font-semibold text-orange-600" title="Score de priorité">
                    <Flame size={14} />{lead.priority_score}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 truncate flex items-center gap-2">
                    {lead.name}
                    {lead.do_not_call && <ShieldOff size={14} className="text-slate-400" title="Ne plus rappeler" />}
                  </div>
                  <div className="text-sm text-slate-500 truncate flex items-center gap-3 flex-wrap">
                    {lead.city && <span>{lead.city}</span>}
                    {lead.phone && <span className="flex items-center gap-1"><Phone size={12} />{lead.phone}</span>}
                    {lead.email && <span className="flex items-center gap-1"><Mail size={12} />{lead.email}</span>}
                  </div>
                </div>
                {lead.assigned_to_name && <span className="text-xs text-slate-400 shrink-0 hidden sm:block">{lead.assigned_to_name}</span>}
                <span className={`pill-tag shrink-0 ${STATUS_CLASS[lead.status] || "status-pending"}`}>{STATUS_LABEL[lead.status] || lead.status}</span>
                {user?.is_platform_admin && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteLead(lead.id); }}
                    className="shrink-0 text-slate-400 hover:text-red-600 p-1"
                    title="Supprimer ce lead"
                    data-testid={`lead-delete-${lead.id}`}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" className="rounded-full" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={16} className="mr-1" />Précédent
              </Button>
              <span className="text-sm text-slate-600">Page {page} / {totalPages}</span>
              <Button size="sm" variant="outline" className="rounded-full" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Suivant<ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      <LeadDetailDialog lead={detail} onOpenChange={(v) => !v && setDetail(null)} onSaved={() => { setDetail(null); load(); loadCallbacks(); }} onActivityLogged={loadCallbacks} />
    </div>
  );
}

function AdminPanel({ fileInputRef, onImport, importing }) {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);

  const loadEmployees = async () => {
    const { data } = await api.get("/admin/employees");
    setEmployees(data);
  };
  useEffect(() => { loadEmployees(); }, []);

  const createEmployee = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/employees", form);
      toast.success("Compte employé créé");
      setForm({ name: "", email: "", password: "" });
      loadEmployees();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible de créer le compte");
    } finally { setBusy(false); }
  };

  const removeEmployee = async (id) => {
    if (!window.confirm("Supprimer ce compte employé ?")) return;
    await api.delete(`/admin/employees/${id}`);
    toast.success("Employé supprimé");
    loadEmployees();
  };

  return (
    <div className="mt-6 space-y-6">
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900">Importer des leads (CSV)</h3>
        <p className="text-sm text-slate-600 mt-1">Compatible avec l'export <code>leads/extract_clubs_sportifs_rna.py</code> (colonnes nom, objet, adresse, code_postal, commune, site_web, id_rna…). Les doublons (même id_rna) sont ignorés automatiquement.</p>
        <label className="mt-3 inline-block">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onImport} data-testid="leads-import-input" />
          <Button variant="outline" className="rounded-full h-11" asChild disabled={importing}>
            <span><Upload size={16} className="mr-2" />{importing ? "Import en cours…" : "Choisir un fichier CSV"}</span>
          </Button>
        </label>
      </div>

      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900">Équipe commerciale</h3>
        <form onSubmit={createEmployee} className="mt-3 grid sm:grid-cols-3 gap-3">
          <Input placeholder="Nom" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="employee-name" />
          <Input placeholder="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="employee-email" />
          <div className="flex gap-2">
            <Input placeholder="Mot de passe" type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="employee-password" />
            <Button type="submit" disabled={busy} className="rounded-full shrink-0" style={{background:"var(--club-primary)"}} data-testid="employee-create-btn">Créer</Button>
          </div>
        </form>
        <div className="mt-4 space-y-2">
          {employees.map((e) => (
            <div key={e.id} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-slate-50">
              <span>{e.name} — {e.email}</span>
              <button onClick={() => removeEmployee(e.id)} className="text-red-600 text-xs underline" data-testid={`employee-delete-${e.id}`}>Supprimer</button>
            </div>
          ))}
          {employees.length === 0 && <p className="text-sm text-slate-500">Aucun employé pour l'instant.</p>}
        </div>
      </div>
    </div>
  );
}

function LeadDetailDialog({ lead, onOpenChange, onSaved, onActivityLogged }) {
  const { user } = useAuth() || {};
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(lead || {}); }, [lead]);

  const save = async (extra = {}) => {
    const next = { ...form, ...extra };
    if (next.status === "refus" && !next.rejection_reason) {
      toast.error("Un motif de refus est obligatoire pour ce statut");
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.put(`/admin/leads/${lead.id}`, next);
      toast.success("Lead mis à jour");
      setForm(data);
      onSaved();
    } catch (err) { toast.error(err.response?.data?.detail?.message || err.response?.data?.detail || "Impossible d'enregistrer"); }
    finally { setSaving(false); }
  };

  if (!lead) return null;

  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto" data-testid="lead-detail-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {lead.name}
            {form.priority_score > 0 && <span className="pill-tag status-paid flex items-center gap-1"><Flame size={12} />{form.priority_score}</span>}
          </DialogTitle>
        </DialogHeader>
        {lead.description && <p className="text-sm text-slate-500 bg-slate-50 rounded-lg p-3 max-h-24 overflow-y-auto">{lead.description}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Téléphone</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1 h-11" data-testid="lead-phone" /></div>
          <div><Label>Email</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 h-11" data-testid="lead-email" /></div>
        </div>
        <div>
          <Label>Statut</Label>
          <Select value={form.status || "nouveau"} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger className="mt-1 h-11" data-testid="lead-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {form.status === "refus" && (
          <div>
            <Label>Motif de refus <span className="text-red-500">*</span></Label>
            <Select value={form.rejection_reason || ""} onValueChange={(v) => setForm({ ...form, rejection_reason: v })}>
              <SelectTrigger className="mt-1 h-11" data-testid="lead-rejection-reason"><SelectValue placeholder="Choisir un motif" /></SelectTrigger>
              <SelectContent>
                {Object.entries(REJECTION_REASON_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.rejection_reason === "autre" && (
              <Input className="mt-2 h-11" placeholder="Précisez…" value={form.rejection_note || ""} onChange={(e) => setForm({ ...form, rejection_note: e.target.value })} data-testid="lead-rejection-note" />
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <Label className="text-xs uppercase text-slate-400">Critères de qualification</Label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Sport</Label><Input value={form.sport || ""} onChange={(e) => setForm({ ...form, sport: e.target.value })} className="mt-1 h-10" data-testid="lead-sport" /></div>
            <div><Label className="text-xs">Nb adhérents (approx.)</Label><Input type="number" value={form.estimated_member_count ?? ""} onChange={(e) => setForm({ ...form, estimated_member_count: e.target.value ? Number(e.target.value) : null })} className="mt-1 h-10" data-testid="lead-member-count" /></div>
            <div><Label className="text-xs">Nb équipes (approx.)</Label><Input type="number" value={form.estimated_team_count ?? ""} onChange={(e) => setForm({ ...form, estimated_team_count: e.target.value ? Number(e.target.value) : null })} className="mt-1 h-10" data-testid="lead-team-count" /></div>
            <div>
              <Label className="text-xs">Outil actuel</Label>
              <Select value={form.current_tool || ""} onValueChange={(v) => setForm({ ...form, current_tool: v })}>
                <SelectTrigger className="mt-1 h-10" data-testid="lead-current-tool"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{Object.entries(CURRENT_TOOL_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Qui décide</Label>
              <Select value={form.decision_maker_role || ""} onValueChange={(v) => setForm({ ...form, decision_maker_role: v })}>
                <SelectTrigger className="mt-1 h-10" data-testid="lead-decision-maker"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{Object.entries(DECISION_MAKER_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Niveau d'intérêt</Label>
              <Select value={form.interest_level || ""} onValueChange={(v) => setForm({ ...form, interest_level: v })}>
                <SelectTrigger className="mt-1 h-10" data-testid="lead-interest-level"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{Object.entries(INTEREST_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Échéance d'achat</Label>
              <Select value={form.buying_horizon || ""} onValueChange={(v) => setForm({ ...form, buying_horizon: v })}>
                <SelectTrigger className="mt-1 h-10" data-testid="lead-buying-horizon"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{Object.entries(HORIZON_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-sm text-orange-600 underline">Voir le site web</a>}

        <AnnuairePanel lead={form} isAdmin={!!user?.is_platform_admin} onChanged={(updated) => setForm(updated)} />

        <BookingLinkPanel leadId={lead.id} />

        <LeadActivityPanel leadId={lead.id} currentUserId={user?.id} isAdmin={!!user?.is_platform_admin} onActivity={onActivityLogged} />

        <label className="flex items-center gap-2 text-sm text-slate-600 border-t border-slate-100 pt-3">
          <input type="checkbox" checked={!!form.do_not_call} onChange={(e) => setForm({ ...form, do_not_call: e.target.checked })} data-testid="lead-do-not-call" />
          <ShieldOff size={14} />Ne plus jamais rappeler (retire ce lead des files d'appel et campagnes)
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Fermer</Button>
          <Button onClick={() => save()} disabled={saving || (form.status === "refus" && !form.rejection_reason)} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="lead-save-btn">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LeadActivityPanel({ leadId, currentUserId, isAdmin, onActivity }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteType, setNoteType] = useState("appel");
  const [noteText, setNoteText] = useState("");
  const [callOutcome, setCallOutcome] = useState("");
  const [callDuration, setCallDuration] = useState("");
  const [callNote, setCallNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/admin/leads/${leadId}/activities`);
      setActivities(data);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { if (leadId) load(); }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const addNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/leads/${leadId}/activities`, { type: "note", note_type: noteType, text: noteText.trim() });
      setNoteText("");
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible d'ajouter la note"); }
    finally { setBusy(false); }
  };

  const logCall = async () => {
    if (!callOutcome) { toast.error("Choisissez un résultat d'appel"); return; }
    if (callOutcome === "callback" && !callbackAt) { toast.error("Une date de rappel est requise"); return; }
    setBusy(true);
    try {
      await api.post(`/admin/leads/${leadId}/activities`, {
        type: "call", call_outcome: callOutcome,
        call_duration_seconds: callDuration ? Number(callDuration) * 60 : null,
        text: callNote.trim(),
        callback_at: callOutcome === "callback" ? new Date(callbackAt).toISOString() : null,
      });
      toast.success("Appel enregistré");
      setCallOutcome(""); setCallDuration(""); setCallNote(""); setCallbackAt("");
      load();
      onActivity && onActivity();
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible d'enregistrer l'appel"); }
    finally { setBusy(false); }
  };

  const saveEdit = async (id) => {
    if (!editText.trim()) return;
    try {
      await api.put(`/admin/leads/${leadId}/activities/${id}`, { text: editText.trim() });
      setEditingId(null);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible de modifier"); }
  };

  const removeActivity = async (id) => {
    if (!window.confirm("Supprimer cette note ?")) return;
    try {
      await api.delete(`/admin/leads/${leadId}/activities/${id}`);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible de supprimer"); }
  };

  const renderActivity = (a) => {
    if (a.type === "status_change") {
      return <span>Statut : <b>{STATUS_LABEL[a.from_status] || a.from_status || "—"}</b> → <b>{STATUS_LABEL[a.to_status] || a.to_status}</b></span>;
    }
    if (a.type === "call") {
      return (
        <span>
          Appel — <b>{CALL_OUTCOME_LABEL[a.call_outcome] || a.call_outcome}</b>
          {a.call_duration_seconds ? ` (${Math.round(a.call_duration_seconds / 60)} min)` : ""}
          {a.callback_at ? ` · rappel prévu le ${fmtDateTime(a.callback_at)}` : ""}
          {a.text ? <div className="text-slate-600 mt-0.5">{a.text}</div> : null}
        </span>
      );
    }
    if (a.type === "email") {
      return <span>{a.text || "Email envoyé"}</span>;
    }
    // note
    return <span>[{NOTE_TYPE_LABEL[a.note_type] || a.note_type}] {a.text}</span>;
  };

  return (
    <div className="border-t border-slate-100 pt-3 space-y-4">
      <div>
        <Label className="text-xs uppercase text-slate-400">Enregistrer un appel</Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Select value={callOutcome} onValueChange={setCallOutcome}>
            <SelectTrigger className="h-10" data-testid="lead-call-outcome"><SelectValue placeholder="Résultat…" /></SelectTrigger>
            <SelectContent>{Object.entries(CALL_OUTCOME_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" placeholder="Durée (min)" value={callDuration} onChange={(e) => setCallDuration(e.target.value)} className="h-10" data-testid="lead-call-duration" />
          {callOutcome === "callback" && (
            <Input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className="h-10 col-span-2" data-testid="lead-callback-at" />
          )}
          <Input placeholder="Note rapide (optionnel)" value={callNote} onChange={(e) => setCallNote(e.target.value)} className="h-10 col-span-2" data-testid="lead-call-note" />
        </div>
        <Button size="sm" className="mt-2 rounded-full" onClick={logCall} disabled={busy} style={{ background: "var(--club-primary)" }} data-testid="lead-log-call-btn">
          <Phone size={14} className="mr-1.5" />Enregistrer l'appel
        </Button>
      </div>

      <div>
        <Label className="text-xs uppercase text-slate-400">Ajouter une note</Label>
        <div className="mt-2 flex gap-2">
          <Select value={noteType} onValueChange={setNoteType}>
            <SelectTrigger className="h-10 w-32 shrink-0" data-testid="lead-note-type"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(NOTE_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input placeholder="Nouvelle note…" value={noteText} onChange={(e) => setNoteText(e.target.value)} className="h-10" data-testid="lead-note-text" />
        </div>
        <Button size="sm" variant="outline" className="mt-2 rounded-full" onClick={addNote} disabled={busy}>Ajouter la note</Button>
      </div>

      <div>
        <Label className="text-xs uppercase text-slate-400">Historique</Label>
        {loading && <p className="text-sm text-slate-400 mt-2">Chargement…</p>}
        {!loading && activities.length === 0 && <p className="text-sm text-slate-400 mt-2">Aucune activité pour le moment.</p>}
        <div className="mt-2 space-y-2 max-h-56 overflow-y-auto">
          {activities.map((a) => {
            const canEdit = a.type === "note" && (a.author_id === currentUserId || isAdmin);
            return (
              <div key={a.id} className="text-sm bg-slate-50 rounded-lg p-2.5" data-testid={`lead-activity-${a.id}`}>
                {editingId === a.id ? (
                  <div className="flex gap-2 items-center">
                    <Input value={editText} onChange={(e) => setEditText(e.target.value)} className="h-9" />
                    <button onClick={() => saveEdit(a.id)} className="text-green-600"><Check size={16} /></button>
                    <button onClick={() => setEditingId(null)} className="text-slate-400"><X size={16} /></button>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">{renderActivity(a)}</div>
                    {canEdit && (
                      <div className="flex gap-1.5 shrink-0">
                        <button onClick={() => { setEditingId(a.id); setEditText(a.text || ""); }} className="text-slate-400 hover:text-slate-700" data-testid={`lead-activity-edit-${a.id}`}><Pencil size={14} /></button>
                        <button onClick={() => removeActivity(a.id)} className="text-slate-400 hover:text-red-600" data-testid={`lead-activity-delete-${a.id}`}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                )}
                <div className="text-xs text-slate-400 mt-1">{a.author_name} · {fmtDateTime(a.created_at)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const CLAIM_STATUS_BADGE = {
  none: null,
  a_verifier: { label: "Revendication à vérifier", cls: "status-pending" },
  revendique: { label: "Fiche revendiquée", cls: "status-paid" },
};

function AnnuairePanel({ lead, isAdmin, onChanged }) {
  const [busy, setBusy] = useState(false);
  const visible = !!lead.annuaire_visible;
  const publicUrl = lead.annuaire_slug ? `${window.location.origin}/annuaire/${lead.annuaire_slug}` : "";
  const badge = CLAIM_STATUS_BADGE[lead.claim_status];

  const toggle = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/admin/leads/${lead.id}/annuaire`, { visible: !visible });
      onChanged(data);
      toast.success(data.annuaire_visible ? "Fiche publiée sur l'annuaire" : "Fiche retirée de l'annuaire");
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible de mettre à jour"); }
    finally { setBusy(false); }
  };

  return (
    <div className="border-t border-slate-100 pt-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Label className="text-xs uppercase text-slate-400">Annuaire public</Label>
        {badge && <span className={`pill-tag ${badge.cls}`}>{badge.label}</span>}
      </div>
      <div className="mt-2 flex items-center gap-3 flex-wrap">
        {isAdmin ? (
          <Button size="sm" variant="outline" className="rounded-full" onClick={toggle} disabled={busy} data-testid="lead-annuaire-toggle">
            {visible ? "Retirer de l'annuaire" : "Publier sur l'annuaire"}
          </Button>
        ) : (
          <span className="text-sm text-slate-500">{visible ? "Visible sur l'annuaire" : "Non publiée"}</span>
        )}
        {publicUrl && visible && (
          <a href={publicUrl} target="_blank" rel="noreferrer" className="text-sm text-orange-600 underline break-all">{publicUrl}</a>
        )}
      </div>
    </div>
  );
}

function BookingLinkPanel({ leadId }) {
  const [type, setType] = useState("appel_decouverte");
  const [busy, setBusy] = useState(false);
  const [lastUrl, setLastUrl] = useState("");

  const sendLink = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/admin/leads/${leadId}/booking-link`, { appointment_type: type });
      setLastUrl(data.booking_url);
      toast.success("Lien de réservation envoyé au prospect par email");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible de créer le lien de réservation");
    } finally { setBusy(false); }
  };

  return (
    <div className="border-t border-slate-100 pt-3">
      <Label className="text-xs uppercase text-slate-400">Prendre rendez-vous</Label>
      <div className="mt-2 flex gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-10 flex-1" data-testid="booking-link-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(APPOINTMENT_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" className="rounded-full shrink-0" onClick={sendLink} disabled={busy} data-testid="booking-link-send-btn">
          <CalendarPlus size={14} className="mr-1.5" />Envoyer le lien
        </Button>
      </div>
      {lastUrl && <p className="mt-2 text-xs text-slate-400 break-all">Lien envoyé : {lastUrl}</p>}
    </div>
  );
}

function AgendaPanel({ user }) {
  const [appointments, setAppointments] = useState([]);
  const [availability, setAvailability] = useState({ slots: [] });
  const [savingAvail, setSavingAvail] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/appointments");
    setAppointments(data);
  };
  const loadAvailability = async () => {
    const { data } = await api.get("/admin/availability");
    setAvailability(data);
  };
  useEffect(() => { load(); loadAvailability(); }, []);

  const addSlot = () => {
    setAvailability((prev) => ({ ...prev, slots: [...prev.slots, { type: "appel_decouverte", weekday: 0, start_time: "09:00", end_time: "12:00" }] }));
  };
  const updateSlot = (i, field, value) => {
    setAvailability((prev) => ({ ...prev, slots: prev.slots.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)) }));
  };
  const removeSlot = (i) => {
    setAvailability((prev) => ({ ...prev, slots: prev.slots.filter((_, idx) => idx !== i) }));
  };
  const saveAvailability = async () => {
    setSavingAvail(true);
    try {
      await api.put("/admin/availability", { slots: availability.slots });
      toast.success("Disponibilités enregistrées");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible d'enregistrer");
    } finally { setSavingAvail(false); }
  };

  const cancelAppointment = async (id) => {
    if (!window.confirm("Annuler ce rendez-vous ?")) return;
    try {
      await api.delete(`/admin/appointments/${id}`);
      toast.success("Rendez-vous annulé");
      load();
    } catch { toast.error("Impossible d'annuler"); }
  };

  const upcoming = appointments.filter((a) => a.status !== "annule");

  return (
    <div className="mt-6 space-y-6">
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900">Mes rendez-vous</h3>
        <div className="mt-3 space-y-2">
          {upcoming.length === 0 && <p className="text-sm text-slate-400">Aucun rendez-vous programmé.</p>}
          {upcoming.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50" data-testid={`agenda-appointment-${a.id}`}>
              <div>
                <div className="font-medium text-slate-900">{APPOINTMENT_TYPE_LABEL[a.type] || a.type}</div>
                <div className="text-sm text-slate-500">{fmtDateTime(a.start_at)} · {a.duration_minutes} min{a.assigned_to_name ? ` · ${a.assigned_to_name}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="pill-tag status-pending">{a.status}</span>
                <button onClick={() => cancelAppointment(a.id)} className="text-slate-400 hover:text-red-600 p-1" data-testid={`agenda-cancel-${a.id}`}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900">Mes disponibilités hebdomadaires</h3>
        <p className="text-sm text-slate-600 mt-1">Les créneaux proposés au prospect (sur la page de réservation ou dans la CRM) sont calculés à partir de ces plages récurrentes.</p>
        <div className="mt-3 space-y-2">
          {availability.slots.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2" data-testid={`availability-slot-${i}`}>
              <Select value={s.type} onValueChange={(v) => updateSlot(i, "type", v)}>
                <SelectTrigger className="h-10 w-44"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(APPOINTMENT_TYPE_LABEL).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={String(s.weekday)} onValueChange={(v) => updateSlot(i, "weekday", Number(v))}>
                <SelectTrigger className="h-10 w-32"><SelectValue /></SelectTrigger>
                <SelectContent>{WEEKDAY_LABEL.map((l, v) => <SelectItem key={v} value={String(v)}>{l}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="time" value={s.start_time} onChange={(e) => updateSlot(i, "start_time", e.target.value)} className="h-10 w-28" />
              <span className="text-slate-400">→</span>
              <Input type="time" value={s.end_time} onChange={(e) => updateSlot(i, "end_time", e.target.value)} className="h-10 w-28" />
              <button onClick={() => removeSlot(i)} className="text-slate-400 hover:text-red-600 p-1"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="rounded-full" onClick={addSlot} data-testid="availability-add-slot-btn">+ Ajouter un créneau</Button>
          <Button className="rounded-full" style={{ background: "var(--club-primary)" }} onClick={saveAvailability} disabled={savingAvail} data-testid="availability-save-btn">
            {savingAvail ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
