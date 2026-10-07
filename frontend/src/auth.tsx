import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

import { api, setToken, setUnauthorizedHandler } from "@/src/api";
import { deviceLabel, devicePlatform } from "@/src/device";
import { clearOffline } from "@/src/offline";
import { queryClient } from "@/src/query-client";
import { storage } from "@/src/utils/storage";

const TOKEN_KEY = "session_token";

export type User = {
  user_id: string;
  email: string;
  phone?: string;
  name?: string | null;
  picture?: string;
  role: "DEVELOPER" | "OWNER" | "EMPLOYEE" | null;
  employee_type: "FIELD_AGENT" | "ACCOUNTANT" | null;
  org_id: string | null;
  org: any;
  consent_at?: string;
};

type Ctx = {
  user: User | null | undefined;
  token: string | null | undefined;
  error: string | null;
  busy: boolean;
  requestOtp: (phone: string, channel?: "whatsapp") => Promise<"sms" | "whatsapp" | null>;
  verifyOtp: (phone: string, code: string) => Promise<boolean>;
  saveName: (name: string) => Promise<boolean>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null | undefined>(undefined);
  const [token, setTokenState] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const clear = useCallback(async () => {
    await storage.secureRemove(TOKEN_KEY);
    await clearOffline();
    setToken(null);
    setTokenState(null);
    queryClient.clear();
    setUserState(null);
  }, []);

  // Wraps a call with busy/error state; returns true on success.
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e: any) {
      setError(e.message ?? "حدث خطأ");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clear();
    });
    (async () => {
      const t = await storage.secureGet(TOKEN_KEY, null);
      if (!t) return setUserState(null);
      setToken(String(t));
      setTokenState(String(t));
      try {
        setUserState(await api<User>("/auth/me"));
        // Trusted device: slide the session forward + record this device on every app open.
        api("/auth/touch", { method: "POST", body: { device: deviceLabel(), platform: devicePlatform() } }).catch(() => {});
      } catch {
        await clear();
      }
    })();
  }, [clear]);

  // Resolves to the channel the code was sent on, or null on failure.
  const requestOtp = useCallback(
    async (phone: string, channel?: "whatsapp") => {
      let sent: "sms" | "whatsapp" | null = null;
      await run(async () => {
        const r = await api<{ channel: "sms" | "whatsapp" }>("/auth/otp/request", { method: "POST", body: { phone, channel } });
        sent = r.channel;
      });
      return sent;
    },
    [run],
  );

  const verifyOtp = useCallback(
    (phone: string, code: string) =>
      run(async () => {
        const r = await api<{ session_token: string; user: User }>("/auth/otp/verify", { method: "POST", body: { phone, code } });
        setToken(r.session_token);
        await storage.secureSet(TOKEN_KEY, r.session_token);
        setTokenState(r.session_token);
        setUserState(r.user);
        api("/auth/touch", { method: "POST", body: { device: deviceLabel(), platform: devicePlatform() } }).catch(() => {});
      }),
    [run],
  );

  const saveName = useCallback(
    (name: string) =>
      run(async () => {
        await api("/auth/name", { method: "POST", body: { name } });
        setUserState(await api<User>("/auth/me"));
      }),
    [run],
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {}
    await clear();
  }, [clear]);

  const refresh = useCallback(async () => {
    try {
      setUserState(await api<User>("/auth/me"));
    } catch {}
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, error, busy, requestOtp, verifyOtp, saveName, logout, setUser: setUserState, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function homeFor(u: User | null | undefined): string {
  if (!u || !u.name) return "login"; // phone accounts set their name on the login screen
  if (!u.consent_at) return "consent";
  if (!u.role) return "activate";
  if (u.role === "DEVELOPER") return "dev";
  const org = u.org;
  if (!org || org.status !== "ACTIVE" || new Date(org.expires_at) < new Date()) return "blocked";
  if (u.role === "OWNER") return "owner";
  return u.employee_type === "ACCOUNTANT" ? "acct" : "dist";
}
