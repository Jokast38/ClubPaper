import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { applyClubTheme } from "@/lib/colorExtractor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MapPin, Mail, Phone, Users, Calendar as CalIcon, ArrowRight } from "lucide-react";
import { publicMediaUrl } from "@/lib/media";

export default function PublicClub() {
  const { slug } = useParams();
  const [club, setClub] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(false);
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", team_interest: "", message: "" });
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    api.get(`/public/clubs/${slug}`).then(({ data }) => {
      setClub(data);
      if (data.theme) applyClubTheme(data.theme);
      document.title = data.name;
    }).catch(() => setError(true));
    api.get(`/public/clubs/${slug}/blog`).then(({ data }) => setPosts(data)).catch(() => {});
  }, [slug]);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post(`/public/clubs/${slug}/prospects`, form);
      setSent(true);
      toast.success("Votre demande a bien été reçue !");
    } catch (err) {
      toast.error("Impossible d'envoyer, réessayez.");
    } finally { setSending(false); }
  };

  if (error) return <Empty />;
  if (!club) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;

  const primary = club.theme?.primary || "#EA580C";

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <header className="relative overflow-hidden" style={{background: `linear-gradient(135deg, ${primary}, ${club.theme?.secondary || "#0F172A"})`}}>
        <div
          className="absolute inset-0 opacity-20 mix-blend-overlay bg-cover bg-center"
          style={{backgroundImage: `url('${club.hero_image_data_url || "https://images.unsplash.com/photo-1526232761682-d26e03ac148e"}')`}}
        />
        <div className="relative max-w-5xl mx-auto px-4 lg:px-8 py-14 lg:py-20 text-white">
          <div className="flex items-center gap-4">
            {club.logo_data_url && <img src={club.logo_data_url} alt="" className="w-20 h-20 rounded-2xl bg-white/95 p-2 object-contain" />}
            <div>
              <div className="text-sm uppercase tracking-wide opacity-80">{club.sport}{club.city ? ` · ${club.city}` : ""}</div>
              <h1 className="font-display font-bold text-3xl sm:text-5xl mt-1">{club.name}</h1>
            </div>
          </div>
          {club.description && <p className="mt-6 text-lg lg:text-xl max-w-2xl opacity-95 leading-relaxed">{club.description}</p>}
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#rejoindre">
              <Button className="rounded-full h-12 px-6 bg-white text-slate-900 hover:bg-white/90" data-testid="public-join-cta">Rejoindre le club</Button>
            </a>
            {club.email && <a href={`mailto:${club.email}`}><Button variant="outline" className="rounded-full h-12 px-6 border-white/60 text-white hover:bg-white/10">Nous contacter</Button></a>}
          </div>
        </div>
      </header>

      {/* Stats + info */}
      <section className="max-w-5xl mx-auto px-4 lg:px-8 py-16 grid md:grid-cols-3 gap-6">
        <StatBox icon={Users} label="Adhérents" value={club.members_count || 0} color={primary} />
        <StatBox icon={CalIcon} label="Saison" value={club.season} color={primary} />
        <StatBox icon={MapPin} label="Ville" value={club.city || "—"} color={primary} />
      </section>

      {/* Contact + address */}
      <section className="bg-slate-50 py-16">
        <div className="max-w-5xl mx-auto px-4 lg:px-8 grid md:grid-cols-2 gap-8">
          <div>
            <h2 className="font-display text-3xl font-bold text-slate-900">Où nous trouver</h2>
            <ul className="mt-6 space-y-3 text-slate-700">
              {club.address && <li className="flex gap-3"><MapPin className="shrink-0" size={20} style={{color: primary}} /><span>{club.address}{club.city ? `, ${club.city}` : ""}</span></li>}
              {club.email && <li className="flex gap-3"><Mail className="shrink-0" size={20} style={{color: primary}} /><a href={`mailto:${club.email}`}>{club.email}</a></li>}
              {club.phone && <li className="flex gap-3"><Phone className="shrink-0" size={20} style={{color: primary}} /><a href={`tel:${club.phone}`}>{club.phone}</a></li>}
            </ul>
            <img
              src={club.about_image_data_url || "https://images.pexels.com/photos/7611541/pexels-photo-7611541.jpeg"}
              alt=""
              className="mt-8 rounded-2xl w-full object-cover h-64"
            />
          </div>
          <div id="rejoindre" className="paper-card p-8">
            <h2 className="font-display text-2xl font-bold text-slate-900">Rejoindre {club.name}</h2>
            <p className="mt-2 text-slate-600">Laissez-nous vos coordonnées, le bureau vous contactera rapidement.</p>
            {sent ? (
              <div className="mt-8 p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800">
                <div className="font-semibold text-lg">Merci !</div>
                <p className="mt-1 text-sm">Votre demande a bien été enregistrée. Le club vous recontactera prochainement.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-6 space-y-3" data-testid="public-prospect-form">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Prénom *</Label><Input required value={form.first_name} onChange={(e) => setForm({...form, first_name: e.target.value})} className="mt-1 h-11" data-testid="prospect-first-name" /></div>
                  <div><Label>Nom *</Label><Input required value={form.last_name} onChange={(e) => setForm({...form, last_name: e.target.value})} className="mt-1 h-11" data-testid="prospect-last-name" /></div>
                </div>
                <div><Label>Email *</Label><Input type="email" required value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="mt-1 h-11" data-testid="prospect-email" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Téléphone</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="mt-1 h-11" data-testid="prospect-phone" /></div>
                  <div><Label>Équipe souhaitée</Label><Input placeholder="Ex. U11" value={form.team_interest} onChange={(e) => setForm({...form, team_interest: e.target.value})} className="mt-1 h-11" data-testid="prospect-team" /></div>
                </div>
                <div><Label>Message (facultatif)</Label><Textarea rows={2} value={form.message} onChange={(e) => setForm({...form, message: e.target.value})} className="mt-1" data-testid="prospect-message" /></div>
                <Button type="submit" disabled={sending} className="w-full h-12 rounded-full text-base" style={{background: primary}} data-testid="prospect-submit-btn">
                  {sending ? "Envoi…" : "Envoyer ma demande"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>

      {posts.length > 0 && (
        <section className="py-16">
          <div className="max-w-5xl mx-auto px-4 lg:px-8">
            <div className="flex items-end justify-between flex-wrap gap-3">
              <h2 className="font-display text-3xl font-bold text-slate-900">Actualités & saison</h2>
              <span className="text-sm text-slate-500">{posts.length} article{posts.length > 1 ? "s" : ""}</span>
            </div>
            <div className="mt-8 grid md:grid-cols-2 lg:grid-cols-3 gap-6 stagger">
              {posts.map((p) => (
                <a key={p.id} href={`/c/${slug}/blog/${p.slug}`} className="paper-card overflow-hidden hover:-translate-y-0.5 transition-transform" data-testid={`public-post-${p.id}`}>
                  {p.cover_image && <img src={publicMediaUrl(p.cover_image)} alt="" className="w-full h-40 object-cover" />}
                  <div className="p-6">
                    <span className="pill-tag" style={{background: "var(--club-primary-soft)", color: primary}}>{p.category}</span>
                    <h3 className="mt-4 font-display font-semibold text-lg text-slate-900 line-clamp-2">{p.title}</h3>
                    {p.excerpt && <p className="mt-2 text-sm text-slate-600 line-clamp-3">{p.excerpt}</p>}
                    <div className="mt-4 text-xs text-slate-500 flex items-center gap-1">
                      {new Date(p.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} <ArrowRight size={12} />
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      <footer className="py-8 text-center text-sm text-slate-500">
        Propulsé par <a href="/" className="font-medium">ClubPaper</a>
      </footer>
    </div>
  );
}

function StatBox({ icon: Icon, label, value, color }) {
  return (
    <div className="paper-card p-6">
      <div className="w-11 h-11 rounded-xl grid place-items-center text-white" style={{background: color}}><Icon size={22} strokeWidth={2.5} /></div>
      <div className="mt-4 text-sm text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="mt-1 font-display font-bold text-2xl text-slate-900">{value}</div>
    </div>
  );
}

function Empty() {
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-3xl font-bold text-slate-900">Club introuvable</h1>
        <p className="mt-2 text-slate-600">L'adresse que vous avez saisie n'existe pas.</p>
        <a href="/" className="mt-6 inline-block text-orange-600 font-medium">Retour à l'accueil</a>
      </div>
    </div>
  );
}
