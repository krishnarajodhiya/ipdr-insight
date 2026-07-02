import React, { useEffect, useMemo, useState } from "react";
import { forceCenter, forceLink, forceManyBody, forceSimulation } from "d3-force";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, downloadBlob } from "./api";

const STORAGE_KEY = "ipdr_insight_token";

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function badgeClass(level) {
  if (level === "High") return "bg-red-500/15 text-red-300 border-red-500/30";
  if (level === "Medium") return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
}

function useAuth() {
  const [token, setToken] = useState(localStorage.getItem(STORAGE_KEY) || "");
  const [username, setUsername] = useState("admin");

  const login = (payload) => {
    localStorage.setItem(STORAGE_KEY, payload.access_token);
    setToken(payload.access_token);
    setUsername(payload.username);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setUsername("");
  };

  return { token, username, login, logout };
}

function LoginView({ onLogin }) {
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
    <div className="min-h-full flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-glow">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.35em] text-cyan-400">IPDR Insight</p>
          <h1 className="mt-2 text-3xl font-semibold">Secure demo login</h1>
          <p className="mt-2 text-sm text-slate-400">
            Use the offline sample dataset to explore A-party to B-party communications.
          </p>
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
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <button
            disabled={loading}
            className="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 hover:bg-cyan-400"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="mt-5 text-xs text-slate-500">
          Demo credentials: <span className="text-slate-300">admin / admin123</span>
        </p>
      </div>
    </div>
  );
}

