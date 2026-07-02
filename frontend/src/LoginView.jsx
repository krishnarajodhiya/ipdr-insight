import React, { useState } from "react";
import { Network } from "lucide-react";
import { apiFetch } from "../api";
import { CyberBackdrop } from "./components/CyberBackdrop";

const ACCENT = "#1e40af";

export function LoginView({ onLogin }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      onLogin(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden px-4">
      <CyberBackdrop />
      <div className="relative z-10 mx-auto flex min-h-full w-full max-w-md items-center justify-center py-10">
        <div className="w-full rounded-2xl border border-white/40 bg-white/92 p-8 shadow-2xl backdrop-blur-md fade-in">
          <div className="mb-6 text-center">
            <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
              <Network size={20} />
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.26em] text-blue-800">IPDR INSIGHT</p>
            <h1 className="mt-2 text-3xl font-bold heading-tight text-slate-900">Secure Access</h1>
            <p className="mt-2 text-sm muted">Investigation dashboard authentication</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full"
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm hover:shadow"
              style={{ backgroundColor: ACCENT }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}