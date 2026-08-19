import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, club: null, loading: true });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setState({ user: data.user, club: data.club, loading: false });
    } catch {
      setState({ user: null, club: null, loading: false });
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) localStorage.setItem("cm_token", data.token);
    await refresh();
    return data;
  };

  const googleLogin = async (credential) => {
    const { data } = await api.post("/auth/google", { credential });
    if (data.token) localStorage.setItem("cm_token", data.token);
    await refresh();
    return data;
  };

  const register = async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    if (data.token) localStorage.setItem("cm_token", data.token);
    await refresh();
    return data;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    localStorage.removeItem("cm_token");
    setState({ user: null, club: null, loading: false });
  };

  return (
    <AuthCtx.Provider value={{ ...state, refresh, login, googleLogin, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
