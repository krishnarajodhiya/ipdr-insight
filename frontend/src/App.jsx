import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  Brain,
  Clock3,
  Database,
  FileText,
  Folder,
  FolderPlus,
  LayoutDashboard,
  LogOut,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  ZoomIn,
  ZoomOut,
  Info,
  X,
  ChevronRight,
  Eye,
} from "lucide-react";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { apiFetch, downloadBlob } from "./api";

/* ============================================================
   CONSTANTS
   ============================================================ */
const STORAGE_KEY = "ipdr_insight_token";
const ACCENT = "#1e40af";
const DANGER = "#b91c1c";
const ML_COLOR = "#6d28d9";
const BOOT_MESSAGES = [
  "Authenticating credentials…",
  "Loading IPDR intelligence database…",
  "Initializing ML anomaly engine…",
  "Building communication network graph…",
  "Preparing CIB investigation tools…",
];

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */
function formatVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  return v;
}

function riskBadge(level) {
  if (level === "High") return "badge badge-high";
  if (level === "Medium") return "badge badge-medium";
  return "badge badge-low";
}

function riskBorderColor(level) {
  if (level === "High") return "#ef4444";
  if (level === "Medium") return "#f59e0b";
  return "#475569";
}

function subjectType(s) {
  const t = String(s || "");
  if (t.includes(":") || t.split(".").length === 4) return "ip";
  if (/^\d+$/.test(t)) return "number";
  return "unknown";
}

function subjectLabel(s) {
  const t = subjectType(s);
  return `${s} ${t === "ip" ? "(IP)" : t === "number" ? "(No.)" : ""}`.trim();
}

function mlScoreColor(score) {
  if (score >= 70) return "#ef4444";
  if (score >= 40) return "#f59e0b";
  return "#10b981";
}

/* ============================================================
   HOOKS
   ============================================================ */
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

