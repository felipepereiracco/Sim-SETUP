# ACE Setup — Assetto Corsa Evo Setup Optimizer

A static web app that generates **handling-focused car setups** and **fuel strategies** for any car and track combination in **Assetto Corsa Evo**, tuned to your target lap count.

Runs entirely in the browser — no server required. Hosted on **GitHub Pages**.

**Live site:** `https://felipepereiracco.github.io/Sim-SETUP/`

---

## Features

| Area | Description |
|------|-------------|
| **Data integration** | JSON catalogs for 75+ cars and 20 track layouts in `data/` |
| **Optimization** | Client-side engine adjusts tyres, suspension, aero, electronics, and fuel from lap count and track profile |
| **UI** | Responsive single-page app with grouped selectors, lap slider, fuel summary, and copy-to-clipboard |

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

Any static file server works:

```bash
cd Sim-SETUP
python3 -m http.server 8080
```

Open **http://127.0.0.1:8080**

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
