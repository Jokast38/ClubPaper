import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Search, Building2 } from "lucide-react";

export default function Annuaire() {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sport, setSport] = useState("");
  const [data, setData] = useState({ items: [], total: 0, sports: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "Annuaire des clubs — ClubPaper";
  }, []);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(() => {
      api.get("/public/annuaire", { params: { q, city, sport, limit: 60 } })
        .then(({ data }) => setData(data))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, city, sport]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white py-14 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="font-display font-bold text-3xl lg:text-4xl">Annuaire des clubs sportifs</h1>
          <p className="mt-3 text-slate-300">Retrouvez votre club et revendiquez sa fiche pour la mettre à jour.</p>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 -mt-7">
        <div className="paper-card p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom du club" className="h-11 pl-9" data-testid="annuaire-search" />
          </div>
          <div className="relative w-[200px]">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ville" className="h-11 pl-9" data-testid="annuaire-city" />
          </div>
          <Select value={sport || "all"} onValueChange={(v) => setSport(v === "all" ? "" : v)}>
            <SelectTrigger className="h-11 w-[180px]" data-testid="annuaire-sport"><SelectValue placeholder="Tous sports" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous sports</SelectItem>
              {data.sports.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-10">
        {loading && <p className="text-slate-400 text-sm">Recherche…</p>}
        {!loading && data.items.length === 0 && (
          <p className="text-slate-500 text-sm">Aucun club ne correspond à votre recherche.</p>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.items.map((c) => (
            <Link key={c.annuaire_slug} to={`/annuaire/${c.annuaire_slug}`} className="paper-card p-5 hover:shadow-md transition" data-testid={`annuaire-card-${c.annuaire_slug}`}>
              <div className="w-10 h-10 rounded-xl bg-orange-100 text-orange-700 grid place-items-center"><Building2 size={18} strokeWidth={2.5} /></div>
              <div className="mt-3 font-display font-bold text-slate-900">{c.name}</div>
              <div className="text-sm text-slate-500 mt-0.5">{c.sport}{c.city ? ` · ${c.city}` : ""}</div>
              {c.claim_status === "revendique" && <span className="pill-tag status-paid mt-2 inline-block">Sur ClubPaper</span>}
            </Link>
          ))}
        </div>
        {!loading && data.total > data.items.length && (
          <p className="mt-6 text-center text-sm text-slate-400">{data.items.length} / {data.total} clubs affichés — affinez votre recherche pour voir plus de résultats.</p>
        )}
      </div>
    </div>
  );
}
