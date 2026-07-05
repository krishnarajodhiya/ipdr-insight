# CIB India — IPDR Insight Platform
## Comprehensive System Architecture & Engineering Documentation

This document provides a highly detailed breakdown of the **IPDR (Internet Protocol Detail Record) / CDR (Call Detail Record) Insight Platform** designed for the **Criminal Investigation Branch (CIB) of India**. It details the ingestion pipeline, data normalization schemas, backend Machine Learning (ML) engine, Light Mode user interface architecture, client-side demo fallback system, and operational guide.

---

## 1. High-Level Architecture & Technical Stack

The IPDR Insight Platform is constructed as a secure, local-first full-stack analytical platform designed to run in environments with variable internet access (air-gapped networks). It employs a hybrid service layer that seamlessly switches between a live production backend and a local client-side sandbox environment based on connection strings (`VITE_API_URL`).

```
                         ┌────────────────────────────────────┐
                         │   Client Browser - React SPA       │
                         │  ┌──────────────────────────────┐  │
                         │  │     UI Components (App.jsx)   │  │
                         │  └──────────────┬───────────────┘  │
                         │                 │                  │
                         │  ┌──────────────▼───────────────┐  │
                         │  │   API Interceptor (api.js)   │  │
                         │  └──────┬───────────────┬───────┘  │
                         └─────────┼───────────────┼──────────┘
                                   │               │
                 (VITE_API_URL     │               │ (VITE_API_URL
                  not present)     │               │  is present)
                                   ▼               ▼
                       ┌──────────────┐     ┌──────────────┐
                       │ Demo Engine  │     │ FastAPI Rest │
                       │ (demoApi.js) │     │    Server    │
                       └──────────────┘     └──────┬───────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │  ML Engine   │
                                            │ (services.py)│
                                            └──────┬───────┘
                                                   │
                                                   ▼
                                            ┌──────────────┐
                                            │ SQLite / SQL │
                                            │   Database   │
                                            └──────────────┘
```

### 1.1 Technical Stack Specifications
*   **Backend Framework**: FastAPI (Python 3.10+) - High-performance asynchronous execution of data workloads.
*   **Data Processing Core**: `pandas` + `numpy` - Vectorized mapping, cleansing, and aggregation.
*   **Machine Learning**: `scikit-learn` - Unsupervised clustering and multivariate anomaly detection.
*   **Database Layer**: SQLite - Local file-based transactional storage, ideal for self-contained desktop installations.
*   **Frontend Core**: React 18 - Declarative state management and component-driven view layer.
*   **Visualization Engines**:
    *   `d3-force` - Physics-based force-directed simulation for network visualization.
    *   `recharts` - SVG-rendered area and line charts for volumetric timeline analytics.
*   **Document Generator**: `jspdf` + `html2canvas` - Pure client-side PDF document generation.
*   **Styling & Theming**: Vanilla CSS (Light Government Standard) with Tailwind utility framework.

---

## 2. Data Ingestion & Operator Mapping Pipeline

Telecom operators in India (e.g., Reliance Jio, Bharti Airtel, Vodafone Idea, BSNL) do not export IPDR or CDR logs in a unified schema. They vary in naming formats, datetime serializations, and value offsets. The IPDR Insight Platform implements an adaptable ETL (Extract, Transform, Load) pipeline to parse, clean, and standardize these mixed structures.

### 2.1 Schema Mapping & Operator Normalization
When an investigator uploads a file (`CSV`, `TXT`, or `JSON`), the platform runs it through a dictionary of regex aliases:

| Canonical Field | Type | Common Telecom Aliases | Description |
|---|---|---|---|
| `a_party` | String | `calling_number`, `caller_id`, `source_msisdn`, `a_party`, `msisdn`, `source_ip` | The originator of the session or call. |
| `b_party_number` | String | `called_number`, `dialed_digits`, `destination_msisdn`, `b_party`, `target_no` | The destination voice/telephony number. |
| `b_party_ip` | String | `destination_ip`, `b_party_ip`, `dest_ip`, `target_ip` | The destination server/host IP address. |
| `timestamp` | DateTime | `call_time`, `start_time`, `session_start`, `timestamp`, `event_time` | Start time of the session. |
| `duration_sec` | Integer | `duration`, `call_duration`, `session_duration`, `duration_sec`, `time_spent` | Call duration in seconds. |

