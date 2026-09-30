# ColdChain Guard — Interview Prep

## 60-Second Pitch (say this out loud first)

> "ColdChain Guard is a multi-tenant IoT monitoring platform for cold storage — think refrigerated warehouses storing fruits, dairy, vaccines, or meat. Each user sets up their own cold storages and rooms, and a simulator publishes live temperature/humidity/CO₂ readings over MQTT — the same publish/subscribe protocol real IoT sensors use — to a Node.js backend that ingests them, computes a spoilage-risk score against category-specific safety thresholds, and pushes live updates to a React dashboard over WebSockets.
>
> What makes it more than a CRUD dashboard is three extra layers I added on top of the reactive alerting: a **predictive engine** that fits a linear regression over each room's recent sensor trend and forecasts threshold breaches *before* they happen; an **agentic AI layer** that calls Claude to diagnose the likely root cause and recommend an action whenever something critical is detected — so instead of just 'temperature is too high,' the operator gets 'this looks like a door-seal issue, not a compressor fault, because CO₂ and door-open frequency are both climbing'; and real **email/SMS notifications** so a critical incident doesn't just sit on a dashboard nobody's looking at.
>
> I built it to connect my IoT coursework with the agricultural supply-chain traceability work I do at my internship — cold-chain failure is a huge, expensive, real problem in that domain, and 'catch it before it happens' is the actual value proposition, not just a dashboard."

---

## 1. What the Project Actually Is

**Problem it addresses:** Perishables (produce, dairy, meat) and temperature-sensitive pharmaceuticals (vaccines, medicines) spoil or become unsafe outside narrow environmental bands. Cold-chain monitoring exists to catch excursions — but most systems are purely *reactive*: they alert only after a threshold is already crossed, by which point damage may already be underway.

**What this system does:**
1. Lets a user register, then set up one or more **cold storages**, each containing one or more **rooms** — each room assigned a **category** (fruits, vegetables, dairy, medicines, vaccines, grains, meat) with its own safe temperature/humidity/CO₂ range.
2. A built-in simulator generates realistic sensor readings per room every 3 seconds (gentle sinusoidal drift + Gaussian noise during normal operation, with a 5% chance per tick of injecting a multi-step "anomaly" — e.g. a door left open, a compressor fault) and **publishes them over MQTT** to an embedded broker, exactly like a real device would.
3. The backend **subscribes** to that broker, computes a **spoilage risk score (0–100%)** from how far each reading deviates from the category's safe range, and raises **reactive alerts** (critical/warning) the moment a threshold is crossed.
4. A **predictive layer** fits a trend line to the last ~60 seconds of each metric and, when the trend is clean and heading toward a breach, raises a **predictive alert** *before* the threshold is actually crossed (e.g. "trending to exceed safe max in ~9 min").
5. An **agentic AI layer** watches for critical or predicted incidents and asks Claude to produce a plain-English root-cause hypothesis and a concrete recommendation, rate-limited so it engages selectively rather than firing on every reading.
6. A **critical alert also triggers a real email/SMS notification** (independently optional, rate-limited per room) — so "the dashboard is red" turns into someone's phone actually buzzing.
7. All of this streams live to a React dashboard via Socket.io, with a room detail view, an analytics page (historical charts, alert breakdown), and a live-alerts timeline.

**Who "uses" it:** each registered user is an independent tenant — their own cold storages, rooms, alerts and AI insights, gated behind JWT auth.

---

