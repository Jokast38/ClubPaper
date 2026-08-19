import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/AuthContext";
import { api, formatApiError } from "@/lib/api";
import { extractColorsFromImage, fileToDataUrl, applyClubTheme } from "@/lib/colorExtractor";
import { toast } from "sonner";
import { Upload, ArrowRight, ArrowLeft, Check } from "lucide-react";

const sports = ["Football", "Basketball", "Tennis", "Rugby", "Handball", "Volleyball", "Athlétisme", "Judo", "Natation", "Autre"];

export default function Onboarding() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "", sport: "Football", description: "", city: "", email: "", phone: "",
  });
  const [logo, setLogo] = useState("");
  const [theme, setTheme] = useState(null);
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setLogo(dataUrl);
      const extracted = await extractColorsFromImage(dataUrl, 3);
      setTheme(extracted);
      applyClubTheme(extracted);
      toast.success("Couleurs extraites automatiquement ✨");
    } catch {
      toast.error("Impossible de lire le logo. Essayez un autre fichier.");
    }
  };

  const submit = async () => {
    setLoading(true);
    try {
      await api.post("/clubs", form);
      if (logo || theme) {
        await api.put("/clubs/me", { logo_data_url: logo, theme: theme || undefined });
      }
      await refresh();
      toast.success("Votre club est prêt !");
      navigate("/app");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-8" data-testid="onboarding-stepper">
          {[1,2,3].map((n) => (
            <div key={n} className="flex-1 h-2 rounded-full" style={{background: step >= n ? "var(--club-primary)" : "#E2E8F0"}} />
          ))}
        </div>

        <div className="paper-card p-6 lg:p-10">
          {step === 1 && (
            <div className="fade-in">
              <h1 className="font-display font-bold text-3xl text-slate-900">Parlons de votre club</h1>
              <p className="mt-2 text-slate-600">Pas d'inquiétude, vous pourrez tout modifier plus tard.</p>

              <div className="mt-8 space-y-5">
                <div>
                  <Label>Nom du club *</Label>
                  <Input required value={form.name} onChange={update("name")} data-testid="onboarding-club-name" className="mt-1 h-12" placeholder="Ex. FC Beaumont" />
                </div>
                <div>
                  <Label>Sport principal</Label>
                  <Select value={form.sport} onValueChange={(v) => setForm({...form, sport: v})}>
                    <SelectTrigger className="mt-1 h-12" data-testid="onboarding-sport"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sports.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Ville</Label>
                  <Input value={form.city} onChange={update("city")} data-testid="onboarding-city" className="mt-1 h-12" placeholder="Ex. Beaumont-sur-Oise" />
                </div>
              </div>

              <div className="mt-10 flex justify-end">
                <Button disabled={!form.name} onClick={() => setStep(2)} data-testid="onboarding-next-1" className="rounded-full h-12 px-6" style={{background:"var(--club-primary)"}}>
                  Continuer <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="fade-in">
              <h1 className="font-display font-bold text-3xl text-slate-900">Votre logo, vos couleurs</h1>
              <p className="mt-2 text-slate-600">Uploadez votre logo — on en extrait automatiquement les couleurs pour habiller votre application.</p>

              <div className="mt-8 grid sm:grid-cols-2 gap-6 items-start">
                <label className="cursor-pointer group" data-testid="logo-upload-label">
                  <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} data-testid="logo-upload-input" />
                  <div className="border-2 border-dashed border-slate-300 rounded-2xl h-48 grid place-items-center bg-white group-hover:border-orange-400 transition">
                    {logo ? (
                      <img src={logo} alt="Logo" className="max-h-40 object-contain" />
                    ) : (
                      <div className="text-center">
                        <Upload size={28} className="mx-auto text-slate-400" />
                        <div className="mt-2 text-sm text-slate-500">Cliquez pour uploader</div>
                        <div className="text-xs text-slate-400">PNG, JPG (max 2 Mo)</div>
                      </div>
                    )}
                  </div>
                </label>

                <div>
                  <div className="text-sm font-medium text-slate-700 mb-3">Thème détecté</div>
                  <div className="space-y-2">
                    <ColorRow label="Couleur principale" color={theme?.primary || "#E2E8F0"} onChange={(v) => { const t = {...(theme || {primary:"", secondary:"", accent:""}), primary: v}; setTheme(t); applyClubTheme(t); }} testId="theme-primary" />
                    <ColorRow label="Couleur secondaire" color={theme?.secondary || "#0F172A"} onChange={(v) => { const t = {...(theme || {primary:"", secondary:"", accent:""}), secondary: v}; setTheme(t); applyClubTheme(t); }} testId="theme-secondary" />
                    <ColorRow label="Accent" color={theme?.accent || "#FACC15"} onChange={(v) => { const t = {...(theme || {primary:"", secondary:"", accent:""}), accent: v}; setTheme(t); applyClubTheme(t); }} testId="theme-accent" />
                  </div>
                </div>
              </div>

              <div className="mt-10 flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} data-testid="onboarding-back-2" className="rounded-full h-12 px-6"><ArrowLeft size={18} className="mr-2" />Retour</Button>
                <Button onClick={() => setStep(3)} data-testid="onboarding-next-2" className="rounded-full h-12 px-6" style={{background:"var(--club-primary)"}}>
                  Continuer <ArrowRight size={18} className="ml-2" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="fade-in">
              <h1 className="font-display font-bold text-3xl text-slate-900">Un dernier mot ?</h1>
              <p className="mt-2 text-slate-600">Ces infos apparaîtront sur la page publique de votre club.</p>

              <div className="mt-8 space-y-5">
                <div>
                  <Label>Description du club</Label>
                  <Textarea value={form.description} onChange={update("description")} data-testid="onboarding-description" className="mt-1" rows={3} placeholder="Ex. Club familial fondé en 1982, ouvert à tous les niveaux…" />
                </div>
                <div>
                  <Label>Email de contact</Label>
                  <Input type="email" value={form.email} onChange={update("email")} data-testid="onboarding-contact-email" className="mt-1 h-12" />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input value={form.phone} onChange={update("phone")} data-testid="onboarding-phone" className="mt-1 h-12" />
                </div>
              </div>

              <div className="mt-10 flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} data-testid="onboarding-back-3" className="rounded-full h-12 px-6"><ArrowLeft size={18} className="mr-2" />Retour</Button>
                <Button onClick={submit} disabled={loading} data-testid="onboarding-submit" className="rounded-full h-12 px-6" style={{background:"var(--club-primary)"}}>
                  {loading ? "Création…" : (<><Check size={18} className="mr-2" />Créer mon club</>)}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ColorRow({ label, color, onChange, testId }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg border border-slate-200" style={{background: color}} />
        <span className="text-sm text-slate-700">{label}</span>
      </div>
      <input type="color" value={color} onChange={(e) => onChange(e.target.value.toUpperCase())} data-testid={testId} className="w-8 h-8 rounded cursor-pointer border-0" />
    </div>
  );
}
