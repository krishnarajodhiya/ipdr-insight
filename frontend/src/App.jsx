import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Clock3,
  Database,
  FileText,
  Folder,
  FolderPlus,
  LayoutDashboard,
  LogOut,
  Plus,
  Network,
  ShieldAlert,
  Info,
  Search,
  Settings,
  Upload,
  Trash2,
  Users,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { apiFetch, downloadBlob } from "./api";

const STORAGE_KEY = "ipdr_insight_token";
const ACCENT = "#1e40af";
const BOOT_MESSAGES = [
  "Authenticating session...",
  "Loading IPDR records...",
  "Initializing network graph...",
  "Establishing secure connection...",
];

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function riskTone(level) {
  if (level === "High") return "text-red-700 bg-red-50 border-red-200";
  if (level === "Medium") return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-slate-700 bg-slate-100 border-slate-200";
}

function riskBorder(level) {
  if (level === "High") return "border-l-red-500";
  if (level === "Medium") return "border-l-amber-500";
  return "border-l-slate-300";
}

function blacklistTone() {
  return "text-red-950 bg-red-100 border-red-300";
}

function blacklistBorder() {
  return "border-l-red-700";
}

function subjectType(subject) {
  const text = String(subject || "");
  if (text.includes(":") || text.split(".").length === 4) return "ip";
  if (/^\d+$/.test(text)) return "number";
  return "unknown";
}

function subjectLabel(subject) {
  const type = subjectType(subject);
  return `${subject} ${type === "ip" ? "(IP)" : type === "number" ? "(Number)" : ""}`.trim();
}

function flagSource(row) {
  if (row?.blacklist_matches?.length) return "blacklist";
  if (row?.flags?.some((flag) => flag.source === "manual")) return "manual";
  return "auto";
}

