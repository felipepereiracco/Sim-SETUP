# ACE Setup — Assetto Corsa Evo Setup Optimizer

A static web app that generates **handling-focused car setups** and **fuel strategies** for any car and track combination in **Assetto Corsa Evo**, tuned to your target lap count.

Runs entirely in the browser — no server required. Hosted on **GitHub Pages**.

**Live site:** `https://felipepereiracco.github.io/Sim-SETUP/`

**Supported games:** Assetto Corsa Evo · Gran Turismo 7

---

## Features

| Area | Description |
|------|-------------|
| **Multi-game** | Switch between AC Evo and GT7; each game has its own car/track JSON catalogs |
| **Stint planning** | Set stint length by **laps** (slider) or **race time** (minutes → estimated laps from track lap time) |
| **Optimization** | Client-side engine adjusts tyres, suspension, aero, electronics, and fuel from stint and track profile |
| **UI** | Responsive single-page app with grouped selectors, fuel summary, and copy-to-clipboard |

---

## Project layout

```
├── index.html          # Main page
├── css/style.css
├── js/
│   ├── app.js          # UI and form handling
│   ├── data-registry.js
│   └── setup-engine.js
├── data/
│   ├── manifest.json
│   ├── cars.json
│   └── tracks.json
└── .github/workflows/deploy.yml
```

---

## Run locally

You need a simple static file server (opening `index.html` directly in the browser will block JSON loading).

### Option A — Python (built-in on macOS)

```bash
cd Sim-SETUP
python3 -m http.server 8080
```

Open **http://127.0.0.1:8080**

### Option B — Node.js

```bash
cd Sim-SETUP
npx --yes serve -p 8080
```

Open **http://localhost:8080**

### Quick check

1. Choose **Gran Turismo 7** in the Game dropdown — cars and tracks should reload.
2. Switch stint to **Time**, pick a track, and confirm the “≈ N laps” estimate updates.
3. Generate a setup and verify fuel values appear.

---

## Deploy on GitHub Pages

1. Push this repo to GitHub (`main` branch).
2. **Settings → Pages → Build and deployment → Source:** **GitHub Actions**.
3. On push to `main`, the **Deploy to GitHub Pages** workflow publishes `index.html`, `css/`, `js/`, and `data/`.

Do **not** enable “Deploy from branch” with Jekyll — use the GitHub Actions workflow only.

---

## Updating car / track lists

Edit `data/cars.json` and `data/tracks.json`, then push to `main`. The site redeploys automatically.

---

## Disclaimer

Setups are **recommendations** based on community tuning principles and AC Evo Early Access behavior. Always validate in-game. Not affiliated with Kunos Simulazioni.
