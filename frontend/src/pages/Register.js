import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Register() {
  const { register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(form);
      toast.success("Compte créé ! Passons au club.");
      navigate("/onboarding");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const onGoogleCredential = async (credential) => {
    setLoading(true);
    try {
      await googleLogin(credential);
      toast.success("Compte créé ! Passons au club.");
      navigate("/onboarding");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img src="https://images.pexels.com/photos/159812/team-girls-basketball-team-girls-basketball-159812.jpeg?auto=compress&cs=tinysrgb&h=650" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900/70 to-orange-600/85" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between text-white">
          <Link to="/" className="font-display font-bold text-2xl flex items-center gap-2" data-testid="register-logo">
            <span className="w-9 h-9 rounded-lg bg-white text-orange-600 grid place-items-center">CP</span>
            ClubPaper
          </Link>
          <div>
            <h2 className="font-display font-bold text-3xl">30 jours offerts.</h2>
            <p className="mt-3 opacity-90">Sans carte bancaire. Configurable en 5 minutes.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-display font-bold text-3xl text-slate-900">Créer mon compte</h1>
          <p className="mt-2 text-slate-600">Déjà inscrit ? <Link to="/login" className="text-orange-600 font-medium" data-testid="link-login">Se connecter</Link></p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="name">Votre nom</Label>
              <Input id="name" data-testid="register-name" required value={form.name} onChange={update("name")} className="mt-1 h-12" />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="register-email" type="email" required value={form.email} onChange={update("email")} className="mt-1 h-12" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe (min. 6 caractères)</Label>
              <Input id="password" data-testid="register-password" type="password" required minLength={6} value={form.password} onChange={update("password")} className="mt-1 h-12" />
            </div>
            <Button type="submit" disabled={loading} data-testid="register-submit" className="w-full h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-base">
              {loading ? "Création…" : "Créer mon compte"}
            </Button>
          </form>

          <div className="mt-6 flex items-center gap-3 text-slate-400 text-sm">
            <div className="h-px flex-1 bg-slate-200" />ou<div className="h-px flex-1 bg-slate-200" />
          </div>
          <div className="mt-4 flex justify-center">
            <GoogleSignInButton onCredential={onGoogleCredential} disabled={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}
