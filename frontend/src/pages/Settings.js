import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { extractColorsFromImage, fileToDataUrl, applyClubTheme } from "@/lib/colorExtractor";
import { toast } from "sonner";
import { Upload, Save, Globe, CreditCard, LogOut, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import IntegrationsPanel from "@/components/IntegrationsPanel";
import SeasonSettingsPanel from "@/components/SeasonSettingsPanel";
import NotificationsPanel from "@/components/NotificationsPanel";
import DrivePanel from "@/components/DrivePanel";
import CalendarSyncPanel from "@/components/CalendarSyncPanel";
import SignaturePad from "@/components/SignaturePad";

export default function Settings() {
  const { club, refresh, logout } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState({});
  const [theme, setTheme] = useState(null);
  const [logo, setLogo] = useState("");
  const [signature, setSignature] = useState("");
  const [heroImage, setHeroImage] = useState("");
  const [aboutImage, setAboutImage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (club) {
      setForm({
        name: club.name, sport: club.sport, description: club.description,
        city: club.city, address: club.address, email: club.email,
        phone: club.phone, website_url: club.website_url, default_fee: club.default_fee, teams: (club.teams || []).join(", "),
      });
      setTheme(club.theme);
      setLogo(club.logo_data_url || "");
      setSignature(club.signature_data_url || "");
      setHeroImage(club.hero_image_data_url || "");
      setAboutImage(club.about_image_data_url || "");
    }
  }, [club]);

  const upd = (k) => (e) => setForm({ ...form, [k]: e.target?.value ?? e });

  const onLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    setLogo(dataUrl);
    let extracted = null;
    try {
      extracted = await extractColorsFromImage(dataUrl, 3);
      setTheme(extracted);
      applyClubTheme(extracted);
    } catch { /* color extraction is best-effort */ }
    try {
      await api.put("/clubs/me", { logo_data_url: dataUrl, theme: extracted || undefined });
      await refresh();
      toast.success("Logo enregistré ✅");
    } catch {
      toast.error("Impossible d'enregistrer le logo");
    }
  };

  const onSignatureChange = async (dataUrl) => {
    setSignature(dataUrl);
    try {
      await api.put("/clubs/me", { signature_data_url: dataUrl });
      await refresh();
      toast.success(dataUrl ? "Signature enregistrée ✅" : "Signature supprimée");
    } catch {
      toast.error("Impossible d'enregistrer la signature");
    }
  };

  const onPublicImage = (field, setter, label) => async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    setter(dataUrl);
    try {
      await api.put("/clubs/me", { [field]: dataUrl });
      await refresh();
      toast.success(`${label} enregistrée ✅`);
    } catch {
      toast.error(`Impossible d'enregistrer ${label.toLowerCase()}`);
    }
  };

  const removePublicImage = (field, setter, label) => async () => {
    setter("");
    try {
      await api.put("/clubs/me", { [field]: "" });
      await refresh();
      toast.success(`${label} réinitialisée`);
    } catch {
      toast.error("Impossible de réinitialiser");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        default_fee: parseFloat(form.default_fee) || 0,
        teams: (form.teams || "").split(",").map((t) => t.trim()).filter(Boolean),
        logo_data_url: logo,
        signature_data_url: signature,
        theme: theme || undefined,
      };
      await api.put("/clubs/me", payload);
      await refresh();
      toast.success("Modifications enregistrées");
    } catch { toast.error("Impossible d'enregistrer"); }
    finally { setBusy(false); }
  };

  const subscribe = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/payments/checkout", {
        lookup_key: "clubmanager_monthly",
        origin_url: window.location.origin,
      });
      window.location.href = data.checkout_url;
    } catch (e) {
      toast.error("Impossible de démarrer l'abonnement");
    } finally { setBusy(false); }
  };

  if (!club) return null;
  const trialEnds = club.trial_ends_at ? new Date(club.trial_ends_at) : null;
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds - new Date()) / 86400000)) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display font-bold text-3xl text-slate-900">Paramètres du club</h1>
        <p className="mt-1 text-slate-600">Toutes les infos publiques et le thème visuel de votre club.</p>
      </div>

      {/* Subscription */}
      <div className="paper-card p-6" data-testid="settings-subscription">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0" style={{background:"var(--club-primary)"}}><CreditCard size={22} strokeWidth={2.5} /></div>
          <div className="flex-1">
            <h3 className="font-display font-semibold text-lg text-slate-900">Abonnement</h3>
            <p className="text-sm text-slate-600 mt-1">
              {club.subscription_status === "active" ? "Actif — merci ! 🎉" :
                daysLeft > 0 ? `Essai gratuit — ${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}` :
                "Essai terminé — pensez à souscrire pour continuer sereinement."}
            </p>
            {club.subscription_status !== "active" && (
              <Button className="mt-4 rounded-full h-11" style={{background:"var(--club-primary)"}} onClick={subscribe} data-testid="subscribe-btn">
                <CreditCard size={18} className="mr-2" />Souscrire — 19€/mois
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Public link */}
      <div className="paper-card p-6">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-900 text-white grid place-items-center shrink-0"><Globe size={22} strokeWidth={2.5} /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-lg text-slate-900">Page publique</h3>
            <a href={`/c/${club.slug}`} target="_blank" rel="noreferrer" className="text-sm font-medium truncate block mt-1" style={{color:"var(--club-primary)"}} data-testid="settings-public-link">
              {window.location.origin}/c/{club.slug}
            </a>
          </div>
        </div>
      </div>

      {/* Public page images */}
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Images de la page publique</h3>
        <p className="text-sm text-slate-600 mb-4">Personnalisez les photos affichées sur <a href={`/c/${club.slug}`} target="_blank" rel="noreferrer" className="underline">votre page club publique</a>. Sans image, une photo par défaut est utilisée.</p>
        <div className="grid sm:grid-cols-2 gap-6">
          <PublicImagePicker
            label="Image d'en-tête (hero)"
            value={heroImage}
            onUpload={onPublicImage("hero_image_data_url", setHeroImage, "Image d'en-tête")}
            onRemove={removePublicImage("hero_image_data_url", setHeroImage, "Image d'en-tête")}
            testId="settings-hero-input"
          />
          <PublicImagePicker
            label="Image descriptive (« Où nous trouver »)"
            value={aboutImage}
            onUpload={onPublicImage("about_image_data_url", setAboutImage, "Image descriptive")}
            onRemove={removePublicImage("about_image_data_url", setAboutImage, "Image descriptive")}
            testId="settings-about-input"
          />
        </div>
      </div>

      {/* Logo + theme */}
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-4">Logo & couleurs</h3>
        <div className="grid sm:grid-cols-2 gap-6">
          <label className="cursor-pointer">
            <input type="file" accept="image/*" className="hidden" onChange={onLogo} data-testid="settings-logo-input" />
            <div className="border-2 border-dashed border-slate-300 rounded-2xl h-40 grid place-items-center bg-white hover:border-orange-400 transition">
              {logo ? <img src={logo} alt="Logo" className="max-h-32" /> : (
                <div className="text-center">
                  <Upload size={24} className="mx-auto text-slate-400" />
                  <div className="mt-2 text-sm text-slate-500">Uploader un logo</div>
                </div>
              )}
            </div>
          </label>
          <div className="space-y-2">
            {["primary", "secondary", "accent"].map((k) => (
              <div key={k} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg border" style={{background: theme?.[k] || "#E2E8F0"}} />
                  <span className="text-sm text-slate-700 capitalize">{k === "primary" ? "Principale" : k === "secondary" ? "Secondaire" : "Accent"}</span>
                </div>
                <input type="color" value={theme?.[k] || "#E2E8F0"} data-testid={`settings-color-${k}`}
                  onChange={(e) => { const t = {...(theme || {primary:"", secondary:"", accent:""}), [k]: e.target.value.toUpperCase()}; setTheme(t); applyClubTheme(t); }}
                  className="w-8 h-8 rounded cursor-pointer border-0" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Signature for attestations */}
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-1">Signature du bureau</h3>
        <p className="text-sm text-slate-600 mb-4">Utilisée sur les attestations de licence générées pour les adhérents.</p>
        <SignaturePad value={signature} onChange={onSignatureChange} />
      </div>

      {/* Basic info */}
      <div className="paper-card p-6">
        <h3 className="font-display font-semibold text-lg text-slate-900 mb-4">Informations du club</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <div><Label>Nom</Label><Input value={form.name || ""} onChange={upd("name")} data-testid="settings-name" className="mt-1 h-11" /></div>
          <div><Label>Sport</Label><Input value={form.sport || ""} onChange={upd("sport")} data-testid="settings-sport" className="mt-1 h-11" /></div>
          <div><Label>Ville</Label><Input value={form.city || ""} onChange={upd("city")} data-testid="settings-city" className="mt-1 h-11" /></div>
          <div><Label>Adresse (entraînements)</Label><Input value={form.address || ""} onChange={upd("address")} data-testid="settings-address" className="mt-1 h-11" /></div>
          <div><Label>Email</Label><Input type="email" value={form.email || ""} onChange={upd("email")} data-testid="settings-email" className="mt-1 h-11" /></div>
          <div><Label>Téléphone</Label><Input value={form.phone || ""} onChange={upd("phone")} data-testid="settings-phone" className="mt-1 h-11" /></div>
          <div className="sm:col-span-2"><Label>Site officiel du club (si existant)</Label><Input type="url" placeholder="https://www.mon-club.fr" value={form.website_url || ""} onChange={upd("website_url")} data-testid="settings-website" className="mt-1 h-11" /></div>
          <div className="sm:col-span-2"><Label>Description publique</Label><Textarea rows={3} value={form.description || ""} onChange={upd("description")} data-testid="settings-description" className="mt-1" /></div>
          <div><Label>Cotisation par défaut (€)</Label><Input type="number" step="0.01" value={form.default_fee || 0} onChange={upd("default_fee")} data-testid="settings-default-fee" className="mt-1 h-11" /></div>
          <div><Label>Équipes (séparées par virgules)</Label><Input value={form.teams || ""} onChange={upd("teams")} data-testid="settings-teams" className="mt-1 h-11" placeholder="U9, U11, U13, Séniors" /></div>
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={save} disabled={busy} className="rounded-full h-12 px-6" style={{background:"var(--club-primary)"}} data-testid="settings-save-btn">
            <Save size={18} className="mr-2" />{busy ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </div>

      <div className="paper-card p-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={async () => { await logout(); navigate("/"); }} data-testid="settings-logout-btn" className="rounded-full">
          <LogOut size={16} className="mr-2" />Se déconnecter
        </Button>
      </div>

      <SeasonSettingsPanel />
      <DrivePanel />
      <CalendarSyncPanel />
      <NotificationsPanel />
      <IntegrationsPanel />

      {/* Danger zone */}
      <div className="paper-card p-6 border border-red-200">
        <h3 className="font-display font-semibold text-lg text-red-700 flex items-center gap-2"><AlertTriangle size={20} />Zone dangereuse</h3>
        <p className="text-sm text-slate-600 mt-1">Supprimer définitivement votre compte, votre club et toutes les données associées (adhérents, cotisations, planning, documents). Cette action est irréversible.</p>
        <Button variant="outline" onClick={() => setDeleteOpen(true)} className="mt-4 rounded-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700" data-testid="settings-delete-account-btn">
          Supprimer mon compte
        </Button>
      </div>

      <DeleteAccountDialog open={deleteOpen} onOpenChange={setDeleteOpen} clubName={club?.name} />
    </div>
  );
}

function DeleteAccountDialog({ open, onOpenChange, clubName }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!open) setConfirmText(""); }, [open]);

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.delete("/auth/me");
      toast.success("Votre compte a été supprimé.");
      await logout();
      navigate("/");
    } catch {
      toast.error("Impossible de supprimer le compte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="delete-account-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600"><AlertTriangle size={20} />Supprimer mon compte</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-slate-600">
          Cette action supprimera définitivement <b>{clubName || "votre club"}</b>, tous ses adhérents, cotisations, documents et l'historique associé. Impossible à annuler.
        </p>
        <div className="mt-2">
          <Label>Tapez <b>SUPPRIMER</b> pour confirmer</Label>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-1 h-11" data-testid="delete-account-confirm-input" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-full">Annuler</Button>
          <Button
            onClick={doDelete}
            disabled={confirmText !== "SUPPRIMER" || busy}
            className="rounded-full bg-red-600 hover:bg-red-700"
            data-testid="delete-account-confirm-btn"
          >
            {busy ? "Suppression…" : "Supprimer définitivement"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PublicImagePicker({ label, value, onUpload, onRemove, testId }) {
  return (
    <div>
      <Label>{label}</Label>
      <label className="cursor-pointer block mt-1">
        <input type="file" accept="image/*" className="hidden" onChange={onUpload} data-testid={testId} />
        <div className="border-2 border-dashed border-slate-300 rounded-2xl h-32 grid place-items-center bg-white hover:border-orange-400 transition overflow-hidden">
          {value ? <img src={value} alt={label} className="w-full h-full object-cover" /> : (
            <div className="text-center">
              <Upload size={20} className="mx-auto text-slate-400" />
              <div className="mt-2 text-sm text-slate-500">Uploader une image</div>
            </div>
          )}
        </div>
      </label>
      {value && (
        <button type="button" className="text-xs text-red-600 mt-2 underline" onClick={onRemove}>
          Réinitialiser (image par défaut)
        </button>
      )}
    </div>
  );
}
