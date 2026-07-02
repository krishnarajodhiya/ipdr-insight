# IPDR Insight

IPDR Insight is a full-stack investigation prototype that uploads telecom IPDR logs, normalizes mixed operator formats, maps A-party to B-party communication patterns, and highlights suspicious behavior with configurable rule-based detection.

## Stack
- Backend: FastAPI + pandas + SQLite
- Frontend: React + Tailwind CSS
- Charts: Recharts
- Network graph: d3-force
- Auth: JWT (username/password demo login)

## Step-by-step execution flow (implemented)

1. **Understand IPDR structure and formats**
   - The parser supports multiple telecom naming styles (e.g. `calling_number`, `A_Party`, `caller_id`) and maps them to a single internal schema.
2. **Parse and clean logs**
   - Upload endpoints accept CSV/TXT/JSON and process with pandas; malformed rows are skipped and logged.
3. **Identify A-party and B-party relationships**
   - Each valid row stores `a_party`, `b_party_ip` / `b_party_number`, `timestamp`, duration, port, and metadata in SQLite.
4. **Filter relevant communication data**
   - Search APIs support a `relevant_only` filter to suppress noisy sessions (missing B-party/zero-duration/noise session types).
5. **Normalize diverse data formats**
   - Alias-based column normalization supports different operators and export structures.
6. **Build communication mapping tools**
   - Dashboard includes interaction tables and an A↔B force-directed graph.
7. **Automate suspicious activity detection**
   - Rules flag late-night frequency bursts, repeated short sessions, high fan-out A-parties, and shared hub B-parties.
8. **Search and query**
   - Search by number/IP with date, duration, type, flagged-only, and relevant-only filters; sortable paginated results.
9. **User dashboard**
   - Summary cards, timeline chart, top risk list, upload summary, and investigation modal report.
10. **Security and compliance**
   - JWT-based auth, configurable token expiry, configurable CORS origins, and a clear local-demo compliance notice.

## Run locally

### 1) Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The backend auto-loads `sample_data/sample_ipdr_data.csv` on startup if the database is empty.

### 2) Frontend
```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL in your browser and log in with:
- Username: `admin`
- Password: `admin123`

## Deployment notes

- **Backend (Render):** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Frontend (Vercel):** set root directory to `frontend`
- **Frontend API URL:** `VITE_API_URL=https://<your-backend-domain>`

## Data handling note
This prototype is intended for locally uploaded sample data only. It does not connect to external services or implement live surveillance.
