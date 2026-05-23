"""Setup optimization for Assetto Corsa Evo — handling and fuel strategy by lap count."""

from __future__ import annotations

from data_registry import DEFAULT_GAME_ID, DataRegistry, default_registry

CATEGORY_CAPS = {
    "road": {"tyres": True, "electronics": True, "fuel": True, "suspension": False, "dampers": False, "aero": False},
    "historic": {"tyres": True, "electronics": False, "fuel": True, "suspension": True, "dampers": False, "aero": False},
    "track_day": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "tcr": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "gt4": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "gt3": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "gt2": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "formula": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
    "prototype": {"tyres": True, "electronics": True, "fuel": True, "suspension": True, "dampers": True, "aero": True},
}

TRACK_AERO_BIAS = {
    "low_downforce": {"front_wing": -4, "rear_wing": -6, "ride_height_mm": 8},
    "high_speed": {"front_wing": -2, "rear_wing": -3, "ride_height_mm": 4},
    "technical": {"front_wing": 1, "rear_wing": 0, "ride_height_mm": -2},
    "elevation": {"front_wing": 0, "rear_wing": 1, "ride_height_mm": 6},
    "endurance": {"front_wing": 2, "rear_wing": 2, "ride_height_mm": 10},
    "bumpy": {"front_wing": 1, "rear_wing": 1, "ride_height_mm": 12},
    "mixed": {"front_wing": -1, "rear_wing": -1, "ride_height_mm": 3},
}

# Approximate race fuel use (L/lap) by class — calibrate as AC Evo physics stabilize.
FUEL_L_PER_LAP = {
    "road": 2.4,
    "historic": 3.2,
    "track_day": 2.8,
    "tcr": 2.6,
    "gt4": 2.5,
    "gt3": 2.7,
    "gt2": 2.8,
    "formula": 2.2,
    "prototype": 2.4,
}

TRACK_FUEL_MULTIPLIER = {
    "low_downforce": 0.92,
    "high_speed": 1.08,
    "technical": 1.0,
    "elevation": 1.06,
    "endurance": 1.04,
    "bumpy": 1.02,
    "mixed": 1.0,
}

VALID_GOALS = frozenset({"balanced_handling", "stable_entry", "rotation_exit"})
VALID_PRIORITIES = frozenset({"balanced", "handling", "fuel_efficiency"})


def get_cars(game_id: str = DEFAULT_GAME_ID) -> list[dict]:
    return default_registry().get_cars(game_id)


def get_tracks(game_id: str = DEFAULT_GAME_ID) -> list[dict]:
    return default_registry().get_tracks(game_id)


def find_car(car_id: str, game_id: str = DEFAULT_GAME_ID) -> dict | None:
    return default_registry().find_car(car_id, game_id)


def find_track(track_id: str, game_id: str = DEFAULT_GAME_ID) -> dict | None:
    return default_registry().find_track(track_id, game_id)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _stint_profile(laps: int) -> str:
    if laps <= 5:
        return "sprint"
    if laps <= 15:
        return "medium"
    return "endurance"


def _compute_fuel_strategy(
    car: dict,
    track: dict,
    laps: int,
    priority: str,
) -> dict:
    category = car["category"]
    base_per_lap = FUEL_L_PER_LAP.get(category, 2.8)
    profile = track.get("profile", "mixed")
    mult = TRACK_FUEL_MULTIPLIER.get(profile, 1.0)
    if track.get("elevation") in ("high", "very_high"):
        mult *= 1.03
    length_km = float(track.get("length_km", 5.0))
    if length_km > 10:
        mult *= 1.05

    per_lap = base_per_lap * mult
    stint = _stint_profile(laps)

    if priority == "fuel_efficiency":
        safety_laps = 0.5 if stint == "sprint" else 1.0
        tc_offset = 1
        map_hint = "Economy / lower power map if available"
    elif priority == "handling":
        safety_laps = 0.25 if stint == "sprint" else 0.75
        tc_offset = -1
        map_hint = "Race map — prioritize grip over consumption"
    else:
        safety_laps = 0.5 if stint == "sprint" else 1.0
        tc_offset = 0
        map_hint = "Race map — balance pace and range"

    total_litres = per_lap * (laps + safety_laps)
    total_litres = _clamp(round(total_litres, 1), 5.0, 120.0)

    distance_km = round(length_km * laps, 1)
    return {
        "litres": total_litres,
        "per_lap": round(per_lap, 2),
        "safety_laps": safety_laps,
        "stint": stint,
        "tc_offset": tc_offset,
        "map_hint": map_hint,
        "distance_km": distance_km,
    }


