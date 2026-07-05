import { demo } from "./demoApi";

const DEFAULT_API_URL = "https://ipdr-insight-1.onrender.com";
const API_URL = import.meta.env.VITE_API_URL || DEFAULT_API_URL;
const USE_DEMO = import.meta.env.DEV && !import.meta.env.VITE_API_URL;

function queryParams(path) {
  return Object.fromEntries(new URLSearchParams(path.split("?")[1] || ""));
}

export function apiUrl(path) {
  return USE_DEMO ? path : `${API_URL}${path}`;
}

export async function apiFetch(path, options = {}, token) {
  if (USE_DEMO) {
    const method = (options.method || "GET").toUpperCase();
    if (path === "/auth/login") return demo.login(JSON.parse(options.body || "{}"));
    if (path === "/auth/me") return demo.me();
    if (path.startsWith("/dashboard/summary")) return demo.summary();
    if (path.startsWith("/dashboard/network")) return demo.network(Number(queryParams(path).limit || 200));
    if (path.startsWith("/dashboard/timeline")) return demo.timeline(queryParams(path).granularity || "day");
    if (path.startsWith("/dashboard/heatmap")) return demo.heatmapGrid();
    if (path.startsWith("/flags/top")) return demo.topFlagged();
    if (path.startsWith("/records/search")) return demo.search(queryParams(path));
    if (path.startsWith("/interactions")) return demo.interactions(queryParams(path));
    if (path.startsWith("/settings")) return demo.settings(method, JSON.parse(options.body || "null"));
    if (path.startsWith("/investigation/")) return demo.investigation(decodeURIComponent(path.split("/").pop() || ""));
    if (path === "/cases") return demo.cases(method, JSON.parse(options.body || "null"));
    if (path.startsWith("/cases/")) return demo.caseDetail(method, path, JSON.parse(options.body || "null"));
    if (path === "/blacklist") return demo.blacklist(method, JSON.parse(options.body || "null"));
    if (path.startsWith("/blacklist/")) return demo.blacklist(method, JSON.parse(options.body || "null"), path);
    if (path === "/uploads") return demo.uploads(method);
    if (path.startsWith("/uploads/")) return demo.uploadDetail(method, path);
    if (path.startsWith("/export/csv")) return demo.exportCsv(queryParams(path));
    if (path.startsWith("/export/pdf")) return demo.exportPdf(queryParams(path).query || "");
    if (path.startsWith("/upload")) return demo.upload(options.body);
    if (path === "/ml/anomaly") return demo.mlAnomaly();
    if (path === "/ml/clusters") return demo.mlClusters();
    if (path.startsWith("/ml/predict/")) return demo.mlPredict(decodeURIComponent(path.split("/ml/predict/")[1] || ""));
  }

  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  try {
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (!response.ok) {
      let message = "Request failed";
      try {
        const payload = await response.json();
        message = payload.detail || JSON.stringify(payload);
      } catch {
        message = await response.text();
      }
      throw new Error(message);
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return response.json();
    return response.blob();
  } catch {
    throw new Error("Backend unreachable. Check VITE_API_URL and backend deployment.");
  }
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
