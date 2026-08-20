import { NavLink, useNavigate } from "react-router-dom";
import { Home, Users, Wallet, CalendarDays, Megaphone, Settings as SettingsIcon, LogOut, UserPlus, Newspaper, HelpCircle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";

const nav = [
  { to: "/app", label: "Accueil", icon: Home, end: true },
  { to: "/app/adherents", label: "Adhérents", icon: Users },
  { to: "/app/cotisations", label: "Cotisations", icon: Wallet },
  { to: "/app/planning", label: "Planning", icon: CalendarDays },
  { to: "/app/annonces", label: "Annonces", icon: Megaphone },
];

export default function AppShell({ children }) {
  const { club, user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 fixed inset-y-0 left-0 bg-white border-r border-slate-200 z-20">
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {club?.logo_data_url ? (
              <img src={club.logo_data_url} alt="Logo" className="w-11 h-11 rounded-xl object-contain bg-slate-50 p-1" />
            ) : (
              <div className="w-11 h-11 rounded-xl bg-club-primary text-white grid place-items-center font-bold" style={{background:"var(--club-primary)"}}>{club?.name?.[0] || "C"}</div>
            )}
            <div className="min-w-0">
              <div className="font-display font-bold text-slate-900 truncate">{club?.name || "ClubPaper"}</div>
              <div className="text-xs text-slate-500">{club?.sport}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {nav.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} data-testid={`sidebar-nav-${it.label.toLowerCase()}`}
              className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
              style={({isActive}) => isActive ? {background: "var(--club-primary)"} : {}}>
              <it.icon size={20} strokeWidth={2.5} />
              {it.label}
            </NavLink>
          ))}
          <NavLink to="/app/prospects" data-testid="sidebar-nav-prospects"
            className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
            style={({isActive}) => isActive ? {background: "var(--club-primary)"} : {}}>
            <UserPlus size={20} strokeWidth={2.5} /> Demandes
          </NavLink>
          <NavLink to="/app/blog" data-testid="sidebar-nav-blog"
            className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
            style={({isActive}) => isActive ? {background: "var(--club-primary)"} : {}}>
            <Newspaper size={20} strokeWidth={2.5} /> Blog
          </NavLink>
          <NavLink to="/app/aide" data-testid="sidebar-nav-aide"
            className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
            style={({isActive}) => isActive ? {background: "var(--club-primary)"} : {}}>
            <HelpCircle size={20} strokeWidth={2.5} /> Aide
          </NavLink>
          <NavLink to="/app/parametres" data-testid="sidebar-nav-parametres"
            className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
            style={({isActive}) => isActive ? {background: "var(--club-primary)"} : {}}>
            <SettingsIcon size={20} strokeWidth={2.5} /> Paramètres
          </NavLink>
          {user?.is_platform_admin && (
            <NavLink to="/app/admin" data-testid="sidebar-nav-admin"
              className={({isActive}) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition ${isActive ? "text-white shadow-sm" : "text-slate-700 hover:bg-slate-50"}`}
              style={({isActive}) => isActive ? {background: "#0F172A"} : {}}>
              <ShieldCheck size={20} strokeWidth={2.5} /> Admin plateforme
            </NavLink>
          )}
        </nav>
        <div className="p-4 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-2">{user?.name}</div>
          <button data-testid="logout-btn" onClick={async () => { await logout(); navigate("/"); }} className="flex items-center gap-2 text-sm text-slate-700 hover:text-red-600">
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {club?.logo_data_url ? (
            <img src={club.logo_data_url} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-slate-50 p-0.5" />
          ) : (
            <div className="w-8 h-8 rounded-lg text-white grid place-items-center font-bold text-sm" style={{background:"var(--club-primary)"}}>{club?.name?.[0] || "C"}</div>
          )}
          <div className="font-display font-semibold text-slate-900 text-base truncate max-w-[180px]">{club?.name}</div>
        </div>
        <button data-testid="mobile-settings-btn" onClick={() => navigate("/app/parametres")} className="p-2 text-slate-600">
          <SettingsIcon size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="lg:ml-64 min-h-screen pb-tabs lg:pb-8">
        <div className="max-w-6xl mx-auto p-4 lg:p-8 fade-in">{children}</div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200" style={{paddingBottom: "env(safe-area-inset-bottom, 0px)"}}>
        <ul className="grid grid-cols-5">
          {nav.map((it) => (
            <li key={it.to}>
              <NavLink to={it.to} end={it.end} data-testid={`tab-${it.label.toLowerCase()}`}
                className={({isActive}) => `flex flex-col items-center justify-center gap-1 h-16 text-[11px] font-medium ${isActive ? "" : "text-slate-500"}`}
                style={({isActive}) => isActive ? {color: "var(--club-primary)"} : {}}>
                <it.icon size={22} strokeWidth={2.5} />
                {it.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
