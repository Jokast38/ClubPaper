import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { downloadPdf } from "@/lib/downloadPdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import RichTextEditor from "@/components/RichTextEditor";
import { Inbox, Send, FileText, PenSquare, Paperclip, X, Download, RefreshCw, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function Mailbox() {
  const [folder, setFolder] = useState("inbox"); // inbox | sent | templates | signature
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState(null);

  const openCompose = (prefill) => { setComposePrefill(prefill || null); setComposeOpen(true); };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Ma messagerie</h1>
          <p className="mt-1 text-slate-600">Boîte perso de l'administrateur — envoi, réception, modèles.</p>
        </div>
        <Button onClick={() => openCompose()} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="mailbox-compose-btn">
          <PenSquare size={18} className="mr-2" />Nouveau message
        </Button>
      </div>

      <div className="mt-6 flex gap-2 border-b border-slate-200 overflow-x-auto">
        {[
          { id: "inbox", label: "Boîte de réception", icon: Inbox },
          { id: "sent", label: "Envoyés", icon: Send },
          { id: "templates", label: "Modèles", icon: FileText },
          { id: "signature", label: "Signature", icon: Pencil },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFolder(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition flex items-center gap-1.5 ${folder === t.id ? "border-orange-600 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
            data-testid={`mailbox-tab-${t.id}`}
          >
            <t.icon size={15} />{t.label}
          </button>
        ))}
      </div>

      {folder === "inbox" && <InboxFolder />}
      {folder === "sent" && <SentFolder />}
      {folder === "templates" && <TemplatesFolder onUseTemplate={(tpl) => openCompose({ subject: tpl.subject, body_html: tpl.body_html })} />}
      {folder === "signature" && <SignatureSettings />}

      <ComposeDialog open={composeOpen} onOpenChange={setComposeOpen} prefill={composePrefill} />
    </div>
  );
}

function InboxFolder() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/mailbox/inbox", { params: { limit: 30 } });
      setData(data);
    } catch { toast.error("Impossible de charger la boîte de réception"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openMessage = async (uid) => {
    setLoadingDetail(true);
    try {
      const { data } = await api.get(`/admin/mailbox/inbox/${uid}`);
      setDetail(data);
      load(); // refresh unread state
    } catch { toast.error("Impossible d'ouvrir ce message"); }
    finally { setLoadingDetail(false); }
  };

  return (
    <div className="mt-4">
      <div className="flex justify-end mb-2">
        <Button size="sm" variant="outline" className="rounded-full" onClick={load} data-testid="mailbox-inbox-refresh">
          <RefreshCw size={14} className="mr-1.5" />Actualiser
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-slate-500 py-6 text-center">Chargement…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">Boîte de réception vide.</p>
      ) : (
        <div className="space-y-1">
          {data.items.map((m) => (
            <button
              key={m.uid}
              onClick={() => openMessage(m.uid)}
              className={`w-full text-left paper-card p-3 flex items-center gap-3 hover:-translate-y-0.5 transition-transform ${m.unread ? "border-l-4" : ""}`}
              style={m.unread ? { borderLeftColor: "var(--club-primary)" } : {}}
              data-testid={`mailbox-inbox-row-${m.uid}`}
            >
              <div className="min-w-0 flex-1">
                <div className={`truncate text-sm ${m.unread ? "font-semibold text-slate-900" : "text-slate-600"}`}>{m.from}</div>
                <div className={`truncate text-sm ${m.unread ? "font-medium text-slate-900" : "text-slate-500"}`}>{m.subject}</div>
              </div>
              <div className="text-xs text-slate-400 shrink-0">{m.date ? new Date(m.date).toLocaleDateString("fr-FR") : ""}</div>
            </button>
          ))}
        </div>
      )}

      <MessageDetailDialog message={detail} loading={loadingDetail} onOpenChange={(v) => !v && setDetail(null)} downloadPath={(idx) => `/admin/mailbox/inbox/${detail?.uid}/attachments/${idx}`} />
    </div>
  );
}

