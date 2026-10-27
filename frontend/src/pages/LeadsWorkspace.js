import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Phone, Search, Upload, Mail, Send, ChevronLeft, ChevronRight, UserCircle2, Users as UsersIcon, Sparkles, Trash2, Flame, ShieldOff } from "lucide-react";
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
const PAGE_SIZE = 30;

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
        {user?.is_platform_admin && (
          <div className="flex rounded-full border border-slate-200 p-1 bg-white">
            <button onClick={() => setTab("queue")} className={`h-9 px-3 rounded-full text-sm font-medium transition ${tab === "queue" ? "text-white" : "text-slate-600"}`} style={tab === "queue" ? {background:"var(--club-primary)"} : {}} data-testid="leads-tab-queue">File d'appel</button>
            <button onClick={() => setTab("admin")} className={`h-9 px-3 rounded-full text-sm font-medium transition ${tab === "admin" ? "text-white" : "text-slate-600"}`} style={tab === "admin" ? {background:"var(--club-primary)"} : {}} data-testid="leads-tab-admin">Import & équipe</button>
          </div>
        )}
      </div>

      {tab === "admin" && user?.is_platform_admin && (
        <AdminPanel fileInputRef={fileInputRef} onImport={onImport} importing={importing} />
      )}

      {tab === "queue" && (
        <>
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

      <LeadDetailDialog lead={detail} onOpenChange={(v) => !v && setDetail(null)} onSaved={() => { setDetail(null); load(); }} />
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

function LeadDetailDialog({ lead, onOpenChange, onSaved }) {
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

        <div>
          <Label>Notes d'appel</Label>
          <Textarea rows={4} value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1" placeholder="Ce qui a été dit, à rappeler, objections…" data-testid="lead-notes" />
        </div>
        {lead.website && <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noreferrer" className="text-sm text-orange-600 underline">Voir le site web</a>}

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