def _pressure_delta(track: dict, stint: str, priority: str) -> float:
    profile = track.get("profile", "mixed")
    delta = 0.0
    if profile in ("high_speed", "low_downforce"):
        delta -= 0.8
    elif profile in ("technical", "bumpy", "endurance"):
        delta += 0.4
    if track.get("elevation") in ("high", "very_high"):
        delta += 0.2
    if stint == "endurance":
        delta += 0.3
    if priority == "handling" and stint == "sprint":
        delta -= 0.2
    return delta


def _category_base(category: str) -> dict:
    bases = {
        "road": {"psi_fl": 32, "psi_fr": 32, "psi_rl": 30, "psi_rr": 30, "abs": 5, "tc": 5},
        "historic": {"psi_fl": 30, "psi_fr": 30, "psi_rl": 28, "psi_rr": 28, "abs": 3, "tc": 0},
        "track_day": {"psi_fl": 28, "psi_fr": 28, "psi_rl": 27, "psi_rr": 27, "abs": 4, "tc": 3},
        "tcr": {"psi_fl": 26, "psi_fr": 26, "psi_rl": 25, "psi_rr": 25, "abs": 6, "tc": 4},
        "gt4": {"psi_fl": 24, "psi_fr": 24, "psi_rl": 23, "psi_rr": 23, "abs": 7, "tc": 5},
        "gt3": {"psi_fl": 22, "psi_fr": 22, "psi_rl": 21, "psi_rr": 21, "abs": 8, "tc": 6},
        "gt2": {"psi_fl": 23, "psi_fr": 23, "psi_rl": 22, "psi_rr": 22, "abs": 8, "tc": 6},
        "formula": {"psi_fl": 21, "psi_fr": 21, "psi_rl": 20, "psi_rr": 20, "abs": 9, "tc": 7},
        "prototype": {"psi_fl": 20, "psi_fr": 20, "psi_rl": 19, "psi_rr": 19, "abs": 9, "tc": 7},
    }
    return bases.get(category, bases["track_day"]).copy()


def _track_ride_height(track: dict, category: str, stint: str) -> tuple[int, int]:
    aero = TRACK_AERO_BIAS.get(track.get("profile", "mixed"), TRACK_AERO_BIAS["mixed"])
    base_front = 55 if category in ("gt3", "gt2", "gt4", "formula") else 70
    base_rear = base_front + 8
    bump = aero["ride_height_mm"]
    if track.get("kerbs") == "aggressive":
        bump += 4
    if track.get("profile") == "bumpy":
        bump += 6
    if stint == "endurance":
        bump += 3
    return base_front + bump, base_rear + bump