### 2.2 Datetime Cleansing & Sanitization
Datetime parser handles multiple standard formats dynamically, converting text streams to ISO-8601 strings:
*   `YYYY-MM-DD HH:MM:SS` (Airtel / Jio typical format)
*   `DD/MM/YYYY HH:MM:SS` (BSNL / Vodafone legacy formats)
*   ISO-8601 Strings (`YYYY-MM-DDTHH:MM:SS.sssZ`)

Rows containing empty values in critical identifiers (`a_party` or target fields) are automatically quarantined, and descriptive parse errors are written to the database for investigator audits.

---

## 3. The Machine Learning Engine (`services.py`)

To process high-volume telecom data without manual threshold definitions, the backend integrates an unsupervised Machine Learning subsystem. This engine extracts behavioral embeddings and trains anomaly detection algorithms on the fly based on the active dataset.

```
[Raw IPDR Records] 
        │
        ▼ (Grouping by A-Party)
[Behavioral Feature Extraction] ──► 1. Night Call Ratio
        │                           2. Short Session Ratio
        │                           3. Fan-Out Rate
        │                           4. Blacklist Contact Ratio
        │                           5. Call Velocity
        ▼
[Preprocessing & Feature Scaling] (StandardScaler & RobustScaler)
        │
        ├───► [Isolation Forest (Anomaly Detection)] ──► Anomaly Scores (0-100)
        │
        └───► [DBSCAN (Density-Based Clustering)]  ──► Suspect Case Groups
```

### 3.1 Behavioral Feature Extraction
For each unique `a_party` identified, a 7-dimensional behavioral vector ($F \in \mathbb{R}^7$) is extracted:

1.  **Night Call Ratio ($f_1$)**: The proportion of calls/sessions occurring within the user-defined night window (default: 00:00 to 04:00):
    $$f_1 = \frac{\sum \mathbb{I}(\text{hour}(t) \in [\text{NightStart}, \text{NightEnd}])}{N}$$
2.  **Short Session Ratio ($f_2$)**: Ratio of short calls below the defined duration threshold (default: 5 seconds):
    $$f_2 = \frac{\sum \mathbb{I}(\text{duration} < \text{ShortThreshold})}{N}$$
3.  **Fan-Out Rate ($f_3$)**: The diversity index of contacts, measured as unique B-parties reached per interaction:
    $$f_3 = \frac{|U_{\text{B-parties}}|}{N}$$
4.  **Blacklist Contact Ratio ($f_4$)**: The percentage of interactions contacting items registered in the active Threat Blacklist Database:
    $$f_4 = \frac{\sum \mathbb{I}(\text{B-party} \in \text{Blacklist})}{N}$$
5.  **Call Velocity ($f_5$)**: Interactions per hour across the active reporting interval:
    $$f_5 = \frac{N}{\text{span in hours}}$$
6.  **B-party Diversity ($f_6$)**: Unique destination density.
7.  **Average Duration ($f_7$)**: Mean duration of voice or data sessions.

### 3.2 Anomaly Detection via Isolation Forest
An Isolation Forest model is dynamically trained on the extracted features. The algorithm isolates anomalies by randomly selecting a feature and then randomly selecting a split value between the maximum and minimum values of that feature.

*   **Model Properties**: 200 isolation trees (`n_estimators=200`), contamination factor based on outlier scoring.
*   **Preprocessing**: `RobustScaler` is applied to features (such as call velocity) to avoid scaling distortion from extreme outliers.
*   **Anomaly Score Calculation**: Raw anomaly scores are normalized to a user-facing range of `0 - 100`. Scores $\ge 60$ trigger a high-risk machine learning warning banner.
*   **Explainability (Z-Scores)**: For any flagged anomaly, the system calculates feature-specific Z-scores to reveal the exact mathematical cause of the flag:
    $$z_i = \frac{x_i - \text{median}(x)}{\text{MAD}(x)}$$

### 3.3 Suspect Clustering via DBSCAN
To link independent suspect numbers acting as coordinated cells (e.g., fraud rings, phishing campaigns), the engine executes **DBSCAN (Density-Based Spatial Clustering of Applications with Noise)**:
*   **Hyperparameters**: Neighborhood radius `eps=0.8`, core point threshold `min_samples=2`.
*   **Scaling**: Standardized features using `StandardScaler` to ensure uniform distance calculation in multi-dimensional space.
*   **Cluster Labels**:
    *   **Cluster -1 (Noise)**: Outliers exhibiting anomalous, highly isolated behavior ("Isolated / Extreme").
    *   **Cluster $\ge 0$**: Coordinated communication clusters, automatically assigned case syndicate labels ("Syndicate Alpha", "Network Beta", etc.).

---

## 4. UI/UX Design System (Light Mode CIB Standard)

