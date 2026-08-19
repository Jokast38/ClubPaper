import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/AuthContext";
import { formatApiError } from "@/lib/api";
import { toast } from "sonner";
import GoogleSignInButton from "@/components/GoogleSignInButton";

export default function Login() {
  const { login, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Bienvenue !");
      navigate("/app");
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
      toast.success("Bienvenue !");
      navigate("/app");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:block relative">
        <img src="https://images.unsplash.com/photo-1526232761682-d26e03ac148e" className="absolute inset-0 w-full h-full object-cover" alt="" />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/85 to-slate-900/70" />
        <div className="relative z-10 p-12 h-full flex flex-col justify-between text-white">
          <Link to="/" className="font-display font-bold text-2xl flex items-center gap-2" data-testid="login-logo">
            <span className="w-9 h-9 rounded-lg bg-white text-orange-600 grid place-items-center">CP</span>
            ClubPaper
          </Link>
          <div>
            <h2 className="font-display font-bold text-3xl">Le club, sans la paperasse.</h2>
            <p className="mt-3 opacity-90">Retrouvez vos adhérents, cotisations et créneaux en 3 clics.</p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <h1 className="font-display font-bold text-3xl text-slate-900">Se connecter</h1>
          <p className="mt-2 text-slate-600">Pas encore de compte ? <Link to="/inscription" className="text-orange-600 font-medium" data-testid="link-register">Créer mon club</Link></p>

          <form onSubmit={onSubmit} className="mt-8 space-y-5">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-12" />
            </div>
            <div>
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-12" />
            </div>
            <Button type="submit" disabled={loading} data-testid="login-submit" className="w-full h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-base">
              {loading ? "Connexion…" : "Se connecter"}
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
