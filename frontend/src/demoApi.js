const random = (() => {
  let seed = 42;
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
})();

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function iso(dt) {
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
}

function parseDateTime(value) {
  if (!value) return null;
  const dt = new Date(String(value).replace(" ", "T"));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function normalizeKey(value) {
  return String(value).trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
}

const settings = {
  night_start_hour: 0,
  night_end_hour: 4,
  night_frequency_threshold: 4,
  short_duration_threshold_sec: 5,
  short_duration_repeat_threshold: 6,
  distinct_window_minutes: 60,
  distinct_b_threshold: 12,
  shared_bparty_threshold: 6,
  graph_limit: 200,
};

function buildRecords() {
  const rows = [];
  const base = new Date("2026-06-24T08:00:00");
  const normalA = Array.from({ length: 16 }, () => `9${Math.floor(100000000 + random() * 899999999)}`);
  const bNumbers = Array.from({ length: 24 }, () => `8${Math.floor(100000000 + random() * 899999999)}`);

  const push = (record) => rows.push(record);

  for (let i = 0; i < 180; i += 1) {
    const dt = new Date(base.getTime() + (Math.floor(random() * 9 * 24 * 60) * 60 + Math.floor(random() * 3600)) * 1000);
    push({
      a_party: pick(normalA),
      b_party_ip: `10.${Math.floor(i / 250) % 250}.${Math.floor(i / 25) % 250}.${(i % 250) + 1}`,
      b_party_number: pick(bNumbers),
      timestamp: iso(dt),
      duration_sec: Math.floor(8 + random() * 672),
      port: pick([80, 443, 5060, 8080, 22, 53, 8443]),
      data_volume: null,
      session_type: "data",
    });
  }

  const burstA = "9177000001";
  for (let i = 0; i < 60; i += 1) {
    const dt = new Date("2026-06-28T00:00:00");
    dt.setMinutes(dt.getMinutes() + Math.floor(i / 3));
    dt.setSeconds(dt.getSeconds() + i * 13);
    push({
      a_party: burstA,
      b_party_ip: "198.51.100.77",
      b_party_number: "8000001000",
      timestamp: iso(dt),
      duration_sec: Math.floor(18 + random() * 222),
      port: 443,
      data_volume: null,
      session_type: "data",
    });
  }

  const pingA = "9177000002";
  for (let i = 0; i < 40; i += 1) {
    const dt = new Date("2026-06-29T14:10:00");
    dt.setMinutes(dt.getMinutes() + i * 5);
    push({
      a_party: pingA,
      b_party_ip: "203.0.113.90",
      b_party_number: "8000002000",
      timestamp: iso(dt),
      duration_sec: Math.floor(1 + random() * 4),
      port: pick([80, 443, 8080]),
      data_volume: null,
      session_type: "data",
    });
  }

  const fanoutA = "9177000003";
  const fanoutBs = Array.from({ length: 30 }, (_, i) => `198.51.100.${10 + i}`);
  for (let i = 0; i < 20; i += 1) {
    const dt = new Date("2026-06-30T11:00:00");
    dt.setMinutes(dt.getMinutes() + i * 2);
    push({
      a_party: fanoutA,
      b_party_ip: fanoutBs[i % fanoutBs.length],
      b_party_number: `800001${String(i).padStart(4, "0")}`,
      timestamp: iso(dt),
      duration_sec: Math.floor(6 + random() * 84),
      port: pick([53, 80, 443, 22, 25]),
      data_volume: null,
      session_type: "data",
    });
  }

  const sharedA = ["9177000010", "9177000011", "9177000012", "9177000013", "9177000014", "9177000015", "9177000016"];
  sharedA.forEach((a, i) => {
    const dt = new Date("2026-06-30T18:20:00");
    dt.setMinutes(dt.getMinutes() + i * 11);
    push({
      a_party: a,
      b_party_ip: "203.0.113.200",
      b_party_number: "8000099000",
      timestamp: iso(dt),
      duration_sec: Math.floor(12 + random() * 108),
      port: pick([443, 8443, 8080]),
      data_volume: null,
      session_type: "data",
    });
  });

  while (rows.length < 307) {
    const dt = new Date(base.getTime() + (Math.floor(random() * 10 * 24 * 60) * 60 + Math.floor(random() * 3600)) * 1000);
    push({
      a_party: pick([...normalA, burstA, pingA, fanoutA]),
      b_party_ip: `10.${Math.floor(rows.length / 250) % 250}.${Math.floor(rows.length / 25) % 250}.${(rows.length % 250) + 1}`,
      b_party_number: pick(bNumbers),
      timestamp: iso(dt),
      duration_sec: Math.floor(5 + random() * 415),
      port: pick([80, 443, 5060, 22, 25]),
      data_volume: null,
      session_type: "data",
    });
  }

  return rows;
}

const records = buildRecords();

// Assign a stable device identity (IMEI/IMSI/home tower) per A-party, matching Indian TSP IPDR exports
const deviceByA = new Map();
records.forEach((record) => {
  if (!deviceByA.has(record.a_party)) {
    deviceByA.set(record.a_party, {
      imei: `35${String(Math.floor(random() * 1e13)).padStart(13, "0")}`,
      imsi: `404${String(10 + Math.floor(random() * 89))}${String(Math.floor(random() * 1e10)).padStart(10, "0")}`,
      cell_id: `${1000 + Math.floor(random() * 9000)}-${10000 + Math.floor(random() * 90000)}`,
    });
  }
  Object.assign(record, deviceByA.get(record.a_party));
});

function buildDeviceProfile(rows) {
  const collect = (field) => {
    const seen = new Map();
    rows.forEach((record) => {
      const value = String(record[field] || "").trim();
      if (!value) return;
      const entry = seen.get(value) || { value, count: 0, first_seen: record.timestamp, last_seen: record.timestamp };
      entry.count += 1;
      if (record.timestamp < entry.first_seen) entry.first_seen = record.timestamp;
      if (record.timestamp > entry.last_seen) entry.last_seen = record.timestamp;
      seen.set(value, entry);
    });
    return [...seen.values()].sort((a, b) => b.count - a.count);
  };
  return { imeis: collect("imei"), imsis: collect("imsi"), cell_ids: collect("cell_id") };
}

function recordMatchesFilters(record, filters = {}) {
  if (filters.query) {
    const q = filters.query.toLowerCase();
    const hay = [record.a_party, record.b_party_ip, record.b_party_number, record.session_type, record.port, record.imei, record.imsi, record.cell_id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const start = filters.start_date ? parseDateTime(filters.start_date) : null;
  const end = filters.end_date ? parseDateTime(filters.end_date) : null;
  const current = parseDateTime(record.timestamp);
  if (start && current && current < start) return false;
  if (end && current && current > end) return false;
  if (filters.session_type && String(record.session_type).toLowerCase() !== String(filters.session_type).toLowerCase()) return false;
  if (filters.min_duration !== undefined && filters.min_duration !== "" && Number(record.duration_sec || 0) < Number(filters.min_duration)) return false;
  if (filters.max_duration !== undefined && filters.max_duration !== "" && Number(record.duration_sec || 0) > Number(filters.max_duration)) return false;
  return true;
}

function isRelevantRecord(record) {
  const bId = (record.b_party_ip || "").trim() || (record.b_party_number || "").trim();
  if (!bId) return false;
  if (Number(record.duration_sec || 0) <= 0) return false;
  const noiseTypes = new Set(["heartbeat", "keepalive", "probe", "healthcheck", "background_sync"]);
  return !noiseTypes.has(String(record.session_type || "").toLowerCase());
}

function computeFlags(data) {
  const byA = new Map();
  const byB = new Map();
  const out = [];
  const riskPoints = new Map();
  const flagsByA = new Map();

  const isNight = (hour) => {
    const { night_start_hour: start, night_end_hour: end } = settings;
    if (start === end) return true;
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  };

  data.forEach((record) => {
    const dt = parseDateTime(record.timestamp);
    const bId = record.b_party_ip || record.b_party_number;
    if (!byA.has(record.a_party)) byA.set(record.a_party, []);
    if (!byB.has(bId)) byB.set(bId, []);
    byA.get(record.a_party).push({ ...record, dt, b_id: bId });
    byB.get(bId).push({ ...record, dt, b_id: bId });
  });

  for (const [aParty, items] of byA.entries()) {
    const pushFlag = (flag, points) => {
      if (!flagsByA.has(aParty)) flagsByA.set(aParty, []);
      flagsByA.get(aParty).push(flag);
      riskPoints.set(aParty, (riskPoints.get(aParty) || 0) + points);
    };

    const nightCount = items.filter((r) => r.dt && isNight(r.dt.getHours())).length;
    if (nightCount > settings.night_frequency_threshold) {
      pushFlag({ type: "night_activity", message: `${nightCount} interactions between 00:00 and 04:00`, severity: "medium", count: nightCount }, 1);
    }

    const short = new Map();
    items.filter((r) => Number(r.duration_sec || 0) < settings.short_duration_threshold_sec).forEach((r) => {
      short.set(r.b_id, (short.get(r.b_id) || 0) + 1);
    });
    const topShort = [...short.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topShort && topShort[1] > settings.short_duration_repeat_threshold) {
      pushFlag({ type: "short_repeated_sessions", message: `${topShort[1]} short sessions with ${topShort[0]}`, severity: "high", count: topShort[1] }, 2);
    }

    const sorted = [...items].sort((a, b) => a.dt - b.dt);
    for (const current of sorted) {
      const end = new Date(current.dt.getTime() + settings.distinct_window_minutes * 60000);
      const distinct = new Set(items.filter((r) => r.dt && r.dt >= current.dt && r.dt <= end).map((r) => r.b_id));
      if (distinct.size > settings.distinct_b_threshold) {
        pushFlag({ type: "many_distinct_b_parties", message: `${distinct.size} distinct B-parties within ${settings.distinct_window_minutes} minutes`, severity: "high", count: distinct.size }, 2);
        break;
      }
    }
  }

  for (const [bId, items] of byB.entries()) {
    const distinctA = new Set(items.map((r) => r.a_party));
    if (distinctA.size > settings.shared_bparty_threshold) {
      for (const item of items) {
        const aParty = item.a_party;
        if (!flagsByA.has(aParty)) flagsByA.set(aParty, []);
        flagsByA.get(aParty).push({
          type: "shared_b_party_hub",
          message: `B-party ${bId} contacted by ${distinctA.size} different A-parties`,
          severity: "medium",
          count: distinctA.size,
        });
        riskPoints.set(aParty, (riskPoints.get(aParty) || 0) + 1);
      }
    }
  }

  const riskByA = {};
  for (const [aParty, points] of riskPoints.entries()) {
    riskByA[aParty] = { score: points, level: points >= 4 ? "High" : points >= 2 ? "Medium" : "Low" };
  }

  for (const rec of data) {
    const risk = riskByA[rec.a_party];
    if (risk) out.push({ ...rec, risk, flags: flagsByA.get(rec.a_party) || [] });
  }

  const topFlagged = [...riskPoints.keys()]
    .map((aParty) => ({
      a_party: aParty,
      risk_score: riskByA[aParty].score,
      risk_level: riskByA[aParty].level,
      flags: flagsByA.get(aParty) || [],
      interaction_count: data.filter((r) => r.a_party === aParty).length,
      distinct_b_parties: new Set(data.filter((r) => r.a_party === aParty).map((r) => r.b_party_ip || r.b_party_number)).size,
    }))
    .sort((a, b) => b.risk_score - a.risk_score || b.interaction_count - a.interaction_count);

  return { flagsByA, riskByA, flaggedRecords: out, topFlagged };
}

function aggregateInteractions(data) {
  const grouped = new Map();
  data.forEach((record) => {
    const key = `${record.a_party}|${record.b_party_ip}|${record.b_party_number}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  });
  return [...grouped.entries()].map(([, items]) => ({
    a_party: items[0].a_party,
    b_party_ip: items[0].b_party_ip,
    b_party_number: items[0].b_party_number,
    interaction_count: items.length,
    total_duration_sec: items.reduce((sum, item) => sum + Number(item.duration_sec || 0), 0),
    first_seen: items.map((i) => i.timestamp).sort()[0],
    last_seen: items.map((i) => i.timestamp).sort().at(-1),
    session_types: [...new Set(items.map((i) => i.session_type).filter(Boolean))],
  }));
}

function filterRecords(query = {}) {
  return records.filter((r) => recordMatchesFilters(r, query));
}

function networkData(limit = 200) {
  const { riskByA } = computeFlags(records);
  const nodes = new Map();
  const edges = new Map();
  records.slice(0, limit).forEach((record) => {
    const a = record.a_party;
    const b = record.b_party_ip || record.b_party_number;
    if (!a || !b) return;
    nodes.set(a, { id: a, label: a, type: "a", flagged: Boolean(riskByA[a]) });
    nodes.set(b, { id: b, label: b, type: "b", flagged: false });
    const key = `${a}|${b}`;
    edges.set(key, { source: a, target: b, weight: (edges.get(key)?.weight || 0) + 1 });
  });
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function timelineData(granularity = "day") {
  const buckets = new Map();
  records.forEach((record) => {
    const dt = parseDateTime(record.timestamp);
    if (!dt) return;
    const key =
      granularity === "hour"
        ? `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:00`
        : `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  });
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, count]) => ({ period, count }));
}