function Shell({ token, username, onLogout }) {
  const [view, setView] = useState("dashboard");
  return (
    <div className="min-h-full bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-slate-800 bg-slate-950/80 p-5 lg:flex">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-[0.35em] text-cyan-400">IPDR Insight</p>
            <h2 className="mt-2 text-2xl font-semibold">Investigation Console</h2>
          </div>
          <nav className="space-y-2">
            {["dashboard", "search", "settings"].map((item) => (
              <button
                key={item}
                onClick={() => setView(item)}
                className={`w-full rounded-xl px-4 py-3 text-left capitalize ${
                  view === item ? "bg-cyan-500/15 text-cyan-300" : "text-slate-300 hover:bg-slate-900"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-6">
            <button onClick={onLogout} className="w-full rounded-xl border border-slate-700 px-4 py-3 text-slate-300">
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-800 bg-slate-950/70 px-4 py-4 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm text-slate-400">Logged in as {username}</p>
                <h1 className="text-xl font-semibold capitalize">{view}</h1>
              </div>
              <div className="flex gap-2 lg:hidden">
                {["dashboard", "search", "settings"].map((item) => (
                  <button
                    key={item}
                    onClick={() => setView(item)}
                    className={`rounded-lg px-3 py-2 text-sm capitalize ${
                      view === item ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-900 text-slate-300"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="p-4 lg:p-8">
            {view === "dashboard" ? <DashboardView token={token} /> : null}
            {view === "search" ? <SearchView token={token} /> : null}
            {view === "settings" ? <SettingsView token={token} /> : null}
          </div>

          <footer className="border-t border-slate-800 px-4 py-4 text-xs text-slate-500 lg:px-8">
            Demo notice: locally uploaded sample data only; no live surveillance or external services.
          </footer>
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "cyan" }) {
  const tones = {
    cyan: "border-cyan-500/20 bg-cyan-500/10 text-cyan-300",
    amber: "border-amber-500/20 bg-amber-500/10 text-amber-300",
    red: "border-red-500/20 bg-red-500/10 text-red-300",
    emerald: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function NetworkGraph({ nodes = [], edges = [] }) {
  const graph = useMemo(() => {
    const simNodes = nodes.map((node) => ({ ...node }));
    const simLinks = edges.map((edge) => ({ ...edge }));
    const sim = forceSimulation(simNodes)
      .force("link", forceLink(simLinks).id((d) => d.id).distance(120).strength(0.8))
      .force("charge", forceManyBody().strength(-260))
      .force("center", forceCenter(450, 280))
      .stop();
    for (let i = 0; i < 220; i += 1) sim.tick();
    return { nodes: simNodes, links: simLinks };
  }, [nodes, edges]);

  return (
    <svg viewBox="0 0 900 560" className="h-[420px] w-full rounded-2xl border border-slate-800 bg-slate-950">
      {graph.links.map((link, index) => (
        <line
          key={index}
          x1={link.source.x}
          y1={link.source.y}
          x2={link.target.x}
          y2={link.target.y}
          stroke="rgba(148,163,184,0.25)"
          strokeWidth={Math.max(1, Math.min(4, link.weight || 1))}
        />
      ))}
      {graph.nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
          <circle
            r={node.type === "a" ? 14 : 11}
            fill={node.flagged ? "#ef4444" : node.type === "a" ? "#22d3ee" : "#64748b"}
            stroke="#0f172a"
            strokeWidth="3"
          />
          <text y={24} textAnchor="middle" fontSize="10" fill="#cbd5e1">
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function DashboardView({ token }) {
  const [summary, setSummary] = useState(null);
  const [network, setNetwork] = useState({ nodes: [], edges: [] });
  const [timeline, setTimeline] = useState([]);
  const [topFlagged, setTopFlagged] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [summaryData, networkData, timelineData, flaggedData] = await Promise.all([
        apiFetch("/dashboard/summary", {}, token),
        apiFetch("/dashboard/network?limit=200", {}, token),
        apiFetch("/dashboard/timeline?granularity=day", {}, token),
        apiFetch("/flags/top", {}, token),
      ]);
      setSummary(summaryData);
      setNetwork(networkData);
      setTimeline(timelineData);
      setTopFlagged(flaggedData);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await apiFetch("/upload", { method: "POST", body: form }, token);
      setUploadResult(result);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">{error}</div> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total records" value={summary?.total_records ?? "—"} />
        <StatCard label="Unique A-parties" value={summary?.unique_a_parties ?? "—"} tone="emerald" />
        <StatCard label="Unique B-parties" value={summary?.unique_b_parties ?? "—"} tone="amber" />
        <StatCard label="Flagged parties" value={summary?.flagged_parties ?? "—"} tone="red" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 shadow-glow">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">A-party ↔ B-party network</h2>
              <p className="text-sm text-slate-400">Flagged nodes appear in red.</p>
            </div>
            <label className="cursor-pointer rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950">
              Upload file
              <input type="file" accept=".csv,.txt,.json" onChange={uploadFile} className="hidden" />
            </label>
          </div>
          <NetworkGraph nodes={network.nodes} edges={network.edges} />
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-lg font-semibold">Parse summary</h2>
          {uploadResult ? (
            <div className="mt-4 space-y-2 text-sm text-slate-300">
              <p>File: {uploadResult.filename}</p>
              <p>Total rows: {uploadResult.total_rows}</p>
              <p>Valid rows: {uploadResult.valid_rows}</p>
              <p>Errors: {uploadResult.error_rows}</p>
              <p>Date range: {uploadResult.date_min || "-"} to {uploadResult.date_max || "-"}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Upload an IPDR file to see parsing details.</p>
          )}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Top flagged A-parties</h3>
            <div className="space-y-3">
              {topFlagged.slice(0, 5).map((row) => (
                <div key={row.a_party} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{row.a_party}</span>
                    <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(row.risk_level)}`}>
                      {row.risk_level}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Score {row.risk_score} · {row.interaction_count} interactions · {row.distinct_b_parties} B-parties
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4">
            <h2 className="text-lg font-semibold">Communication volume over time</h2>
            <p className="text-sm text-slate-400">Spot spikes in activity quickly.</p>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="period" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#020617", border: "1px solid #334155", color: "#e2e8f0" }} />
                <Area type="monotone" dataKey="count" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Risk counts</h2>
              <p className="text-sm text-slate-400">Low / Medium / High distribution.</p>
            </div>
            <button
              onClick={() => apiFetch("/export/csv", { method: "GET" }, token).then((blob) => downloadBlob(blob, "ipdr_export.csv"))}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-200"
            >
              Export CSV
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatCard label="Low" value={summary?.risk_counts?.low ?? 0} tone="emerald" />
            <StatCard label="Medium" value={summary?.risk_counts?.medium ?? 0} tone="amber" />
            <StatCard label="High" value={summary?.risk_counts?.high ?? 0} tone="red" />
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchView({ token }) {
  const [form, setForm] = useState({
    query: "",
    start_date: "",
    end_date: "",
    min_duration: "",
    max_duration: "",
    session_type: "",
    relevant_only: true,
    flagged_only: false,
  });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sortBy, setSortBy] = useState("interaction_count");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  async function runSearch(nextPage = 1) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== "" && value !== false) params.set(key, value);
      });
      params.set("page", String(nextPage));
      params.set("page_size", String(pageSize));
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      const result = await apiFetch(`/interactions?${params.toString()}`, {}, token);
      setRows(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    runSearch(1);
  }, [token, sortBy, sortDir]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function toggleSort(column) {
    if (sortBy === column) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortDir("desc");
    }
  }

  async function exportCsv() {
    const params = new URLSearchParams();
    Object.entries(form).forEach(([key, value]) => {
      if (value !== "" && value !== false) params.set(key, value);
    });
    const blob = await apiFetch(`/export/csv?${params.toString()}`, {}, token);
    downloadBlob(blob, "ipdr_filtered.csv");
  }

  async function exportPdf(aParty) {
    const blob = await apiFetch(`/export/pdf?query=${encodeURIComponent(aParty)}`, {}, token);
    downloadBlob(blob, `${aParty}_investigation.pdf`);
  }

  async function openInvestigation(aParty) {
    try {
      const result = await apiFetch(`/investigation/${encodeURIComponent(aParty)}`, {}, token);
      setSelected(result);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-red-200">{error}</div> : null}
      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={form.query} onChange={(e) => update("query", e.target.value)} placeholder="Search number or IP" />
          <input value={form.start_date} onChange={(e) => update("start_date", e.target.value)} type="datetime-local" />
          <input value={form.end_date} onChange={(e) => update("end_date", e.target.value)} type="datetime-local" />
          <input
            value={form.session_type}
            onChange={(e) => update("session_type", e.target.value)}
            placeholder="Session type"
          />
          <input
            value={form.min_duration}
            onChange={(e) => update("min_duration", e.target.value)}
            placeholder="Min duration"
            type="number"
          />
          <input
            value={form.max_duration}
            onChange={(e) => update("max_duration", e.target.value)}
            placeholder="Max duration"
            type="number"
          />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.flagged_only} onChange={(e) => update("flagged_only", e.target.checked)} />
            Flagged only
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.relevant_only} onChange={(e) => update("relevant_only", e.target.checked)} />
            Relevant only
          </label>
          <div className="flex gap-2">
            <button onClick={() => runSearch(1)} className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
              Search
            </button>
            <button onClick={exportCsv} className="rounded-xl border border-slate-700 px-4 py-2 text-slate-200">
              CSV
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Interactions</h2>
            <p className="text-sm text-slate-400">{total} rows matched</p>
          </div>
          <div className="text-sm text-slate-400">{loading ? "Loading..." : `Page ${page}`}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                {[
                  ["a_party", "A-party"],
                  ["b_party_ip", "B IP"],
                  ["interaction_count", "Count"],
                  ["total_duration_sec", "Duration"],
                  ["first_seen", "First seen"],
                  ["last_seen", "Last seen"],
                ].map(([key, label]) => (
                  <th key={key} className="cursor-pointer border-b border-slate-800 px-3 py-2" onClick={() => toggleSort(key)}>
                    {label}
                  </th>
                ))}
                <th className="border-b border-slate-800 px-3 py-2">Risk</th>
                <th className="border-b border-slate-800 px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.a_party}-${row.b_party_ip}-${row.b_party_number}`} className="border-b border-slate-800/70">
                  <td className="px-3 py-3">{row.a_party}</td>
                  <td className="px-3 py-3">{formatValue(row.b_party_ip || row.b_party_number)}</td>
                  <td className="px-3 py-3">{row.interaction_count}</td>
                  <td className="px-3 py-3">{Math.round(row.total_duration_sec)}</td>
                  <td className="px-3 py-3">{row.first_seen}</td>
                  <td className="px-3 py-3">{row.last_seen}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs ${badgeClass(row.risk.level)}`}>{row.risk.level}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openInvestigation(row.a_party)} className="text-cyan-300">
                        Investigate
                      </button>
                      <button onClick={() => exportPdf(row.a_party)} className="text-amber-300">
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => runSearch(page - 1)} className="rounded-lg border border-slate-700 px-3 py-2">
            Prev
          </button>
          <button
            disabled={page * pageSize >= total}
            onClick={() => runSearch(page + 1)}
            className="rounded-lg border border-slate-700 px-3 py-2"
          >
            Next
          </button>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl border border-slate-800 bg-slate-950 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold">Investigation summary: {selected.a_party}</h3>
              <button onClick={() => setSelected(null)} className="text-slate-400">
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Risk: <span className="text-slate-100">{selected.risk.level}</span> ({selected.risk.score})
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {selected.flags.map((flag) => (
                <div key={flag.type} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
                  <p className="font-medium text-slate-100">{flag.type}</p>
                  <p className="text-sm text-slate-400">{flag.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-400">
                  <tr>
                    <th className="border-b border-slate-800 px-3 py-2">B-party</th>
                    <th className="border-b border-slate-800 px-3 py-2">Count</th>
                    <th className="border-b border-slate-800 px-3 py-2">Duration</th>
                    <th className="border-b border-slate-800 px-3 py-2">First Seen</th>
                    <th className="border-b border-slate-800 px-3 py-2">Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.interactions.map((item) => (
                    <tr key={`${item.b_party_ip}-${item.b_party_number}`} className="border-b border-slate-800/70">
                      <td className="px-3 py-3">{item.b_party_ip || item.b_party_number}</td>
                      <td className="px-3 py-3">{item.interaction_count}</td>
                      <td className="px-3 py-3">{Math.round(item.total_duration_sec)}</td>
                      <td className="px-3 py-3">{item.first_seen}</td>
                      <td className="px-3 py-3">{item.last_seen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SettingsView({ token }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    apiFetch("/settings", {}, token)
      .then(setSettings)
      .catch((err) => setStatus(err.message));
  }, [token]);

  function update(key, value) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    try {
      const result = await apiFetch("/settings", { method: "PUT", body: JSON.stringify(settings) }, token);
      setSettings(result);
      setStatus("Saved");
    } catch (err) {
      setStatus(err.message);
    }
  }

  if (!settings) return <p className="text-slate-400">Loading settings...</p>;

  const fields = [
    ["night_start_hour", "Night start hour"],
    ["night_end_hour", "Night end hour"],
    ["night_frequency_threshold", "Night frequency threshold"],
    ["short_duration_threshold_sec", "Short session threshold (sec)"],
    ["short_duration_repeat_threshold", "Short session repeat threshold"],
    ["distinct_window_minutes", "Distinct B-party window (min)"],
    ["distinct_b_threshold", "Distinct B-party threshold"],
    ["shared_bparty_threshold", "Shared B-party threshold"],
    ["graph_limit", "Graph record limit"],
  ];

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Suspicious activity thresholds</h2>
          <p className="text-sm text-slate-400">Adjust rule-based detection for the demo.</p>
        </div>
        <button onClick={save} className="rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-slate-950">
          Save
        </button>
      </div>
      {status ? <p className="mt-3 text-sm text-slate-400">{status}</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(([key, label]) => (
          <label key={key} className="space-y-2 text-sm text-slate-300">
            <span>{label}</span>
            <input type="number" value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className="w-full" />
          </label>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const auth = useAuth();

  if (!auth.token) {
    return <LoginView onLogin={auth.login} />;
  }

  return <Shell token={auth.token} username={auth.username} onLogout={auth.logout} />;
}
