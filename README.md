# IPDR Insight

IPDR Insight is a full-stack investigation prototype for telecom IPDR logs. It ingests mixed operator formats, keeps each upload in its own history, maps A-party to B-party communication patterns, highlights suspicious behavior with explainable risk scoring, and supports cases, blacklist management, and PDF export.

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
   - Rules flag late-night frequency bursts, repeated short sessions, high fan-out A-parties, and shared hub B-parties, with explainable reasons and blacklist matches.
8. **Search and query**
   - Search by number/IP with date, duration, type, flagged-only, and relevant-only filters; sortable paginated results scoped to a selected upload.
9. **User dashboard**
   - Summary cards, timeline chart, top risk list, upload summary, past logs, case tracking, blacklist management, and investigation modal report.
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

The app now starts empty by default. Upload your own CSV, TXT, or JSON IPDR dataset from the UI to create a separate log history entry.

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

## Validation

The current codebase was verified with:

```bash
cd backend
python3 -m py_compile app/*.py

cd ../frontend
npm run build
```

A live smoke test also confirmed an empty startup state, upload creation, upload-scoped search, and upload history listing.

## UI/UX design notes

- Light professional interface (`#f8fafc` background, white cards, deep blue accent `#1e40af`)
- Sidebar with tinted background and active left-border navigation state
- Stat cards with left accents + icons (Database, Users, Network, AlertTriangle)
- Interactive network graph with zoom/pan, legend, tooltips, and reset view
- Clickable top-flagged cards that focus corresponding graph nodes
- Drag-and-drop upload zone, past logs view, and loading skeletons for smoother state transitions

## Data handling note
This prototype is intended for locally uploaded datasets only. It does not connect to external services or implement live surveillance.
