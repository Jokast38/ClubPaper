import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { applyClubTheme } from "@/lib/colorExtractor";
import { publicMediaUrl } from "@/lib/media";
import { ArrowLeft } from "lucide-react";

export default function BlogPost() {
  const { slug, postSlug } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.get(`/public/clubs/${slug}/blog/${postSlug}`).then(({ data }) => {
      setData(data);
      if (data.club.theme) applyClubTheme(data.club.theme);
      document.title = `${data.post.title} — ${data.club.name}`;
    }).catch(() => setError(true));
  }, [slug, postSlug]);

  if (error) return <div className="min-h-screen grid place-items-center text-slate-500">Article introuvable.</div>;
  if (!data) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;
  const { post, club } = data;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 lg:px-8 h-16 flex items-center gap-3">
          <button onClick={() => navigate(`/c/${slug}`)} className="text-sm text-slate-600 flex items-center gap-1 hover:text-slate-900" data-testid="blog-back-btn">
            <ArrowLeft size={16} /> {club.name}
          </button>
        </div>
      </header>
      <article className="max-w-3xl mx-auto px-4 lg:px-8 py-14">
        <div className="text-xs uppercase tracking-wide font-medium" style={{color:"var(--club-primary)"}}>{post.category}</div>
        <h1 className="font-display font-bold text-4xl lg:text-5xl text-slate-900 mt-3 leading-tight">{post.title}</h1>
        <div className="mt-3 text-sm text-slate-500">Par {post.author_name} · {new Date(post.created_at).toLocaleDateString("fr-FR", { day:"numeric", month:"long", year:"numeric" })}</div>
        {post.cover_image && <img src={publicMediaUrl(post.cover_image)} alt="" className="mt-8 rounded-2xl w-full object-cover max-h-[400px]" />}
        <div className="prose prose-slate prose-lg mt-10 max-w-none text-slate-800" dangerouslySetInnerHTML={{ __html: post.body }} />
        <div className="mt-16 border-t pt-8">
          <Link to={`/c/${slug}`} className="text-sm font-medium" style={{color:"var(--club-primary)"}}>← Retour à {club.name}</Link>
        </div>
      </article>
    </div>
  );
}