function useCountUp(target, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    const start = Date.now();
    const from = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const pct = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - pct, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (pct < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

/* ============================================================
   ERROR BOUNDARY
   ============================================================ */
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8" style={{ background: "var(--bg-base)" }}>
          <div className="card p-8 max-w-lg text-center">
            <AlertTriangle size={40} className="mx-auto text-danger mb-4" />
            <h2 className="heading-tight text-xl mb-2">Component Error</h2>
            <p className="muted text-sm mb-4">{this.state.error.message}</p>
            <button className="btn-primary" onClick={() => this.setState({ error: null })}>Dismiss</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ============================================================
   ANIMATED BACKDROP
   ============================================================ */
function CyberBackdrop() {
  return (
    <>
      <div className="auth-bg-gradient" />
      <div className="auth-bg-grid" />
      <svg className="auth-bg-network" viewBox="0 0 1400 900" preserveAspectRatio="none" aria-hidden>
        <g>
          {[
            [120, 140, 420, 260], [420, 260, 680, 180], [680, 180, 940, 300], [940, 300, 1180, 220], [1180, 220, 1340, 320],
            [200, 460, 500, 380], [500, 380, 760, 490], [760, 490, 1020, 400], [1020, 400, 1280, 500],
            [160, 680, 460, 600], [460, 600, 720, 680], [720, 680, 980, 610], [980, 610, 1240, 700],
            [420, 260, 500, 380], [680, 180, 760, 490], [940, 300, 1020, 400],
          ].map(([x1, y1, x2, y2], i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />
          ))}
          {[
            [120,140],[420,260],[680,180],[940,300],[1180,220],[1340,320],
            [200,460],[500,380],[760,490],[1020,400],[1280,500],
            [160,680],[460,600],[720,680],[980,610],[1240,700],
          ].map(([cx, cy], i) => (
            <circle key={i} cx={cx} cy={cy} r={3 + (i % 3) * 0.6} />
          ))}
        </g>
      </svg>
    </>
  );
}


/* ============================================================
   SKELETON
   ============================================================ */
function Skeleton({ className = "" }) {
  return <div className={`skeleton ${className}`} />;
}

/* ============================================================
   STAT CARD with count-up animation
   ============================================================ */
function StatCard({ label, value, icon: Icon, accent = ACCENT, sublabel }) {
  const animated = useCountUp(typeof value === "number" ? value : 0);
  const display = typeof value === "number" ? animated : value;

  return (
    <div
      className="card card-interactive p-5 fade-in"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="label">{label}</p>
          <p
            className="mt-3 text-3xl font-bold heading-tight"
            style={{ color: accent === DANGER ? "#f87171" : "var(--text-primary)" }}
          >
            {display}
          </p>
          {sublabel && <p className="mt-1 text-xs muted">{sublabel}</p>}
        </div>
        <div className="rounded-xl p-2.5" style={{ background: `${accent}1f` }}>
          <Icon size={18} style={{ color: accent }} />
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   WHY FLAGGED POPOVER
   ============================================================ */
function WhyFlaggedPopover({ details = [], risk, mlData }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        <Info size={12} />
        Why flagged?
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-2 w-80 rounded-2xl p-4 shadow-2xl fade-in"
          style={{
            background: "var(--bg-panel)",
            border: "1px solid var(--border-default)",
            minWidth: "280px",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-white">Risk Breakdown</p>
            <button onClick={() => setOpen(false)} style={{ color: "var(--text-muted)" }}>
              <X size={14} />
            </button>
          </div>
          <ul className="space-y-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {details.length
              ? details.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg p-2" style={{ background: "var(--bg-raised)" }}>
                    <span className="mt-1 h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: "var(--accent)" }} />
                    <span>
                      {d.message}{" "}
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                        → +{d.points}
                      </span>
                    </span>
                  </li>
                ))
              : <li className="muted">No triggered rules.</li>}
          </ul>
          {mlData && (
            <div className="mt-3 rounded-lg p-2" style={{ background: "var(--ml-purple-soft)", border: "1px solid rgba(168,85,247,0.3)" }}>
              <p className="text-xs font-semibold" style={{ color: "#c084fc" }}>ML Anomaly Score: {mlData.anomaly_score}</p>
              <p className="text-xs muted mt-0.5">{mlData.cluster_label || "—"}</p>
            </div>
          )}
          <div className="mt-3 rounded-lg p-2" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
              Rule Score: {risk?.score ?? 0} → {risk?.level ?? "Low"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ML RADAR CHART (SVG)
   ============================================================ */
function RadarChart({ features = {}, size = 220 }) {
  const featureNames = [
    ["night_call_ratio", "Night %"],
    ["short_session_ratio", "Short Sess."],
    ["fan_out_rate", "Fan-out"],
    ["blacklist_contact_ratio", "Blacklist"],
    ["call_velocity_per_hour", "Velocity"],
    ["distinct_b_ratio", "B-diversity"],
  ];
  const n = featureNames.length;
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  const angles = featureNames.map((_, i) => ((Math.PI * 2 * i) / n) - Math.PI / 2);

  // Normalize velocity to 0-1 (cap at 20 calls/hr)
  const normalize = (key, val) => {
    if (key === "call_velocity_per_hour") return Math.min(1, (val || 0) / 20);
    return Math.min(1, Math.max(0, val || 0));
  };

  const points = featureNames.map(([key], i) => {
    const v = normalize(key, features[key]);
    return [cx + r * v * Math.cos(angles[i]), cy + r * v * Math.sin(angles[i])];
  });

  const polyPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1].map((frac) => {
    const ringPts = angles.map((a) => [cx + r * frac * Math.cos(a), cy + r * frac * Math.sin(a)]);
    return ringPts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
  });

  const axisEnds = angles.map((a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]);

  return (
    <svg width={size} height={size} className="mx-auto">
      {/* Grid rings */}
      {rings.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="var(--border-subtle)" strokeWidth={0.8} />
      ))}
      {/* Axis lines */}
      {axisEnds.map(([x, y], i) => (
        <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border-subtle)" strokeWidth={0.8} />
      ))}
      {/* Data polygon */}
      <path d={polyPath} className="radar-polygon" />
      {/* Data points */}
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3} fill={ACCENT} stroke="var(--bg-surface)" strokeWidth={1.5} />
      ))}
      {/* Labels */}
      {featureNames.map(([, label], i) => {
        const ax = cx + (r + 18) * Math.cos(angles[i]);
        const ay = cy + (r + 18) * Math.sin(angles[i]);
        return (
          <text
            key={i}
            x={ax}
            y={ay}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9}
            fill="var(--text-muted)"
            fontFamily="Inter, sans-serif"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

/* ============================================================
   NETWORK GRAPH — Enhanced D3 Force with pulsing flagged nodes
   ============================================================ */
function NetworkGraph({ nodes = [], edges = [], focusedNode, riskLookup = {}, mlScores = {} }) {
  const width = 1000;
  const height = 580;
  const [hover, setHover] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(null);
  const [pulse, setPulse] = useState(0);
  const animRef = useRef(null);

  // Pulsing animation for flagged nodes
  useEffect(() => {
    let frame;
    const tick = () => {
      setPulse((p) => (p + 1) % 60);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

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
      mlScore: mlScores[node.id] ?? null,
    }));
    const simLinks = edges.map((e) => ({ ...e }));

    const radius = (node) => {
      const base = node.type === "a" ? 11 : 7;
      return Math.min(26, base + Math.sqrt(node.degree || 1));
    };

    const sim = forceSimulation(simNodes)
      .force("link", forceLink(simLinks).id((d) => d.id).distance((d) => 120 - Math.min(40, Number(d.weight || 1) * 2)).strength(0.45))
      .force("charge", forceManyBody().strength((d) => (d.type === "a" ? -480 : -240)))
      .force("collide", forceCollide().radius((d) => radius(d) + 10).strength(0.92))
      .force("center", forceCenter(width / 2, height / 2))
      .force("cx", forceX(width / 2).strength((d) => (d.type === "a" ? 0.12 : 0.04)))
      .force("cy", forceY(height / 2).strength((d) => (d.type === "a" ? 0.12 : 0.04)))
      .force("ring", forceRadial(Math.min(width, height) * 0.3, width / 2, height / 2).strength((d) => (d.type === "b" ? 0.07 : 0)))
      .stop();

    for (let i = 0; i < 300; i++) sim.tick();
    simNodes.forEach((n) => {
      n.x = Math.max(40, Math.min(width - 40, n.x || width / 2));
      n.y = Math.max(40, Math.min(height - 40, n.y || height / 2));
    });

    return { nodes: simNodes, links: simLinks, radius };
  }, [nodes, edges, riskLookup, mlScores]);

  const resetView = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const adjustZoom = (d) => setZoom((z) => Math.max(0.35, Math.min(2.8, z + d)));
  const onWheel = (e) => { e.preventDefault(); adjustZoom(e.deltaY > 0 ? -0.1 : 0.1); };
  const onMouseDown = (e) => { setDragging(true); dragRef.current = { x: e.clientX, y: e.clientY }; };
  const onMouseMove = (e) => {
    if (dragging && dragRef.current) {
      setOffset((o) => ({ x: o.x + e.clientX - dragRef.current.x, y: o.y + e.clientY - dragRef.current.y }));
      dragRef.current = { x: e.clientX, y: e.clientY };
    }
  };
  const stopDrag = () => { setDragging(false); dragRef.current = null; };

  const pulseScale = 1 + 0.12 * Math.sin((pulse / 60) * Math.PI * 2);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ aspectRatio: "16/10", background: "#f8fafc", border: "1px solid var(--border-default)" }}>
      {/* Controls */}
      <div className="absolute right-3 top-3 z-20 flex gap-2">
        <button onClick={() => adjustZoom(0.15)} className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 8, fontSize: 12 }}>
          <ZoomIn size={14} />
        </button>
        <button onClick={() => adjustZoom(-0.15)} className="btn-secondary" style={{ padding: "4px 8px", borderRadius: 8, fontSize: 12 }}>
          <ZoomOut size={14} />
        </button>
        <button onClick={resetView} className="btn-secondary" style={{ padding: "4px 10px", borderRadius: 8, fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
          <RefreshCw size={12} /> Reset
        </button>
      </div>

      {/* Legend */}
      <div className="absolute left-3 top-3 z-20 rounded-xl p-3 text-xs" style={{ background: "rgba(255,255,255,0.95)", border: "1px solid var(--border-default)", boxShadow: "0 2px 8px rgba(15,23,42,0.08)" }}>
        <p className="font-semibold mb-2" style={{ color: "var(--text-primary)", fontSize: 11 }}>Legend</p>
        {[
          [ACCENT, "A-party (caller)"],
          ["#94a3b8", "B-party (destination)"],
          [DANGER, "High Risk"],
          ["#d97706", "Medium Risk"],
          [ML_COLOR, "ML Anomaly"],
        ].map(([c, l]) => (
          <div key={l} className="flex items-center gap-2 mb-1">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
            <span style={{ color: "var(--text-secondary)" }}>{l}</span>
          </div>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        style={{ cursor: dragging ? "grabbing" : "grab" }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={() => { stopDrag(); setHover(null); }}
      >
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L6,3 L0,6 Z" fill="rgba(148,163,184,0.2)" />
          </marker>
          <radialGradient id="nodeGradient-a" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1e40af" />
          </radialGradient>
          <radialGradient id="nodeGradient-high" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#991b1b" />
          </radialGradient>
          <radialGradient id="nodeGradient-medium" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </radialGradient>
          <radialGradient id="nodeGradient-ml" cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#5b21b6" />
          </radialGradient>
          <filter id="glow-red">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-blue">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="glow-purple">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge><feMergeNode in="coloredBlur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        <g transform={`translate(${offset.x} ${offset.y}) scale(${zoom})`}>
          {/* Edges */}
          {graph.links.map((link, i) => {
            const sx = link.source.x, sy = link.source.y;
            const tx = link.target.x, ty = link.target.y;
            const mx = (sx + tx) / 2 + (ty - sy) * 0.1;
            const my = (sy + ty) / 2 + (sx - tx) * 0.1;
            const w = Number(link.weight || 1);
            const riskSrc = riskLookup[link.source.id] || "Low";
            const edgeColor = riskSrc === "High" ? "rgba(239,68,68,0.25)" : riskSrc === "Medium" ? "rgba(245,158,11,0.2)" : "rgba(99,130,200,0.12)";
            return (
              <path
                key={i}
                d={`M ${sx} ${sy} Q ${mx} ${my} ${tx} ${ty}`}
                fill="none"
                stroke={edgeColor}
                strokeWidth={Math.max(0.6, Math.min(2.8, w * 0.25))}
              />
            );
          })}

          {/* Nodes */}
          {graph.nodes.map((node) => {
            const r = graph.radius(node);
            const focused = focusedNode === node.id;
            const isHigh = node.riskLevel === "High";
            const isMed = node.riskLevel === "Medium";
            const mlAnomaly = mlScores[node.id] >= 60;
            const fill = isHigh
              ? "url(#nodeGradient-high)"
              : isMed
              ? "url(#nodeGradient-medium)"
              : mlAnomaly
              ? "url(#nodeGradient-ml)"
              : node.type === "a"
              ? "url(#nodeGradient-a)"
              : "rgba(30,42,70,0.9)";

            const glowFilter = isHigh ? "url(#glow-red)" : focused ? "url(#glow-blue)" : mlAnomaly ? "url(#glow-purple)" : undefined;
            const ringScale = (isHigh || isMed) ? pulseScale : 1;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x}, ${node.y})`}
                onMouseEnter={(e) => setHover({ x: e.clientX, y: e.clientY, node })}
                onMouseMove={(e) => setHover((h) => h ? { ...h, x: e.clientX, y: e.clientY } : h)}
                onMouseLeave={() => setHover(null)}
              >
                {/* Pulse ring for flagged nodes */}
                {(isHigh || isMed || focused) && (
                  <circle
                    r={(r + 6) * ringScale}
                    fill="none"
                    stroke={focused ? ACCENT : isHigh ? DANGER : "#f59e0b"}
                    strokeWidth={1.2}
                    opacity={0.4 + 0.3 * Math.sin((pulse / 60) * Math.PI * 2)}
                  />
                )}
                {/* ML anomaly outer ring */}
                {mlAnomaly && !isHigh && (
                  <circle
                    r={r + 8}
                    fill="none"
                    stroke={ML_COLOR}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                    opacity={0.5}
                  />
                )}
                {/* Main node */}
                <circle
                  r={r}
                  fill={fill}
                  stroke={focused ? ACCENT : node.type === "b" ? "rgba(99,130,200,0.4)" : "rgba(255,255,255,0.15)"}
                  strokeWidth={focused ? 2.5 : node.type === "b" ? 1.5 : 2}
                  filter={glowFilter}
                />
                {/* Center dot for A-party */}
                {node.type === "a" && (
                  <circle r={2} fill="rgba(255,255,255,0.6)" />
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Hover tooltip */}
      {hover && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl p-3 text-xs shadow-2xl"
          style={{
            left: hover.x + 14, top: hover.y + 14,
            background: "#ffffff",
            border: "1px solid var(--border-default)",
            boxShadow: "0 4px 16px rgba(15,23,42,0.12)",
            minWidth: 160,
          }}
        >
          <p className="font-semibold mb-1 mono" style={{ color: "var(--text-primary)", fontSize: 11 }}>
            {hover.node.id}
          </p>
          <p className="muted">Type: {hover.node.type === "a" ? "A-Party (Caller)" : "B-Party (Destination)"}</p>
          <p className="muted">Interactions: {hover.node.degree}</p>
          {hover.node.riskLevel !== "Low" && (
            <p style={{ color: hover.node.riskLevel === "High" ? "#f87171" : "#fbbf24" }}>
              Risk: {hover.node.riskLevel}
            </p>
          )}
          {mlScores[hover.node.id] != null && (
            <p style={{ color: mlScoreColor(mlScores[hover.node.id]) }}>
              ML Score: {hover.node.mlScore}
            </p>
          )}
        </div>
      )}

      {/* Node count badge */}
      <div className="absolute bottom-3 right-3 text-xs rounded-lg px-2 py-1" style={{ background: "rgba(255,255,255,0.9)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
        {graph.nodes.length} nodes · {graph.links.length} edges
      </div>
    </div>
  );
}

/* ============================================================
   UPLOAD DROPZONE
   ============================================================ */
function UploadDropzone({ onFile }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      className="rounded-xl border-2 border-dashed p-4 text-sm transition"
      style={{
        borderColor: dragging ? ACCENT : "var(--border-default)",
        background: dragging ? "var(--accent-soft)" : "var(--bg-raised)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl p-2" style={{ background: "var(--accent-soft)" }}>
          <Upload size={16} style={{ color: ACCENT }} />
        </div>
        <div>
          <p className="font-medium" style={{ color: "var(--text-primary)" }}>Drop IPDR file here to upload</p>
          <p className="muted">Supports CSV, TXT, JSON · All operator formats auto-detected</p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ACTIVITY HEATMAP — Time-of-day × Day-of-week
   ============================================================ */
function ActivityHeatmap({ grid: gridProp }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Accept pre-computed 7×24 grid from the API
  const grid = gridProp || Array.from({ length: 7 }, () => Array(24).fill(0));

  const maxVal = Math.max(1, ...grid.flatMap((row) => row));
  const cellW = 22;
  const cellH = 22;
  const padL = 36;
  const padT = 28;
  const svgW = padL + 24 * cellW + 8;
  const svgH = padT + 7 * cellH + 12;

  function heatColor(val) {
    const t = val / maxVal;
    if (t === 0) return "#f1f5f9";
    if (t < 0.25) return "rgba(30,64,175,0.18)";
    if (t < 0.5) return "rgba(30,64,175,0.42)";
    if (t < 0.75) return "rgba(217,119,6,0.65)";
    return "rgba(185,28,28,0.78)";
  }

  const [hovCell, setHovCell] = useState(null);

  return (
    <div className="relative">
      <svg width={svgW} height={svgH} className="w-full" style={{ maxWidth: svgW }}>
        {/* Hour labels */}
        {HOURS.filter((h) => h % 3 === 0).map((h) => (
          <text key={h} x={padL + h * cellW + cellW / 2} y={14} textAnchor="middle" fontSize={8} fill="var(--text-muted)" fontFamily="JetBrains Mono, monospace">
            {String(h).padStart(2, "0")}h
          </text>
        ))}
        {/* Day labels */}
        {DAYS.map((d, di) => (
          <text key={d} x={padL - 6} y={padT + di * cellH + cellH / 2 + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)" fontFamily="Inter, sans-serif">
            {d}
          </text>
        ))}
        {/* Heat cells */}
        {DAYS.map((_, di) =>
          HOURS.map((h) => (
            <rect
              key={`${di}-${h}`}
              x={padL + h * cellW + 1}
              y={padT + di * cellH + 1}
              width={cellW - 2}
              height={cellH - 2}
              rx={3}
              fill={heatColor(grid[di][h])}
              onMouseEnter={(e) => setHovCell({ day: DAYS[di], hour: h, count: grid[di][h], x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHovCell(null)}
              style={{ cursor: "pointer" }}
            />
          ))
        )}
      </svg>

      {hovCell && (
        <div
          className="pointer-events-none fixed z-50 rounded-xl p-3 text-xs shadow-2xl"
          style={{ left: hovCell.x + 12, top: hovCell.y + 12, background: "#ffffff", border: "1px solid var(--border-default)", boxShadow: "0 4px 12px rgba(15,23,42,0.1)" }}
        >
          <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{hovCell.day} at {String(hovCell.hour).padStart(2, "0")}:00</p>
          <p className="muted">{hovCell.count} interactions</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   ML INSIGHTS VIEW
   ============================================================ */
function MLInsightsView({ token }) {
  const [anomalies, setAnomalies] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch("/ml/anomaly", {}, token).catch(() => ({ results: [] })),
      apiFetch("/ml/clusters", {}, token).catch(() => ({ results: [] })),
    ])
      .then(([aRes, cRes]) => {
        setAnomalies(aRes.results || []);
        setClusters(cRes.results || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);


  async function loadPrediction(aParty) {
    setSelected(aParty);
    setPredicting(true);
    setPrediction(null);
    try {
      const res = await apiFetch(`/ml/predict/${encodeURIComponent(aParty)}`, {}, token);
      setPrediction(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setPredicting(false);
    }
  }

  const clusterMap = useMemo(() => {
    const m = {};
    clusters.forEach((c) => { m[c.a_party] = c; });
    return m;
  }, [clusters]);

  const topAnomalies = anomalies.slice(0, 12);

  return (
    <div className="space-y-6 fade-in">
      {/* Alert Banner */}
      {anomalies.some((a) => a.is_anomaly) && (
        <div
          className="rounded-2xl px-5 py-4 flex items-center gap-4 pulse-ring"
          style={{ background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.2)" }}
        >
          <Brain size={22} style={{ color: DANGER, flexShrink: 0 }} />
          <div>
            <p className="font-semibold text-sm" style={{ color: "#991b1b" }}>
              ML Engine Detected {anomalies.filter((a) => a.is_anomaly).length} Behavioral Anomalies
            </p>
            <p className="text-xs muted mt-0.5">
              Isolation Forest identified statistically abnormal communication patterns. Review flagged entities below.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="A-parties Analyzed" value={anomalies.length} icon={Brain} accent={ML_COLOR} />
        <StatCard label="Anomalies Detected" value={anomalies.filter((a) => a.is_anomaly).length} icon={AlertTriangle} accent={DANGER} />
        <StatCard label="Behavioral Clusters" value={new Set(clusters.map((c) => c.cluster).filter((c) => c >= 0)).size} icon={Target} accent={ACCENT} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        {/* Anomaly Scores Table */}
        <section className="card p-5">
          <h2 className="text-lg font-bold heading-tight mb-4" style={{ color: "var(--text-primary)" }}>
            ML Anomaly Rankings
          </h2>
          <p className="text-xs muted mb-4">Isolation Forest scores (0-100). Higher = more anomalous behavior.</p>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : topAnomalies.length === 0 ? (
            <div className="text-center py-8 muted text-sm">No data yet. Upload IPDR logs first.</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {topAnomalies.map((a) => {
                const cluster = clusterMap[a.a_party];
                const scoreColor = mlScoreColor(a.anomaly_score);
                const isSelected = selected === a.a_party;
                return (
                  <button
                    key={a.a_party}
                    onClick={() => loadPrediction(a.a_party)}
                    className="w-full rounded-xl p-3 text-left transition card-interactive"
                    style={{
                      background: isSelected ? "var(--accent-soft)" : "var(--bg-raised)",
                      border: `1px solid ${isSelected ? "rgba(30,64,175,0.3)" : "var(--border-subtle)"}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{a.a_party}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {a.is_anomaly && <span className="badge badge-ml">ANOMALY</span>}
                        <span
                          className="text-xs font-bold mono px-2 py-0.5 rounded-lg"
                          style={{ background: `${scoreColor}22`, color: scoreColor, border: `1px solid ${scoreColor}44` }}
                        >
                          {a.anomaly_score}
                        </span>
                      </div>
                    </div>
                    {/* Score bar */}
                    <div className="mt-2 h-1.5 rounded-full" style={{ background: "var(--bg-panel)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${a.anomaly_score}%`, background: `linear-gradient(90deg, ${ACCENT}, ${scoreColor})` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs muted">
                      <span>{a.interaction_count} interactions</span>
                      {cluster && <span>{cluster.cluster_label}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Detail Panel */}
        <section className="card p-5">
          {prediction ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="label">ML Prediction</p>
                  <h3 className="heading-tight text-lg mt-1 mono" style={{ color: "var(--text-primary)" }}>{prediction.a_party}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    {prediction.is_anomaly && <span className="badge badge-ml">ML ANOMALY</span>}
                    <span className="badge" style={{ background: `${mlScoreColor(prediction.anomaly_score)}22`, color: mlScoreColor(prediction.anomaly_score), borderColor: `${mlScoreColor(prediction.anomaly_score)}44` }}>
                      Score: {prediction.anomaly_score}
                    </span>
                    <span className="badge badge-ok">
                      Conf: {Math.round(prediction.confidence * 100)}%
                    </span>
                  </div>
                </div>
                <div
                  className="rounded-xl px-3 py-2 text-center"
                  style={{ background: "var(--bg-panel)", minWidth: 80 }}
                >
                  <p className="text-xs muted">Cluster</p>
                  <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-accent)" }}>{prediction.cluster_label}</p>
                </div>
              </div>

              {/* Radar chart */}
              <div>
                <p className="label mb-3">Behavioral Profile</p>
                <RadarChart features={prediction.features} size={220} />
              </div>

              {/* Natural language insight */}
              <div
                className="rounded-xl p-4 text-sm"
                style={{ background: "rgba(109,40,217,0.06)", border: "1px solid rgba(109,40,217,0.15)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} style={{ color: ML_COLOR }} />
                  <span className="font-semibold text-xs" style={{ color: "#6d28d9" }}>AI Insight</span>
                </div>
                <p className="text-xs" style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{prediction.insight}</p>
              </div>

              {/* Top contributors */}
              {prediction.top_contributors?.length > 0 && (
                <div>
                  <p className="label mb-2">Top Risk Contributors</p>
                  <div className="space-y-2">
                    {prediction.top_contributors.map((c) => (
                      <div key={c.feature} className="flex items-center gap-3 rounded-lg p-2" style={{ background: "var(--bg-raised)" }}>
                        <div className="flex-1">
                          <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>{c.feature.replace(/_/g, " ")}</p>
                          <p className="text-xs muted">Value: {c.value}</p>
                        </div>
                        <span
                          className="text-xs mono font-bold px-2 py-0.5 rounded"
                          style={{
                            background: Math.abs(c.z_score) > 2 ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                            color: Math.abs(c.z_score) > 2 ? "#f87171" : "#fbbf24",
                          }}
                        >
                          z={c.z_score > 0 ? "+" : ""}{c.z_score}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : predicting ? (
            <div className="space-y-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-48" />
              <Skeleton className="h-24" />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full py-12 text-center">
              <Brain size={40} className="mb-4" style={{ color: "var(--border-default)" }} />
              <p className="font-semibold" style={{ color: "var(--text-secondary)" }}>Select an A-party</p>
              <p className="text-xs muted mt-1">Click any row to view full ML behavioral prediction</p>
            </div>
          )}
        </section>
      </div>

      {/* Cluster overview */}
      {clusters.length > 0 && (
        <section className="card p-5">
          <h2 className="text-lg font-bold heading-tight mb-2" style={{ color: "var(--text-primary)" }}>
            Behavioral Cluster Map
          </h2>
          <p className="text-xs muted mb-4">DBSCAN clustering groups A-parties by communication behavior similarity. Cluster -1 = isolated/extreme behavior.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(
              clusters.reduce((acc, c) => {
                const k = c.cluster_label;
                if (!acc[k]) acc[k] = [];
                acc[k].push(c.a_party);
                return acc;
              }, {})
            ).map(([label, parties]) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{
                  background: label === "Isolated / Extreme" ? "rgba(239,68,68,0.1)" : "var(--bg-raised)",
                  border: `1px solid ${label === "Isolated / Extreme" ? "rgba(239,68,68,0.3)" : "var(--border-subtle)"}`,
                  minWidth: 160,
                }}
              >
                <p className="text-xs font-semibold mb-2" style={{ color: label === "Isolated / Extreme" ? "#f87171" : ML_COLOR }}>
                  {label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {parties.slice(0, 4).map((p) => (
                    <span key={p} className="mono text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-panel)", color: "var(--text-secondary)" }}>
                      {p}
                    </span>
                  ))}
                  {parties.length > 4 && <span className="text-xs muted">+{parties.length - 4}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ============================================================
   PDF REPORT EXPORT
   ============================================================ */
async function exportReportPdf(element, fileName) {
  if (!element) return;
  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#0e1628", useCORS: true });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF("p", "mm", "a4");
  const pW = pdf.internal.pageSize.getWidth();
  const pH = pdf.internal.pageSize.getHeight();
  const imgH = (canvas.height * pW) / canvas.width;
  let remaining = imgH;
  let pos = 0;
  while (remaining > 0) {
    pdf.addImage(imgData, "PNG", 0, pos, pW, imgH);
    remaining -= pH;
    if (remaining > 0) { pdf.addPage(); pos -= pH; }
  }
  pdf.save(fileName);
}

/* ============================================================
   LOGIN VIEW
   ============================================================ */
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
      const result = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
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
        <div
          className="w-full rounded-2xl p-8 shadow-2xl fade-in"
          style={{ background: "#ffffff", border: "1px solid var(--border-default)", backdropFilter: "blur(12px)" }}
        >
          <div className="mb-8 text-center">
            <div
              className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-4 pulse-ring-blue"
              style={{ background: "#eff6ff", border: "1px solid rgba(30,64,175,0.2)" }}
            >
              <ShieldAlert size={24} style={{ color: ACCENT }} />
            </div>
            <p className="label" style={{ color: ACCENT }}>Government of India — CIB</p>
            <h1 className="mt-2 text-3xl font-bold heading-tight" style={{ color: "var(--text-primary)" }}>
              IPDR Intelligence
            </h1>
            <p className="mt-1 text-sm muted">Secure Investigation Platform · RESTRICTED ACCESS</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Username"
              className="w-full"
              autoComplete="username"
              id="login-username"
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              className="w-full"
              autoComplete="current-password"
              id="login-password"
            />
            {error && (
              <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
                {error}
              </div>
            )}
            <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm" id="login-submit">
              {loading ? "Authenticating…" : "Sign In"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs muted">
            Demo: admin / admin123 · For authorized personnel only
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BOOT SCREEN
   ============================================================ */
function BootScreen({ message, progress }) {
  return (
    <div className="relative min-h-full overflow-hidden" style={{ background: "#0f172a" }}>
      <CyberBackdrop />
      <div className="relative z-10 flex min-h-full items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <div className="boot-logo-pulse text-4xl font-black tracking-[0.25em] mb-1" style={{ color: ACCENT }}>
            IPDR
          </div>
          <div className="boot-logo-pulse text-xl font-light tracking-[0.5em]" style={{ color: "#94a3b8" }}>
            INTELLIGENCE
          </div>
          <p className="mt-2 text-xs tracking-[0.3em] label" style={{ color: "#475569" }}>CIB · Criminal Investigation Branch</p>
          <div className="mt-10 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#1e293b" }}>
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${Math.max(4, Math.min(100, progress))}%`,
                background: `linear-gradient(90deg, ${ACCENT}, ${ML_COLOR})`,
              }}
            />
          </div>
          <p className="mt-4 text-sm" style={{ color: "#94a3b8" }}>{message}</p>
          <p className="mt-2 text-xs mono" style={{ color: "#334155" }}>
            {Math.round(progress)}% — SECURE CHANNEL ESTABLISHED
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   REPORT SHEET (for PDF export)
   ============================================================ */
function ReportSheet({ data, kind }) {
  const title = kind === "case" ? data.name : `Investigation: ${data.a_party || data.subject}`;
  const summary = kind === "case" ? data.summary : {
    total_interactions: data.interactions?.length || 0,
    risk_score: data.risk?.score || 0,
    flag_count: data.flags?.length || 0,
  };
  const flags = kind === "case"
    ? (data.parties || []).flatMap((p) => (p.risk_details || []).map((d) => ({ ...d, subject: p.subject })))
    : (data.risk_details || data.flags || []);
  const interactionRows = kind === "case"
    ? (data.parties || []).flatMap((p) => p.records || [])
    : (data.interactions || []);

  return (
    <div className="space-y-4 p-6" style={{ background: "#0e1628", color: "#e8eef8", fontFamily: "Inter, sans-serif" }}>
      <div style={{ borderBottom: "1px solid #1a2845", paddingBottom: 12 }}>
        <p style={{ fontSize: 10, letterSpacing: "0.2em", color: "#3b82f6", textTransform: "uppercase" }}>
          CIB India — IPDR Intelligence Platform
        </p>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>{title}</h1>
        <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
          Generated {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC · RESTRICTED
        </p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {[["Total Interactions", summary.total_interactions || 0], ["Risk Score", summary.risk_score || 0], ["Flags", summary.flag_count || 0]].map(([l, v]) => (
          <div key={l} style={{ background: "#152038", border: "1px solid #1a2845", borderRadius: 10, padding: 12 }}>
            <p style={{ fontSize: 10, color: "#5a7090", textTransform: "uppercase" }}>{l}</p>
            <p style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>{v}</p>
          </div>
        ))}
      </div>
      <div style={{ background: "#152038", border: "1px solid #1a2845", borderRadius: 10, padding: 12 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5a7090", marginBottom: 10 }}>Rule Flags</h2>
        {flags.length ? flags.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, fontSize: 12, color: "#94a3b8" }}>
            <span style={{ color: "#3b82f6", marginTop: 2 }}>▸</span>
            <span>{f.subject ? `${f.subject}: ` : ""}{f.message} <strong style={{ color: "#e8eef8" }}>+{f.points ?? 0}</strong></span>
          </div>
        )) : <p style={{ fontSize: 12, color: "#5a7090" }}>No rule flags triggered.</p>}
      </div>
      <div style={{ background: "#152038", border: "1px solid #1a2845", borderRadius: 10, padding: 12 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5a7090", marginBottom: 10 }}>Key Interactions</h2>
        <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ color: "#5a7090" }}>
              {["A-Party", "B-Party", "Timestamp", "Duration (s)"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #1a2845" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {interactionRows.slice(0, 15).map((row, i) => (
              <tr key={i} style={{ color: "#94a3b8" }}>
                <td style={{ padding: "4px 8px" }}>{row.a_party || data.a_party || "—"}</td>
                <td style={{ padding: "4px 8px" }}>{row.b_party_ip || row.b_party_number || "—"}</td>
                <td style={{ padding: "4px 8px" }}>{row.timestamp || row.first_seen || "—"}</td>
                <td style={{ padding: "4px 8px" }}>{Math.round(row.duration_sec || row.total_duration_sec || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD VIEW
   ============================================================ */
function DashboardView({ token, onOpenCasePicker }) {
  const [summary, setSummary] = useState(null);
  const [network, setNetwork] = useState({ nodes: [], edges: [] });
  const [timeline, setTimeline] = useState([]);
  const [topFlagged, setTopFlagged] = useState([]);
  const [mlScoreMap, setMlScoreMap] = useState({});
  const [heatmapGrid, setHeatmapGrid] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [focusedNode, setFocusedNode] = useState(null);
  const [topFilter, setTopFilter] = useState("all");
  const [showHeatmap, setShowHeatmap] = useState(false);

  const riskLookup = useMemo(
    () => Object.fromEntries(topFlagged.map((r) => [r.a_party, r.risk_level])),
    [topFlagged]
  );

  async function load() {
    setError("");
    setLoading(true);
    try {
      const [sumData, netData, tlData, flagData, mlData] = await Promise.all([
        apiFetch("/dashboard/summary", {}, token),
        apiFetch("/dashboard/network?limit=500", {}, token),
        apiFetch("/dashboard/timeline?granularity=day", {}, token),
        apiFetch("/flags/top", {}, token),
        apiFetch("/ml/anomaly", {}, token).catch(() => ({ results: [] })),
      ]);
      setSummary(sumData);
      setNetwork(netData);
      setTimeline(tlData);
      setTopFlagged(flagData);
      // Build ML score map
      const scoreMap = {};
      (mlData.results || []).forEach((r) => { scoreMap[r.a_party] = r.anomaly_score; });
      setMlScoreMap(scoreMap);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Reload heatmap data when toggled
  useEffect(() => {
    if (showHeatmap && !heatmapGrid) {
      apiFetch("/dashboard/heatmap", {}, token)
        .then((res) => { if (res.grid) setHeatmapGrid(res.grid); })
        .catch(() => {});
    }
  }, [showHeatmap, token]);

  useEffect(() => { load(); }, [token]);

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

  // Find anomaly spikes for timeline markers
  const anomalyDates = useMemo(() => {
    if (!topFlagged.length || !timeline.length) return [];
    // Mark the top 3 peak days as anomaly markers
    const sorted = [...timeline].sort((a, b) => b.count - a.count);
    const avg = timeline.reduce((s, t) => s + t.count, 0) / timeline.length;
    return sorted.filter((t) => t.count > avg * 1.8).slice(0, 3).map((t) => t.period);
  }, [topFlagged, timeline]);

  const filteredTop = useMemo(() => {
    return topFlagged.filter((row) => {
      if (topFilter === "blacklist") return row.blacklist_matches?.length > 0;
      if (topFilter === "ml") return (mlScoreMap[row.a_party] || 0) >= 60;
      return true;
    });
  }, [topFlagged, topFilter, mlScoreMap]);

  return (
    <div className="space-y-6">
      {/* High-risk alert banner */}
      {!loading && topFlagged.some((f) => f.risk_level === "High") && (
        <div
          className="rounded-2xl px-5 py-3 flex items-center gap-4"
          style={{ background: "rgba(185,28,28,0.06)", border: "1px solid rgba(185,28,28,0.2)" }}
        >
          <AlertTriangle size={18} style={{ color: DANGER }} className="flex-shrink-0" />
          <p className="text-sm font-medium" style={{ color: "#991b1b" }}>
            {topFlagged.filter((f) => f.risk_level === "High").length} HIGH RISK entities detected in this dataset — immediate review recommended.
          </p>
        </div>
      )}

      {error && (
        <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>
          {error}
        </div>
      )}

      {/* Stats row */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {loading ? (
          <>{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}</>
        ) : (
          <>
            <StatCard label="Total Records" value={summary?.total_records ?? 0} icon={Database} accent={ACCENT} />
            <StatCard label="Unique A-Parties" value={summary?.unique_a_parties ?? 0} icon={Users} accent={ACCENT} />
            <StatCard label="Unique B-Parties" value={summary?.unique_b_parties ?? 0} icon={Network} accent={ACCENT} />
            <StatCard label="Flagged Parties" value={summary?.flagged_parties ?? 0} icon={AlertTriangle} accent={DANGER} />
          </>
        )}
      </div>

      {/* Network + Top Flagged */}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="card p-5 fade-in">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold heading-tight" style={{ color: "var(--text-primary)" }}>Communication Network</h2>
              <p className="text-xs muted mt-0.5">A-party ↔ B-party force graph · Scroll to zoom · Drag to pan</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHeatmap((v) => !v)}
                className="btn-secondary text-xs px-3 py-2"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Activity size={14} />
                {showHeatmap ? "Show Graph" : "Heatmap"}
              </button>
              <label
                className="btn-primary text-xs px-3 py-2 cursor-pointer"
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <Upload size={14} />
                Upload
                <input type="file" accept=".csv,.txt,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadByFile(f); }} className="hidden" />
              </label>
            </div>
          </div>
          <UploadDropzone onFile={uploadByFile} />
          <div className="mt-4">
            {loading ? (
              <Skeleton className="aspect-[16/10] w-full" />
            ) : showHeatmap ? (
              <div className="rounded-2xl p-4" style={{ background: "#f8fafc", border: "1px solid var(--border-default)" }}>
                <p className="label mb-4">Activity Heatmap — Hour × Day</p>
                <ActivityHeatmap grid={heatmapGrid} />
              </div>
            ) : (
              <NetworkGraph
                nodes={network.nodes}
                edges={network.edges}
                focusedNode={focusedNode}
                riskLookup={riskLookup}
                mlScores={mlScoreMap}
              />
            )}
          </div>
        </section>

        <section className="card p-5 fade-in">
          {/* Upload result */}
          {uploadResult && (
            <div className="mb-5 rounded-xl p-4" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}>
              <p className="label mb-2">Parse Result</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[["File", uploadResult.filename], ["Total rows", uploadResult.total_rows], ["Valid", uploadResult.valid_rows], ["Errors", uploadResult.error_rows]].map(([k, v]) => (
                  <div key={k}>
                    <span className="muted">{k}: </span>
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Top Flagged A-Parties</h3>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[["all", "All"], ["blacklist", "Blacklist"], ["ml", "ML Anomaly"]].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setTopFilter(key)}
                  className="text-xs px-3 py-1 rounded-full transition"
                  style={{
                    background: topFilter === key ? "var(--accent-soft)" : "#ffffff",
                    color: topFilter === key ? ACCENT : "var(--text-secondary)",
                    border: `1px solid ${topFilter === key ? "rgba(30,64,175,0.25)" : "var(--border-default)"}`,
                    boxShadow: topFilter === key ? "none" : "0 1px 2px rgba(15,23,42,0.04)",
                    fontWeight: topFilter === key ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {loading ? (
                <>{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}</>
              ) : (
                filteredTop.slice(0, 8).map((row) => {
                  const mlScore = mlScoreMap[row.a_party] ?? null;
                  return (
                    <button
                      key={row.a_party}
                      onClick={() => setFocusedNode(row.a_party)}
                      className="w-full rounded-xl p-3 text-left transition card-interactive"
                      style={{
                        background: "var(--bg-raised)",
                        border: `1px solid ${focusedNode === row.a_party ? "rgba(30,64,175,0.3)" : "var(--border-subtle)"}`,
                        borderLeft: `3px solid ${riskBorderColor(row.risk_level)}`,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="mono text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{row.a_party}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={riskBadge(row.risk_level)}>{row.risk_level}</span>
                          {row.blacklist_matches?.length > 0 && <span className="badge badge-bl">BL</span>}
                          {mlScore != null && mlScore >= 60 && (
                            <span className="badge badge-ml" title={`ML Score: ${mlScore}`}>ML {mlScore}</span>
                          )}
                          <WhyFlaggedPopover
                            details={row.risk_details || row.flags || []}
                            risk={{ score: row.risk_score, level: row.risk_level }}
                            mlData={mlScore != null ? { anomaly_score: mlScore, cluster_label: null } : null}
                          />
                        </div>
                      </div>
                      <p className="mt-1.5 text-xs muted">
                        Score {row.risk_score} · {row.interaction_count} interactions · {row.distinct_b_parties} B-parties
                      </p>
                      {mlScore != null && (
                        <div className="mt-1.5 h-1 rounded-full" style={{ background: "var(--bg-panel)" }}>
                          <div className="h-full rounded-full" style={{ width: `${mlScore}%`, background: `linear-gradient(90deg, ${ACCENT}, ${mlScoreColor(mlScore)})` }} />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Timeline + Risk summary */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section className="card p-5 fade-in">
          <h2 className="text-xl font-bold heading-tight mb-1" style={{ color: "var(--text-primary)" }}>Communication Volume</h2>
          <p className="text-xs muted mb-4">Traffic over time · Red markers = detected anomaly spikes</p>
          <div style={{ height: 280 }}>
            {loading ? <Skeleton className="h-full w-full" /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="tlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,130,200,0.12)" />
                  <XAxis dataKey="period" tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "#ffffff", border: "1px solid var(--border-default)", boxShadow: "0 4px 20px rgba(15,23,42,0.08)", color: "var(--text-primary)", borderRadius: 10, fontSize: 12 }}
                    itemStyle={{ color: "var(--text-accent)" }}
                    labelStyle={{ color: "var(--text-secondary)" }}
                  />
                  {anomalyDates.map((d) => (
                    <ReferenceLine key={d} x={d} stroke={DANGER} strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "!", fill: DANGER, fontSize: 10, position: "top" }} />
                  ))}
                  <Area type="monotone" dataKey="count" stroke={ACCENT} fill="url(#tlGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: ACCENT }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="card p-5 fade-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold heading-tight" style={{ color: "var(--text-primary)" }}>Risk Distribution</h2>
              <p className="text-xs muted">Low / Medium / High flagged parties</p>
            </div>
            <button
              onClick={() => apiFetch("/export/csv", { method: "GET" }, token).then((blob) => downloadBlob(blob, "ipdr_export.csv")).catch(() => {})}
              className="btn-secondary text-xs px-3 py-1.5"
            >
              Export CSV
            </button>
          </div>
          <div className="grid gap-3">
            {loading ? (
              <>{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20" />)}</>
            ) : (
              <>
                <StatCard label="Low Risk" value={summary?.risk_counts?.low ?? 0} icon={AlertTriangle} accent="#475569" />
                <StatCard label="Medium Risk" value={summary?.risk_counts?.medium ?? 0} icon={AlertTriangle} accent="#f59e0b" />
                <StatCard label="High Risk" value={summary?.risk_counts?.high ?? 0} icon={AlertTriangle} accent={DANGER} />
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   SEARCH / INTERACTIONS VIEW
   ============================================================ */
function SearchView({ token, onOpenCasePicker }) {
  const [form, setForm] = useState({ query: "", start_date: "", end_date: "", min_duration: "", max_duration: "", session_type: "", relevant_only: true, flagged_only: false });
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [sortBy, setSortBy] = useState("interaction_count");
  const [sortDir, setSortDir] = useState("desc");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [reportData, setReportData] = useState(null);
  const reportRef = useRef(null);
  const [mlScores, setMlScores] = useState({});

  // Load ML scores once
  useEffect(() => {
    apiFetch("/ml/anomaly", {}, token)
      .then((res) => {
        const m = {};
        (res.results || []).forEach((r) => { m[r.a_party] = r; });
        setMlScores(m);
      })
      .catch(() => {});
  }, [token]);

  async function runSearch(nextPage = 1) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      Object.entries(form).forEach(([k, v]) => { if (v !== "" && v !== false) params.set(k, v); });
      params.set("page", String(nextPage));
      params.set("page_size", String(PAGE_SIZE));
      params.set("sort_by", sortBy);
      params.set("sort_dir", sortDir);
      const result = await apiFetch(`/interactions?${params}`, {}, token);
      setRows(result.items);
      setTotal(result.total);
      setPage(result.page);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runSearch(1); }, [token, sortBy, sortDir]);

  function update(field, val) { setForm((f) => ({ ...f, [field]: val })); }

  function toggleSort(col) {
    if (sortBy === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  async function openInvestigation(aParty) {
    try { const r = await apiFetch(`/investigation/${encodeURIComponent(aParty)}`, {}, token); setSelected(r); }
    catch (err) { setError(err.message); }
  }

  async function exportPdf(aParty) {
    try {
      const detail = selected?.a_party === aParty ? selected : await apiFetch(`/investigation/${encodeURIComponent(aParty)}`, {}, token);
      setReportData(detail);
      await new Promise((res) => setTimeout(res, 150));
      await exportReportPdf(reportRef.current, `IPDR_Report_${String(aParty).replace(/[^A-Za-z0-9_-]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) { setError(err.message); }
    finally { setReportData(null); }
  }

  const columns = [["a_party", "A-Party"], ["b_party_ip", "B-Party"], ["interaction_count", "Count"], ["total_duration_sec", "Duration (s)"], ["first_seen", "First Seen"], ["last_seen", "Last Seen"]];

  return (
    <div className="space-y-6 fade-in">
      {error && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171", border: "1px solid rgba(239,68,68,0.3)" }}>{error}</div>}

      {/* Filter bar */}
      <section className="card p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={form.query} onChange={(e) => update("query", e.target.value)} placeholder="Search number or IP…" id="search-query" />
          <input value={form.start_date} onChange={(e) => update("start_date", e.target.value)} type="datetime-local" id="search-start" />
          <input value={form.end_date} onChange={(e) => update("end_date", e.target.value)} type="datetime-local" id="search-end" />
          <input value={form.session_type} onChange={(e) => update("session_type", e.target.value)} placeholder="Session type" id="search-session" />
          <input value={form.min_duration} onChange={(e) => update("min_duration", e.target.value)} placeholder="Min duration" type="number" id="search-min-dur" />
          <input value={form.max_duration} onChange={(e) => update("max_duration", e.target.value)} placeholder="Max duration" type="number" id="search-max-dur" />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={form.flagged_only} onChange={(e) => update("flagged_only", e.target.checked)} />
              Flagged only
            </label>
            <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--text-secondary)" }}>
              <input type="checkbox" checked={form.relevant_only} onChange={(e) => update("relevant_only", e.target.checked)} />
              Relevant only
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={() => runSearch(1)} className="btn-primary flex-1" id="search-submit">Search</button>
            <button
              onClick={() => apiFetch(`/export/csv?${new URLSearchParams(Object.fromEntries(Object.entries(form).filter(([, v]) => v !== "" && v !== false)))}`, {}, token).then((b) => downloadBlob(b, "ipdr_filtered.csv")).catch(() => {})}
              className="btn-secondary px-3"
            >
              CSV
            </button>
          </div>
        </div>
      </section>

      {/* Results table */}
      <section className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold heading-tight" style={{ color: "var(--text-primary)" }}>Interactions</h2>
            <p className="text-xs muted">{total} matched · Page {page}</p>
          </div>
          {loading && <span className="text-xs muted">Loading…</span>}
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {columns.map(([key, label]) => (
                    <th key={key} onClick={() => toggleSort(key)} style={{ cursor: "pointer" }}>
                      {label} {sortBy === key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                  <th>Risk</th>
                  <th>ML Score</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const ml = mlScores[row.a_party];
                  return (
                    <tr key={`${row.a_party}-${row.b_party_ip}-${row.b_party_number}`}>
                      <td className="mono">{row.a_party}</td>
                      <td className="mono">{formatVal(row.b_party_ip || row.b_party_number)}</td>
                      <td>{row.interaction_count}</td>
                      <td>{Math.round(row.total_duration_sec)}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.first_seen}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.last_seen}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className={riskBadge(row.risk?.level)}>{row.risk?.level || "Low"}</span>
                          {row.blacklist_matches?.length > 0 && <span className="badge badge-bl">BL</span>}
                          <WhyFlaggedPopover details={row.risk_details || row.flags || []} risk={row.risk} />
                        </div>
                      </td>
                      <td>
                        {ml ? (
                          <span className="badge badge-ml">{ml.anomaly_score}</span>
                        ) : <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button onClick={() => openInvestigation(row.a_party)} className="text-xs font-medium" style={{ color: ACCENT }}>Investigate</button>
                          <button onClick={() => onOpenCasePicker?.(row.a_party)} className="text-xs font-medium" style={{ color: "#818cf8" }}>+Case</button>
                          <button onClick={() => exportPdf(row.a_party)} className="text-xs font-medium" style={{ color: "#fbbf24" }}>PDF</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <button disabled={page <= 1} onClick={() => runSearch(page - 1)} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">← Prev</button>
          <span className="text-xs muted">Page {page} of {Math.ceil(total / PAGE_SIZE) || 1}</span>
          <button disabled={page * PAGE_SIZE >= total} onClick={() => runSearch(page + 1)} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">Next →</button>
        </div>
      </section>

      {/* Investigation modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(6px)" }}>
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl p-6 shadow-2xl fade-in" style={{ background: "#ffffff", border: "1px solid var(--border-default)", boxShadow: "0 20px 60px rgba(15,23,42,0.15)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="label">Investigation Summary</p>
                <h3 className="heading-tight text-xl mt-1 mono" style={{ color: "var(--text-primary)" }}>{selected.a_party}</h3>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => onOpenCasePicker?.(selected.a_party)} className="btn-secondary text-xs px-3 py-1.5">Add to Case</button>
                <button onClick={() => exportPdf(selected.a_party)} className="text-xs font-medium" style={{ color: "#fbbf24" }}>Export PDF</button>
                <button onClick={() => setSelected(null)} className="btn-secondary text-xs px-3 py-1.5"><X size={14} /></button>
              </div>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <span className={riskBadge(selected.risk?.level)}>{selected.risk?.level}</span>
              <span className="text-xs muted">Score: {selected.risk?.score}</span>
              {selected.blacklist_matches?.length > 0 && <span className="badge badge-bl">Blacklist Match</span>}
              <WhyFlaggedPopover details={selected.risk_details || []} risk={selected.risk} />
            </div>

            {/* Flags */}
            {selected.flags?.length > 0 && (
              <div className="grid gap-3 md:grid-cols-2 mb-5">
                {selected.flags.map((flag, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3"
                    style={{
                      background: "var(--bg-raised)",
                      border: `1px solid`,
                      borderColor: flag.severity === "high" ? "rgba(239,68,68,0.3)" : flag.severity === "medium" ? "rgba(245,158,11,0.3)" : "var(--border-subtle)",
                      borderLeft: `3px solid ${flag.severity === "high" ? DANGER : flag.severity === "medium" ? "#f59e0b" : "#475569"}`,
                    }}
                  >
                    <p className="text-xs font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{flag.type?.replace(/_/g, " ").toUpperCase()}</p>
                    <p className="text-xs muted">{flag.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Interactions table */}
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th>B-Party</th><th>Count</th><th>Duration (s)</th><th>First Seen</th><th>Last Seen</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.interactions?.map((item, i) => (
                    <tr key={i}>
                      <td className="mono">{item.b_party_ip || item.b_party_number}</td>
                      <td>{item.interaction_count}</td>
                      <td>{Math.round(item.total_duration_sec)}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.first_seen}</td>
                      <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{item.last_seen}</td>
                      <td>
                        {(item.b_party_ip || item.b_party_number) && (
                          <button onClick={() => onOpenCasePicker?.(item.b_party_ip || item.b_party_number)} className="text-xs" style={{ color: "#818cf8" }}>+Case</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {reportData && <div className="fixed left-[-9999px] top-0 w-[900px]" ref={reportRef}><ReportSheet data={reportData} kind="subject" /></div>}
    </div>
  );
}

/* ============================================================
   CASE PICKER MODAL
   ============================================================ */
function CasePickerModal({ token, subject, onClose, onAssigned }) {
  const [cases, setCases] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("Open");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/cases", {}, token).then(setCases).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  async function assignTo(caseId) {
    const res = await apiFetch(`/cases/${caseId}/parties`, { method: "POST", body: JSON.stringify({ subject, subject_type: subjectType(subject) }) }, token);
    onAssigned?.(res);
    onClose();
  }

  async function createAndAssign() {
    try {
      const c = await apiFetch("/cases", { method: "POST", body: JSON.stringify({ name, description, status }) }, token);
      await assignTo(c.id);
    } catch (err) { setError(err.message); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.4)", backdropFilter: "blur(6px)" }}>
      <div className="w-full max-w-2xl rounded-2xl p-6 shadow-2xl fade-in" style={{ background: "#ffffff", border: "1px solid var(--border-default)", boxShadow: "0 20px 60px rgba(15,23,42,0.15)" }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <h3 className="heading-tight text-xl" style={{ color: "var(--text-primary)" }}>Add to Case</h3>
            <p className="text-xs muted mt-1">Assign <span className="mono" style={{ color: ACCENT }}>{subjectLabel(subject)}</span> to a case</p>
          </div>
          <button onClick={onClose} className="btn-secondary p-1.5"><X size={14} /></button>
        </div>
        {error && <div className="rounded-xl p-3 text-sm mb-4" style={{ background: "var(--danger-soft)", color: "#f87171" }}>{error}</div>}
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Existing Cases</p>
            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
              {loading ? <Skeleton className="h-16" /> : cases.length ? cases.map((c) => (
                <button key={c.id} onClick={() => setSelectedId(String(c.id))} className="w-full rounded-xl p-3 text-left transition" style={{ background: selectedId === String(c.id) ? "var(--accent-soft)" : "var(--bg-raised)", border: `1px solid ${selectedId === String(c.id) ? "rgba(59,130,246,0.35)" : "var(--border-subtle)"}` }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                    <span className="badge badge-ok text-xs">{c.status}</span>
                  </div>
                  <p className="text-xs muted mt-1">{c.party_count} linked</p>
                </button>
              )) : <p className="text-sm muted">No cases yet.</p>}
            </div>
            <button disabled={!selectedId} onClick={() => assignTo(selectedId)} className="btn-primary w-full mt-3 text-sm py-2">Assign to Selected</button>
          </div>
          <div className="space-y-3">
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Create New Case</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Case name" className="w-full" />
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="w-full" style={{ minHeight: 80, resize: "vertical" }} />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full">
              <option value="Open">Open</option>
              <option value="Closed">Closed</option>
            </select>
            <button disabled={!name.trim()} onClick={createAndAssign} className="btn-primary w-full text-sm py-2">Create & Assign</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   CASES VIEW
   ============================================================ */
function CasesView({ token, onOpenCasePicker }) {
  const [cases, setCases] = useState([]);
  const [selectedCase, setSelectedCase] = useState(null);
  const [loading, setLoading] = useState(true);
  const [caseLoading, setCaseLoading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [reportData, setReportData] = useState(null);
  const reportRef = useRef(null);

  useEffect(() => {
    apiFetch("/cases", {}, token).then(setCases).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  async function openCase(caseId) {
    setCaseLoading(true);
    try { const r = await apiFetch(`/cases/${caseId}`, {}, token); setSelectedCase(r); }
    catch (e) { setError(e.message); }
    finally { setCaseLoading(false); }
  }

  async function addNote() {
    if (!note.trim() || !selectedCase) return;
    try {
      const r = await apiFetch(`/cases/${selectedCase.id}/notes`, { method: "POST", body: JSON.stringify({ note }) }, token);
      setSelectedCase(r);
      setNote("");
    } catch (e) { setError(e.message); }
  }

  async function exportCasePdf() {
    if (!selectedCase) return;
    setReportData(selectedCase);
    await new Promise((r) => setTimeout(r, 150));
    await exportReportPdf(reportRef.current, `IPDR_Case_${String(selectedCase.name).replace(/[^A-Za-z0-9_-]+/g, "_")}.pdf`);
    setReportData(null);
  }

  const statusColor = (s) => s === "Closed" ? "#475569" : ACCENT;

  return (
    <div className="space-y-6 fade-in">
      {error && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171" }}>{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        {/* Cases list */}
        <section className="card p-5">
          <h2 className="text-lg font-bold heading-tight mb-4" style={{ color: "var(--text-primary)" }}>Investigation Cases</h2>
          {loading ? <Skeleton className="h-32" /> : cases.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {cases.map((c) => (
                <button key={c.id} onClick={() => openCase(c.id)} className="w-full rounded-xl p-3 text-left transition card-interactive" style={{ background: selectedCase?.id === c.id ? "var(--accent-soft)" : "var(--bg-raised)", border: `1px solid ${selectedCase?.id === c.id ? "rgba(59,130,246,0.35)" : "var(--border-subtle)"}`, borderLeft: `3px solid ${statusColor(c.status)}` }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{c.name}</span>
                    <span className="badge" style={{ background: `${statusColor(c.status)}22`, color: statusColor(c.status), borderColor: `${statusColor(c.status)}44` }}>{c.status}</span>
                  </div>
                  <p className="text-xs muted mt-1">{c.party_count} parties · {c.last_updated?.slice(0, 10)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl p-5 text-center text-sm muted" style={{ background: "var(--bg-raised)", border: "1px dashed var(--border-default)" }}>
              No cases yet. Use "Add to Case" from Search or Dashboard.
            </div>
          )}
        </section>

        {/* Case detail */}
        <section className="card p-5">
          {caseLoading ? <Skeleton className="h-72" /> : selectedCase ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="label">Case Detail</p>
                  <h2 className="heading-tight text-xl mt-1" style={{ color: "var(--text-primary)" }}>{selectedCase.name}</h2>
                  {selectedCase.description && <p className="text-xs muted mt-1">{selectedCase.description}</p>}
                </div>
                <button onClick={exportCasePdf} className="btn-secondary text-xs px-3 py-1.5">Export PDF</button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Interactions" value={selectedCase.summary?.total_interactions ?? 0} icon={Activity} accent={ACCENT} />
                <StatCard label="Risk Score" value={selectedCase.summary?.risk_score ?? 0} icon={AlertTriangle} accent={DANGER} />
                <StatCard label="Flags" value={selectedCase.summary?.flag_count ?? 0} icon={ShieldAlert} accent="#f59e0b" />
              </div>

              {/* Parties */}
              {selectedCase.parties?.length > 0 && (
                <div>
                  <p className="label mb-3">Linked Parties</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCase.parties.map((p) => (
                      <span key={p.subject} className="rounded-xl px-3 py-1.5 mono text-xs" style={{ background: "var(--bg-raised)", border: `1px solid ${p.blacklist_matches?.length ? "rgba(239,68,68,0.3)" : "var(--border-subtle)"}`, color: p.blacklist_matches?.length ? "#f87171" : "var(--text-secondary)" }}>
                        {p.subject}
                        {p.blacklist_matches?.length > 0 && <span className="ml-1 badge badge-bl">BL</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <p className="label mb-3">Investigator Notes</p>
                <div className="max-h-40 space-y-2 overflow-y-auto mb-3">
                  {selectedCase.notes?.map((n) => (
                    <div key={n.id} className="rounded-xl p-3 text-sm" style={{ background: "var(--bg-raised)", border: "1px solid var(--border-subtle)" }}>
                      <p style={{ color: "var(--text-primary)", lineHeight: 1.5 }}>{n.note}</p>
                      <p className="text-xs muted mt-1">{n.created_at}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add investigation note…" className="flex-1" />
                  <button onClick={addNote} disabled={!note.trim()} className="btn-primary px-4 text-sm">Add</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Folder size={36} className="mb-3" style={{ color: "var(--border-default)" }} />
              <p className="muted text-sm">Select a case to view details</p>
            </div>
          )}
        </section>
      </div>
      {reportData && <div className="fixed left-[-9999px] top-0 w-[900px]" ref={reportRef}><ReportSheet data={reportData} kind="case" /></div>}
    </div>
  );
}

/* ============================================================
   BLACKLIST VIEW
   ============================================================ */
function BlacklistView({ token }) {
  const [entries, setEntries] = useState([]);
  const [value, setValue] = useState("");
  const [valueType, setValueType] = useState("any");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/blacklist", {}, token).then(setEntries).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  async function addEntry() {
    if (!value.trim() || !label.trim()) return;
    try {
      await apiFetch("/blacklist", { method: "POST", body: JSON.stringify({ value, value_type: valueType, label }) }, token);
      setValue(""); setLabel("");
      setEntries(await apiFetch("/blacklist", {}, token));
    } catch (e) { setError(e.message); }
  }

  async function removeEntry(id) {
    await apiFetch(`/blacklist/${id}`, { method: "DELETE" }, token);
    setEntries(await apiFetch("/blacklist", {}, token));
  }

  return (
    <div className="space-y-6 fade-in">
      {error && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171" }}>{error}</div>}

      <section className="card p-5">
        <h2 className="text-lg font-bold heading-tight mb-4" style={{ color: "var(--text-primary)" }}>Add Blacklist Entry</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_0.5fr_1.5fr_auto]">
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="IP address or phone number" id="bl-value" />
          <select value={valueType} onChange={(e) => setValueType(e.target.value)} id="bl-type">
            <option value="any">Any</option>
            <option value="ip">IP</option>
            <option value="number">Number</option>
          </select>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Reason / intelligence label" id="bl-label" />
          <button onClick={addEntry} disabled={!value.trim() || !label.trim()} className="btn-danger flex items-center gap-2 px-4" id="bl-add">
            <ShieldAlert size={14} /> Add
          </button>
        </div>
      </section>

      <section>
        <p className="label mb-3">{entries.length} entries in threat database</p>
        {loading ? <Skeleton className="h-40" /> : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {entries.map((e) => (
              <div key={e.id} className="card p-4 card-interactive fade-in" style={{ borderLeft: `3px solid rgba(239,68,68,0.6)` }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="mono text-sm font-semibold" style={{ color: "#f87171" }}>{e.value}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{e.value_type.toUpperCase()} · {e.label}</p>
                    <p className="text-xs muted mt-1">{e.created_at?.slice(0, 10)}</p>
                  </div>
                  <button onClick={() => removeEntry(e.id)} className="btn-secondary p-1.5 flex-shrink-0">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================
   LOGS VIEW
   ============================================================ */
function LogsView({ token }) {
  const [uploads, setUploads] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadUploads() {
    setError(""); setLoading(true);
    try {
      const res = await apiFetch("/uploads", {}, token);
      setUploads(res);
      if (res.length && !selected) openUpload(res[0].id);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function openUpload(id) {
    setDetailLoading(true);
    try { const r = await apiFetch(`/uploads/${id}`, {}, token); setSelected(r); }
    catch (e) { setError(e.message); }
    finally { setDetailLoading(false); }
  }

  useEffect(() => { loadUploads(); }, [token]);

  return (
    <div className="space-y-6 fade-in">
      {error && <div className="rounded-xl p-3 text-sm" style={{ background: "var(--danger-soft)", color: "#f87171" }}>{error}</div>}
      <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
        <section className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold heading-tight" style={{ color: "var(--text-primary)" }}>Upload History</h2>
            <button onClick={loadUploads} className="btn-secondary text-xs px-2 py-1"><RefreshCw size={12} /></button>
          </div>
          {loading ? <Skeleton className="h-24" /> : uploads.length ? (
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {uploads.map((u) => (
                <button key={u.id} onClick={() => openUpload(u.id)} className="w-full rounded-xl p-3 text-left transition card-interactive" style={{ background: selected?.upload?.id === u.id ? "var(--accent-soft)" : "var(--bg-raised)", border: `1px solid ${selected?.upload?.id === u.id ? "rgba(59,130,246,0.35)" : "var(--border-subtle)"}` }}>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{u.filename}</p>
                  <p className="text-xs muted mt-1">{u.file_type?.toUpperCase()} · {u.record_count || u.valid_rows} records · {u.error_rows} errors</p>
                  <p className="text-xs muted">{u.created_at?.slice(0, 16)}</p>
                </button>
              ))}
            </div>
          ) : (
            <div className="rounded-xl p-4 text-center text-sm muted" style={{ background: "var(--bg-raised)", border: "1px dashed var(--border-default)" }}>
              No uploads yet.
            </div>
          )}
        </section>

        <section className="card p-5">
          {detailLoading ? <Skeleton className="h-72" /> : selected ? (
            <div className="space-y-5">
              <div>
                <p className="label">Dataset Detail</p>
                <h2 className="heading-tight text-xl mt-1" style={{ color: "var(--text-primary)" }}>{selected.upload.filename}</h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <StatCard label="Total Rows" value={selected.upload.total_rows} icon={FileText} accent={ACCENT} />
                <StatCard label="Valid" value={selected.records.length} icon={Database} accent="#10b981" />
                <StatCard label="Errors" value={selected.errors.length} icon={AlertTriangle} accent={DANGER} />
              </div>
              <div className="grid gap-5 xl:grid-cols-2">
                <div>
                  <p className="label mb-3">Records</p>
                  <div className="max-h-80 overflow-auto rounded-xl" style={{ border: "1px solid var(--border-subtle)" }}>
                    <table className="min-w-full">
                      <thead><tr><th>A-Party</th><th>B-Party</th><th>Timestamp</th><th>Dur.</th></tr></thead>
                      <tbody>
                        {selected.records.map((row) => (
                          <tr key={row.id}>
                            <td className="mono">{row.a_party}</td>
                            <td className="mono">{row.b_party_ip || row.b_party_number}</td>
                            <td style={{ fontSize: 11, color: "var(--text-muted)" }}>{row.timestamp}</td>
                            <td>{Math.round(row.duration_sec || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <p className="label mb-3">Parse Errors</p>
                  <div className="max-h-80 overflow-auto space-y-2">
                    {selected.errors.length ? selected.errors.map((e) => (
                      <div key={e.id} className="rounded-xl p-3 text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
                        <p className="font-semibold">Row {e.row_index}</p>
                        <p className="muted mt-0.5">{e.message}</p>
                      </div>
                    )) : (
                      <div className="rounded-xl p-4 text-sm muted text-center" style={{ background: "var(--bg-raised)" }}>No parse errors.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <FileText size={36} className="mb-3" style={{ color: "var(--border-default)" }} />
              <p className="muted text-sm">Select a dataset to inspect</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================================================
   SETTINGS VIEW
   ============================================================ */
function SettingsView({ token }) {
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    apiFetch("/settings", {}, token).then(setSettings).catch((e) => setStatus(e.message));
  }, [token]);

  function update(key, val) { setSettings((s) => ({ ...s, [key]: val })); }

  async function save() {
    try {
      const r = await apiFetch("/settings", { method: "PUT", body: JSON.stringify(settings) }, token);
      setSettings(r);
      setStatus("✓ Settings saved");
      setTimeout(() => setStatus(""), 3000);
    } catch (e) { setStatus(e.message); }
  }

  if (!settings) return <Skeleton className="h-48 w-full" />;

  const FIELDS = [
    { section: "Night Activity", fields: [["night_start_hour", "Night Start Hour (0-23)"], ["night_end_hour", "Night End Hour (0-23)"], ["night_frequency_threshold", "Min. calls to trigger flag"]] },
    { section: "Short Sessions", fields: [["short_duration_threshold_sec", "Short session threshold (sec)"], ["short_duration_repeat_threshold", "Repeat count to trigger flag"]] },
    { section: "Fan-out Detection", fields: [["distinct_window_minutes", "Time window (minutes)"], ["distinct_b_threshold", "Distinct B-parties threshold"]] },
    { section: "Network Analysis", fields: [["shared_bparty_threshold", "Shared B-party hub threshold"], ["graph_limit", "Max nodes in network graph"]] },
  ];

  return (
    <section className="card p-6 fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold heading-tight" style={{ color: "var(--text-primary)" }}>Detection Thresholds</h2>
          <p className="text-xs muted mt-1">Configure rule-based and ML detection parameters</p>
        </div>
        <div className="flex items-center gap-3">
          {status && <span className="text-xs" style={{ color: status.startsWith("✓") ? "#10b981" : "#f87171" }}>{status}</span>}
          <button onClick={save} className="btn-primary text-sm">Save</button>
        </div>
      </div>
      <div className="space-y-6">
        {FIELDS.map(({ section, fields }) => (
          <div key={section}>
            <p className="label mb-3">{section}</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fields.map(([key, label]) => (
                <label key={key} className="space-y-1.5 text-sm">
                  <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{label}</span>
                  <input type="number" value={settings[key]} onChange={(e) => update(key, Number(e.target.value))} className="w-full" />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ============================================================
   SHELL (main layout)
   ============================================================ */
function Shell({ token, username, onLogout }) {
  const [view, setView] = useState("dashboard");
  const [casePickerSubject, setCasePickerSubject] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const menu = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "ml", label: "ML Intelligence", icon: Brain },
    { id: "search", label: "Search", icon: Search },
    { id: "cases", label: "Cases", icon: Folder },
    { id: "logs", label: "Upload Logs", icon: FileText },
    { id: "blacklist", label: "Blacklist DB", icon: ShieldAlert },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Sidebar */}
      <aside
        className="hidden lg:flex flex-col"
        style={{
          width: "var(--sidebar-w)",
          background: "#ffffff",
          borderRight: "1px solid var(--border-default)",
          flexShrink: 0,
          boxShadow: "1px 0 0 var(--border-subtle)",
        }}
      >
        {/* Brand */}
        <div className="px-5 py-6" style={{ borderBottom: "1px solid var(--border-default)" }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="rounded-xl p-1.5" style={{ background: "var(--accent-soft)", border: "1px solid rgba(59,130,246,0.25)" }}>
              <ShieldAlert size={16} style={{ color: ACCENT }} />
            </div>
            <p className="text-xs font-black tracking-[0.18em]" style={{ color: ACCENT }}>IPDR INTELLIGENCE</p>
          </div>
          <p className="text-xs ml-8" style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>Criminal Investigation Branch</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {menu.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={`nav-item${view === id ? " active" : ""}`}
            >
              <Icon size={16} />
              {label}
              {id === "ml" && <span className="ml-auto badge badge-ml text-xs px-1.5 py-0.5">AI</span>}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="rounded-xl p-3 mb-3" style={{ background: "var(--bg-panel)", border: "1px solid var(--border-subtle)" }}>
            <p className="text-xs muted">Authenticated as</p>
            <p className="text-sm font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>{username}</p>
            <p className="text-xs muted">RESTRICTED ACCESS</p>
          </div>
          <button onClick={onLogout} className="btn-secondary w-full text-sm py-2 flex items-center justify-center gap-2">
            <LogOut size={14} /> Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header style={{ background: "#ffffff", borderBottom: "1px solid var(--border-default)", padding: "0.75rem 1.5rem" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs muted capitalize">{view.replace("_", " ")}</p>
              <h1 className="heading-tight text-lg" style={{ color: "var(--text-primary)" }}>
                {menu.find((m) => m.id === view)?.label || "Dashboard"}
              </h1>
            </div>
            {/* Mobile menu pills */}
            <div className="flex gap-1 lg:hidden flex-wrap">
              {menu.slice(0, 4).map(({ id, label }) => (
                <button key={id} onClick={() => setView(id)} className="text-xs px-2 py-1 rounded-lg" style={{ background: view === id ? "var(--accent-soft)" : "var(--bg-raised)", color: view === id ? ACCENT : "var(--text-muted)", border: `1px solid ${view === id ? "rgba(59,130,246,0.3)" : "var(--border-subtle)"}` }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* View content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          <ErrorBoundary>
            {view === "dashboard" && <DashboardView token={token} onOpenCasePicker={setCasePickerSubject} />}
            {view === "ml" && <MLInsightsView token={token} />}
            {view === "search" && <SearchView token={token} onOpenCasePicker={setCasePickerSubject} />}
            {view === "cases" && <CasesView token={token} onOpenCasePicker={setCasePickerSubject} />}
            {view === "logs" && <LogsView token={token} />}
            {view === "blacklist" && <BlacklistView token={token} />}
            {view === "settings" && <SettingsView token={token} />}
          </ErrorBoundary>
        </main>

        {casePickerSubject && (
          <CasePickerModal
            token={token}
            subject={casePickerSubject}
            onClose={() => setCasePickerSubject("")}
            onAssigned={() => setCasePickerSubject("")}
          />
        )}

        <footer style={{ background: "#f8fafc", borderTop: "1px solid var(--border-default)", padding: "0.5rem 1.5rem" }}>
          <p className="text-xs muted">IPDR Intelligence Platform · CIB India · Local investigative use only · Data stays on device</p>
        </footer>
      </div>
    </div>
  );
}

/* ============================================================
   ROOT APP
   ============================================================ */
export default function App() {
  const auth = useAuth();
  const [booting, setBooting] = useState(false);
  const [bootProgress, setBootProgress] = useState(0);
  const [bootIndex, setBootIndex] = useState(0);

  useEffect(() => {
    if (!booting) return;
    setBootProgress(5);
    setBootIndex(0);
    const started = Date.now();
    const duration = 2400;

    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = (elapsed / duration) * 100;
      setBootProgress(pct);
      if (elapsed >= duration) {
        clearInterval(progressTimer);
        clearInterval(textTimer);
        setBootProgress(100);
        setTimeout(() => setBooting(false), 150);
      }
    }, 80);

    const textTimer = setInterval(() => {
      setBootIndex((idx) => (idx + 1) % BOOT_MESSAGES.length);
    }, 500);

    return () => {
      clearInterval(progressTimer);
      clearInterval(textTimer);
    };
  }, [booting]);

  if (!auth.token) {
    return <LoginView onLogin={(p) => { auth.login(p); setBooting(true); }} />;
  }
  if (booting) return <BootScreen message={BOOT_MESSAGES[bootIndex]} progress={bootProgress} />;
  return <Shell token={auth.token} username={auth.username} onLogout={auth.logout} />;
}
