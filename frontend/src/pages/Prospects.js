import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { UserPlus, Mail, Phone } from "lucide-react";
import { toast } from "sonner";

export default function Prospects() {
  const [items, setItems] = useState([]);

  const load = async () => {
    const { data } = await api.get("/prospects");
    setItems(data);
  };
  useEffect(() => { load(); }, []);

  const convert = async (id) => {
    try {
      await api.post(`/prospects/${id}/convert`);
      toast.success("Prospect converti en adhérent");
      load();
    } catch { toast.error("Impossible de convertir"); }
  };

  return (
    <div>
      <div>
        <h1 className="font-display font-bold text-3xl text-slate-900">Demandes d'inscription</h1>
        <p className="mt-1 text-slate-600">Les demandes reçues depuis votre page publique.</p>
      </div>

      {items.length === 0 ? (
        <div className="mt-10 paper-card p-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-orange-100 text-orange-700 grid place-items-center"><UserPlus size={28} strokeWidth={2.5} /></div>
          <h3 className="mt-4 font-display font-semibold text-xl text-slate-900">Aucune demande</h3>
          <p className="mt-2 text-slate-600">Partagez le lien de votre page publique pour attirer de nouveaux adhérents.</p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3 stagger">
          {items.map((p) => (
            <li key={p.id} className="paper-card p-4 flex flex-wrap items-center gap-4" data-testid={`prospect-${p.id}`}>
              <div className="w-11 h-11 rounded-xl grid place-items-center font-bold text-white shrink-0" style={{background:"var(--club-primary)"}}>{p.first_name?.[0]}{p.last_name?.[0]}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-slate-900">{p.first_name} {p.last_name}</div>
                <div className="text-sm text-slate-500 flex flex-wrap gap-3">
                  <span className="flex items-center gap-1"><Mail size={12} />{p.email}</span>
                  {p.phone && <span className="flex items-center gap-1"><Phone size={12} />{p.phone}</span>}
                </div>
                {p.team_interest && <span className="pill-tag mt-2" style={{background:"var(--club-primary-soft)", color:"var(--club-primary)"}}>{p.team_interest}</span>}
                {p.message && <p className="mt-2 text-sm text-slate-600">{p.message}</p>}
              </div>
              <div className="flex gap-2 shrink-0">
                <span className={`pill-tag ${p.status === "converted" ? "status-paid" : "status-pending"}`}>{p.status === "converted" ? "Adhérent" : "Nouveau"}</span>
                {p.status !== "converted" && (
                  <Button size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={() => convert(p.id)} data-testid={`prospect-convert-${p.id}`}>
                    Ajouter comme adhérent
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
