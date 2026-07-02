# IPDR Insight

IPDR Insight is a local-only demo web app for uploading IPDR logs, normalizing telecom record formats, mapping A-party to B-party communications, flagging suspicious patterns, and exporting investigation summaries.

## Stack
- Backend: FastAPI + pandas + SQLite
- Frontend: React + Tailwind CSS
- Charts: Recharts
- Network graph: d3-force

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

## Demo features
- Upload CSV/TXT/JSON IPDR files
- Auto-normalize operator-specific columns into one schema
- Search interactions by number or IP
- Rule-based suspicious activity detection with configurable thresholds
- CSV/PDF exports and printable investigation summaries
- Dark-themed responsive dashboard for hackathon demos

## Data handling note
This prototype is intended for locally uploaded sample data only. It does not connect to external services or implement live surveillance.