## 2. Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React 18 (function components + hooks), React Router v6 | Component model fits a multi-page dashboard with shared layout; hooks keep state local and simple without needing Redux for this scope |
| Charts | Recharts | Declarative, React-native charting — no imperative canvas code, composes well with live-updating state |
| Realtime | Socket.io-client / Socket.io (server) | Needed push, not poll, for live sensor data; Socket.io gives auto-reconnect and WebSocket-with-polling-fallback for free |
| Build tool | Vite | Fast dev server + HMR, minimal config vs. webpack, standard for new React projects |
| Backend | Node.js + Express | Single language across the stack (JS/JSX everywhere); Express is minimal and enough for a REST + Socket.io hybrid server |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` for password hashing | Stateless auth — no server-side session store needed; bcrypt for one-way password hashing with salting |
| Data storage | SQLite via `better-sqlite3` (`backend/data/coldchain.db`), accessed through prepared statements in a small `db.js` module | A real embedded database — indexed lookups, foreign-key-shaped relations, atomic writes — with zero external service to provision. `better-sqlite3`'s synchronous API kept the swap from the original flat-JSON version a same-shape, same-signature change in `db.js` only; `server.js` didn't need to change |
| Testing | Node's built-in `node:test` + `node:assert`, `supertest` for HTTP-level integration tests | No extra test-runner dependency needed for unit tests; `supertest` drives the Express `app` in-process (no port bound) for auth + multi-tenancy integration tests |
| AI / ML | `@anthropic-ai/sdk` (Claude API) for the agentic diagnosis layer; hand-written least-squares regression (no ML library) for the predictive forecasting layer, isolated in `risk.js` | Regression is simple enough to write directly and keeps the predictive path free/local; pulling it into its own dependency-free module made it unit-testable without booting Express/Socket.io/the DB; Claude is used only where actual language reasoning over multi-signal context adds value, not as a blanket "add AI" move |
| IoT ingestion | `aedes` (embedded MQTT broker) + `mqtt` (client, used by both the simulator publisher and the backend subscriber) | Real MQTT — the actual publish/subscribe protocol IoT devices use — instead of the sensor data arriving as a plain HTTP POST from an in-process function call. Embedding the broker means zero extra infrastructure to deploy, while still being the genuine wire protocol a real ESP32/Raspberry Pi would speak |
| Notifications | `@sendgrid/mail` (email) and `twilio` (SMS), each independently optional | Turns "the dashboard shows red" into an actual page/email — the natural next question for any monitoring system. Same optional/graceful-degrade pattern as the AI layer: no configured keys, no-op, with a boot-time log saying so |
| Rate limiting | `express-rate-limit` on the two auth routes | Standard, well-known library rather than hand-rolled — a login/register brute-force surface shouldn't be where I improvise |
| CI | GitHub Actions (`.github/workflows/ci.yml`) — runs the 18-test backend suite and the frontend production build on every push/PR | Catches a broken build or a regressed test before it reaches `main`, not after |
| Containerization | Docker (`backend/Dockerfile`, two-stage build on `node:20-bookworm-slim`) | Makes the backend runnable identically anywhere (a reviewer's laptop, a different host than Render) without walking through manual setup steps; the two stages keep the `better-sqlite3` compiler toolchain out of the image that actually ships |
| Simulator | A separate module (`simulator.js`) that publishes over MQTT — runs in-process alongside the backend by default (so `node server.js` alone still gives a working demo), or standalone via `node simulator.js` to demonstrate it as a genuinely separate process. (A standalone Python script exists in `simulator/` but is legacy — superseded first by the in-process HTTP version, now by this MQTT version) | Publishing over MQTT instead of calling backend functions directly means swapping in a real sensor requires no protocol-level change — a real device publishing the same JSON shape to the same topic is indistinguishable from this simulator to the backend |
| Deployment | Render (backend), typically Vercel/Netlify-style static host for the Vite build (frontend) | Free/cheap tier suitable for a portfolio project; Render keeps a long-running Node process alive, which the always-on simulator interval needs |

---

## 3. Architecture / Data Flow

```
┌─────────────────────────┐
│   simulator.js            │  setInterval every 3s, per room
│   (MQTT publisher)        │  generates temp/humidity/co2/doorOpen,
└───────────┬───────────────┘  publishes JSON to coldchain/<room_key>/telemetry
            │  MQTT (real wire protocol, Aedes broker embedded in server.js)
            ▼
┌─────────────────────────┐
│   backend MQTT subscriber │  subscribed to coldchain/+/telemetry
│   (server.js)             │  → ingestReading(room, data)
└───────────┬───────────────┘
            │
            ▼
   calcRisk() ─────────────► spoilage risk score (0-100)
            │
            ▼
   computeForecast() ──────► linear regression per metric,
            │                 breach-time prediction, projected risk
            ▼
   checkAlerts() / checkPredictiveAlerts()
            │                 reactive + predictive alerts
            ├──────────────► runDiagnosisAgent() — only on critical/predicted
            │                 trigger, rate-limited, calls Claude, stores
            │                 an "insight" (root cause + recommendation)
            └──────────────► notify.notifyCritical() — only on a critical
            │                 alert, separately rate-limited, sends
            │                 email/SMS if configured
            ▼
   io.to(`user:${room.user_id}`).emit('sensorUpdate' | 'alert' | 'aiInsight')
            │
            ▼
