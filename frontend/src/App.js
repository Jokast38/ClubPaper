import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { useEffect } from "react";
import { applyClubTheme } from "@/lib/colorExtractor";

import Landing from "@/pages/Landing";
import Pricing from "@/pages/Pricing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Members from "@/pages/Members";
import Payments from "@/pages/Payments";
import Calendar from "@/pages/Calendar";
import Announcements from "@/pages/Announcements";
import Settings from "@/pages/Settings";
import Prospects from "@/pages/Prospects";
import Blog from "@/pages/Blog";
import BlogPost from "@/pages/BlogPost";
import Help from "@/pages/Help";
import PublicClub from "@/pages/PublicClub";
import PaymentSuccess from "@/pages/PaymentSuccess";
import PaymentCancel from "@/pages/PaymentCancel";
import PayFee from "@/pages/PayFee";
import LegalPage from "@/pages/LegalPage";
import AdminDashboard from "@/pages/AdminDashboard";
import AppShell from "@/components/AppShell";
import OnboardingTour from "@/components/OnboardingTour";

import "@/App.css";

function ThemeSync() {
  const { club } = useAuth() || {};
  useEffect(() => {
    if (club?.theme) applyClubTheme(club.theme);
  }, [club]);
  return null;
}

function Private({ children, needsClub = true }) {
  const { user, club, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (needsClub && !club) return <Navigate to="/onboarding" replace />;
  return children;
}

function PlatformAdminOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-slate-400">Chargement…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_platform_admin) return <Navigate to="/app" replace />;
  return children;
}

function Shell({ children }) {
  return (
    <AppShell>
      {children}
    </AppShell>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeSync />
        <OnboardingTour />
        <Toaster position="top-center" richColors />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/tarifs" element={<Pricing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/inscription" element={<Register />} />
          <Route path="/onboarding" element={<Private needsClub={false}><Onboarding /></Private>} />
          <Route path="/app" element={<Private><Shell><Dashboard /></Shell></Private>} />
          <Route path="/app/adherents" element={<Private><Shell><Members /></Shell></Private>} />
          <Route path="/app/cotisations" element={<Private><Shell><Payments /></Shell></Private>} />
          <Route path="/app/planning" element={<Private><Shell><Calendar /></Shell></Private>} />
          <Route path="/app/annonces" element={<Private><Shell><Announcements /></Shell></Private>} />
          <Route path="/app/parametres" element={<Private><Shell><Settings /></Shell></Private>} />
          <Route path="/app/prospects" element={<Private><Shell><Prospects /></Shell></Private>} />
          <Route path="/app/blog" element={<Private><Shell><Blog /></Shell></Private>} />
          <Route path="/app/aide" element={<Private><Shell><Help /></Shell></Private>} />
          <Route path="/app/admin" element={<Private needsClub={false}><PlatformAdminOnly><Shell><AdminDashboard /></Shell></PlatformAdminOnly></Private>} />
          <Route path="/legal/:doc" element={<LegalPage />} />
          <Route path="/c/:slug" element={<PublicClub />} />
          <Route path="/c/:slug/blog/:postSlug" element={<BlogPost />} />
          <Route path="/pay/:feeId" element={<PayFee />} />
          <Route path="/payment/success" element={<PaymentSuccess />} />
          <Route path="/payment/cancel" element={<PaymentCancel />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