function SentFolder() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/admin/mailbox/sent");
      setItems(data);
    } catch { toast.error("Impossible de charger les envois"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="mt-4">
      {loading ? (
        <p className="text-sm text-slate-500 py-6 text-center">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-500 py-10 text-center">Aucun email envoyé pour l'instant.</p>
      ) : (
        <div className="space-y-1">
          {items.map((m) => (
            <button
              key={m.id}
              onClick={() => setDetail(m)}
              className="w-full text-left paper-card p-3 flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
              data-testid={`mailbox-sent-row-${m.id}`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-600">À : {m.to.join(", ")}</div>
                <div className="truncate text-sm font-medium text-slate-900">{m.subject}</div>
              </div>
              <span className={`pill-tag shrink-0 ${m.status === "sent" ? "status-paid" : "status-overdue"}`}>{m.status === "sent" ? "Envoyé" : "Échec"}</span>
              <div className="text-xs text-slate-400 shrink-0">{new Date(m.created_at).toLocaleDateString("fr-FR")}</div>
            </button>
          ))}
        </div>
      )}

      <MessageDetailDialog
        message={detail ? { ...detail, from: `Moi → ${detail.to.join(", ")}${detail.cc?.length ? ` (cc: ${detail.cc.join(", ")})` : ""}`, body_html: detail.body_html } : null}
        onOpenChange={(v) => !v && setDetail(null)}
        downloadPath={(idx) => `/admin/mailbox/sent/${detail?.id}/attachments/${idx}`}
      />
    </div>
  );
}

function MessageDetailDialog({ message, loading, onOpenChange, downloadPath }) {
  return (
    <Dialog open={!!message || loading} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="mailbox-message-dialog">
        {loading && <p className="text-sm text-slate-500 py-10 text-center">Chargement…</p>}
        {message && !loading && (
          <>
            <DialogHeader>
              <DialogTitle>{message.subject}</DialogTitle>
            </DialogHeader>
            <div className="text-sm text-slate-500 -mt-2">{message.from}</div>
            <div
              className="prose prose-sm max-w-none border-t border-slate-100 pt-4"
              dangerouslySetInnerHTML={{ __html: message.body_html || `<p>${(message.body_text || "").replace(/\n/g, "<br/>")}</p>` }}
            />
            {message.attachments?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <div className="text-xs font-medium text-slate-500 uppercase mb-2">Pièces jointes</div>
                <div className="flex flex-wrap gap-2">
                  {message.attachments.map((a, i) => (
                    <button
                      key={i}
                      onClick={() => downloadPdf(downloadPath(a.index ?? i), a.filename)}
                      className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100"
                      data-testid={`mailbox-attachment-${i}`}
                    >
                      <Paperclip size={14} />{a.filename}
                      <Download size={14} className="text-slate-400" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TemplatesFolder({ onUseTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/mailbox/templates");
    setTemplates(data);
  };
  useEffect(() => { load(); }, []);

  const remove = async (id) => {
    if (!window.confirm("Supprimer ce modèle ?")) return;
    await api.delete(`/admin/mailbox/templates/${id}`);
    toast.success("Modèle supprimé");
    load();
  };

  return (
    <div className="mt-4">
      <div className="flex justify-end mb-3">
        <Button size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={() => { setEditing(null); setOpen(true); }} data-testid="mailbox-new-template-btn">
          Nouveau modèle
        </Button>
      </div>
      {templates.length === 0 && <p className="text-sm text-slate-500 py-10 text-center">Aucun modèle pour l'instant.</p>}
      <div className="space-y-2">
        {templates.map((t) => (
          <div key={t.id} className="paper-card p-4 flex items-center gap-3" data-testid={`mailbox-template-${t.id}`}>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">{t.name}</div>
              <div className="text-sm text-slate-500 truncate">{t.subject}</div>
            </div>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => onUseTemplate(t)} data-testid={`mailbox-use-template-${t.id}`}>Utiliser</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}><Pencil size={16} /></Button>
            <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(t.id)}><Trash2 size={16} /></Button>
          </div>
        ))}
      </div>
      <TemplateDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function TemplateDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({ name: "", subject: "", body_html: "" });
  useEffect(() => { setForm(editing || { name: "", subject: "", body_html: "" }); }, [editing, open]);

  const save = async () => {
    if (!form.name || !form.subject) { toast.error("Nom et objet sont obligatoires"); return; }
    try {
      if (editing?.id) await api.put(`/admin/mailbox/templates/${editing.id}`, form);
      else await api.post("/admin/mailbox/templates", form);
      toast.success("Modèle enregistré");
      onSaved();
    } catch { toast.error("Impossible d'enregistrer"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" data-testid="mailbox-template-dialog">
        <DialogHeader><DialogTitle>{editing?.id ? "Modifier le modèle" : "Nouveau modèle"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nom du modèle</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 h-11" data-testid="template-name" /></div>
          <div><Label>Objet</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="mt-1 h-11" data-testid="template-subject" /></div>
          <div>
            <Label>Message</Label>
            <div className="mt-1 border rounded-xl overflow-hidden">
              <RichTextEditor value={form.body_html} onChange={(html) => setForm({ ...form, body_html: html })} placeholder="Contenu du modèle…" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button onClick={save} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="template-save-btn">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SignatureSettings() {
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/admin/mailbox/signature").then(({ data }) => setSignature(data.signature || ""));
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/mailbox/signature", { signature });
      toast.success("Signature enregistrée");
    } catch { toast.error("Impossible d'enregistrer"); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-4 paper-card p-6 max-w-2xl">
      <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Signature de mail</h3>
      <p className="text-sm text-slate-600 mb-4">Ajoutée automatiquement en bas de chaque nouveau message composé.</p>
      <div className="border rounded-xl overflow-hidden">
        <RichTextEditor value={signature} onChange={setSignature} placeholder="Cordialement, Votre nom, ClubPaper…" />
      </div>
      <Button onClick={save} disabled={busy} className="mt-4 rounded-full" style={{background:"var(--club-primary)"}} data-testid="mailbox-save-signature-btn">
        {busy ? "Enregistrement…" : "Enregistrer la signature"}
      </Button>
    </div>
  );
}

function ComposeDialog({ open, onOpenChange, prefill }) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTo(""); setCc(""); setFiles([]);
    if (prefill) {
      setSubject(prefill.subject || "");
      setBody(prefill.body_html || "");
    } else {
      setSubject("");
      api.get("/admin/mailbox/signature").then(({ data }) => {
        setBody(data.signature ? `<p></p><p></p>${data.signature}` : "");
      }).catch(() => setBody(""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill]);

  const addFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    setFiles((prev) => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const send = async () => {
    if (!to.trim() || !subject.trim()) { toast.error("Destinataire et objet sont obligatoires"); return; }
    setSending(true);
    try {
      const fd = new FormData();
      fd.append("to", to);
      fd.append("cc", cc);
      fd.append("subject", subject);
      fd.append("body_html", body);
      files.forEach((f) => fd.append("files", f));
      await api.post("/admin/mailbox/send", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Email envoyé");
      onOpenChange(false);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Impossible d'envoyer l'email");
    } finally { setSending(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="mailbox-compose-dialog">
        <DialogHeader><DialogTitle>Nouveau message</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>À</Label><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@exemple.com, autre@exemple.com" className="mt-1 h-11" data-testid="compose-to" /></div>
          <div><Label>Cc (facultatif)</Label><Input value={cc} onChange={(e) => setCc(e.target.value)} className="mt-1 h-11" data-testid="compose-cc" /></div>
          <div><Label>Objet</Label><Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 h-11" data-testid="compose-subject" /></div>
          <div>
            <Label>Message</Label>
            <div className="mt-1 border rounded-xl overflow-hidden">
              <RichTextEditor value={body} onChange={setBody} placeholder="Votre message…" />
            </div>
          </div>
          <div>
            <label className="cursor-pointer inline-flex items-center gap-2 text-sm text-orange-600">
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={addFiles} data-testid="compose-attach-input" />
              <Paperclip size={16} />Joindre des fichiers
            </label>
            {files.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <span key={i} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full bg-slate-100 text-slate-700" data-testid={`compose-file-${i}`}>
                    {f.name}
                    <button onClick={() => removeFile(i)} className="text-slate-400 hover:text-red-600"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button onClick={send} disabled={sending} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="compose-send-btn">
            {sending ? "Envoi…" : "Envoyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