function csvBlob(rows) {
  const headers = Object.keys(rows[0] || {});
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.join(",")].concat(rows.map((row) => headers.map((h) => escape(row[h])).join(","))).join("\n");
  return new Blob([csv], { type: "text/csv" });
}

async function parseUpload(body) {
  const file = body instanceof FormData ? body.get("file") : null;
  if (!file) return { filename: "upload.csv", file_type: "csv", total_rows: 0, valid_rows: 0, error_rows: 0, date_min: null, date_max: null, errors: [] };
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    const data = Array.isArray(parsed) ? parsed : parsed.records || parsed.rows || parsed.data || [];
    return { filename: file.name, file_type: "json", total_rows: data.length, valid_rows: data.length, error_rows: 0, date_min: null, date_max: null, errors: [] };
  }
  const headers = lines[0].split(/[,;\t|]/).map((h) => normalizeKey(h));
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(/[,;\t|]/);
    const raw = {};
    headers.forEach((header, index) => {
      raw[header] = cols[index] || "";
    });
    const mapped = {
      a_party: raw.a_party_number || raw.a_party || raw.calling_number || raw.caller_id || raw.caller || raw.msisdn || "",
      b_party_ip: raw.b_party_ip || raw.destination_ip || raw.dest_ip || raw.recipient_ip || raw.remote_ip || "",
      b_party_number: raw.b_party_number || raw.called_number || raw.destination_number || raw.dest_number || "",
      timestamp: raw.timestamp || raw.datetime || raw.date_time || raw.event_time || raw.call_time || raw.start_time || "",
      duration_sec: Number(raw.duration_sec || raw.duration || raw.call_duration || 0),
      port: raw.port || raw.dst_port || "",
      data_volume: raw.data_volume || "",
      session_type: raw.session_type || "unknown",
    };
    return mapped;
  });
  const valid = rows.filter((row) => row.a_party && row.timestamp && (row.b_party_ip || row.b_party_number));
  return {
    filename: file.name,
    file_type: "csv",
    total_rows: rows.length,
    valid_rows: valid.length,
    error_rows: rows.length - valid.length,
    date_min: valid[0]?.timestamp || null,
    date_max: valid.at(-1)?.timestamp || null,
    errors: [],
  };
}