function WhyFlaggedPopover({ details = [], risk }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setOpen((current) => !current)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900">
        <Info size={13} />
        Why flagged?
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-900">Risk breakdown</p>
            <button className="text-xs muted" onClick={() => setOpen(false)}>Close</button>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {details.length ? details.map((detail, index) => (
              <li key={`${detail.type}-${index}`} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
                <span>
                  {detail.message} <span className="font-semibold text-slate-900">→ +{detail.points}</span>
                </span>
              </li>
            )) : <li className="muted">No triggered rules.</li>}
          </ul>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <span className="font-semibold text-slate-900">Total Risk Score:</span> {risk?.score ?? 0} → <span className="font-semibold">{risk?.level ?? "Low"}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

async function exportReportPdf(element, fileName) {
  if (!element) return;
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
  const imageData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageHeight = (canvas.height * pageWidth) / canvas.width;
  let remaining = imageHeight;
  let position = 0;
  while (remaining > 0) {
    pdf.addImage(imageData, "PNG", 0, position, pageWidth, imageHeight);
    remaining -= pageHeight;
    if (remaining > 0) {
      pdf.addPage();
      position -= pageHeight;
    }
  }
  pdf.save(fileName);
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

function Skeleton({ className }) {
  return <div className={`skeleton rounded-xl ${className}`} />;
}

function CyberBackdrop() {
  return (
    <>
      <div className="auth-bg-gradient" />
      <div className="auth-bg-grid" />
      <svg className="auth-bg-network" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden>
        <g>
          <line x1="120" y1="140" x2="380" y2="240" />
          <line x1="380" y1="240" x2="620" y2="180" />
          <line x1="620" y1="180" x2="860" y2="280" />
          <line x1="860" y1="280" x2="1040" y2="220" />
          <line x1="260" y1="430" x2="520" y2="360" />
          <line x1="520" y1="360" x2="740" y2="470" />
          <line x1="740" y1="470" x2="980" y2="390" />
          <line x1="210" y1="640" x2="470" y2="560" />
          <line x1="470" y1="560" x2="690" y2="640" />
          <line x1="690" y1="640" x2="930" y2="580" />
          <circle cx="120" cy="140" r="3" />
          <circle cx="380" cy="240" r="3.5" />
          <circle cx="620" cy="180" r="3" />
          <circle cx="860" cy="280" r="3.5" />
          <circle cx="1040" cy="220" r="3" />
          <circle cx="260" cy="430" r="3.2" />
          <circle cx="520" cy="360" r="3.5" />
          <circle cx="740" cy="470" r="3.2" />
          <circle cx="980" cy="390" r="3" />
          <circle cx="210" cy="640" r="3" />
          <circle cx="470" cy="560" r="3.5" />
          <circle cx="690" cy="640" r="3.2" />
          <circle cx="930" cy="580" r="3" />
        </g>
      </svg>
    </>
  );
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

function BootScreen({ message, progress }) {
  return (
    <div className="relative min-h-full overflow-hidden">
      <CyberBackdrop />
      <div className="relative z-10 flex min-h-full items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <div className="boot-logo-pulse text-3xl font-bold tracking-[0.18em] text-white">IPDR INSIGHT</div>
          <p className="mt-3 text-xs uppercase tracking-[0.26em] text-blue-200/90">System initializing</p>
          <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
            <div
              className="h-full rounded-full bg-blue-300 transition-all duration-300"
              style={{ width: `${Math.max(8, Math.min(100, progress))}%` }}
            />
          </div>
          <p className="mt-4 text-sm text-slate-200">{message}</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, accent }) {
  return (
    <div className="card card-interactive border-l-4 p-5 fade-in" style={{ borderLeftColor: accent }}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium muted">{label}</p>
          <p className="mt-3 text-3xl font-bold heading-tight text-slate-900">{value}</p>
        </div>
        <div className="rounded-full p-2.5" style={{ backgroundColor: `${accent}1a` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

function NetworkGraph({ nodes = [], edges = [], focusedNode, riskLookup = {} }) {
  const width = 940;
  const height = 560;
  const [hover, setHover] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);

  const graph = useMemo(() => {
    const degree = {};
    edges.forEach((e) => {
      degree[e.source] = (degree[e.source] || 0) + Number(e.weight || 1);
      degree[e.target] = (degree[e.target] || 0) + Number(e.weight || 1);
    });

    const simNodes = nodes.map((node) => ({
      ...node,
      degree: degree[node.id] || 1,
      riskLevel: riskLookup[node.id] || "Low",
    }));
    const simLinks = edges.map((edge) => ({ ...edge }));

    const radius = (node) => {
      const base = node.type === "a" ? 10 : 7;
      return Math.min(24, base + Math.sqrt(node.degree || 1));
    };

    const sim = forceSimulation(simNodes)
      .force("link", forceLink(simLinks).id((d) => d.id).distance((d) => 110 - Math.min(35, Number(d.weight || 1) * 2)).strength(0.45))
      .force("charge", forceManyBody().strength((d) => (d.type === "a" ? -420 : -220)))
      .force("collide", forceCollide().radius((d) => radius(d) + 8).strength(0.95))
      .force("center", forceCenter(width / 2, height / 2))
      .force("center-x", forceX(width / 2).strength((d) => (d.type === "a" ? 0.15 : 0.04)))
      .force("center-y", forceY(height / 2).strength((d) => (d.type === "a" ? 0.15 : 0.04)))
      .force("ring-b", forceRadial(Math.min(width, height) * 0.32, width / 2, height / 2).strength((d) => (d.type === "b" ? 0.065 : 0)))
      .stop();

    for (let i = 0; i < 280; i += 1) sim.tick();
    simNodes.forEach((n) => {
      n.x = Math.max(35, Math.min(width - 35, n.x || width / 2));
      n.y = Math.max(35, Math.min(height - 35, n.y || height / 2));
    });

    return { nodes: simNodes, links: simLinks, radius };
  }, [nodes, edges, riskLookup]);

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const adjustZoom = (delta) => {
    setZoom((z) => Math.max(0.5, Math.min(2.2, z + delta)));
  };

  const onWheel = (e) => {
    e.preventDefault();
    adjustZoom(e.deltaY > 0 ? -0.08 : 0.08);
  };

  const onMouseDown = (e) => {
    setDragging(true);
    dragRef.current = { x: e.clientX, y: e.clientY };
  };

  const onMouseMove = (e) => {
    if (dragging && dragRef.current) {
      const dx = e.clientX - dragRef.current.x;
      const dy = e.clientY - dragRef.current.y;
      setOffset((o) => ({ x: o.x + dx, y: o.y + dy }));
      dragRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const stopDrag = () => {
    setDragging(false);
    dragRef.current = null;
  };

  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        <button onClick={() => adjustZoom(0.12)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 shadow-sm">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => adjustZoom(-0.12)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 shadow-sm">
          <ZoomOut size={16} />
        </button>
        <button onClick={resetView} className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
          <RefreshCw size={14} className="inline mr-1" />
          Reset view
        </button>
      </div>

      <div className="absolute left-3 top-3 z-20 rounded-lg border border-slate-200 bg-white/95 p-2 text-xs text-slate-600 shadow-sm">
        <div className="font-semibold text-slate-800">Legend</div>
        <div className="mt-1 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: ACCENT }} />A-party node</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full border border-slate-400 bg-white" />B-party node</div>
        <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-500" />Flagged node</div>
        <div className="mt-1">Node size = interaction volume</div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full cursor-grab"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={() => {
          stopDrag();
          setHover(null);
        }}
      >
        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {graph.links.map((link, index) => {
            const sx = link.source.x;
            const sy = link.source.y;
            const tx = link.target.x;
            const ty = link.target.y;
            const mx = (sx + tx) / 2 + (ty - sy) * 0.08;
            const my = (sy + ty) / 2 + (sx - tx) * 0.08;
            return (
              <path
                key={index}
                d={`M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`}
                fill="none"
                stroke="rgba(148,163,184,0.38)"
                strokeWidth={Math.max(0.8, Math.min(2.2, Number(link.weight || 1) * 0.22))}
              />
            );
          })}
          {graph.nodes.map((node) => {
            const r = graph.radius(node);
            const focused = focusedNode && focusedNode === node.id;
            const isFlagged = node.riskLevel === "High" || node.riskLevel === "Medium";
            const fill = isFlagged ? (node.riskLevel === "High" ? "#ef4444" : "#f59e0b") : node.type === "a" ? ACCENT : "#ffffff";
            const stroke = node.type === "a" || isFlagged ? "#ffffff" : "#64748b";
            const ring = focused ? "#22c55e" : isFlagged ? `${fill}55` : "transparent";
            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={(e) =>
                  setHover({
                    x: e.clientX,
                    y: e.clientY,
                    id: node.id,
                    interactions: node.degree,
                    risk: node.riskLevel,
                  })
                }
                onMouseMove={(e) =>
                  setHover((h) =>
                    h
                      ? {
                          ...h,
                          x: e.clientX,
                          y: e.clientY,
                        }
                      : h
                  )
                }
                onMouseLeave={() => setHover(null)}
              >
                <circle r={r + 4} fill={ring} />
                <circle r={r} fill={fill} stroke={stroke} strokeWidth={node.type === "b" ? 1.8 : 2.6} />
              </g>
            );
          })}
        </g>
      </svg>

      {hover ? (
        <div
          className="pointer-events-none fixed z-30 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-lg"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
        >
          <div className="font-semibold text-slate-900">{hover.id}</div>
          <div className="muted">Interactions: {hover.interactions}</div>
          <div className="muted">Risk: {hover.risk}</div>
        </div>
      ) : null}
    </div>
  );
}

function UploadDropzone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
      className={`rounded-xl border-2 border-dashed p-4 text-sm transition ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50"}`}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-blue-100 p-2 text-blue-700">
          <Upload size={16} />
        </div>
        <div>
          <p className="font-medium text-slate-800">Drag & drop IPDR file here</p>
          <p className="muted">Supports CSV, TXT, JSON</p>
        </div>
      </div>
    </div>
  );
}

function DashboardView({ token, onOpenCasePicker }) {
  const [summary, setSummary] = useState(null);
  const [network, setNetwork] = useState({ nodes: [], edges: [] });
  const [timeline, setTimeline] = useState([]);
  const [topFlagged, setTopFlagged] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [focusedNode, setFocusedNode] = useState(null);
  const [topFilter, setTopFilter] = useState("all");

  const riskLookup = useMemo(
    () => Object.fromEntries(topFlagged.map((r) => [r.a_party, r.risk_level])),
    [topFlagged]
  );

  const filteredTopFlagged = useMemo(() => {
    return topFlagged.filter((row) => {
      const source = flagSource(row);
      if (topFilter === "auto") return source === "auto";
      if (topFilter === "manual") return source === "manual";
      if (topFilter === "blacklist") return source === "blacklist";
      return true;
    });
  }, [topFlagged, topFilter]);

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [summaryData, networkData, timelineData, flaggedData] = await Promise.all([
        apiFetch("/dashboard/summary", {}, token),
        apiFetch("/dashboard/network?limit=500", {}, token),
        apiFetch("/dashboard/timeline?granularity=day", {}, token),
        apiFetch("/flags/top", {}, token),
      ]);
      setSummary(summaryData);
      setNetwork(networkData);
      setTimeline(timelineData);
      setTopFlagged(flaggedData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [token]);

  async function uploadByFile(file) {
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

  const onUploadInput = (event) => {
    const file = event.target.files?.[0];
    if (file) uploadByFile(file);
  };

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </>
        ) : (
          <>
            <StatCard label="Total records" value={summary?.total_records ?? 0} icon={Database} accent="#1e40af" />
            <StatCard label="Unique A-parties" value={summary?.unique_a_parties ?? 0} icon={Users} accent="#1e40af" />
            <StatCard label="Unique B-parties" value={summary?.unique_b_parties ?? 0} icon={Network} accent="#1e40af" />
            <StatCard label="Flagged parties" value={summary?.flagged_parties ?? 0} icon={AlertTriangle} accent="#b91c1c" />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <section className="card p-5 fade-in">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold heading-tight text-slate-900">A-party ↔ B-party Network</h2>
              <p className="text-sm muted">Zoom with scroll, drag to pan, click top flagged entries to focus nodes.</p>
            </div>
            <label
              className="inline-flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
              style={{ backgroundColor: ACCENT }}
            >
              <Upload size={16} />
              Upload file
              <input type="file" accept=".csv,.txt,.json" onChange={onUploadInput} className="hidden" />
            </label>
          </div>
          <UploadDropzone onFile={uploadByFile} />
          <div className="mt-4">
            {loading ? <Skeleton className="aspect-[16/10] w-full" /> : <NetworkGraph nodes={network.nodes} edges={network.edges} focusedNode={focusedNode} riskLookup={riskLookup} />}
          </div>
        </section>

        <section className="card p-5 fade-in">
          <h2 className="text-xl font-bold heading-tight text-slate-900">Parse Summary</h2>
          {uploadResult ? (
            <div className="mt-4 grid gap-2 text-sm text-slate-700">
              <p><span className="font-medium">File:</span> {uploadResult.filename}</p>
              <p><span className="font-medium">Total rows:</span> {uploadResult.total_rows}</p>
              <p><span className="font-medium">Valid rows:</span> {uploadResult.valid_rows}</p>
              <p><span className="font-medium">Errors:</span> {uploadResult.error_rows}</p>
              <p><span className="font-medium">Date range:</span> {uploadResult.date_min || "-"} to {uploadResult.date_max || "-"}</p>
            </div>
          ) : (
            <p className="mt-3 text-sm muted">Upload an IPDR file to view parser stats.</p>
          )}

          <div className="mt-6">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Top flagged A-parties</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[["all", "All"], ["auto", "Auto"], ["manual", "Manual"], ["blacklist", "Blacklist Match"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTopFilter(key)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${topFilter === key ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-3 space-y-3">
              {loading ? (
                <>
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                  <Skeleton className="h-20" />
                </>
              ) : (
                filteredTopFlagged.slice(0, 6).map((row) => (
                  <button
                    key={row.a_party}
                    onClick={() => setFocusedNode(row.a_party)}
                    className={`w-full rounded-xl border border-slate-200 border-l-4 bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 hover:shadow ${riskBorder(row.risk_level)} ${focusedNode === row.a_party ? "ring-2 ring-blue-300" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-800">{row.a_party}</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${riskTone(row.risk_level)}`}>{row.risk_level}</span>
                        {row.blacklist_matches?.length ? (
                          <span className={`rounded-lg border px-2 py-0.5 text-xs font-medium ${blacklistTone()}`}>Blacklist Match</span>
                        ) : null}
                        <span onClick={(e) => e.stopPropagation()}>
                          <WhyFlaggedPopover details={row.risk_details || row.flags || []} risk={{ score: row.risk_score, level: row.risk_level }} />
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs muted">Score {row.risk_score} · {row.interaction_count} interactions · {row.distinct_b_parties} B-parties</p>
                  </button>
                ))
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="card p-5 fade-in">
          <div className="mb-4">
            <h2 className="text-xl font-bold heading-tight text-slate-900">Communication Volume Over Time</h2>
            <p className="text-sm muted">Detect traffic spikes and unusual windows quickly.</p>
          </div>
          <div className="h-80">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fill: "#475569", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#475569", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "#ffffff", border: "1px solid #e2e8f0", color: "#0f172a" }} />
                  <Area type="monotone" dataKey="count" stroke={ACCENT} fill={ACCENT} fillOpacity={0.16} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card p-5 fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold heading-tight text-slate-900">Risk Summary</h2>
              <p className="text-sm muted">Low / Medium / High flagged parties.</p>
            </div>
            <button
              onClick={() => apiFetch("/export/csv", { method: "GET" }, token).then((blob) => downloadBlob(blob, "ipdr_export.csv"))}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:shadow-sm"
            >
              Export CSV
            </button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {loading ? (
              <>
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </>
            ) : (
              <>
                <StatCard label="Low" value={summary?.risk_counts?.low ?? 0} icon={AlertTriangle} accent="#64748b" />
                <StatCard label="Medium" value={summary?.risk_counts?.medium ?? 0} icon={AlertTriangle} accent="#d97706" />
                <StatCard label="High" value={summary?.risk_counts?.high ?? 0} icon={AlertTriangle} accent="#b91c1c" />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchView({ token, onOpenCasePicker }) {
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
  const [reportData, setReportData] = useState(null);
  const reportRef = useRef(null);
  const [selectedUploadId, setSelectedUploadId] = useState("");

  async function runSearch(nextPage = 1) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== "" && value !== false) params.set(key, value);
      });
      if (selectedUploadId) params.set("upload_id", selectedUploadId);
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
    try {
      const detail = selected && selected.a_party === aParty ? selected : await apiFetch(`/investigation/${encodeURIComponent(aParty)}`, {}, token);
      setReportData(detail);
      await new Promise((resolve) => setTimeout(resolve, 120));
      await exportReportPdf(reportRef.current, `IPDR_Report_${String(aParty).replace(/[^A-Za-z0-9_-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportData(null);
    }
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
    <div className="space-y-6 fade-in">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      <section className="card p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input value={form.query} onChange={(e) => update("query", e.target.value)} placeholder="Search number or IP" />
          <input value={form.start_date} onChange={(e) => update("start_date", e.target.value)} type="datetime-local" />
          <input value={form.end_date} onChange={(e) => update("end_date", e.target.value)} type="datetime-local" />
          <input value={form.session_type} onChange={(e) => update("session_type", e.target.value)} placeholder="Session type" />
          <input value={form.min_duration} onChange={(e) => update("min_duration", e.target.value)} placeholder="Min duration" type="number" />
          <input value={form.max_duration} onChange={(e) => update("max_duration", e.target.value)} placeholder="Max duration" type="number" />
          <input value={selectedUploadId} onChange={(e) => setSelectedUploadId(e.target.value)} placeholder="Upload ID" type="number" />
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.flagged_only} onChange={(e) => update("flagged_only", e.target.checked)} />Flagged only</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={form.relevant_only} onChange={(e) => update("relevant_only", e.target.checked)} />Relevant only</label>
          <div className="flex gap-2">
            <button onClick={() => runSearch(1)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>Search</button>
            <button onClick={exportCsv} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">CSV</button>
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold heading-tight text-slate-900">Interactions</h2>
            <p className="text-sm muted">{total} rows matched</p>
          </div>
          <div className="text-sm muted">{loading ? "Loading..." : `Page ${page}`}</div>
        </div>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-slate-600">
                <tr>
                  {[["a_party", "A-party"], ["b_party_ip", "B IP"], ["interaction_count", "Count"], ["total_duration_sec", "Duration"], ["first_seen", "First seen"], ["last_seen", "Last seen"]].map(([key, label]) => (
                    <th key={key} className="cursor-pointer border-b border-slate-200 px-3 py-2" onClick={() => toggleSort(key)}>{label}</th>
                  ))}
                  <th className="border-b border-slate-200 px-3 py-2">Risk</th>
                  <th className="border-b border-slate-200 px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.a_party}-${row.b_party_ip}-${row.b_party_number}`} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3">{row.a_party}</td>
                    <td className="px-3 py-3">{formatValue(row.b_party_ip || row.b_party_number)}</td>
                    <td className="px-3 py-3">{row.interaction_count}</td>
                    <td className="px-3 py-3">{Math.round(row.total_duration_sec)}</td>
                    <td className="px-3 py-3">{row.first_seen}</td>
                    <td className="px-3 py-3">{row.last_seen}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-lg border px-2 py-1 text-xs ${riskTone(row.risk.level)}`}>{row.risk.level}</span>
                        {row.blacklist_matches?.length ? <span className={`rounded-lg border px-2 py-1 text-xs ${blacklistTone()}`}>Blacklist Match</span> : null}
                        <WhyFlaggedPopover details={row.risk_details || row.flags || []} risk={row.risk} />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openInvestigation(row.a_party)} className="text-sm font-medium" style={{ color: ACCENT }}>Investigate</button>
                        <button onClick={() => onOpenCasePicker?.(row.a_party)} className="text-sm font-medium text-indigo-700">Add A</button>
                        {row.b_party_ip || row.b_party_number ? <button onClick={() => onOpenCasePicker?.(row.b_party_ip || row.b_party_number)} className="text-sm font-medium text-indigo-700">Add B</button> : null}
                        <button onClick={() => exportPdf(row.a_party)} className="text-sm font-medium text-amber-700">PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => runSearch(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Prev</button>
          <button disabled={page * pageSize >= total} onClick={() => runSearch(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50">Next</button>
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-2xl fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold heading-tight text-slate-900">Investigation summary: {selected.a_party}</h3>
              <div className="flex items-center gap-3">
                <button onClick={() => onOpenCasePicker?.(selected.a_party)} className="text-sm font-medium text-indigo-700">Add to Case</button>
                <button onClick={() => exportPdf(selected.a_party)} className="text-sm font-medium text-amber-700">Export Report (PDF)</button>
                <button onClick={() => setSelected(null)} className="text-sm muted">Close</button>
              </div>
            </div>
            <p className="mt-2 text-sm muted">Risk: <span className="font-semibold text-slate-800">{selected.risk.level}</span> ({selected.risk.score}) {selected.blacklist_matches?.length ? <span className={`ml-2 rounded-lg border px-2 py-0.5 text-xs ${blacklistTone()}`}>Blacklist Match</span> : null}</p>
            <div className="mt-2">
              <WhyFlaggedPopover details={selected.risk_details || selected.flags || []} risk={selected.risk} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {selected.flags.map((flag) => (
                <div key={flag.type} className={`rounded-xl border border-l-4 bg-white p-4 ${riskBorder(flag.severity === "high" ? "High" : flag.severity === "medium" ? "Medium" : "Low")}`}>
                  <p className="font-semibold text-slate-900">{flag.type}</p>
                  <p className="text-sm muted">{flag.message}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {selected.blacklist_matches?.map((match) => (
                <span key={`${match.value}-${match.label}`} className={`rounded-lg border px-2 py-1 text-xs ${blacklistTone()}`}>{match.label}</span>
              ))}
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-3 py-2">B-party</th>
                    <th className="border-b border-slate-200 px-3 py-2">Count</th>
                    <th className="border-b border-slate-200 px-3 py-2">Duration</th>
                    <th className="border-b border-slate-200 px-3 py-2">First Seen</th>
                    <th className="border-b border-slate-200 px-3 py-2">Last Seen</th>
                    <th className="border-b border-slate-200 px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.interactions.map((item) => (
                    <tr key={`${item.b_party_ip}-${item.b_party_number}`} className="border-b border-slate-100">
                      <td className="px-3 py-3">{item.b_party_ip || item.b_party_number}</td>
                      <td className="px-3 py-3">{item.interaction_count}</td>
                      <td className="px-3 py-3">{Math.round(item.total_duration_sec)}</td>
                      <td className="px-3 py-3">{item.first_seen}</td>
                      <td className="px-3 py-3">{item.last_seen}</td>
                      <td className="px-3 py-3">
                        {(item.b_party_ip || item.b_party_number) ? <button onClick={() => onOpenCasePicker?.(item.b_party_ip || item.b_party_number)} className="text-sm font-medium text-indigo-700">Add to Case</button> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
      {reportData ? (
        <div className="fixed left-[-9999px] top-0 w-[900px] bg-white p-6 text-slate-900" ref={reportRef}>
          <ReportSheet data={reportData} kind="subject" />
        </div>
      ) : null}
    </div>
  );
}

function ReportSheet({ data, kind }) {
  const title = kind === "case" ? data.name : `Investigation Summary: ${data.a_party || data.subject}`;
  const summary = kind === "case" ? data.summary : {
    total_interactions: data.interactions?.length || 0,
    risk_score: data.risk?.score || 0,
    flag_count: data.flags?.length || 0,
  };
  const flags = kind === "case"
    ? (data.parties || []).flatMap((party) => (party.risk_details || []).map((detail) => ({ ...detail, subject: party.subject })))
    : (data.risk_details || data.flags || []);
  const network = kind === "case" ? data.network : { nodes: [], edges: [] };
  const interactionRows = kind === "case" ? (data.parties || []).flatMap((party) => party.records || []) : (data.interactions || []);
  return (
    <div className="space-y-4 bg-white p-6 text-slate-900">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-800">IPDR Insight</p>
        <h1 className="mt-2 text-2xl font-bold heading-tight">{title}</h1>
        <p className="mt-1 text-xs text-slate-500">Generated {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase text-slate-500">Total interactions</p><p className="mt-2 text-2xl font-bold">{summary.total_interactions || 0}</p></div>
        <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase text-slate-500">Risk score</p><p className="mt-2 text-2xl font-bold">{summary.risk_score || 0}</p></div>
        <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs uppercase text-slate-500">Flag count</p><p className="mt-2 text-2xl font-bold">{summary.flag_count || 0}</p></div>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Flags</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {flags.length ? flags.map((flag, index) => (
            <li key={`${flag.type || flag.message}-${index}`} className="flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{flag.subject ? `${flag.subject}: ` : ""}{flag.message} <span className="font-semibold">→ +{flag.points ?? 0}</span></span>
            </li>
          )) : <li className="text-slate-500">No triggered rules.</li>}
        </ul>
      </div>
      <div className="rounded-xl border border-slate-200 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Key interactions</h2>
        <table className="mt-3 min-w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="border-b border-slate-200 px-2 py-2">A-party</th>
              <th className="border-b border-slate-200 px-2 py-2">B-party</th>
              <th className="border-b border-slate-200 px-2 py-2">Timestamp</th>
              <th className="border-b border-slate-200 px-2 py-2">Duration</th>
            </tr>
          </thead>
          <tbody>
            {interactionRows.slice(0, 12).map((row, index) => (
              <tr key={index}>
                <td className="border-b border-slate-100 px-2 py-2">{row.a_party || data.a_party || "-"}</td>
                <td className="border-b border-slate-100 px-2 py-2">{row.b_party_ip || row.b_party_number || row.subject || "-"}</td>
                <td className="border-b border-slate-100 px-2 py-2">{row.timestamp || row.first_seen || row.created_at || "-"}</td>
                <td className="border-b border-slate-100 px-2 py-2">{Math.round(row.duration_sec || row.total_duration_sec || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kind === "case" ? (
        <div className="rounded-xl border border-slate-200 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Case network</h2>
          <div className="mt-3 bg-white">
            <NetworkGraph nodes={network.nodes || []} edges={network.edges || []} riskLookup={{}} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CasePickerModal({ token, subject, onClose, onAssigned }) {
  const [cases, setCases] = useState([]);
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Open");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/cases", {}, token)
      .then(setCases)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function assignToCase(caseId) {
    const result = await apiFetch(`/cases/${caseId}/parties`, {
      method: "POST",
      body: JSON.stringify({ subject, subject_type: subjectType(subject) }),
    }, token);
    onAssigned?.(result);
    onClose();
  }

  async function createAndAssign() {
    const created = await apiFetch("/cases", {
      method: "POST",
      body: JSON.stringify({ name, description, status }),
    }, token);
    await assignToCase(created.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl fade-in">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-xl font-bold heading-tight text-slate-900">Add to Case</h3>
            <p className="text-sm muted">Assign {subjectLabel(subject)} to an existing case or create a new one.</p>
          </div>
          <button onClick={onClose} className="text-sm muted">Close</button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Existing cases</p>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {loading ? <Skeleton className="h-20" /> : cases.length ? cases.map((item) => (
                <button key={item.id} onClick={() => setSelectedCaseId(String(item.id))} className={`w-full rounded-xl border p-3 text-left ${selectedCaseId === String(item.id) ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
                  <div className="flex items-center justify-between"><span className="font-semibold text-slate-800">{item.name}</span><span className="text-xs muted">{item.status}</span></div>
                  <p className="mt-1 text-xs muted">{item.party_count} linked parties</p>
                </button>
              )) : <p className="text-sm muted">No cases yet.</p>}
            </div>
            <button disabled={!selectedCaseId} onClick={() => assignToCase(selectedCaseId)} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
              Assign to selected case
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-800">Create new case</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Case name" className="w-full" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full min-h-28" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
              <option>Open</option>
              <option>Closed</option>
            </select>
            <button disabled={!name.trim()} onClick={createAndAssign} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
              Create case and add subject
            </button>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function CasesView({ token, onOpenCasePicker }) {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [caseName, setCaseName] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [caseStatus, setCaseStatus] = useState("Open");
  const [note, setNote] = useState("");
  const [subject, setSubject] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const reportRef = useRef(null);

  async function loadCases() {
    const result = await apiFetch("/cases", {}, token);
    setCases(result);
    setLoading(false);
  }

  async function loadCaseDetail(caseId) {
    setLoading(true);
    try {
      const result = await apiFetch(`/cases/${caseId}`, {}, token);
      setSelectedCase(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCases().catch((err) => setError(err.message));
  }, [token]);

  async function createCase() {
    const created = await apiFetch("/cases", { method: "POST", body: JSON.stringify({ name: caseName, description: caseDescription, status: caseStatus }) }, token);
    setCaseName("");
    setCaseDescription("");
    setCaseStatus("Open");
    await loadCases();
    await loadCaseDetail(created.id);
  }

  async function addSubject() {
    if (!selectedCase || !subject.trim()) return;
    const result = await apiFetch(`/cases/${selectedCase.id}/parties`, { method: "POST", body: JSON.stringify({ subject, subject_type: subjectType(subject) }) }, token);
    setSelectedCase(result);
    setSubject("");
    await loadCases();
  }

  async function addNote() {
    if (!selectedCase || !note.trim()) return;
    const result = await apiFetch(`/cases/${selectedCase.id}/notes`, { method: "POST", body: JSON.stringify({ note }) }, token);
    setSelectedCase(result);
    setNote("");
    await loadCases();
  }

  async function exportCasePdf() {
    setReportData(selectedCase);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await exportReportPdf(reportRef.current, `IPDR_Report_${String(selectedCase?.name || "case").replace(/[^A-Za-z0-9_-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setReportData(null);
  }

  return (
    <div className="space-y-6 fade-in">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      <section className="card p-5">
        <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.7fr_auto]">
          <input value={caseName} onChange={(e) => setCaseName(e.target.value)} placeholder="Case name" />
          <input value={caseDescription} onChange={(e) => setCaseDescription(e.target.value)} placeholder="Description" />
          <select value={caseStatus} onChange={(e) => setCaseStatus(e.target.value)}>
            <option>Open</option>
            <option>Closed</option>
          </select>
          <button onClick={createCase} disabled={!caseName.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
            <FolderPlus size={16} className="mr-2 inline" />Create Case
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-1 space-y-3">
          {loading ? <Skeleton className="h-40" /> : cases.map((item) => (
            <button key={item.id} onClick={() => loadCaseDetail(item.id)} className={`w-full rounded-xl border p-4 text-left shadow-sm ${selectedCase?.id === item.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">{item.name}</span>
                <span className={`rounded-lg border px-2 py-0.5 text-xs ${item.status === "Closed" ? "border-slate-300 bg-slate-100 text-slate-700" : "border-blue-200 bg-blue-50 text-blue-700"}`}>{item.status}</span>
              </div>
              <p className="mt-2 text-xs muted">{item.party_count} linked parties</p>
              <p className="mt-1 text-xs muted">Last updated: {item.last_updated}</p>
            </button>
          ))}
        </div>
        <div className="xl:col-span-2">
          {selectedCase ? (
            <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold heading-tight text-slate-900">{selectedCase.name}</h2>
                  <p className="mt-1 text-sm muted">{selectedCase.description || "No description"}</p>
                  <p className="mt-2 text-xs muted">Status: {selectedCase.status} · Created {selectedCase.created_at}</p>
                </div>
                <div className="flex gap-2">
                  {selectedCase.parties?.[0]?.subject ? (
                    <button onClick={onOpenCasePicker ? () => onOpenCasePicker(selectedCase.parties[0].subject) : undefined} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Add to Case</button>
                  ) : null}
                  <button onClick={exportCasePdf} className="rounded-xl px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>Export Report (PDF)</button>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Linked parties</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {(selectedCase.parties || []).map((party) => (
                    <div key={party.subject} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-800">{subjectLabel(party.subject)}</span>
                        <span className={`rounded-lg border px-2 py-0.5 text-xs ${party.blacklist_matches?.length ? blacklistTone() : riskTone(party.risk.level)}`}>{party.blacklist_matches?.length ? "Blacklist Match" : party.risk.level}</span>
                      </div>
                      <p className="mt-1 text-xs muted">{party.status} · {party.interaction_count} interactions</p>
                      <WhyFlaggedPopover details={party.risk_details || party.flags || []} risk={party.risk} />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Mini network graph</h3>
                  <div className="mt-3">
                    <NetworkGraph nodes={selectedCase.network?.nodes || []} edges={selectedCase.network?.edges || []} riskLookup={Object.fromEntries((selectedCase.parties || []).map((party) => [party.subject, party.risk.level]))} />
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Add linked party</h3>
                    <div className="mt-2 flex gap-2">
                      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Number or IP" className="flex-1" />
                      <button onClick={addSubject} disabled={!subject.trim()} className="rounded-xl px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>Add</button>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Notes & timeline</h3>
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add investigator note..." className="mt-2 min-h-24 w-full" />
                    <button onClick={addNote} disabled={!note.trim()} className="mt-2 rounded-xl px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>Add note</button>
                    <div className="mt-3 space-y-2">
                      {(selectedCase.notes || []).slice().reverse().map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-3">
                          <div className="flex items-center gap-2 text-xs muted"><Clock3 size={12} />{item.created_at}</div>
                          <p className="mt-1 text-sm text-slate-800">{item.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm muted">Select a case to open the case detail page.</div>
          )}
        </div>
      </section>

      {reportData ? (
        <div className="fixed left-[-9999px] top-0 w-[900px] bg-white p-6 text-slate-900" ref={reportRef}>
          <ReportSheet data={reportData} kind="case" />
        </div>
      ) : null}
    </div>
  );
}

function BlacklistView({ token }) {
  const [entries, setEntries] = useState([]);
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState("any");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/blacklist", {}, token)
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, [token]);

  async function addEntry() {
    try {
      await apiFetch("/blacklist", { method: "POST", body: JSON.stringify({ value, value_type: valueType, label }) }, token);
      setValue("");
      setLabel("");
      const updated = await apiFetch("/blacklist", {}, token);
      setEntries(updated);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeEntry(entryId) {
    await apiFetch(`/blacklist/${entryId}`, { method: "DELETE" }, token);
    setEntries(await apiFetch("/blacklist", {}, token));
  }

  return (
    <div className="space-y-6 fade-in">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      <section className="card p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_0.5fr_1.2fr_auto]">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="IP or number" />
          <select value={valueType} onChange={(e) => setValueType(e.target.value)}>
            <option value="any">Any</option>
            <option value="ip">IP</option>
            <option value="number">Number</option>
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reason / label" />
          <button onClick={addEntry} disabled={!value.trim() || !label.trim()} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
            <ShieldAlert size={16} className="mr-2 inline" />Add to blacklist
          </button>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <div key={entry.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{entry.value}</p>
                <p className="mt-1 text-xs muted">{entry.value_type} · {entry.label}</p>
              </div>
              <button onClick={() => removeEntry(entry.id)} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function LogsView({ token }) {
  const [uploads, setUploads] = useState([]);
  const [selectedUpload, setSelectedUpload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadUploads() {
    setError("");
    setLoading(true);
    try {
      const result = await apiFetch("/uploads", {}, token);
      setUploads(result);
      if (result.length && !selectedUpload) {
        await openUpload(result[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openUpload(uploadId) {
    setDetailLoading(true);
    try {
      const result = await apiFetch(`/uploads/${uploadId}`, {}, token);
      setSelectedUpload(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    loadUploads();
  }, [token]);

  return (
    <div className="space-y-6 fade-in">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
      <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <div className="card p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold heading-tight text-slate-900">Past Logs</h2>
              <p className="text-sm muted">Every uploaded dataset stays separated here.</p>
            </div>
            <button onClick={loadUploads} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700">Refresh</button>
          </div>
          <div className="mt-4 space-y-3">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : uploads.length ? (
              uploads.map((upload) => (
                <button
                  key={upload.id}
                  onClick={() => openUpload(upload.id)}
                  className={`w-full rounded-xl border p-4 text-left shadow-sm ${selectedUpload?.upload?.id === upload.id ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-800">{upload.filename}</p>
                      <p className="mt-1 text-xs muted">{upload.file_type.toUpperCase()} · {upload.record_count || upload.valid_rows} records · {upload.error_rows} errors</p>
                    </div>
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700">{upload.created_at}</span>
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm muted">No uploaded logs yet. Upload a file from the dashboard to begin.</div>
            )}
          </div>
        </div>

        <div className="card p-5">
          {detailLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : selectedUpload ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold heading-tight text-slate-900">{selectedUpload.upload.filename}</h2>
                  <p className="text-sm muted">Stored separately as its own dataset in the database.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs muted">Valid rows</p><p className="text-lg font-semibold text-slate-900">{selectedUpload.upload.valid_rows}</p></div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-xs muted">Errors</p><p className="text-lg font-semibold text-slate-900">{selectedUpload.upload.error_rows}</p></div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <StatCard label="Total rows" value={selectedUpload.upload.total_rows} icon={FileText} accent="#1e40af" />
                <StatCard label="Records stored" value={selectedUpload.records.length} icon={Database} accent="#1e40af" />
                <StatCard label="Parse errors" value={selectedUpload.errors.length} icon={AlertTriangle} accent="#b91c1c" />
              </div>

              <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Records</h3>
                  <div className="mt-3 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-left text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-slate-600">
                        <tr>
                          <th className="border-b border-slate-200 px-3 py-2">A-party</th>
                          <th className="border-b border-slate-200 px-3 py-2">B-party</th>
                          <th className="border-b border-slate-200 px-3 py-2">Timestamp</th>
                          <th className="border-b border-slate-200 px-3 py-2">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUpload.records.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="px-3 py-2">{row.a_party}</td>
                            <td className="px-3 py-2">{row.b_party_ip || row.b_party_number}</td>
                            <td className="px-3 py-2">{row.timestamp}</td>
                            <td className="px-3 py-2">{Math.round(row.duration_sec || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Parse errors</h3>
                  <div className="mt-3 space-y-2 max-h-[420px] overflow-auto">
                    {selectedUpload.errors.length ? selectedUpload.errors.map((err) => (
                      <div key={err.id} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        <p className="font-semibold">Row {err.row_index}</p>
                        <p className="mt-1">{err.message}</p>
                      </div>
                    )) : <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm muted">No parse errors for this dataset.</div>}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm muted">Select a dataset to inspect its records.</div>
          )}
        </div>
      </section>
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

  if (!settings) return <Skeleton className="h-56 w-full" />;

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
    <section className="card p-6 fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold heading-tight text-slate-900">Suspicious Activity Thresholds</h2>
          <p className="text-sm muted">Configure rule-based alerts.</p>
        </div>
        <button onClick={save} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
          Save
        </button>
      </div>
      {status ? <p className="mt-3 text-sm muted">{status}</p> : null}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {fields.map(([key, label]) => (
          <label key={key} className="space-y-2 text-sm text-slate-700">
            <span className="font-medium">{label}</span>
            <input type="number" value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className="w-full" />
          </label>
        ))}
      </div>
    </section>
  );
}

function Shell({ token, username, onLogout }) {
  const [view, setView] = useState("dashboard");
  const [casePickerSubject, setCasePickerSubject] = useState("");
  const menu = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "logs", label: "Past Logs", icon: FileText },
    { id: "cases", label: "Cases", icon: Folder },
    { id: "search", label: "Search", icon: Search },
    { id: "blacklist", label: "Blacklist", icon: ShieldAlert },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="min-h-full bg-slate-50 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 flex-col border-r border-slate-200 bg-slate-100 px-4 py-6 lg:flex">
          <div className="mb-8 px-2">
            <p className="text-xs uppercase tracking-[0.2em] font-semibold" style={{ color: ACCENT }}>IPDR Insight</p>
            <h2 className="mt-2 text-2xl font-bold heading-tight text-slate-900">Investigation Tool</h2>
          </div>
          <nav className="space-y-1">
            {menu.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setView(item.id)}
                  className={`flex w-full items-center gap-2 rounded-r-xl border-l-4 px-3 py-2.5 text-left text-sm font-medium transition ${active ? "border-blue-700 bg-blue-50 text-blue-800" : "border-transparent text-slate-700 hover:bg-slate-200"}`}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto pt-6">
            <button onClick={onLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:shadow-sm">
              <LogOut size={16} />
              Logout
            </button>
          </div>
        </aside>

        <main className="flex-1">
          <header className="border-b border-slate-200 bg-white px-4 py-4 lg:px-8">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm muted">Logged in as {username}</p>
                <h1 className="text-2xl font-bold heading-tight capitalize text-slate-900">{view}</h1>
              </div>
              <div className="flex gap-2 lg:hidden">
                {menu.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setView(item.id)}
                    className={`rounded-xl px-3 py-2 text-sm ${view === item.id ? "bg-blue-100 text-blue-800" : "bg-white border border-slate-300 text-slate-700"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className="p-4 lg:p-8">
            {view === "dashboard" ? <DashboardView token={token} onOpenCasePicker={(subject) => setCasePickerSubject(subject)} /> : null}
            {view === "logs" ? <LogsView token={token} /> : null}
            {view === "cases" ? <CasesView token={token} onOpenCasePicker={(subject) => setCasePickerSubject(subject)} /> : null}
            {view === "search" ? <SearchView token={token} onOpenCasePicker={(subject) => setCasePickerSubject(subject)} /> : null}
            {view === "blacklist" ? <BlacklistView token={token} /> : null}
            {view === "settings" ? <SettingsView token={token} /> : null}
          </div>

          {casePickerSubject ? (
            <CasePickerModal
              token={token}
              subject={casePickerSubject}
              onClose={() => setCasePickerSubject("")}
              onAssigned={() => setCasePickerSubject("")}
            />
          ) : null}

          <footer className="border-t border-slate-200 bg-white px-4 py-4 text-xs muted lg:px-8">
            Data is handled per privacy-compliance guidelines for local investigative analysis demos.
          </footer>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const auth = useAuth();
  const [booting, setBooting] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootIndex, setBootIndex] = useState(0);

  useEffect(() => {
    if (!booting) return undefined;
    setBootProgress(8);
    setBootIndex(0);
    const started = Date.now();
    const duration = 2100;
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = (elapsed / duration) * 100;
      setBootProgress(pct);
      if (elapsed >= duration) {
        clearInterval(progressTimer);
        clearInterval(textTimer);
        setBootProgress(100);
        setTimeout(() => setBooting(false), 120);
      }
    }, 90);
    const textTimer = setInterval(() => {
      setBootIndex((idx) => (idx + 1) % BOOT_MESSAGES.length);
    }, 560);
    return () => {
      clearInterval(progressTimer);
      clearInterval(textTimer);
    };
  }, [booting]);

  if (!auth.token) {
    return (
      <LoginView
        onLogin={(payload) => {
          auth.login(payload);
          setBooting(true);
        }}
      />
    );
  }
  if (booting) return <BootScreen message={BOOT_MESSAGES[bootIndex]} progress={bootProgress} />;
  return <Shell token={auth.token} username={auth.username} onLogout={auth.logout} />;
}