┌─────────────────────────┐
│   React dashboard         │  Socket.io client (authenticated via JWT on
│   (App.jsx, RoomPage,     │  the handshake) updates state live; REST
│   LiveAlertsPage, ...)    │  endpoints (JWT-protected) fetch historical
└─────────────────────────┘   data, rooms, insights
```

**Auth flow:** register/login → bcrypt-checked password → JWT signed with a 7-day expiry → stored in `localStorage` → sent as `Authorization: Bearer <token>` on every REST call *and* as the Socket.io handshake `auth.token` → an Express middleware (`auth`) verifies REST requests and attaches `req.user`; an equivalent `io.use(...)` middleware verifies the socket handshake and joins the socket to a `user:<id>` room.

**Multi-tenancy:** every REST read/write is scoped by `req.user.id` inside the `db.js` query functions (e.g. `getUserRooms`, `getUserAlerts`). Every live event is scoped the same way at the transport level — emitted with `io.to(`user:${userId}`)` instead of a global `io.emit(...)` — so one tenant's socket never receives another tenant's data. Rooms have a stable `room_key` (`room_1`, `room_2`, …) used as the join key across in-memory sensor history, alerts, and insights.

---

## 4. The Predictive ML Layer (be ready to whiteboard this)

**Goal:** turn "temperature is out of range" (reactive) into "temperature will be out of range in ~9 minutes" (predictive).

**Method:** ordinary least-squares linear regression, computed by hand (no library):
- Take the last 20 readings for a room (~60 seconds at the 3-second tick rate), oldest to newest.
- For each metric (temperature, humidity, CO₂), fit `y = slope·x + intercept` where `x` is elapsed seconds.
- Compute R² to judge how "clean" the trend is — reject noisy fits (R² < 0.35) so a couple of jittery readings don't trigger a false prediction.
- If the slope is heading toward the category's safe-range boundary, solve for the time-to-breach: `t = (threshold − current) / slope`.
- Only surface it if `0 < t ≤ 15 minutes` (the forecast horizon) — far-future extrapolations from a short window aren't trustworthy.
- Also project spoilage risk 5 and 15 minutes ahead by extrapolating all three metrics forward and re-running the same risk formula used for the live score.

**Why this isn't decorative:** it's the actual value proposition of a cold-chain system — catching a slow compressor degradation or a propped-open door *before* stock is lost, not after. It required no external dependency, so it works even without any API key configured, and it's genuinely explainable (R², slope, extrapolation) rather than a black box.

**Known simplification I'd mention if asked:** a 60-second window with linear extrapolation won't catch slow multi-hour drifts or non-linear failure curves (e.g. exponential compressor decay). A production version would use a longer multi-window ensemble or an exponential-weighted trend, and would validate against real failure data rather than a synthetic simulator.

---

## 5. The Agentic AI Layer (be ready to explain the design choices)

**Trigger, not blanket usage:** the agent does **not** run on every 3-second tick — that would be noisy and expensive. It only engages when `checkAlerts` fires a critical alert or `checkPredictiveAlerts` fires a predicted breach, and even then it's rate-limited to once per room per 3 minutes. This is the actual definition of "agentic" here: the system exercises judgment about *when* to reason, not just *that* it can.

**What it's given:** category, product, quantity, safe thresholds, current readings, the forecast object (slopes, R², breach predictions), a 20-point recent history window, and the specific reasons it was triggered.

**What it returns:** a strict JSON object — `rootCause`, `recommendation`, `urgency` — parsed directly (no markdown, no chit-chat) so it can be rendered as a structured insight rather than a wall of prose.

**Why Claude and not a rule engine here:** the reactive/predictive layers already handle "is a number out of range" — that's math, not reasoning. What Claude adds is *synthesizing multiple correlated signals into a hypothesis* ("rising CO₂ + frequent door events → seal failure, not compressor failure") — the kind of judgment call a human ops analyst would make by looking at several charts at once, which a fixed threshold rule can't express.

**Cost/ops awareness:** the model is read from `AI_AGENT_MODEL` (env var, defaults to `claude-opus-5`) so it can be swapped without a code change, and the whole layer degrades gracefully — if `ANTHROPIC_API_KEY` isn't set, the backend logs that AI diagnosis is disabled and continues running everything else normally.

---

## 6. The MQTT Ingestion Layer (this is the "real IoT" part of an IoT degree project)

**Why this exists:** the honest gap in the original build was that "sensor data" arrived as a plain HTTP POST from a function call inside the same process — that's backend engineering, not IoT engineering. Real sensors don't call REST APIs; they publish to a broker and don't care who (or how many) subscribers are listening. MQTT is the protocol that pattern is built on, and it's the one actually taught and used in IoT coursework and real deployments (it's what powers most commercial smart-home and industrial telemetry).

**What actually happens now:**
1. `mqtt.js` embeds a real MQTT broker (`Aedes`) inside the backend process, listening on a plain TCP socket (`MQTT_PORT`, default `1883`) — this is the actual MQTT wire protocol, not a simulation of it.
2. `simulator.js` connects to that broker **as an MQTT client** and publishes each room's reading as JSON to topic `coldchain/<room_key>/telemetry` every 3 seconds — `{ temperature, humidity, co2, doorOpen }`.
3. `server.js` connects to the same broker **as a second, independent MQTT client**, subscribes to the wildcard topic `coldchain/+/telemetry` (the `+` matches any room automatically — a newly created room needs no manual resubscribe), and on every message looks up the room by the key embedded in the topic, parses the JSON, and hands it to `ingestReading()` — the same risk-scoring/forecasting/alerting pipeline that existed before, just fed by a subscription instead of a direct call.

**Why an embedded broker instead of a separate Mosquitto install:** deployability. Anyone cloning this repo, or Render running it, gets a fully working MQTT pipeline from `node server.js` alone — no separate broker binary to install, configure, and keep alive as its own service. The trade-off, and I'd say this proactively in an interview: the simulator and the backend's subscriber currently run in the *same OS process* (or at most the same host, if you run `node simulator.js` standalone) — this is genuinely different from having a broker reachable from the public internet.

**Swapping in real hardware:** this is the part that makes the trade-off worth explaining rather than hiding. An ESP32 with a DHT22/BME280 sensor, running an MQTT client library (e.g. `PubSubClient` in Arduino/C++), connecting to the same broker's IP and port and publishing the same JSON shape to the same topic, would be **indistinguishable from `simulator.js` to everything downstream** — `ingestReading()`, the risk engine, the alerts, the AI agent, none of it would need to change. That's the actual argument for why this is a real IoT architecture and not a renamed HTTP endpoint.

**The honest limitation:** on Render's free "Web Service" tier, only the HTTP(S) port is reachable from the public internet — a real device on your home WiFi *couldn't* publish directly to the deployed backend's `1883` without a paid Render service type (or Render's TCP proxy) or pointing the device at a separately hosted broker (e.g. HiveMQ Cloud's free tier) and having the backend subscribe to that instead of hosting its own. Locally, or on any host where you control the network, this is a non-issue.

---

## 7. Notifications (email / SMS)

**The gap this closes:** a monitoring dashboard that only shows red on a screen nobody's looking at isn't actually monitoring anything. `notify.js` sends a real email (via SendGrid) and/or SMS (via Twilio) the moment a **critical** alert fires — deliberately not on warnings or predictive alerts, which would make it noisy rather than useful.

**How it's gated:** each channel checks its own required env vars at module load (`SENDGRID_API_KEY`/`ALERT_EMAIL_TO`/`ALERT_EMAIL_FROM` for email; `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM_NUMBER`/`ALERT_SMS_TO` for SMS) and only initializes that channel's client if all of them are present — same "optional, degrades to a no-op with a boot-time log" pattern as the AI diagnosis layer, so a fresh clone with no keys configured still runs the full app.

**Why a separate cooldown from the AI agent's:** notifications use a 10-minute per-room cooldown (`NOTIFY_COOLDOWN_MS`), longer than the AI agent's 3-minute one. An AI insight appearing again after 3 minutes is mildly repetitive; a text message going off again after 3 minutes during a sustained anomaly is actually annoying — the cooldown length reflects the cost of being wrong about the interval in each direction.

**What it sends:** all critical messages that fired on that ingestion tick, batched into one email/SMS rather than one message per condition — a room breaching both temperature and humidity at once sends one notification listing both, not two separate pages.

---

## 8. Hardening Pass — Issues Found and Fixed

I identified real gaps in the original build across two passes (a good interview answer in itself — "I audit my own work and fix what I find") and closed all of them:

**Pass 1 — data, transport, secrets, tests:**
- **Storage was flat JSON files.** Every read/write did a full file read + `JSON.parse`/`JSON.stringify` — no transactions, no indexing, would corrupt under concurrent writes at any real scale. **Fix:** migrated to SQLite via `better-sqlite3` (`backend/data/coldchain.db`), with indexed lookups on `room_id`/`user_id` and a one-time migration routine (`db.js` → `migrateFromJson`) that imports the existing JSON data into the new schema the first time the app boots against a fresh DB file, so nothing already stored was lost in the swap. `db.js`'s exported function signatures (`insertAlert`, `getUserRooms`, etc.) didn't change, so `server.js` needed zero changes beyond the `require`.
- **Socket.io broadcasts weren't scoped per user.** `io.emit(...)` sent every `sensorUpdate`/`alert`/`aiInsight` event to *every* connected browser regardless of tenant. **Fix:** added an `io.use(...)` handshake middleware that verifies the same JWT used for REST auth and joins each socket to a `user:<id>` room; every emit that used to be `io.emit(...)` is now `io.to(`user:${userId}`).emit(...)`. Verified end-to-end with a real socket.io-client connection: a socket presenting a valid JWT connects and receives events, a socket with no token is rejected at the handshake with an `Unauthorized` `connect_error`.
- **JWT secret was hardcoded in source** (`coldchain_jwt_secret_2025`). **Fix (finished in pass 2):** reads `process.env.JWT_SECRET`; in `NODE_ENV=production` a missing secret now makes the process log a fatal error and `exit(1)` rather than boot insecurely — fail-closed. Outside production it falls back to the old value with a loud `console.warn`, so local dev/tests aren't broken by the requirement.
- **No automated tests.** **Fix:** pulled the pure risk/forecast math out of `server.js` into a dependency-free `risk.js` module and added a `node:test` suite (`risk.test.js`) covering `calcRisk` boundary behavior and `computeForecast`'s breach-detection and noise-rejection logic, plus an integration suite (`server.test.js`, via `supertest`) covering registration validation, duplicate-email rejection, login success/failure, protected-route 401s, and — the one that matters most — that a second user genuinely cannot see a first user's rooms. 18 tests, all passing, run with `npm test`. Tests run against an isolated in-memory SQLite DB (`NODE_ENV=test`), never the real data file.
- **In-memory sensor history reset on every server restart.** `sensorHistory` was a plain JS object with nothing behind it, so a redeploy blanked the predictive engine's rolling window back to zero. **Fix:** added `hydrateSensorHistory()`, called once at boot, which reads each room's last 50 readings back out of SQLite and rebuilds the in-memory window before ingestion starts — so the predictive engine has trend context immediately after a restart instead of needing ~60 fresh seconds to warm back up.
- **CORS was wide open** (`origin: '*'`, on both Express and Socket.io). **Fix:** replaced with an explicit allowlist read from `ALLOWED_ORIGINS` (comma-separated env var, defaults to `http://localhost:3000` for local dev) checked on every request/handshake. **Action item:** the deployed frontend's real URL needs to be added to `ALLOWED_ORIGINS` on the backend host, or the production frontend will start getting CORS errors after this change ships.

