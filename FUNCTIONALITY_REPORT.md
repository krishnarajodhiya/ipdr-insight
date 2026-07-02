# IPDR Insight Functionality Report

Date: 2026-07-02

## Overview
IPDR Insight is a local investigative prototype for telecom IPDR analysis. It ingests upload files, normalizes mixed operator formats, stores records in SQLite, scores suspicious activity, and presents results through a React dashboard.

## Core Functionality

### 1. Authentication
- Demo login with JWT-based session handling.
- Default credentials: `admin` / `admin123`.
- Protects all main API routes behind bearer token auth.

### 2. IPDR Upload and Parsing
- Accepts CSV, TXT, and JSON uploads.
- Normalizes common telecom field aliases into a single internal schema.
- Skips malformed rows and stores parse errors for review.
- Persists upload summaries, valid rows, and timestamps in SQLite.

### 3. Dashboard
- Summary cards for total records, unique A-parties, unique B-parties, and flagged parties.
- Timeline chart for traffic volume over time.
- Top-flagged A-party list with risk level and score.
- A↔B force-directed communication graph with zoom, pan, and reset.

### 4. Search and Investigation
- Search by number, IP, date range, duration, session type, flagged-only, and relevant-only filters.
- Paginated and sortable results.
- Investigation modal for a selected A-party with related interactions and rule flags.

### 5. Rule-Based Flagging
- Night activity detection.
- Repeated short-duration sessions.
- High distinct B-party fan-out within a time window.
- Shared hub B-parties contacted by many A-parties.
- Risk levels map to Low, Medium, or High.

## Added Features

### 6. Cases / Investigation Folders
- New Cases section in the sidebar.
- Create cases with name, description, status, and timestamps.
- Assign A-parties or B-parties to existing cases or create a new case inline.
- Case detail view includes case metadata, linked parties, risk/flag status, a mini network graph, and investigator notes/timeline.
- Case list shows card-style summaries with status, linked party count, and last updated time.

### 7. PDF Investigation Report Export
- Export report buttons on investigation and case views.
- Generates a print-friendly PDF with branding, timestamp, summary stats, flags, key interactions, and a rendered network graph image.
- Saved with filenames in the form `IPDR_Report_<subject>_<date>.pdf`.

### 8. Explainable Risk Score
- "Why flagged?" breakdown available wherever risk is shown.
- Displays only the rules that triggered for the selected subject.
- Includes rule-level point values and total score/risk level.
- Supports automatic, manual, and blacklist-related contributions.

### 9. Blacklist / Known-Bad Database
- New Blacklist section in the sidebar.
- Seeded demo blacklist entries for IPs and numbers.
- Add and delete blacklist entries manually.
- Automatic matching during scoring and data review.
- Blacklist matches force High risk and surface a distinct badge and reason in the explainability panel.

## UI / UX Notes
- Existing light theme, card styling, and typography are preserved.
- New screens reuse the established design system and badge patterns.
- Blacklist matches use the dark red/maroon style requested.

## Validation Completed
- Backend modules compile successfully.
- Authenticated API smoke checks pass for health, dashboard, cases, blacklist, and search routes.
- Frontend production build completes successfully.

## Deployment / Runtime
- Backend: `uvicorn app.main:app --host 0.0.0.0 --port 8000`
- Frontend: `npm run dev -- --host 0.0.0.0 --port 5173`

## Notes
- The app is intended for local investigative demo use only.
- No external surveillance integrations are included.