const demo = {
  async login(payload) {
    if (payload.username === "admin" && payload.password === "admin123") {
      return { access_token: "demo-token", token_type: "bearer", username: "admin" };
    }
    throw new Error("Invalid demo credentials");
  },
  async me() {
    return { username: "admin" };
  },
  async summary() {
    const flagged = computeFlags(records);
    return {
      total_records: records.length,
      unique_a_parties: new Set(records.map((r) => r.a_party)).size,
      unique_b_parties: new Set(records.map((r) => r.b_party_ip || r.b_party_number)).size,
      flagged_parties: Object.keys(flagged.riskByA).length,
      risk_counts: {
        low: Object.values(flagged.riskByA).filter((r) => r.level === "Low").length,
        medium: Object.values(flagged.riskByA).filter((r) => r.level === "Medium").length,
        high: Object.values(flagged.riskByA).filter((r) => r.level === "High").length,
      },
    };
  },
  async network(limit = 200) {
    return networkData(limit);
  },
  async timeline(granularity = "day") {
    return timelineData(granularity);
  },
  async topFlagged() {
    return computeFlags(records).topFlagged;
  },
  async search(query = {}) {
    const flagged = computeFlags(records);
    let items = filterRecords(query);
    if (query.relevant_only === "true" || query.relevant_only === true) items = items.filter(isRelevantRecord);
    if (query.flagged_only) items = items.filter((r) => flagged.riskByA[r.a_party]);
    items = items.map((r) => ({
      ...r,
      risk: flagged.riskByA[r.a_party] || { score: 0, level: "Low" },
      flags: flagged.flagsByA.get(r.a_party) || [],
    }));
    items.sort((a, b) => String(b[query.sort_by || "timestamp"]).localeCompare(String(a[query.sort_by || "timestamp"])));
    const page = Number(query.page || 1);
    const pageSize = Number(query.page_size || 25);
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize, flags: Object.fromEntries(flagged.riskByA) };
  },
  async interactions(query = {}) {
    const flagged = computeFlags(records);
    let rows = filterRecords(query);
    if (query.relevant_only === "true" || query.relevant_only === true) rows = rows.filter(isRelevantRecord);
    if (query.a_party) rows = rows.filter((r) => r.a_party === query.a_party);
    if (query.b_party) rows = rows.filter((r) => (r.b_party_ip || r.b_party_number) === query.b_party);
    if (query.flagged_only) rows = rows.filter((r) => flagged.riskByA[r.a_party]);
    const items = aggregateInteractions(rows).map((item) => ({
      ...item,
      risk: flagged.riskByA[item.a_party] || { score: 0, level: "Low" },
      flags: flagged.flagsByA.get(item.a_party) || [],
    }));
    items.sort((a, b) => Number(b[query.sort_by || "interaction_count"]) - Number(a[query.sort_by || "interaction_count"]));
    const page = Number(query.page || 1);
    const pageSize = Number(query.page_size || 25);
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize };
  },
  async settings(method, payload) {
    if (method === "PUT" && payload) {
      Object.assign(settings, payload);
      return settings;
    }
    return settings;
  },
  async investigation(query) {
    const flagged = computeFlags(records);
    const rows = records.filter((r) => [r.a_party, r.b_party_ip, r.b_party_number].some((value) => String(value || "").includes(query)));
    if (!rows.length) throw new Error("No matching records");
    const aParty = rows[0].a_party;
    return {
      query,
      a_party: aParty,
      risk: flagged.riskByA[aParty] || { score: 0, level: "Low" },
      flags: flagged.flagsByA.get(aParty) || [],
      device_profile: buildDeviceProfile(rows),
      interactions: aggregateInteractions(rows).map((item) => ({
        ...item,
        risk: flagged.riskByA[item.a_party] || { score: 0, level: "Low" },
        flags: flagged.flagsByA.get(item.a_party) || [],
      })),
      records: rows,
    };
  },
  async exportCsv(query = {}) {
    const rows = (await this.search(query)).items;
    return csvBlob(rows);
  },
  async exportPdf(query) {
    return new Blob([`IPDR Insight investigation summary for ${query}`], { type: "application/pdf" });
  },
  async upload(body) {
    return parseUpload(body);
  },
};

export { demo, records };
