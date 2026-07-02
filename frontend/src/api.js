import { demo } from "./demoApi";

const API_URL = import.meta.env.VITE_API_URL || "";
const USE_DEMO = !API_URL;

export function apiUrl(path) {
  return USE_DEMO ? path : `${API_URL}${path}`;
}

export async function apiFetch(path, options = {}, token) {
  if (USE_DEMO) {
    const method = (options.method || "GET").toUpperCase();
    if (path === "/auth/login") return demo.login(JSON.parse(options.body || "{}"));
    if (path === "/auth/me") return demo.me();
    if (path.startsWith("/dashboard/summary")) return demo.summary();
    if (path.startsWith("/dashboard/network")) {
      const params = new URLSearchParams(path.split("?")[1] || "");
      return demo.network(Number(params.get("limit") || 200));
    }
    if (path.startsWith("/dashboard/timeline")) {
      const params = new URLSearchParams(path.split("?")[1] || "");
      return demo.timeline(params.get("granularity") || "day");
    }
    if (path.startsWith("/flags/top")) return demo.topFlagged();
    if (path.startsWith("/records/search")) {
      const params = Object.fromEntries(new URLSearchParams(path.split("?")[1] || ""));
      return demo.search(params);
    }
    if (path.startsWith("/interactions")) {
      const params = Object.fromEntries(new URLSearchParams(path.split("?")[1] || ""));
      return demo.interactions(params);
    }
    if (path.startsWith("/settings")) {
      const params = JSON.parse(options.body || "null");
      return demo.settings(method, params);
    }
    if (path.startsWith("/investigation/")) return demo.investigation(decodeURIComponent(path.split("/").pop() || ""));
    if (path.startsWith("/export/csv")) {
      const params = Object.fromEntries(new URLSearchParams(path.split("?")[1] || ""));
      return demo.exportCsv(params);
    }
    if (path.startsWith("/export/pdf")) {
      const params = new URLSearchParams(path.split("?")[1] || "");
      return demo.exportPdf(params.get("query") || "");
    }
    if (path.startsWith("/upload")) return demo.upload(options.body);
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
  } catch (error) {
    if (USE_DEMO) throw error;
    throw new Error("Backend unreachable. Set VITE_API_URL or deploy the backend.");
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