def _balance_notes(car: dict, track: dict, laps: int, fuel: dict, priority: str) -> list[str]:
    notes = [
        f"Optimized for {laps} lap{'s' if laps != 1 else ''} (~{fuel['distance_km']} km) with "
        f"{fuel['litres']:.0f} L fuel ({fuel['per_lap']:.2f} L/lap estimated).",
    ]
    if priority == "fuel_efficiency":
        notes.append("Fuel-first: conservative TC/ABS and pressures tuned to limit tyre scrub and consumption.")
    elif priority == "handling":
        notes.append("Grip-first: sharper rotation and platform control; accept slightly higher fuel use.")
    else:
        notes.append("Balanced: neutral handling with fuel load matched to stint length.")

    profile = track.get("profile", "mixed")
    if profile == "low_downforce":
        notes.append("Low-drag aero trim for long straights; watch front grip in high-speed corners.")
    elif profile == "technical":
        notes.append("Mechanical grip bias (camber/ARB) aids rotation through linked corners.")
    elif profile == "endurance":
        notes.append("Compliance-focused dampers and ride height protect the platform on long stints.")
    elif profile == "bumpy":
        notes.append("Softer fast bump and bumpstop range keep tyres planted over rough sections.")

    if fuel["stint"] == "endurance":
        notes.append("Long stint: slightly higher pressures and TC help manage tyre degradation.")
    elif fuel["stint"] == "sprint":
        notes.append("Short stint: lower fuel load improves rotation — re-check pressures after burn-off.")

    if car["category"] == "road":
        notes.append("Road car: only in-game parameters are shown; focus on pressures and assists.")

    return notes


