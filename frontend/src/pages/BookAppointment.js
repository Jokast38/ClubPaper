import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CalendarCheck, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

function fmt(iso) {
  try {
    return new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

export default function BookAppointment() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState(null);
  const [prospectNote, setProspectNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [booked, setBooked] = useState(null);

  useEffect(() => {
    api.get(`/public/booking/${token}`).then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || "Ce lien de réservation n'est plus valide."));
  }, [token]);

  const confirm = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const { data: appt } = await api.post(`/public/booking/${token}`, {
        employee_id: chosen.employee_id, start_at: chosen.start_at, prospect_note: prospectNote,
      });
      setBooked(appt);
      toast.success("Rendez-vous confirmé !");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Ce créneau n'est plus disponible, merci de recharger la page.");
    } finally { setBusy(false); }
  };

  if (error) return <div className="min-h-screen grid place-items-center text-slate-600 p-6 text-center">{error}</div>;
  if (!data) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;

  if (booked) {
    return (
      <div className="min-h-screen bg-slate-50 grid place-items-center p-4">
        <div className="paper-card p-8 max-w-md w-full text-center">
          <CheckCircle2 size={40} className="mx-auto text-emerald-500" />
          <h1 className="mt-4 font-display font-bold text-2xl text-slate-900">Rendez-vous confirmé</h1>
          <p className="mt-2 text-slate-600">{fmt(booked.start_at)}</p>
          <p className="mt-4 text-sm text-slate-500">Un email de confirmation avec une invitation calendrier vous a été envoyé.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4">
      <div className="paper-card p-8 max-w-xl w-full mx-auto mt-10">
        <div className="text-sm uppercase tracking-wide text-slate-500">ClubPaper</div>
        <h1 className="mt-1 font-display font-bold text-2xl text-slate-900">Choisissez votre créneau</h1>
        <p className="mt-2 text-slate-600">{data.appointment_type_label} — {data.lead_name}</p>

        {data.is_on_site && (
          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">Vos disponibilités (facultatif)</label>
            <Textarea rows={3} value={prospectNote} onChange={(e) => setProspectNote(e.target.value)} className="mt-1" placeholder="Ex : plutôt le matin, pas le mercredi…" data-testid="booking-prospect-note" />
          </div>
        )}

        <div className="mt-5 space-y-2 max-h-80 overflow-y-auto">
          {data.offers.length === 0 && (
            <p className="text-sm text-slate-500">Aucun créneau disponible pour le moment — contactez-nous directement.</p>
          )}
          {data.offers.map((o, i) => (
            <button
              key={i}
              onClick={() => setChosen(o)}
              className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition ${chosen === o ? "border-orange-500 bg-orange-50" : "border-slate-200 hover:border-slate-300"}`}
              data-testid={`booking-offer-${i}`}
            >
              <Clock size={16} className="text-slate-400 shrink-0" />
              <div>
                <div className="font-medium text-slate-900 capitalize">{fmt(o.start_at)}</div>
                {o.employee_name && <div className="text-xs text-slate-500">avec {o.employee_name}</div>}
              </div>
            </button>
          ))}
        </div>

        <Button disabled={!chosen || busy} onClick={confirm} className="mt-6 w-full h-14 rounded-full text-base" style={{ background: "#EA580C" }} data-testid="booking-confirm-btn">
          <CalendarCheck size={20} className="mr-2" />
          {busy ? "Confirmation…" : "Confirmer le rendez-vous"}
        </Button>
      </div>
    </div>
  );
}