The frontend is styled using a premium, clean **light government template** built using modern glassmorphism principles tailored for daytime visibility in police operation centers.

### 4.1 Theme Token Configuration (`index.css`)
```css
:root {
  --bg-base:        #f1f5f9; /* Slate background */
  --bg-surface:     #ffffff; /* Clean white cards */
  --bg-raised:      #f8fafc; /* Subtly raised sub-panels */
  --bg-panel:       #eef2f9; /* Active controls background */

  --border-subtle:  rgba(15,23,42,0.07);
  --border-default: rgba(15,23,42,0.12);

  --accent:         #1e40af; /* CIB Navy Blue */
  --accent-soft:    rgba(30,64,175,0.08);

  --text-primary:   #0f172a; /* Slate 900 */
  --text-secondary: #475569; /* Slate 700 */
  --text-muted:     #94a3b8; /* Slate 400 */
}
```

### 4.2 Interactive Elements & Micro-Animations
*   **Pulsing Focus Rings**: Flagged nodes and threat warnings use double concentric animations (`pulseRingRed`, `pulseRingBlue`) to draw attention to high-risk numbers.
*   **SVG Glow Filters**: SVG elements utilize vector glow filters to highlight anomalous nodes without relying on heavy canvas frames:
    ```xml
    <filter id="glow-red">
      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
      <feMerge>
        <feMergeNode in="coloredBlur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
    ```
*   **Interactive Force Graph**: Implements real-time dragging, wheel zoom/pan, hover tooltips, and click-to-isolate suspect paths on a dynamic canvas.

---

## 5. Main Functional Views

### 5.1 Dashboard View
The core operations screen, featuring:
1.  **Count-Up Stat Cards**: Displays total records, unique A-parties, unique B-parties, and flagged items with smooth easing animations (`useCountUp`).
2.  **Volumetric Timeline Chart**: Renders an area chart showing traffic peaks over time. If a specific day experiences a high volume of anomalous calls, a red dashed vertical reference line ($!$) is drawn on the chart.
3.  **Graph vs. Heatmap Toggle**: Switch between:
    *   **Network Graph**: Real-time D3 force-directed view of interactions.
    *   **Activity Heatmap**: A 7×24 grid (Sun-Sat vs. 00h-23h) showing call density. The blocks shift color from slate blue (low activity) to amber and red (extreme activity) to pinpoint late-night coordination windows.

### 5.2 ML Intelligence View
Provides access to the machine learning engine:
*   **Anomaly Score List**: Displays list of suspects ranked by Isolation Forest score.
*   **Explainable Profile Panel**: Displays a 6-axis dynamic **SVG Radar Chart** indicating suspect behaviors (Night%, Short Sess., Fan-out, Blacklist, Velocity, B-diversity).
*   **Clustering Grid**: Displays grouping cards sorted by syndicate classes. Clicking a suspect opens their profile, detailing Z-scores and natural-language explainable summaries.

---

## 6. Offline Client Simulation (`demoApi.js`)

For instances where the production server is unreachable, the system executes an offline client-side JS data engine. This client-side code mirrors all search queries, blacklist matches, and ML processes in the browser:

```javascript
// Simple median-based deviation scoring used in the browser sandbox
function median(arr) { 
  const s = [...arr].sort((a, b) => a - b); 
  const m = Math.floor(s.length / 2); 
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; 
}
// Calculates multivariate deviations client-side
const rawScores = featuresArr.map(f => 
  KEYS.reduce((sum, k, ki) => sum + WEIGHTS[ki] * Math.abs((f[k] - medians[ki]) / stds[ki]), 0)
);
```

This guarantees that investigative workflows, search filters, and graph renders continue working offline during field operations.

---

## 7. Setup, Installation & Verification Handlist

### 7.1 Production Server Launch
#### 1. Setup Backend:
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
#### 2. Setup Frontend:
```bash
cd frontend
npm install
npm run dev
```

### 7.2 Strict Offline Sandbox Mode
To run in offline mode without a python server, disable the API environment variable before launching Vite:
```bash
cd frontend
unset VITE_API_URL
npm run dev
```
The application will launch in secure local demo mode with sample CIB data preloaded.

### 7.3 Verification Checklist
Execute the following verification command sequence to ensure code compliance:
```bash
# Verify backend compilation
cd backend && python3 -m py_compile app/*.py

# Verify frontend build & code splitting
cd ../frontend && npm run build
```
The frontend should compile to a `dist/` directory in under 3 seconds, with the main JS bundles minified and code-split.
