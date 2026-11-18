import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Megaphone, Plus, Send } from "lucide-react";
import { toast } from "sonner";
import RichTextEditor from "@/components/RichTextEditor";
import { useAuth } from "@/lib/AuthContext";
import ChannelPicker, { useChannels, CHANNEL_META } from "@/components/ChannelPicker";

export default function Announcements() {
  const { club } = useAuth() || {};
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", audience: "all" });
  const ch = useChannels("announcement");

  const load = async () => {
    const { data: a } = await api.get("/announcements");
    setItems(a);
  };
  useEffect(() => { load(); }, []);

  const teams = club?.teams || [];

  const send = async () => {
    const stripped = (form.body || "").replace(/<[^>]*>/g, "").trim();
    if (!form.title || !stripped) { toast.error("Titre et message sont obligatoires"); return; }
    try {
      const { data } = await api.post("/announcements", { ...form, channels: ch.value });
      const names = (data.channels || []).map((c) => CHANNEL_META[c].label);
      toast.success(names.length ? `Annonce publiée — envoi en cours (${names.join(", ")})` : "Annonce publiée sur l'espace du club");
      setForm({ title: "", body: "", audience: "all" });
      setTimeout(load, 4000);
      setOpen(false);
      load();
    } catch (err) { toast.error(err.response?.data?.detail || "Impossible de publier"); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display font-bold text-3xl text-slate-900">Annonces</h1>
          <p className="mt-1 text-slate-600">Historique complet, plus jamais perdu dans WhatsApp.</p>
        </div>
        <Button onClick={() => setOpen(true)} className="rounded-full h-11" style={{background:"var(--club-primary)"}} data-testid="announcement-new-btn">
          <Plus size={18} className="mr-2" />Nouvelle annonce
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 paper-card p-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><Megaphone size={28} strokeWidth={2.5} /></div>
          <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Aucune annonce</h3>
          <p className="mt-2 text-slate-600">Prévenez tout le club d'un tournoi, d'une AG ou d'une info importante.</p>
          <Button onClick={() => setOpen(true)} className="mt-6 rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="empty-new-announcement">
            <Plus size={18} className="mr-2" />Publier une annonce
          </Button>
        </div>
      ) : (
        <ul className="mt-6 space-y-4 stagger">
          {items.map((a) => (
            <li key={a.id} className="paper-card p-6" data-testid={`announcement-${a.id}`}>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><Megaphone size={18} strokeWidth={2.5} /></div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="font-display font-semibold text-lg text-slate-900">{a.title}</h3>
                    {a.audience !== "all" && <span className="pill-tag" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{a.audience.replace("team:", "")}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">{a.author_name} · {new Date(a.created_at).toLocaleString("fr-FR")}</div>
                  {(a.channels || []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5" data-testid={`announcement-delivery-${a.id}`}>
                      {a.channels.map((c) => {
                        const Icon = CHANNEL_META[c].icon;
                        const d = (a.delivery || {})[c];
                        return (
                          <span key={c} className="pill-tag status-pending inline-flex items-center gap-1">
                            <Icon size={11} />{CHANNEL_META[c].label}
                            {typeof d === "number" ? ` · ${d}` : d === "sent" ? " ✓" : d === "error" ? " ✗" : ""}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 prose prose-slate max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: a.body }} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="announcement-dialog">
          <DialogHeader><DialogTitle>Publier une annonce</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Titre *</Label><Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} data-testid="announcement-title" className="mt-1 h-11" /></div>
            <div>
              <Label>Message *</Label>
              <div className="mt-1"><RichTextEditor value={form.body} onChange={(html) => setForm({ ...form, body: html })} placeholder="Écrivez votre annonce…" /></div>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={form.audience} onValueChange={(v) => setForm({...form, audience: v})}>
                <SelectTrigger className="mt-1 h-11" data-testid="announcement-audience"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tout le club</SelectItem>
                  {teams.map((t) => <SelectItem key={t} value={`team:${t}`}>Équipe {t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Envoyer aussi par</Label>
              <div className="mt-2">
                <ChannelPicker value={ch.value} onChange={ch.setValue} allowed={ch.allowed} available={ch.available} testId="announcement-channels" />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {ch.value.length === 0 ? "Aucun envoi : l'annonce est seulement publiée dans l'espace du club." :
                  "Email et SMS : un message à chaque adhérent concerné (le SMS contient le titre). Telegram : publication de l'annonce complète dans le groupe des adhérents."}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} className="rounded-full">Annuler</Button>
            <Button onClick={send} className="rounded-full" style={{background:"var(--club-primary)"}} data-testid="announcement-send-btn">
              <Send size={16} className="mr-2" />Publier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
