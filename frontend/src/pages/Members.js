import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, Search, Upload, Trash2, Edit3, Users as UsersIcon, FileText, Download, IdCard, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import MemberDocumentsDialog from "@/components/MemberDocumentsDialog";
import { downloadPdf } from "@/lib/downloadPdf";
import { useAuth } from "@/lib/AuthContext";

const LICENSE = { valid: "En règle", pending: "En attente", expired: "Expirée" };
const LICENSE_CLASS = { valid: "status-paid", pending: "status-pending", expired: "status-overdue" };
const PAGE_SIZE = 20;

export default function Members() {
  const { club } = useAuth() || {};
  const [members, setMembers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [team, setTeam] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsMember, setDocsMember] = useState(null);
  const [wipeOpen, setWipeOpen] = useState(false);

  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounce = useRef(null);
  const suggestDebounce = useRef(null);

  const load = async (opts = {}) => {
    const { data } = await api.get("/members", {
      params: { q: search, team, page: opts.page || page, page_size: PAGE_SIZE },
    });
    setMembers(data.items || []);
    setTotal(data.total || 0);
  };

  useEffect(() => { load({ page: 1 }); setPage(1); setSelected(new Set()); }, [team]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setPage(1); load({ page: 1 }); setSelected(new Set()); }, 350);
    return () => clearTimeout(searchDebounce.current);
    // eslint-disable-next-line
  }, [search]);

  useEffect(() => {
    clearTimeout(suggestDebounce.current);
    if (search.trim().length < 2) { setSuggestions([]); return; }
    suggestDebounce.current = setTimeout(async () => {
      try {
        const { data } = await api.get("/members/search", { params: { q: search } });
        setSuggestions(data);
      } catch { /* ignore */ }
    }, 200);
    return () => clearTimeout(suggestDebounce.current);
  }, [search]);

  const teams = useMemo(() => ["all", ...((club?.teams) || [])], [club]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const openNew = () => { setEditing({}); setOpen(true); };
  const openEdit = (m) => { setEditing(m); setOpen(true); };
  const remove = async (id) => {
    if (!window.confirm("Supprimer cet adhérent ?")) return;
    await api.delete(`/members/${id}`);
    toast.success("Adhérent supprimé");
    load();
  };

  const wipeAll = async () => {
    await api.delete("/members");
    toast.success("Tous les adhérents ont été supprimés");
    setWipeOpen(false);
    setSelected(new Set());
    setPage(1);
    load({ page: 1 });
  };

  const bulkRemove = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Supprimer ${selected.size} adhérent(s) sélectionné(s) ?`)) return;
    await api.post("/members/bulk-delete", { ids: Array.from(selected) });
    toast.success(`${selected.size} adhérent(s) supprimé(s)`);
    setSelected(new Set());
    load();
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (prev.size === members.length) return new Set();
      return new Set(members.map((m) => m.id));
    });
  };

  const importCsv = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    const endpoint = isXlsx ? "/members/import-xlsx" : "/members/import";
    try {
      const { data } = await api.post(endpoint, fd, { headers: { "Content-Type": "multipart/form-data" }});
      toast.success(`${data.imported} adhérent(s) importé(s)${data.errors ? `, ${data.errors} ligne(s) ignorée(s)` : ""}`);
      load();
    } catch (err) {
      toast.error("Import impossible : vérifiez le format du fichier");
    } finally {
      e.target.value = "";
    }
  };

  const openDocs = (m) => { setDocsMember(m); setDocsOpen(true); };
  const pickSuggestion = (s) => {
    setSearch(`${s.first_name} ${s.last_name}`);
    setShowSuggestions(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Adhérents</h1>
          <p className="mt-1 text-slate-600">{total} adhérent{total > 1 ? "s" : ""} au club</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label>
            <input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={importCsv} data-testid="members-import-input" />
            <Button variant="outline" className="rounded-full h-11" asChild data-testid="members-import-btn">
              <span><Upload size={18} className="mr-2" />Importer CSV / Excel</span>
            </Button>
          </label>
          <Button onClick={openNew} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="members-add-btn">
            <UserPlus size={18} className="mr-2" />Ajouter un adhérent
          </Button>
          {total > 0 && (
            <Button variant="outline" className="rounded-full h-11 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setWipeOpen(true)} data-testid="members-wipe-btn">
              <Trash2 size={18} className="mr-2" />Vider les adhérents
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher un nom, un email…"
            className="pl-10 h-11"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowSuggestions(true); }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            data-testid="members-search"
          />
          {showSuggestions && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden" data-testid="members-search-suggestions">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm"
                    onMouseDown={() => pickSuggestion(s)}
                  >
                    <span className="font-medium text-slate-900">{s.first_name} {s.last_name}</span>
                    {s.team && <span className="text-slate-400 ml-2">{s.team}</span>}
                    {s.email && <span className="text-slate-400 ml-2">· {s.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Select value={team} onValueChange={setTeam}>
          <SelectTrigger className="h-11 w-[200px]" data-testid="members-team-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            {teams.map((t) => <SelectItem key={t} value={t}>{t === "all" ? "Toutes les équipes" : t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="mt-4 flex items-center justify-between gap-3 paper-card p-3 px-4 bg-orange-50 border-orange-200" data-testid="members-bulk-bar">
          <span className="text-sm font-medium text-slate-800">{selected.size} sélectionné{selected.size > 1 ? "s" : ""}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setSelected(new Set())}>Désélectionner</Button>
            <Button size="sm" className="rounded-full bg-red-600 hover:bg-red-700" onClick={bulkRemove} data-testid="members-bulk-delete-btn">
              <Trash2 size={14} className="mr-1.5" />Supprimer la sélection
            </Button>
          </div>
        </div>
      )}

      {/* List */}
      {members.length === 0 ? (
        <EmptyMembers onAdd={openNew} />
      ) : (
        <>
          <div className="mt-6 flex items-center gap-2 px-1">
            <input
              type="checkbox"
              className="w-4 h-4 rounded"
              checked={selected.size === members.length && members.length > 0}
              onChange={toggleSelectAll}
              data-testid="members-select-all"
            />
            <span className="text-sm text-slate-500">Tout sélectionner sur cette page</span>
          </div>
          <ul className="mt-2 space-y-3 stagger">
            {members.map((m) => (
              <li key={m.id} className="paper-card p-4 flex items-center gap-4" data-testid={`member-row-${m.id}`}>
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded shrink-0"
                  checked={selected.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  data-testid={`member-select-${m.id}`}
                />
                <div className="w-11 h-11 rounded-xl grid place-items-center font-bold text-white shrink-0" style={{background:"var(--club-primary)"}}>
                  {m.first_name?.[0]}{m.last_name?.[0]}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-slate-900 truncate">{m.first_name} {m.last_name}</div>
                  <div className="text-sm text-slate-500 truncate">{m.email || "Pas d'email"} · {m.phone || "—"}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.team && <span className="pill-tag" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{m.team}</span>}
                    <span className={`pill-tag ${LICENSE_CLASS[m.license_status] || "status-pending"}`}>Licence : {LICENSE[m.license_status] || "?"}</span>
                    {m.medical_cert_status !== "ok" && <span className="pill-tag status-overdue">Certif. médical manquant</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openDocs(m)} data-testid={`member-docs-${m.id}`} title="Documents"><FileText size={16} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(`/pdf/member/${m.id}`, `fiche-${m.last_name}.pdf`)} data-testid={`member-pdf-${m.id}`} title="Fiche PDF"><Download size={16} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => downloadPdf(`/pdf/license/${m.id}`, `attestation-${m.last_name}.pdf`)} data-testid={`member-license-${m.id}`} title="Attestation licence"><IdCard size={16} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(m)} data-testid={`member-edit-${m.id}`}><Edit3 size={16} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(m.id)} data-testid={`member-delete-${m.id}`} className="text-red-600 hover:text-red-700"><Trash2 size={16} /></Button>
                </div>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3" data-testid="members-pagination">
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

      <MemberDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
      <MemberDocumentsDialog member={docsMember} open={docsOpen} onOpenChange={setDocsOpen} />
      <WipeMembersDialog open={wipeOpen} onOpenChange={setWipeOpen} total={total} onConfirm={wipeAll} />
    </div>
  );
}

function WipeMembersDialog({ open, onOpenChange, total, onConfirm }) {
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setConfirmText(""); }, [open]);

  const doConfirm = async () => {
    setBusy(true);
    try { await onConfirm(); }
    catch { toast.error("Impossible de vider les adhérents"); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="members-wipe-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle size={20} />Vider tous les adhérents
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Cette action supprimera définitivement les <b>{total}</b> adhérent{total > 1 ? "s" : ""} du club ainsi que leurs cotisations associées. Cette action est irréversible.
        </p>
        <div className="mt-2">
          <Label>Tapez <b>SUPPRIMER</b> pour confirmer</Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-1 h-11" data-testid="members-wipe-confirm-input" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button
            onClick={doConfirm}
            disabled={confirmText !== "SUPPRIMER" || busy}
            className="rounded-full bg-red-600 hover:bg-red-700"
            data-testid="members-wipe-confirm-btn"
          >
            {busy ? "Suppression…" : "Tout supprimer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyMembers({ onAdd }) {
  return (
    <div className="mt-10 paper-card p-10 text-center">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><UsersIcon size={28} strokeWidth={2.5} /></div>
      <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Aucun adhérent pour le moment</h3>
      <p className="mt-2 text-slate-600 max-w-md mx-auto">Ajoutez votre premier adhérent, ou importez une liste existante depuis Excel.</p>
      <Button onClick={onAdd} className="mt-6 rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="empty-add-member">
        <UserPlus size={18} className="mr-2" />Ajouter un adhérent
      </Button>
    </div>
  );
}

function MemberDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({});
  useEffect(() => { setForm(editing || {}); }, [editing, open]);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  const save = async () => {
    if (!form.first_name || !form.last_name) {
      toast.error("Prénom et nom sont obligatoires");
      return;
    }
    try {
      if (editing?.id) {
        await api.put(`/members/${editing.id}`, form);
        toast.success("Adhérent mis à jour");
      } else {
        await api.post("/members", form);
        toast.success("Adhérent ajouté");
      }
      onSaved();
    } catch (err) {
      toast.error("Impossible d'enregistrer");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="member-dialog">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Modifier l'adhérent" : "Nouvel adhérent"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Prénom *</Label><Input value={form.first_name || ""} onChange={upd("first_name")} data-testid="member-first-name" className="mt-1 h-11" /></div>
          <div><Label>Nom *</Label><Input value={form.last_name || ""} onChange={upd("last_name")} data-testid="member-last-name" className="mt-1 h-11" /></div>
          <div className="col-span-2"><Label>Email</Label><Input type="email" value={form.email || ""} onChange={upd("email")} data-testid="member-email" className="mt-1 h-11" /></div>
          <div><Label>Téléphone</Label><Input value={form.phone || ""} onChange={upd("phone")} data-testid="member-phone" className="mt-1 h-11" /></div>
          <div><Label>Date de naissance</Label><Input type="date" value={form.birth_date || ""} onChange={upd("birth_date")} data-testid="member-birth" className="mt-1 h-11" /></div>
          <div><Label>Équipe</Label><Input placeholder="Ex. U11" value={form.team || ""} onChange={upd("team")} data-testid="member-team" className="mt-1 h-11" /></div>
          <div><Label>Cotisation (€)</Label><Input type="number" step="0.01" value={form.fee_amount || ""} onChange={upd("fee_amount")} data-testid="member-fee" className="mt-1 h-11" /></div>
          <div>
            <Label>Statut licence</Label>
            <Select value={form.license_status || "pending"} onValueChange={(v) => setForm({...form, license_status: v})}>
              <SelectTrigger className="mt-1 h-11" data-testid="member-license-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valid">En règle</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="expired">Expirée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Certificat médical</Label>
            <Select value={form.medical_cert_status || "missing"} onValueChange={(v) => setForm({...form, medical_cert_status: v})}>
              <SelectTrigger className="mt-1 h-11" data-testid="member-medical-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ok">Reçu</SelectItem>
                <SelectItem value="missing">Manquant</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={2} value={form.notes || ""} onChange={upd("notes")} data-testid="member-notes" className="mt-1" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button onClick={save} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="member-save-btn">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
