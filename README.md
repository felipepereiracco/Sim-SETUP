# ACE Setup — Assetto Corsa Evo Setup Optimizer

A locally runnable web app that generates **handling-focused car setups** and **fuel strategies** for any car and track combination in **Assetto Corsa Evo**, tuned to your target lap count.

Inspired by Apple’s clean typography and layout, with a motorsports palette (racing red, amber, and carbon black).

---

## Features

| Area | Description |
|------|-------------|
| **Data integration** | JSON catalogs for 75+ cars and 20 track layouts, loaded through a modular `DataRegistry` and `data/manifest.json` for future titles |
| **Optimization** | Adjusts tyres, suspension, aero, electronics, and fuel load from lap count, track profile (Monza vs Nordschleife), and priority (balanced / handling / fuel) |
| **UI** | Responsive single-page app with grouped selectors, lap slider, fuel summary banner, and copy-to-clipboard |
| **Extensibility** | Add a new game by extending `manifest.json` and dropping `cars.json` / `tracks.json` files |

---

## Architecture

```
├── app.py              # Flask API + static UI
├── data_registry.py    # Game manifest + catalog loader
├── setup_engine.py     # Optimization rules (handling + fuel)
├── data/
│   ├── manifest.json   # Registered racing titles
│   ├── cars.json
│   └── tracks.json
├── templates/
└── static/
```

**API endpoints**

- `GET /api/games` — active titles from manifest
- `GET /api/cars?game_id=ac_evo`
- `GET /api/tracks?game_id=ac_evo`
- `POST /api/setup` — body: `{ car_id, track_id, laps, goal, priority, game_id }`
- `GET /api/meta` — valid goals and priorities

---

## Run locally

### Prerequisites

- **Python 3.10+** (3.12 recommended)
- macOS, Windows, or Linux

### macOS / Linux

```bash
cd "/path/to/Project cursor"
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5001**

### Windows (PowerShell)

```powershell
cd "C:\path\to\Project cursor"
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Open **http://127.0.0.1:5001**

### Production-style local run (Gunicorn)

```bash
source venv/bin/activate
gunicorn --bind 127.0.0.1:5001 --workers 2 --threads 4 app:app
```

### Docker

```bash
docker build -t ace-setup .
docker run --rm -p 8080:8080 ace-setup
```

Open **http://localhost:8080**

---

## Online hosting

### Recommended platforms

| Platform | Best for | Notes |
|----------|----------|-------|
| **[Railway](https://railway.app)** | Fast deploy from Git | Connect repo, set start command: `gunicorn --bind 0.0.0.0:$PORT app:app` |
| **[Fly.io](https://fly.io)** | Global edge, Docker | Use included `Dockerfile`; `fly launch` + `fly deploy` |
| **[Render](https://render.com)** | Free tier / simple ops | Web Service, Python, build: `pip install -r requirements.txt`, start: Gunicorn |
| **[Vercel](https://vercel.com)** | Static + serverless | Prefer splitting: static UI on CDN + Python API on Railway/Fly (Flask is not native to Vercel Python) |
| **AWS / GCP** | Enterprise scale | ECS/Cloud Run + ALB; use Docker image from this repo |

### Deployment checklist

1. **Build**: `pip install -r requirements.txt` or `docker build`.
2. **Start command**: `gunicorn --bind 0.0.0.0:$PORT --workers 2 --threads 4 app:app`
3. **Environment**: `FLASK_DEBUG=0`, `PORT` set by host.
4. **HTTPS**: Terminate TLS at the load balancer (Railway/Render/Fly provide this automatically).
5. **Security**:
   - Do not expose debug mode in production.
   - Add rate limiting (e.g. Flask-Limiter) if the API is public.
   - Set `Content-Security-Policy` and `X-Frame-Options` via reverse proxy or middleware.
   - No secrets are required for the current read-only JSON API.
6. **Performance**:
   - Gunicorn workers ≈ `2 × CPU + 1` for CPU-bound; this app is I/O-light — 2 workers + threads is sufficient.
   - Enable gzip on the reverse proxy for `static/` assets.
   - Cache `GET /api/cars` and `/api/tracks` at CDN edge (Cache-Control: `public, max-age=3600`).

### Example: Fly.io

```bash
fly launch --no-deploy
fly secrets set FLASK_DEBUG=0
fly deploy
```

---

## Extending to another racing title

1. Add `data/cars_other_game.json` and `data/tracks_other_game.json`.
2. Register in `data/manifest.json`:

```json
{
  "id": "other_sim",
  "name": "Other Racing Sim",
  "active": true,
  "data_files": {
    "cars": "cars_other_game.json",
    "tracks": "tracks_other_game.json"
  }
}
```

3. Pass `game_id=other_sim` to API calls (or add a game selector in the UI).
4. Optionally add title-specific rules in `setup_engine.py` or a new `engines/other_sim.py` module.

### Track schema (recommended fields)

```json
{
  "id": "monza",
  "name": "Monza",
  "layout": "Grand Prix",
  "country": "Italy",
  "profile": "low_downforce",
  "length_km": 5.79,
  "kerbs": "moderate",
  "elevation": "low"
}
```

`profile` drives aero and suspension: `low_downforce`, `high_speed`, `technical`, `elevation`, `endurance`, `bumpy`, `mixed`.

---

## Updating car / track lists

Edit `data/cars.json` and `data/tracks.json`. Each car needs `id`, `name`, `brand`, `category`. Categories control which setup tabs appear: `road`, `historic`, `track_day`, `tcr`, `gt4`, `gt3`, `gt2`, `formula`, `prototype`.

Restart the server after JSON changes (or rely on process restart in production).

---

## Disclaimer

Setups are **recommendations** based on community tuning principles and AC Evo Early Access behavior. Physics and available parameters may change with game updates. Always validate in-game with tyre temperatures and lap time. Not affiliated with Kunos Simulazioni.