**Pass 2 — closed the two items pass 1 left open, plus ops maturity:**
- **No rate limiting on auth.** `/api/auth/login` and `/api/auth/register` had no request cap, so both were brute-forceable. **Fix:** `express-rate-limit` on both routes — 10 requests per 15 minutes per IP, `429` beyond that. Deliberately skipped when `NODE_ENV=test` (via the library's own `skip` option) so repeated `npm test` runs in the same window don't start failing on their own rate limit.
- **JWT-secret fallback was fail-open, not fail-closed** (see above — genuinely fixed this pass, not left as a "would argue for" aspiration).
- **No CI.** Nothing verified a push didn't break the build or the tests. **Fix:** `.github/workflows/ci.yml` — one job runs the full backend test suite, a second runs the frontend production build, both on every push and PR.
- **No containerization.** Running the backend required following manual setup steps by hand. **Fix:** `backend/Dockerfile`, a two-stage build on `node:20-bookworm-slim` — a `builder` stage installs the compiler toolchain and runs `npm ci` (needed once, to compile `better-sqlite3`'s native module), and the final stage copies over only the resulting `node_modules` and source, so the toolchain never ships. `ENV NODE_ENV=production` is set in the image, which means the fail-closed `JWT_SECRET` check applies — the container **won't start** without `-e JWT_SECRET=...` passed in, which is correct, not a bug, but worth knowing before you run it and wonder why it exited. (The first version of this Dockerfile wasn't actually two-stage and didn't deliver what its own comment claimed — see the Q&A in Section 9 for that story.)

### What's still honestly open after both passes

- **SQLite is a single file on the backend's local disk.** Fine for one process; doesn't horizontally scale across multiple backend instances, and depends on the hosting platform giving that disk persistence across redeploys (the same caveat the JSON files already had — not a regression, just not yet solved either).
- **A JWT that's already authenticated a live socket isn't re-checked before it expires.** Token expiry is enforced on the next REST call and on the next socket *connection*, but not against a socket connection already held open — there's no server-initiated disconnect on expiry.
- **Test coverage stops at the socket layer, the AI agent, MQTT, and notifications.** The multi-tenant socket scoping and the MQTT publish→subscribe→ingest pipeline were both verified manually (real socket.io-client and end-to-end MQTT round-trip scripts) during these fixes, but neither is an automated test yet. The AI diagnosis path and the email/SMS notification path aren't tested at all, since both would need their external API mocked out (Claude, SendGrid, Twilio) rather than actually called in CI.
- **The Docker image is written carefully but not verified with an actual `docker build`** — Docker wasn't available in the environment this was built in. The base image, the native-module build step for `better-sqlite3`, and the `NODE_ENV=production` + `JWT_SECRET` interaction are all deliberate, reasoned choices, but "I wrote it correctly" and "I watched it build and run" are different claims — run it yourself before demoing it live.
- **The MQTT broker (and therefore a real external device) is only reachable on whatever host is running the backend** — see the honest limitation called out in Section 6. Fine for the simulator (same host, always), not yet fine for a real device unless you're running locally or upgrade the deployment.

---

## 9. Interview Q&A

### Project walkthrough / general

**Q: Walk me through what happens from a sensor reading to something appearing on screen.**
A: The simulator generates a reading every 3 seconds per room and publishes it as JSON over MQTT to topic `coldchain/<room_key>/telemetry`. The backend, subscribed to that topic as its own MQTT client, receives it and hands it to `ingestReading()`. `calcRisk` scores it against the room's category thresholds. It's pushed into that room's in-memory history array, which `computeForecast` reads to fit a trend line and predict any coming breach. `checkAlerts` and `checkPredictiveAlerts` compare the reading (and the forecast) against thresholds and may push alerts, which are broadcast over Socket.io — scoped to that room owner's `user:<id>` channel only — and also persisted to the `alerts` table in SQLite. If a critical or predicted issue fired, `runDiagnosisAgent` is invoked (rate-limited) to optionally get an AI-generated root cause, and a critical-only, separately-rate-limited notification may go out over email/SMS. Finally the raw reading itself — with the forecast attached — is broadcast as a `sensorUpdate` event and persisted to the `readings` table. The React dashboard has a live, JWT-authenticated Socket.io connection updating component state on each of these events, plus REST polling for anything not pushed live (like insights).

**Q: Why did you build this?**
A: I'm doing my B.Tech in IoT and interning at an agricultural supply-chain traceability company, so cold-chain failure is a domain problem I actually understand the stakes of — spoiled stock is a real, expensive, and common failure mode. I wanted a portfolio project that wasn't just a CRUD app, so I focused on making the alerting actually *useful*: predictive rather than purely reactive, and with AI reasoning that adds judgment a fixed rule can't.

**Q: What was the hardest part to get right?**
A: Tuning the predictive engine so it's useful without being noisy. A naive "any upward slope predicts a breach" approach fires constantly on sensor jitter. I added the R² gate to require a genuinely clean trend, a minimum slope magnitude, and a cooldown per room+metric so the same developing situation doesn't re-alert every 3 seconds while it's still unfolding.

### Backend / Node.js

**Q: Why Express instead of a framework like NestJS or Fastify?**
A: Scope. This is a small number of REST routes plus one Socket.io server — Express's minimalism means no unused structure to maintain, and it integrates with Socket.io with zero friction (same HTTP server instance). NestJS's DI/module system would be justified at a much larger route count.

**Q: How does authentication work end-to-end?**
A: Register hashes the password with bcrypt (10 salt rounds) and stores the hash. Login compares the given password against the stored hash with `bcrypt.compareSync`. On success, a JWT is signed with the user's id and email, 7-day expiry. The frontend stores it in `localStorage` and sends it as a Bearer token on every request. An Express middleware verifies the token with `jwt.verify` and attaches the decoded payload to `req.user`, which every route then uses to scope its data access.

**Q: Why JWT instead of session cookies?**
A: Statelessness — no server-side session store to manage, which matters since the backend keeps meaningful in-memory state already (sensor history, cooldown maps) and I didn't want to add a session store dependency on top of that. The tradeoff is that a JWT can't be revoked before it expires without maintaining a blocklist, which I'd add if this needed real logout-everywhere semantics.

**Q: What's actually under test, and why those specific things first?**
A: Two layers. `risk.test.js` unit-tests the pure math — `calcRisk`'s boundary behavior (0 inside range, increasing and clamped to 100 outside it) and `computeForecast`'s two failure modes: does it correctly predict a breach for a clean trend, and does it correctly *not* predict one for noisy-but-stable readings (the R² gate). Those were first because they're pure functions with no I/O — cheapest to test, and the place a silent regression would be hardest to notice by eye. `server.test.js` uses `supertest` to integration-test the auth flow end-to-end against a real (in-memory) instance of the app: registration validation, duplicate-email rejection, wrong-password rejection, protected routes returning 401 with no or garbage tokens, and — most important — that a second registered user gets an empty room list rather than seeing the first user's rooms. That last one is the test I'd point to first: it's the one that actually verifies the multi-tenancy boundary works, not just that the routes respond.

**Q: Your data layer used to be flat JSON files — walk me through why and how you moved off it.**
A: `fs.writeFileSync` on every insert was a synchronous full-file rewrite of the entire table — no transactions, no indexing, and it would corrupt under real concurrent writes. It survived as long as it did because writes were effectively serialized by Node's single-threaded event loop and volume was low (one simulator, low request rate), but it wasn't a foundation I'd want to build more on. I moved to SQLite via `better-sqlite3`: indexed prepared statements instead of read-modify-write-the-whole-file, and a one-time migration step that detects a fresh database file, reads whatever's still in the old JSON files, and inserts it with the original IDs preserved — so the swap didn't lose the data that was already there. Because `db.js` exposed the same function signatures before and after (`insertAlert`, `getUserRooms`, etc.), `server.js` needed zero changes beyond the `require`.

**Q: Why SQLite and not Postgres?**
A: For a single-process app with one writer (the simulator loop) and low request volume, SQLite gives me real transactions and indexing without provisioning and paying for a separate database service — `better-sqlite3`'s synchronous API also meant the migration from the old synchronous JSON-file code was a mechanical swap, not a rewrite to async/await throughout `server.js`. The honest limit is that it's a single file on one host's disk, so it doesn't horizontally scale across multiple backend instances the way Postgres would — that's the trigger for revisiting it, not request volume alone.

### Real-time / Socket.io

**Q: Why Socket.io instead of plain WebSockets or Server-Sent Events?**
A: I need bidirectional-capable, auto-reconnecting delivery with a fallback (long-polling) for environments where WebSocket upgrades are blocked, without writing that reconnection/fallback logic myself. SSE would have covered the one-way server→client push I actually use, but Socket.io's built-in room support turned out to matter directly — it's what the per-user `user:<id>` scoping (see below) is built on, which a plain WebSocket or SSE implementation would have made me build by hand.

**Q: You mentioned a multi-tenancy issue with sockets — explain it, and how you fixed it.**
A: `io.emit()` broadcast to every connected socket with no scoping — there was no concept of "which user is this socket for." REST endpoints were properly scoped because they ran through JWT-protected middleware, but the socket layer had no equivalent handshake check — the UI looked correct because the client only reads keys for rooms it fetched via its own authenticated REST call, but the raw events were visible to any connected client. The fix: an `io.use((socket, next) => {...})` middleware that reads `socket.handshake.auth.token`, verifies it with the same `jwt.verify` call the REST middleware uses, and rejects the handshake if it's missing or invalid; on success the socket joins a room named `user:<id>`. Every emit that used to be `io.emit(...)` is now `io.to(`user:${userId}`).emit(...)`, using the `user_id` already available on the room record at the point each event fires. I verified it end-to-end with a small socket.io-client script: a socket with a valid JWT connects and receives events normally, a socket with no token gets a `connect_error` with message `Unauthorized` and never joins.

### IoT / MQTT

**Q: Walk me through why you added MQTT and what actually changed.**
A: Sensor data originally arrived as a plain HTTP POST from a function call inside the same process — that's not how real IoT devices talk to a backend; they publish to a broker over MQTT and don't know or care who's subscribed. I embedded a real MQTT broker (`Aedes`) in the backend process using plain TCP, moved the simulator into its own module that connects as an MQTT client and publishes each room's reading to `coldchain/<room_key>/telemetry`, and made the backend itself a second MQTT client that subscribes to the wildcard `coldchain/+/telemetry` and feeds whatever arrives into the same `ingestReading()` pipeline that already existed (risk scoring, forecasting, alerting, the AI agent, notifications — none of that changed). What changed is *only* how a reading gets from "generated" to "ingested" — a real network hop over a real protocol instead of a direct function call.

**Q: Isn't embedding the broker in your own backend cheating — is that "real" MQTT?**
A: It's the real MQTT wire protocol running over a real TCP socket with two independent clients (the simulator and the backend) that don't share any Node objects or call each other directly — they only know the broker's address and a topic name, exactly like a real device and a real backend would. What's *not* fully "real" is that both currently run on the same host for deployability (no separate broker service to provision). I'm explicit about that trade-off rather than implying otherwise: a real ESP32 publishing to the same broker over the network would need zero backend-side changes, which is the actual test of whether the abstraction is real or cosmetic.

**Q: How would you actually wire up a real sensor to this?**
A: An ESP32 (or Raspberry Pi) with a DHT22 or BME422/BME280 sensor, running an MQTT client library — `PubSubClient` is the standard one in the Arduino/C++ ecosystem — connecting to the broker's IP and port `1883`, and publishing the same JSON shape (`{temperature, humidity, co2, doorOpen}`) to `coldchain/<room_key>/telemetry` on the same interval. The backend has no way to distinguish that from `simulator.js` — it's the same topic, same payload shape, same subscriber. The only real-world wrinkle is reachability: if the backend is deployed on Render's free tier, only the HTTP port is exposed publicly, so the device would need to be on the same network, or the broker would need to move somewhere reachable (a paid Render tier, or a hosted broker like HiveMQ Cloud).

**Q: Why Aedes specifically, and did you consider Mosquitto?**
A: Mosquitto is the standard standalone broker, but it's a separate binary/service to install and keep running — for a portfolio project meant to `git clone` and run with one command, that's friction I didn't want to impose on anyone reviewing it (including Render's build). Aedes is a pure-JS broker that runs inside the same Node process, so `npm install && node server.js` is still the entire setup. If this needed to handle real production device load, I'd revisit that — Aedes embedded in the API process means broker load and API load compete for the same event loop, which a standalone Mosquitto instance wouldn't.

### Frontend / React

**Q: Why no Redux or global state library?**
A: The amount of shared state is small — auth (kept in `localStorage`, re-read via helpers, not even React context) and per-page live data via a local Socket.io connection and `useState`. Pulling in Redux/Zustand would add boilerplate without solving a problem I actually have; if the app grew multiple deeply-nested consumers of the same live state, I'd introduce React Context or a lightweight store at that point, not before.

**Q: How does the dashboard stay "live" without constant polling?**
A: A single Socket.io connection per page (opened in `useEffect`, cleaned up on unmount) listens for `sensorUpdate`, `alert`, and `aiInsight` events and merges them into local state as they arrive. REST calls are only used for the initial load and for data that isn't pushed live (like paginated alert/insight history), on a slower polling interval as a fallback.

**Q: How would you improve performance if this dashboard had to show 100 rooms instead of a handful?**
A: Right now every `sensorUpdate` triggers a state update and a re-render of whatever's subscribed. At 100 rooms and a 3-second tick I'd (1) batch incoming socket events instead of setting state per-event, (2) virtualize the room grid so only visible cards render, and (3) move the historical chart data fetching to be paginated/windowed rather than pulling full history per room up front.

### The AI/ML feature (expect the deepest questions here)

**Q: Is this actually machine learning, or just an if-statement with extra steps?**
A: The forecasting layer is genuinely a statistical model — ordinary least-squares linear regression with an R² goodness-of-fit gate — not a hardcoded rule. It's a simple model deliberately: the goal was an explainable, dependency-free predictor that's honest about its own confidence (via R²), not a heavyweight model that would be overkill for a 20-point rolling window. The "AI" half (Claude) is intentionally *not* doing the numeric prediction — it's doing the part suited to a language model: synthesizing several correlated signals into a human-readable hypothesis.

**Q: Why didn't you use a "real" ML library or a trained model?**
A: There's no labeled failure dataset to train on — this is a simulator, not real sensor history with known failure outcomes. Fitting a trend and extrapolating is the statistically honest thing to do without invented ground truth. If real historical failure data existed, I'd look at something like an exponentially-weighted moving average or a small time-series model (e.g. Holt's linear trend method) trained/validated against actual spoilage incidents.

**Q: How do you keep the AI agent from being spammy or expensive?**
A: Two gates: it only fires on an actual trigger (a critical alert or a predicted breach), not on every tick, and there's a 3-minute cooldown per room on top of that regardless of how many triggers happen in that window. It also fails soft — if the API key isn't set, or the call errors, the rest of the system (reactive + predictive alerting) is completely unaffected.

**Q: What happens if Claude returns malformed JSON?**
A: The response is parsed inside a `try/catch`; a parse failure just returns without creating an insight — silently degrading to "no AI insight for this incident" rather than crashing the simulator loop or corrupting stored data. Given the system prompt hard-constrains the output format, but a model can still stray, I chose to drop bad output rather than retry-loop against a live, cost-incurring API in a background job.

**Q: How would you evaluate whether the AI's diagnoses are actually good?**
A: I don't have ground-truth failure causes to grade against since this is simulated data, so today it's judged qualitatively (does the reasoning line up with the actual injected anomaly type). In a real deployment I'd log outcomes (was a technician dispatched, did they confirm the hypothesis) and build a feedback loop — even a simple thumbs up/down on each insight — to track precision over time.

### Data modeling / general system design

**Q: How is the multi-tenant data model structured?**
A: `users` → `cold_storages` (belongs to a user) → `rooms` (belongs to a cold storage, and denormalized with `user_id` directly for simpler filtering) → `readings`/`alerts`/`insights`, each tagged with the room's `room_key` and filtered back to a user by cross-referencing which room keys belong to them. It's a straightforward one-to-many chain; the interesting part is that `room_key` (not the numeric `id`) is the identifier threaded through in-memory state, sockets, and the AI payloads, since it's stable and human-readable in logs.

**Q: If you had to scale this to thousands of rooms across many tenants, what changes first?**
A: SQLite and the single in-process simulator both stop working at that scale — SQLite is one file on one host's disk, so it doesn't horizontally scale across multiple backend instances the way a client-server database does. I'd move storage to Postgres (the query layer is already SQL, so the rewrite is mostly connection setup and minor dialect differences, not a redesign), move the simulator (or real ingestion) to a queue-backed worker so it's not coupled to the API process's event loop, and shard the Socket.io layer with Redis pub/sub (`socket.io-redis` adapter) so multiple backend instances can share the per-user room state instead of each holding its own in-process copy.

**Q: How do you decide category-specific safe thresholds?**
A: They're hardcoded per category in `CATEGORY_THRESHOLDS` (e.g. vaccines: 2–8°C, 35–55% humidity; dairy: 2–4°C, 80–90% humidity) — these reflect commonly cited real-world cold-chain storage guidance for each product type. A production system would want these to be configurable per-room (some facilities have tighter tolerances than the category default) rather than fixed constants.

### Security

**Q: What security shortcuts did the project originally have, and what did you do about them?**
A: Five real ones, all fixed across two hardening passes: the JWT secret was a hardcoded string — now read from `JWT_SECRET`, and refuses to boot without it when `NODE_ENV=production` (fail-closed, not just a warning); CORS was wide open (`origin: '*'`) on both Express and Socket.io — now an explicit `ALLOWED_ORIGINS` allowlist; the Socket.io layer broadcast every event to every connected client regardless of tenant — now authenticated per-socket via the same JWT and scoped to a per-user room; and there was no rate limiting on `/api/auth/login` or `/api/auth/register`, so both were brute-forceable — now capped at 10 attempts per 15 minutes per IP via `express-rate-limit`. Passwords themselves were handled correctly throughout from the start — bcrypt with salting, hash never returned in any API response (there's a test asserting that specifically). What's still open: a live socket's JWT isn't re-validated before it expires, only on connection — see Section 8.

### Notifications, CI & Docker

**Q: Why do notifications only fire on critical alerts, not warnings or predictions?**
A: Because the whole point of a phone-buzzing notification is that it's rare enough to trust. If it fired on every warning or predictive alert too, it'd fire constantly during any sustained drift and people would start ignoring it — the exact failure mode real monitoring systems have with alert fatigue. Critical means a threshold is *already* breached right now; that's the bar for interrupting someone.

**Q: Why two separate services (SendGrid and Twilio) instead of one?**
A: Email and SMS are genuinely different channels with different urgency implications — email for "review when you're back at a desk," SMS for "someone should look at this in the next few minutes." They're independently gated by their own env vars specifically so you can enable just one, both, or neither without the code caring — same pattern as the AI agent's `ANTHROPIC_API_KEY` check.

**Q: What does your CI pipeline actually catch, and what would it miss?**
A: Two jobs on every push/PR: the full 18-test backend suite, and a full frontend production build. It would catch a broken test, a syntax error, a missing import, a dependency that silently stopped resolving — anything that fails at test-run-time or build-time. It would *not* catch a runtime-only bug (something that only breaks when a real socket connects, or when MQTT actually delivers a malformed payload) since those aren't exercised by the current test suite — the socket scoping and the MQTT pipeline were both verified manually, not in CI, which is the honest next gap.

**Q: Why does your Docker container refuse to start without JWT_SECRET?**
A: Because the image sets `NODE_ENV=production`, and I made the fail-closed JWT_SECRET check apply in production specifically — booting with the old hardcoded default in an environment presented as "production" is worse than not booting at all. It's a deliberate consequence of the hardening-pass decision, not an oversight; I'd rather someone hit a clear boot-time error than have a container quietly running with an insecure secret.

**Q: Why is your Dockerfile a two-stage build?**
A: It wasn't originally, and that's a useful story: my first version installed `python3`/`build-essential` to compile `better-sqlite3`'s native module, and the comment above that line claimed they "get removed so they don't bloat the final image" — but the actual `RUN` command only cleared the apt package-list cache (`rm -rf /var/lib/apt/lists/*`), never the installed compiler toolchain itself. The comment described intent, the code didn't deliver it, and the final image would have shipped a full C/C++ toolchain it never needed at runtime. I caught this on a later self-review specifically by treating "what does this claim" and "what does this code do" as two separate questions to check against each other — the fix was a proper two-stage build: a `builder` stage installs the compiler and runs `npm ci`, and the final stage copies only the resulting `node_modules` (with the already-compiled binary) from it, on the same base image so the compiled binary's glibc/Node ABI matches. Same idea as the socket-scoping bug from pass 1 — a claim that sounded right until I checked it against what the code actually did.

### Behavioral-technical

**Q: Tell me about a design decision you went back and forth on.**
A: Whether the AI agent should run on every reading or only on-trigger. Running it constantly would make the "agentic" behavior more visible/impressive-looking, but it's dishonest engineering — most readings don't need a language model's judgment, and it would be needlessly expensive and noisy in the UI. I chose to gate it behind the same critical/predictive triggers the rest of the system already computes, which also happens to be the more defensible choice if someone asks "why does this need an LLM call at all."

**Q: What would you do differently if you started over?**
A: Write the multi-tenancy test (`a second user cannot see the first user's rooms`) *before* building the sharing surface, not after — it's the single test that would have caught the Socket.io broadcast leak immediately instead of me having to notice it during a later review. More generally: build the boundary-crossing test first for anything multi-tenant, because that's exactly the kind of bug that's invisible in normal manual testing (you're always logged in as one user) and only shows up when you deliberately try to break isolation between two.
