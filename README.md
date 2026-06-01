# 🧊 ColdChain Guard — IoT Cold Storage Monitoring System

Real-time IoT dashboard that monitors temperature, humidity, and CO₂ across 3 cold storage rooms, detects anomalies, calculates spoilage risk, and sends live alerts.

## Architecture

```
Python Simulator  →  Node.js Backend  →  React Dashboard
(sensor data)        (Express + Socket.io)   (live charts + alerts)
```

## Project Structure

```
coldchain-guard/
├── backend/
│   ├── server.js        ← Express API + Socket.io + alert logic
│   └── package.json
├── simulator/
│   └── sensor_simulator.py  ← Sends fake sensor data every 3s
└── frontend/
    ├── src/
    │   ├── App.jsx      ← Full React dashboard
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    └── package.json
```

## How to Run (3 terminals)

### Terminal 1 — Start the backend
```bash
cd backend
npm install
node server.js
```
You should see: `🧊 ColdChain Guard Backend running at http://localhost:5000`

### Terminal 2 — Start the React frontend
```bash
cd frontend
npm install
npm run dev
```
Open browser at: http://localhost:3000

### Terminal 3 — Start the Python simulator
```bash
cd simulator
pip install requests
python sensor_simulator.py
```

## Features

- **Live dashboard** — real-time temperature, humidity, CO₂ per room
- **Spoilage risk score** — calculated from all 3 sensor readings combined
- **Auto alerts** — triggered when any reading goes out of safe range
- **Anomaly simulation** — random faults injected to test the alert system
- **Alert log** — full history with severity levels (critical / warning)
- **Analytics tab** — humidity and risk trend charts per room
- **Door open detection** — simulates door being left open

## Safe Thresholds
| Sensor      | Safe Range    |
|-------------|---------------|
| Temperature | 1°C — 8°C     |
| Humidity    | 80% — 95%     |
| CO₂         | < 1000 ppm    |

## Tech Stack
- **Frontend**: React 18, Recharts, Socket.io-client, Vite
- **Backend**: Node.js, Express, Socket.io
- **Simulator**: Python 3, requests
