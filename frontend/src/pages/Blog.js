import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Newspaper, Plus, Edit3, Trash2, ExternalLink, ImagePlus, X } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import { uploadImage, publicMediaUrl } from "@/lib/media";

const CATEGORIES = { actualite: "Actualité", saison: "Saison", discipline: "Discipline" };

export default function Blog() {
  const { club } = useAuth();
  const [posts, setPosts] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data } = await api.get("/blog");
    setPosts(data);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing({ category: "actualite", published: true }); setOpen(true); };
  const openEdit = (p) => { setEditing(p); setOpen(true); };
  const remove = async (id) => {
    if (!window.confirm("Supprimer cet article ?")) return;
    await api.delete(`/blog/${id}`);
    toast.success("Article supprimé");
    load();
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Blog du club</h1>
          <p className="mt-1 text-slate-600">Vos articles apparaissent sur la page publique du club, super pour le SEO.</p>
        </div>
        <Button onClick={openNew} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="blog-new-btn">
          <Plus size={18} className="mr-2" />Écrire un article
        </Button>
      </div>

      {posts.length === 0 ? (
        <div className="mt-10 paper-card p-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><Newspaper size={28} strokeWidth={2.5} /></div>
          <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Pas encore d'article</h3>
          <p className="mt-2 text-slate-600">Racontez la saison, présentez vos disciplines, gardez vos supporters informés.</p>
          <Button onClick={openNew} className="mt-6 rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="empty-new-post">
            <Plus size={18} className="mr-2" />Écrire un article
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-3 stagger">
          {posts.map((p) => (
            <li key={p.id} className="paper-card p-4 flex flex-wrap items-center gap-4" data-testid={`post-${p.id}`}>
              <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Newspaper size={20} strokeWidth={2.5} /></div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="font-medium text-slate-900 truncate">{p.title}</div>
                  <span className="pill-tag" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{CATEGORIES[p.category] || p.category}</span>
                  {!p.published && <span className="pill-tag status-pending">Brouillon</span>}
                </div>
                <div className="text-xs text-slate-500 mt-1">{new Date(p.created_at).toLocaleDateString("fr-FR")} · /{p.slug}</div>
                {p.excerpt && <p className="mt-1 text-sm text-slate-600">{p.excerpt}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                {club && p.published && (
                  <a href={`/c/${club.slug}/blog/${p.slug}`} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="ghost" data-testid={`post-view-${p.id}`}><ExternalLink size={16} /></Button>
                  </a>
                )}
                <Button size="sm" variant="ghost" onClick={() => openEdit(p)} data-testid={`post-edit-${p.id}`}><Edit3 size={16} /></Button>
                <Button size="sm" variant="ghost" className="text-red-600" onClick={() => remove(p.id)} data-testid={`post-delete-${p.id}`}><Trash2 size={16} /></Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <PostDialog open={open} onOpenChange={setOpen} editing={editing} onSaved={() => { setOpen(false); load(); }} />
    </div>
  );
}

function PostDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState({});
  const [uploading, setUploading] = useState(false);
  useEffect(() => { setForm(editing || {}); }, [editing, open]);
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  const onCoverUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const path = await uploadImage(file, "blog");
    setUploading(false);
    e.target.value = "";
    if (path) { setForm({ ...form, cover_image: path }); toast.success("Image de couverture ajoutée"); }
  };

  const save = async () => {
    const bodyStripped = (form.body || "").replace(/<[^>]*>/g, "").trim();
    if (!form.title || !bodyStripped) { toast.error("Titre et contenu sont obligatoires"); return; }
    try {
      const payload = {
        title: form.title, slug: form.slug,
        excerpt: form.excerpt || "",
        body: form.body, category: form.category || "actualite",
        cover_image: form.cover_image || "",
        published: form.published !== false,
      };
      if (editing?.id) await api.put(`/blog/${editing.id}`, payload);
      else await api.post("/blog", payload);
      toast.success(editing?.id ? "Article mis à jour" : "Article publié");
      onSaved();
    } catch { toast.error("Impossible d'enregistrer"); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="post-dialog">
        <DialogHeader><DialogTitle>{editing?.id ? "Modifier l'article" : "Nouvel article"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Titre *</Label><Input value={form.title || ""} onChange={upd("title")} data-testid="post-title" className="mt-1 h-11" placeholder="Ex. Bilan de la saison 2024-2025" /></div>

          <div>
            <Label>Image de couverture</Label>
            {form.cover_image ? (
              <div className="mt-1 relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200" data-testid="post-cover-preview">
                <img src={publicMediaUrl(form.cover_image)} alt="" className="w-full h-40 object-cover pointer-events-none" />
                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setForm((f) => ({ ...f, cover_image: "" })); }} className="absolute top-2 right-2 w-9 h-9 rounded-full bg-white hover:bg-slate-50 grid place-items-center shadow z-10" data-testid="post-cover-remove" aria-label="Retirer l'image">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <label className="mt-1 cursor-pointer block">
                <input type="file" accept="image/*" className="hidden" onChange={onCoverUpload} disabled={uploading} data-testid="post-cover-input" />
                <div className="border-2 border-dashed border-slate-300 rounded-xl h-32 grid place-items-center hover:border-orange-400 transition">
                  <div className="text-center text-slate-500 text-sm">
                    <ImagePlus size={22} className="mx-auto text-slate-400" />
                    <div className="mt-1">{uploading ? "Envoi…" : "Ajouter une image (JPG, PNG, WEBP)"}</div>
                  </div>
                </div>
              </label>
            )}
          </div>

          <div>
            <Label>Catégorie</Label>
            <Select value={form.category || "actualite"} onValueChange={(v) => setForm({...form, category: v})}>
              <SelectTrigger className="mt-1 h-11" data-testid="post-category"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="actualite">Actualité</SelectItem>
                <SelectItem value="saison">Bilan / Info de saison</SelectItem>
                <SelectItem value="discipline">Discipline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Résumé (facultatif)</Label><Textarea rows={2} value={form.excerpt || ""} onChange={upd("excerpt")} data-testid="post-excerpt" className="mt-1" /></div>
          <div>
            <Label>Contenu *</Label>
            <div className="mt-1"><RichTextEditor value={form.body || ""} onChange={(html) => setForm({ ...form, body: html })} /></div>
          </div>
          <label className="flex items-center gap-2 mt-2 cursor-pointer">
            <Checkbox checked={form.published !== false} onCheckedChange={(v) => setForm({...form, published: !!v})} data-testid="post-published" />
            <span className="text-sm text-slate-700">Publier sur la page publique du club</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button onClick={save} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="post-save-btn">Enregistrer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
