/** Setup optimization for Assetto Corsa Evo — handling and fuel strategy (browser). */
(function (global) {
  const CATEGORY_CAPS = {
    road: { tyres: true, electronics: true, fuel: true, suspension: false, dampers: false, aero: false, brakes: true },
    historic: { tyres: true, electronics: false, fuel: true, suspension: true, dampers: false, aero: false, brakes: true },
    track_day: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    tcr: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    gt4: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    gt3: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    gt2: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    formula: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
    prototype: { tyres: true, electronics: true, fuel: true, suspension: true, dampers: true, aero: true, brakes: true },
  };

  const ALL_PARAMS_BY_SECTION = {
    tyres: ["psi_fl", "psi_fr", "psi_rl", "psi_rr", "front_camber", "rear_camber", "front_toe", "rear_toe"],
    electronics: ["abs", "tc", "engine_map"],
    fuel_strategy: ["fuel_load", "target_laps", "compound", "brake_pad"],
    suspension: ["front_rh", "rear_rh", "front_arb", "rear_arb", "front_bumpstop", "rear_bumpstop", "bumpstop_range", "steering_ratio"],
    dampers: ["f_slow_bump", "f_slow_rebound", "f_fast_bump", "f_fast_rebound", "r_slow_bump", "r_slow_rebound", "r_fast_bump", "r_fast_rebound"],
    aerodynamics: ["front_wing", "rear_wing", "front_splitter", "rear_diffuser"],
    brakes: ["brake_bias", "brake_pressure", "diff_preload"],
  };

  const CATEGORY_PARAMS = {
    road: {
      tyres: ["psi_fl", "psi_fr", "psi_rl", "psi_rr"],
      electronics: ["abs", "tc"],
      fuel_strategy: ["fuel_load", "target_laps", "compound"],
      brakes: ["brake_bias"],
    },
    historic: {
      tyres: ["psi_fl", "psi_fr", "psi_rl", "psi_rr", "front_camber", "rear_camber"],
      fuel_strategy: ["fuel_load", "target_laps", "compound", "brake_pad"],
      suspension: ["front_rh", "rear_rh", "front_arb", "rear_arb"],
      brakes: ["brake_bias", "brake_pressure"],
    },
  };

  const RACE_CATEGORIES = new Set(["track_day", "tcr", "gt4", "gt3", "gt2", "formula", "prototype"]);

  function paramsForCategory(category, section) {
    if (CATEGORY_PARAMS[category]?.[section]) return CATEGORY_PARAMS[category][section];
    if (RACE_CATEGORIES.has(category)) return ALL_PARAMS_BY_SECTION[section] || [];
    return [];
  }

  function pickRows(rows, allowed) {
    const allowedSet = new Set(allowed);
    return rows
      .filter((r) => allowedSet.has(r.key))
      .map(({ key, ...rest }) => rest);
  }

  function addSection(setup, sectionKey, title, rows, allowed) {
    const values = pickRows(rows, allowed);
    if (!values.length) return;
    setup.sections[sectionKey] = { title, values };
  }

  function buildTuningTips(caps, fuel) {
    const enabled = {
      tyres: caps.tyres,
      electronics: caps.electronics,
      fuel_strategy: caps.fuel,
      suspension: caps.suspension,
      dampers: caps.dampers,
      aerodynamics: caps.aero,
    };
    const tips = [
      { issue: "Understeer on entry", fix: "Soften front ARB, add 0.02° front toe-out, or +1 front wing", needs: ["suspension", "aerodynamics"] },
      { issue: "Oversteer on exit", fix: "Soften rear slow bump, lower rear ride height 2 mm, or +1 rear wing", needs: ["dampers", "aerodynamics"] },
      { issue: "Tyres overheating", fix: "Raise pressures 0.5 psi, reduce camber 0.2°, lower TC by 1", needs: ["tyres", "electronics"] },
      { issue: "Running out of fuel", fix: `Add ~${fuel.per_lap.toFixed(1)} L per extra lap; use economy map and +1 TC`, needs: ["fuel_strategy", "electronics"] },
      { issue: "Instability over kerbs", fix: "Soften fast bump 1 click, increase bumpstop range 2 mm", needs: ["dampers", "suspension"] },
    ];
    return tips.filter((tip) => tip.needs.some((s) => enabled[s]));
  }

  const TRACK_AERO_BIAS = {
    low_downforce: { front_wing: -4, rear_wing: -6, ride_height_mm: 8 },
    high_speed: { front_wing: -2, rear_wing: -3, ride_height_mm: 4 },
    technical: { front_wing: 1, rear_wing: 0, ride_height_mm: -2 },
    elevation: { front_wing: 0, rear_wing: 1, ride_height_mm: 6 },
    endurance: { front_wing: 2, rear_wing: 2, ride_height_mm: 10 },
    bumpy: { front_wing: 1, rear_wing: 1, ride_height_mm: 12 },
    mixed: { front_wing: -1, rear_wing: -1, ride_height_mm: 3 },
  };

  const FUEL_L_PER_LAP = {
    road: 2.4,
    historic: 3.2,
    track_day: 2.8,
    tcr: 2.6,
    gt4: 2.5,
    gt3: 2.7,
    gt2: 2.8,
    formula: 2.2,
    prototype: 2.4,
  };

  const TRACK_FUEL_MULTIPLIER = {
    low_downforce: 0.92,
    high_speed: 1.08,
    technical: 1.0,
    elevation: 1.06,
    endurance: 1.04,
    bumpy: 1.02,
    mixed: 1.0,
  };

  const VALID_GOALS = new Set(["balanced_handling", "stable_entry", "rotation_exit"]);
  const VALID_PRIORITIES = new Set(["balanced", "handling", "fuel_efficiency"]);

  function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
  }

  function stintProfile(laps) {
    if (laps <= 5) return "sprint";
    if (laps <= 15) return "medium";
    return "endurance";
  }

  function computeFuelStrategy(car, track, laps, priority) {
    const category = car.category;
    let basePerLap = FUEL_L_PER_LAP[category] ?? 2.8;
    const profile = track.profile || "mixed";
    let mult = TRACK_FUEL_MULTIPLIER[profile] ?? 1.0;
    if (track.elevation === "high" || track.elevation === "very_high") mult *= 1.03;
    const lengthKm = Number(track.length_km ?? 5.0);
    if (lengthKm > 10) mult *= 1.05;

    let perLap = basePerLap * mult;
    const stint = stintProfile(laps);
    let safetyLaps;
    let tcOffset;
    let mapHint;

    if (priority === "fuel_efficiency") {
      safetyLaps = stint === "sprint" ? 0.5 : 1.0;
      tcOffset = 1;
      mapHint = "Economy / lower power map if available";
    } else if (priority === "handling") {
      safetyLaps = stint === "sprint" ? 0.25 : 0.75;
      tcOffset = -1;
      mapHint = "Race map — prioritize grip over consumption";
    } else {
      safetyLaps = stint === "sprint" ? 0.5 : 1.0;
      tcOffset = 0;
      mapHint = "Race map — balance pace and range";
    }

    let totalLitres = Math.round(perLap * (laps + safetyLaps) * 10) / 10;
    totalLitres = clamp(totalLitres, 5.0, 120.0);
    const distanceKm = Math.round(lengthKm * laps * 10) / 10;

    return {
      litres: totalLitres,
      per_lap: Math.round(perLap * 100) / 100,
      safety_laps: safetyLaps,
      stint,
      tc_offset: tcOffset,
      map_hint: mapHint,
      distance_km: distanceKm,
    };
  }

  function pressureDelta(track, stint, priority) {
    const profile = track.profile || "mixed";
    let delta = 0;
    if (profile === "high_speed" || profile === "low_downforce") delta -= 0.8;
    else if (profile === "technical" || profile === "bumpy" || profile === "endurance") delta += 0.4;
    if (track.elevation === "high" || track.elevation === "very_high") delta += 0.2;
    if (stint === "endurance") delta += 0.3;
    if (priority === "handling" && stint === "sprint") delta -= 0.2;
    return delta;
  }

  function categoryBase(category) {
    const bases = {
      road: { psi_fl: 32, psi_fr: 32, psi_rl: 30, psi_rr: 30, abs: 5, tc: 5 },
      historic: { psi_fl: 30, psi_fr: 30, psi_rl: 28, psi_rr: 28, abs: 3, tc: 0 },
      track_day: { psi_fl: 28, psi_fr: 28, psi_rl: 27, psi_rr: 27, abs: 4, tc: 3 },
      tcr: { psi_fl: 26, psi_fr: 26, psi_rl: 25, psi_rr: 25, abs: 6, tc: 4 },
      gt4: { psi_fl: 24, psi_fr: 24, psi_rl: 23, psi_rr: 23, abs: 7, tc: 5 },
      gt3: { psi_fl: 22, psi_fr: 22, psi_rl: 21, psi_rr: 21, abs: 8, tc: 6 },
      gt2: { psi_fl: 23, psi_fr: 23, psi_rl: 22, psi_rr: 22, abs: 8, tc: 6 },
      formula: { psi_fl: 21, psi_fr: 21, psi_rl: 20, psi_rr: 20, abs: 9, tc: 7 },
      prototype: { psi_fl: 20, psi_fr: 20, psi_rl: 19, psi_rr: 19, abs: 9, tc: 7 },
    };
    return { ...(bases[category] || bases.track_day) };
  }

  function trackRideHeight(track, category, stint) {
    const aero = TRACK_AERO_BIAS[track.profile || "mixed"] || TRACK_AERO_BIAS.mixed;
    let baseFront = ["gt3", "gt2", "gt4", "formula"].includes(category) ? 55 : 70;
    let baseRear = baseFront + 8;
    let bump = aero.ride_height_mm;
    if (track.kerbs === "aggressive") bump += 4;
    if (track.profile === "bumpy") bump += 6;
    if (stint === "endurance") bump += 3;
    return [baseFront + bump, baseRear + bump];
  }

  function balanceNotes(car, track, laps, fuel, priority) {
    const notes = [
      `Optimized for ${laps} lap${laps !== 1 ? "s" : ""} (~${fuel.distance_km} km) with ` +
        `${Math.round(fuel.litres)} L fuel (${fuel.per_lap.toFixed(2)} L/lap estimated).`,
    ];
    if (priority === "fuel_efficiency") {
      notes.push("Fuel-first: conservative TC/ABS and pressures tuned to limit tyre scrub and consumption.");
    } else if (priority === "handling") {
      notes.push("Grip-first: sharper rotation and platform control; accept slightly higher fuel use.");
    } else {
      notes.push("Balanced: neutral handling with fuel load matched to stint length.");
    }

    const profile = track.profile || "mixed";
    if (profile === "low_downforce") {
      notes.push("Low-drag aero trim for long straights; watch front grip in high-speed corners.");
    } else if (profile === "technical") {
      notes.push("Mechanical grip bias (camber/ARB) aids rotation through linked corners.");
    } else if (profile === "endurance") {
      notes.push("Compliance-focused dampers and ride height protect the platform on long stints.");
    } else if (profile === "bumpy") {
      notes.push("Softer fast bump and bumpstop range keep tyres planted over rough sections.");
    }

    if (fuel.stint === "endurance") {
      notes.push("Long stint: slightly higher pressures and TC help manage tyre degradation.");
    } else if (fuel.stint === "sprint") {
      notes.push("Short stint: lower fuel load improves rotation — re-check pressures after burn-off.");
    }

    if (car.category === "road") {
      notes.push("Road car: only in-game parameters are shown; focus on pressures and assists.");
    }

    return notes;
  }

  function balanceNotesWithStint(car, track, laps, fuel, priority, gameId, stintMode, stintMinutes) {
    const notes = balanceNotes(car, track, laps, fuel, priority);
    if (stintMode === "time" && stintMinutes != null) {
      notes.unshift(
        `Stint planned for ${stintMinutes} minutes (~${laps} laps at this track).`
      );
    }
    if (gameId === "gt7") {
      notes.push("GT7: apply values in Car Settings — only menus that exist for this car model are listed.");
    }
    return notes;
  }

  function appendAvailabilityNote(notes, category, sectionCount, paramCount) {
    notes.push(
      `${sectionCount} setup group${sectionCount !== 1 ? "s" : ""}, ${paramCount} parameter${paramCount !== 1 ? "s" : ""} — ` +
        `limited to what ${category.replace(/_/g, " ")} cars can adjust in-game.`
    );
    return notes;
  }

  function titleCaseGoal(goal) {
    return goal.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function estimateLapTimeSeconds(track) {
    if (track.lap_time_sec) return Number(track.lap_time_sec);
    const lengthKm = Number(track.length_km ?? 5);
    const speedKmh = {
      very_high: 215,
      high: 185,
      medium: 155,
      low: 125,
    }[track.avg_speed] || 160;
    return Math.round((lengthKm / speedKmh) * 3600);
  }

  function lapsFromStintMinutes(track, minutes) {
    const lapSec = estimateLapTimeSeconds(track);
    const laps = Math.round((minutes * 60) / lapSec);
    return Math.max(1, Math.min(200, laps));
  }

  function formatLapTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function generateSetup(carId, trackId, options = {}, registry) {
    const {
      goal = "balanced_handling",
      laps = 10,
      priority = "balanced",
      game_id: gameId = global.DEFAULT_GAME_ID,
      stint_mode: stintMode = "laps",
      stint_minutes: stintMinutes = null,
    } = options;

    const car = await registry.findCar(carId, gameId);
    const track = await registry.findTrack(trackId, gameId);
    if (!car || !track) throw new Error("Unknown car or track");
    if (!VALID_GOALS.has(goal)) {
      throw new Error(`Invalid goal. Choose from: ${[...VALID_GOALS].sort().join(", ")}`);
    }
    if (!VALID_PRIORITIES.has(priority)) {
      throw new Error(`Invalid priority. Choose from: ${[...VALID_PRIORITIES].sort().join(", ")}`);
    }

    const lapsInt = Math.floor(clamp(Number(laps), 1, 200));
    const stintMinutesInt =
      stintMode === "time" && stintMinutes != null
        ? Math.floor(clamp(Number(stintMinutes), 5, 240))
        : null;
    const lapTimeSec = estimateLapTimeSeconds(track);
    const category = car.category;
    const caps = CATEGORY_CAPS[category] || CATEGORY_CAPS.track_day;
    const base = categoryBase(category);
    const fuel = computeFuelStrategy(car, track, lapsInt, priority);
    const stint = fuel.stint;
    const pd = pressureDelta(track, stint, priority);
    const [frontRh, rearRh] = trackRideHeight(track, category, stint);
    const aeroBias = TRACK_AERO_BIAS[track.profile || "mixed"] || TRACK_AERO_BIAS.mixed;

    const isRace = ["gt3", "gt2", "gt4", "tcr", "formula", "prototype"].includes(category);
    let frontCamber = isRace ? -3.2 : -2.0;
    let rearCamber = isRace ? -2.0 : -1.5;
    if (track.profile === "technical") {
      frontCamber -= 0.3;
      rearCamber -= 0.2;
    }
    if (stint === "endurance") {
      frontCamber += 0.15;
      rearCamber += 0.1;
    }

    let frontToe;
    let rearToe;
    if (goal === "stable_entry") {
      frontToe = 0.02;
      rearToe = 0.15;
    } else if (goal === "rotation_exit") {
      frontToe = 0.08;
      rearToe = 0.08;
    } else {
      frontToe = 0.05;
      rearToe = 0.12;
    }

    const priorityLabels = {
      balanced: "Balanced",
      handling: "Maximum handling",
      fuel_efficiency: "Fuel efficiency",
    };

    let stintDisplay;
    if (stintMode === "time" && stintMinutesInt != null) {
      stintDisplay = `${stintMinutesInt} min (~${lapsInt} laps @ ${formatLapTime(lapTimeSec)}/lap)`;
    } else {
      stintDisplay = `${lapsInt} laps`;
    }

    const setup = {
      meta: {
        car: car.name,
        car_id: car.id,
        track: `${track.name} — ${track.layout}`,
        track_id: track.id,
        category,
        goal: titleCaseGoal(goal),
        priority: priorityLabels[priority],
        laps: lapsInt,
        stint_mode: stintMode,
        stint_minutes: stintMinutesInt,
        stint_display: stintDisplay,
        lap_time_sec: lapTimeSec,
        game: gameId === "gt7" ? "Gran Turismo 7" : gameId === "ac_evo" ? "Assetto Corsa Evo" : gameId,
        focus: "Handling + fuel strategy tuned to stint length and track profile",
        game_id: gameId,
      },
      fuel_summary: {
        litres: fuel.litres,
        per_lap: fuel.per_lap,
        distance_km: fuel.distance_km,
        stint: fuel.stint,
      },
      notes: balanceNotesWithStint(
        car,
        track,
        lapsInt,
        fuel,
        priority,
        gameId,
        stintMode,
        stintMinutesInt
      ),
      sections: {},
    };

    const tc = Math.floor(clamp(base.tc + fuel.tc_offset, 0, 12));
    let absLevel = base.abs;
    if (priority === "fuel_efficiency") absLevel = Math.floor(clamp(absLevel + 1, 0, 12));
    const compound =
      stint === "endurance" && isRace ? "Slick Medium" : isRace ? "Slick Soft" : "Street Sport";
    let arbFront = track.profile === "technical" ? 6 : 5;
    let arbRear = track.profile === "high_speed" ? 4 : 5;
    if (stint === "endurance") {
      arbFront -= 1;
      arbRear -= 1;
    }
    let bumpScale = track.profile === "bumpy" || track.profile === "endurance" ? 1.15 : 1.0;
    if (stint === "endurance") bumpScale *= 1.05;
    let fw = clamp(8 + aeroBias.front_wing, 0, 12);
    let rw = clamp(10 + aeroBias.rear_wing, 0, 15);
    if (priority === "fuel_efficiency" && track.profile !== "technical") {
      fw = Math.max(0, fw - 1);
      rw = Math.max(0, rw - 2);
    }
    let brakeBias = 58.0;
    if (goal === "stable_entry") brakeBias = 59.0;
    else if (goal === "rotation_exit") brakeBias = 57.0;

    if (caps.tyres) {
      addSection(setup, "tyres", "Tyres", [
        { key: "psi_fl", label: "Front Left Pressure", value: `${(base.psi_fl + pd).toFixed(1)} psi`, hint: "Target green centre temps after 3–4 laps" },
        { key: "psi_fr", label: "Front Right Pressure", value: `${(base.psi_fr + pd).toFixed(1)} psi`, hint: "Match opposite front for balance" },
        { key: "psi_rl", label: "Rear Left Pressure", value: `${(base.psi_rl + pd).toFixed(1)} psi`, hint: "Slightly lower than front for rotation" },
        { key: "psi_rr", label: "Rear Right Pressure", value: `${(base.psi_rr + pd).toFixed(1)} psi`, hint: "Re-check after fuel burn and suspension changes" },
        { key: "front_camber", label: "Front Camber", value: `${frontCamber.toFixed(1)}°`, hint: "More negative = mid-corner grip, less straight-line traction" },
        { key: "rear_camber", label: "Rear Camber", value: `${rearCamber.toFixed(1)}°`, hint: "Keep rear less aggressive than front" },
        { key: "front_toe", label: "Front Toe", value: `${frontToe.toFixed(2)}° out`, hint: "Light toe-out sharpens turn-in" },
        { key: "rear_toe", label: "Rear Toe", value: `${rearToe.toFixed(2)}° in`, hint: "Toe-in stabilizes the rear under braking" },
      ], paramsForCategory(category, "tyres"));
    }

    if (caps.electronics) {
      addSection(setup, "electronics", "Electronics", [
        { key: "abs", label: "ABS", value: String(absLevel), hint: "Higher = more stability under threshold braking" },
        { key: "tc", label: "Traction Control", value: String(tc), hint: "Higher TC saves fuel; lower TC for maximum drive" },
        { key: "engine_map", label: "Engine Map", value: fuel.map_hint, hint: "Match map to stint length and fuel target" },
      ], paramsForCategory(category, "electronics"));
    }

    if (caps.fuel) {
      addSection(setup, "fuel_strategy", "Fuel & Strategy", [
        { key: "fuel_load", label: "Fuel Load", value: `${Math.round(fuel.litres)} L`, hint: `~${fuel.per_lap.toFixed(2)} L/lap × ${lapsInt} laps + ${fuel.safety_laps.toFixed(1)} lap reserve` },
        { key: "target_laps", label: "Target Laps", value: String(lapsInt), hint: `Stint type: ${stint.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}` },
        { key: "compound", label: "Tyre Compound", value: compound, hint: "Medium often better for long stints; soft for qualifying sprint" },
        { key: "brake_pad", label: "Brake Pad Compound", value: isRace ? "Racing" : "Sport", hint: "Racing pads for repeated heavy braking zones" },
      ], paramsForCategory(category, "fuel_strategy"));
    }

    if (caps.suspension) {
      addSection(setup, "suspension", "Suspension", [
        { key: "front_rh", label: "Front Ride Height", value: `${frontRh} mm`, hint: "Lower = downforce; raise if bottoming on kerbs" },
        { key: "rear_rh", label: "Rear Ride Height", value: `${rearRh} mm`, hint: "Keep rear higher than front for stability" },
        { key: "front_arb", label: "Front Anti-Roll Bar", value: `${arbFront} / 10`, hint: "Stiffer front = more understeer on entry" },
        { key: "rear_arb", label: "Rear Anti-Roll Bar", value: `${arbRear} / 10`, hint: "Softer rear helps rotation on exit" },
        { key: "front_bumpstop", label: "Front Bumpstop Rate", value: "Medium-Stiff", hint: "Stiffer front reduces dive under braking" },
        { key: "rear_bumpstop", label: "Rear Bumpstop Rate", value: "Medium", hint: "Softer rear absorbs traction squat" },
        { key: "bumpstop_range", label: "Bumpstop Range (F/R)", value: "42 mm / 48 mm", hint: "More range on bumpy tracks" },
        { key: "steering_ratio", label: "Steering Ratio", value: isRace ? "12:1" : "14:1", hint: "Quicker ratio for tight circuits" },
      ], paramsForCategory(category, "suspension"));
    }

    if (caps.dampers) {
      addSection(setup, "dampers", "Dampers", [
        { key: "f_slow_bump", label: "Front Slow Bump", value: String(Math.floor(5 * bumpScale)), hint: "Controls pitch under braking" },
        { key: "f_slow_rebound", label: "Front Slow Rebound", value: "6", hint: "Higher slows front lift on throttle" },
        { key: "f_fast_bump", label: "Front Fast Bump", value: track.kerbs === "aggressive" ? "4" : "5", hint: "Softer absorbs kerb strikes" },
        { key: "f_fast_rebound", label: "Front Fast Rebound", value: "5", hint: "Lets suspension recover after kerbs" },
        { key: "r_slow_bump", label: "Rear Slow Bump", value: String(Math.floor(4 * bumpScale)), hint: "Softer rear improves traction on exit" },
        { key: "r_slow_rebound", label: "Rear Slow Rebound", value: "5", hint: "Controls rear lift under braking" },
        { key: "r_fast_bump", label: "Rear Fast Bump", value: "4", hint: "Match front for platform stability" },
        { key: "r_fast_rebound", label: "Rear Fast Rebound", value: "5", hint: "Balance with slow rebound for rotation" },
      ], paramsForCategory(category, "dampers"));
    }

    if (caps.aero) {
      addSection(setup, "aerodynamics", "Aerodynamics", [
        { key: "front_wing", label: "Front Wing", value: String(Math.floor(fw)), hint: "More front wing reduces understeer in high-speed corners" },
        { key: "rear_wing", label: "Rear Wing", value: String(Math.floor(rw)), hint: "Lower rear wing saves fuel on straights" },
        { key: "front_splitter", label: "Front Splitter", value: ["gt3", "gt2", "prototype"].includes(category) ? "Medium" : "Fixed", hint: "Increase on high-downforce tracks" },
        { key: "rear_diffuser", label: "Rear Diffuser / Gurney", value: "Standard +1", hint: "Fine-tune if rear feels light at speed" },
      ], paramsForCategory(category, "aerodynamics"));
    }

    if (caps.brakes) {
      addSection(setup, "brakes", "Brakes & Differential", [
        { key: "brake_bias", label: "Brake Bias", value: `${brakeBias.toFixed(1)}% front`, hint: "Rearward if front locks; forward if rear steps out under braking" },
        { key: "brake_pressure", label: "Brake Pressure", value: "95%", hint: "Full pressure for race cars; reduce if ABS triggers too early" },
        { key: "diff_preload", label: "Preload / Diff", value: isRace ? "120 Nm" : "Open", hint: "Higher preload stabilizes throttle-on; can add understeer" },
      ], paramsForCategory(category, "brakes"));
    }

    setup.meta.available_sections = Object.values(setup.sections).map((s) => s.title);
    setup.meta.param_count = Object.values(setup.sections).reduce((n, s) => n + s.values.length, 0);
    setup.tuning_tips = buildTuningTips(caps, fuel);
    setup.notes = appendAvailabilityNote(
      setup.notes,
      category,
      setup.meta.available_sections.length,
      setup.meta.param_count
    );

    return setup;
  }

  global.generateSetup = generateSetup;
  global.estimateLapTimeSeconds = estimateLapTimeSeconds;
  global.lapsFromStintMinutes = lapsFromStintMinutes;
  global.formatLapTime = formatLapTime;
})(window);
