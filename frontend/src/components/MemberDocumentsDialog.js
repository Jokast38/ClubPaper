import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, FileText, Trash2, Download } from "lucide-react";
import { toast } from "sonner";

const KINDS = {
  medical_cert: "Certificat médical",
  license: "Licence",
  other: "Autre",
};

export default function MemberDocumentsDialog({ member, open, onOpenChange }) {
  const [docs, setDocs] = useState([]);
  const [kind, setKind] = useState("medical_cert");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!member) return;
    const { data } = await api.get(`/members/${member.id}/documents`);
    setDocs(data);
  };
  useEffect(() => { if (open) load(); }, [open, member]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      await api.post(`/members/${member.id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success("Document ajouté");
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible d'uploader");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Supprimer ce document ?")) return;
    await api.delete(`/documents/${id}`);
    toast.success("Document supprimé");
    load();
  };

  const download = async (doc) => {
    try {
      const res = await api.get(`/documents/${doc.id}/download`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = doc.original_filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error("Téléchargement impossible"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" data-testid="documents-dialog">
        <DialogHeader>
          <DialogTitle>Documents — {member?.first_name} {member?.last_name}</DialogTitle>
        </DialogHeader>

        <div className="paper-card p-4 bg-slate-50 border-slate-200">
          <div className="text-sm font-medium text-slate-700 mb-2">Ajouter un document</div>
          <div className="grid grid-cols-3 gap-2">
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger className="h-11 col-span-1" data-testid="doc-kind"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(KINDS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
            <label className="col-span-2">
              <input type="file" accept="application/pdf,image/*" className="hidden" onChange={upload} disabled={busy} data-testid="doc-upload-input" />
              <Button asChild disabled={busy} className="w-full h-11 rounded-md" style={{background:"var(--club-primary)"}} data-testid="doc-upload-btn">
                <span><Upload size={16} className="mr-2" />{busy ? "Envoi…" : "Choisir un fichier"}</span>
              </Button>
            </label>
          </div>
          <div className="text-xs text-slate-500 mt-2">PDF ou image, max 15 Mo.</div>
        </div>

        <div className="mt-4 space-y-2 max-h-80 overflow-auto">
          {docs.length === 0 ? (
            <div className="text-center text-sm text-slate-500 py-6">Aucun document pour l'instant.</div>
          ) : docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200" data-testid={`doc-${d.id}`}>
              <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-700 grid place-items-center"><FileText size={18} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate text-slate-900">{d.original_filename}</div>
                <div className="text-xs text-slate-500">{KINDS[d.kind] || d.kind} · {(d.size / 1024).toFixed(0)} Ko · {new Date(d.created_at).toLocaleDateString("fr-FR")}</div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => download(d)} data-testid={`doc-download-${d.id}`}><Download size={16} /></Button>
              <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(d.id)} data-testid={`doc-delete-${d.id}`}><Trash2 size={16} /></Button>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