def generate_setup(
    car_id: str,
    track_id: str,
    *,
    goal: str = "balanced_handling",
    laps: int = 10,
    priority: str = "balanced",
    game_id: str = DEFAULT_GAME_ID,
    registry: DataRegistry | None = None,
) -> dict:
    reg = registry or default_registry()
    car = reg.find_car(car_id, game_id)
    track = reg.find_track(track_id, game_id)
    if not car or not track:
        raise ValueError("Unknown car or track")
    if goal not in VALID_GOALS:
        raise ValueError(f"Invalid goal. Choose from: {', '.join(sorted(VALID_GOALS))}")
    if priority not in VALID_PRIORITIES:
        raise ValueError(f"Invalid priority. Choose from: {', '.join(sorted(VALID_PRIORITIES))}")

    laps = int(_clamp(laps, 1, 200))
    category = car["category"]
    caps = CATEGORY_CAPS.get(category, CATEGORY_CAPS["track_day"])
    base = _category_base(category)
    fuel = _compute_fuel_strategy(car, track, laps, priority)
    stint = fuel["stint"]
    pd = _pressure_delta(track, stint, priority)
    front_rh, rear_rh = _track_ride_height(track, category, stint)
    aero_bias = TRACK_AERO_BIAS.get(track.get("profile", "mixed"), TRACK_AERO_BIAS["mixed"])

    is_race = category in ("gt3", "gt2", "gt4", "tcr", "formula", "prototype")
    front_camber = -3.2 if is_race else -2.0
    rear_camber = -2.0 if is_race else -1.5
    if track.get("profile") == "technical":
        front_camber -= 0.3
        rear_camber -= 0.2
    if stint == "endurance":
        front_camber += 0.15
        rear_camber += 0.1

    if goal == "stable_entry":
        front_toe, rear_toe = 0.02, 0.15
    elif goal == "rotation_exit":
        front_toe, rear_toe = 0.08, 0.08
    else:
        front_toe, rear_toe = 0.05, 0.12

    priority_labels = {
        "balanced": "Balanced",
        "handling": "Maximum handling",
        "fuel_efficiency": "Fuel efficiency",
    }

    setup: dict = {
        "meta": {
            "car": car["name"],
            "car_id": car["id"],
            "track": f"{track['name']} — {track['layout']}",
            "track_id": track["id"],
            "category": category,
            "goal": goal.replace("_", " ").title(),
            "priority": priority_labels[priority],
            "laps": laps,
            "focus": "Handling + fuel strategy tuned to stint length and track profile",
            "game_id": game_id,
        },
        "fuel_summary": {
            "litres": fuel["litres"],
            "per_lap": fuel["per_lap"],
            "distance_km": fuel["distance_km"],
            "stint": fuel["stint"],
        },
        "notes": _balance_notes(car, track, laps, fuel, priority),
        "sections": {},
    }

    if caps["tyres"]:
        setup["sections"]["tyres"] = {
            "title": "Tyres",
            "values": [
                {"label": "Front Left Pressure", "value": f"{base['psi_fl'] + pd:.1f} psi", "hint": "Target green centre temps after 3–4 laps"},
                {"label": "Front Right Pressure", "value": f"{base['psi_fr'] + pd:.1f} psi", "hint": "Match opposite front for balance"},
                {"label": "Rear Left Pressure", "value": f"{base['psi_rl'] + pd:.1f} psi", "hint": "Slightly lower than front for rotation"},
                {"label": "Rear Right Pressure", "value": f"{base['psi_rr'] + pd:.1f} psi", "hint": "Re-check after fuel burn and suspension changes"},
                {"label": "Front Camber", "value": f"{front_camber:.1f}°", "hint": "More negative = mid-corner grip, less straight-line traction"},
                {"label": "Rear Camber", "value": f"{rear_camber:.1f}°", "hint": "Keep rear less aggressive than front"},
                {"label": "Front Toe", "value": f"{front_toe:.2f}° out", "hint": "Light toe-out sharpens turn-in"},
                {"label": "Rear Toe", "value": f"{rear_toe:.2f}° in", "hint": "Toe-in stabilizes the rear under braking"},
            ],
        }

    if caps["electronics"]:
        tc = int(_clamp(base["tc"] + fuel["tc_offset"], 0, 12))
        abs_level = base["abs"]
        if priority == "fuel_efficiency":
            abs_level = int(_clamp(abs_level + 1, 0, 12))
        setup["sections"]["electronics"] = {
            "title": "Electronics",
            "values": [
                {"label": "ABS", "value": str(abs_level), "hint": "Higher = more stability under threshold braking"},
                {"label": "Traction Control", "value": str(tc), "hint": "Higher TC saves fuel; lower TC for maximum drive"},
                {"label": "Engine Map", "value": fuel["map_hint"], "hint": "Match map to stint length and fuel target"},
            ],
        }

    if caps["fuel"]:
        compound = "Slick Medium" if stint == "endurance" and is_race else ("Slick Soft" if is_race else "Street Sport")
        setup["sections"]["fuel_strategy"] = {
            "title": "Fuel & Strategy",
            "values": [
                {"label": "Fuel Load", "value": f"{fuel['litres']:.0f} L", "hint": f"~{fuel['per_lap']:.2f} L/lap × {laps} laps + {fuel['safety_laps']:.1f} lap reserve"},
                {"label": "Target Laps", "value": str(laps), "hint": f"Stint type: {stint.replace('_', ' ').title()}"},
                {"label": "Tyre Compound", "value": compound, "hint": "Medium often better for long stints; soft for qualifying sprint"},
                {"label": "Brake Pad Compound", "value": "Racing" if is_race else "Sport", "hint": "Racing pads for repeated heavy braking zones"},
            ],
        }

    if caps["suspension"]:
        arb_front = 6 if track.get("profile") == "technical" else 5
        arb_rear = 4 if track.get("profile") == "high_speed" else 5
        if stint == "endurance":
            arb_front -= 1
            arb_rear -= 1
        setup["sections"]["suspension"] = {
            "title": "Suspension",
            "values": [
                {"label": "Front Ride Height", "value": f"{front_rh} mm", "hint": "Lower = downforce; raise if bottoming on kerbs"},
                {"label": "Rear Ride Height", "value": f"{rear_rh} mm", "hint": "Keep rear higher than front for stability"},
                {"label": "Front Anti-Roll Bar", "value": f"{arb_front} / 10", "hint": "Stiffer front = more understeer on entry"},
                {"label": "Rear Anti-Roll Bar", "value": f"{arb_rear} / 10", "hint": "Softer rear helps rotation on exit"},
                {"label": "Front Bumpstop Rate", "value": "Medium-Stiff", "hint": "Stiffer front reduces dive under braking"},
                {"label": "Rear Bumpstop Rate", "value": "Medium", "hint": "Softer rear absorbs traction squat"},
                {"label": "Bumpstop Range (F/R)", "value": "42 mm / 48 mm", "hint": "More range on bumpy tracks"},
                {"label": "Steering Ratio", "value": "12:1" if is_race else "14:1", "hint": "Quicker ratio for tight circuits"},
            ],
        }

    if caps["dampers"]:
        bump_scale = 1.15 if track.get("profile") in ("bumpy", "endurance") else 1.0
        if stint == "endurance":
            bump_scale *= 1.05
        setup["sections"]["dampers"] = {
            "title": "Dampers",
            "values": [
                {"label": "Front Slow Bump", "value": str(int(5 * bump_scale)), "hint": "Controls pitch under braking"},
                {"label": "Front Slow Rebound", "value": "6", "hint": "Higher slows front lift on throttle"},
                {"label": "Front Fast Bump", "value": "4" if track.get("kerbs") == "aggressive" else "5", "hint": "Softer absorbs kerb strikes"},
                {"label": "Front Fast Rebound", "value": "5", "hint": "Lets suspension recover after kerbs"},
                {"label": "Rear Slow Bump", "value": str(int(4 * bump_scale)), "hint": "Softer rear improves traction on exit"},
                {"label": "Rear Slow Rebound", "value": "5", "hint": "Controls rear lift under braking"},
                {"label": "Rear Fast Bump", "value": "4", "hint": "Match front for platform stability"},
                {"label": "Rear Fast Rebound", "value": "5", "hint": "Balance with slow rebound for rotation"},
            ],
        }

    if caps["aero"]:
        fw = _clamp(8 + aero_bias["front_wing"], 0, 12)
        rw = _clamp(10 + aero_bias["rear_wing"], 0, 15)
        if priority == "fuel_efficiency" and track.get("profile") != "technical":
            fw = max(0, fw - 1)
            rw = max(0, rw - 2)
        setup["sections"]["aerodynamics"] = {
            "title": "Aerodynamics",
            "values": [
                {"label": "Front Wing", "value": f"{int(fw)}", "hint": "More front wing reduces understeer in high-speed corners"},
                {"label": "Rear Wing", "value": f"{int(rw)}", "hint": "Lower rear wing saves fuel on straights"},
                {"label": "Front Splitter", "value": "Medium" if category in ("gt3", "gt2", "prototype") else "Fixed", "hint": "Increase on high-downforce tracks"},
                {"label": "Rear Diffuser / Gurney", "value": "Standard +1", "hint": "Fine-tune if rear feels light at speed"},
            ],
        }

    brake_bias = 58.0
    if goal == "stable_entry":
        brake_bias = 59.0
    elif goal == "rotation_exit":
        brake_bias = 57.0

    setup["sections"]["brakes"] = {
        "title": "Brakes & Differential",
        "values": [
            {"label": "Brake Bias", "value": f"{brake_bias:.1f}% front", "hint": "Rearward if front locks; forward if rear steps out under braking"},
            {"label": "Brake Pressure", "value": "95%", "hint": "Full pressure for race cars; reduce if ABS triggers too early"},
            {"label": "Preload / Diff", "value": "120 Nm" if is_race else "Open", "hint": "Higher preload stabilizes throttle-on; can add understeer"},
        ],
    }

    setup["tuning_tips"] = [
        {"issue": "Understeer on entry", "fix": "Soften front ARB, add 0.02° front toe-out, or +1 front wing"},
        {"issue": "Oversteer on exit", "fix": "Soften rear slow bump, lower rear ride height 2 mm, or +1 rear wing"},
        {"issue": "Tyres overheating", "fix": "Raise pressures 0.5 psi, reduce camber 0.2°, lower TC by 1"},
        {"issue": "Running out of fuel", "fix": f"Add ~{fuel['per_lap']:.1f} L per extra lap; use economy map and +1 TC"},
        {"issue": "Instability over kerbs", "fix": "Soften fast bump 1 click, increase bumpstop range 2 mm"},
    ]

    return setup
