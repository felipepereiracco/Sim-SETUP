const gameSelect = document.getElementById("game");
const carSelect = document.getElementById("car");
const trackSelect = document.getElementById("track");
const lapsRange = document.getElementById("laps");
const lapsValue = document.getElementById("laps-value");
const stintMinutesRange = document.getElementById("stint-minutes");
const timeValue = document.getElementById("time-value");
const stintLapsPanel = document.getElementById("stint-laps-panel");
const stintTimePanel = document.getElementById("stint-time-panel");
const timeLapsEstimate = document.getElementById("time-laps-estimate");
const stintModeBtns = document.querySelectorAll(".stint-mode-btn");
const form = document.getElementById("setup-form");
const results = document.getElementById("results");
const resultsTitle = document.getElementById("results-title");
const resultsMeta = document.getElementById("results-meta");
const notesList = document.getElementById("notes-list");
const sectionsContainer = document.getElementById("sections-container");
const tipsContainer = document.getElementById("tips-container");
const generateBtn = document.getElementById("generate-btn");
const btnLabel = generateBtn.querySelector(".btn-label");
const btnSpinner = generateBtn.querySelector(".btn-spinner");
const copyBtn = document.getElementById("copy-btn");
const fuelBanner = document.getElementById("fuel-banner");
const fuelLitres = document.getElementById("fuel-litres");
const fuelPerLap = document.getElementById("fuel-per-lap");
const fuelDistance = document.getElementById("fuel-distance");
const gameBadge = document.getElementById("game-badge");

let lastSetup = null;
let registry = null;
let stintMode = "laps";
let tracksCache = [];

function currentGameId() {
  return gameSelect.value || DEFAULT_GAME_ID;
}

function groupOptions(items, keyField) {
  const groups = {};
  for (const item of items) {
    const key = item[keyField] || "Other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.keys(groups)
    .sort()
    .map((key) => ({ key, items: groups[key] }));
}

function resetSelect(select, placeholder) {
  select.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = placeholder;
  select.appendChild(opt);
}

function fillGroupedSelect(select, items, groupKey, formatItem) {
  for (const { key, items: groupItems } of groupOptions(items, groupKey)) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = key;
    for (const item of groupItems) {
      const opt = document.createElement("option");
      opt.value = item.id;
      opt.textContent = formatItem(item);
      optgroup.appendChild(opt);
    }
    select.appendChild(optgroup);
  }
}

function syncLapsDisplay() {
  const n = Math.min(100, Math.max(1, parseInt(lapsRange.value, 10) || 10));
  lapsRange.value = n;
  lapsValue.textContent = String(n);
}

function syncTimeDisplay() {
  const m = Math.min(120, Math.max(5, parseInt(stintMinutesRange.value, 10) || 30));
  stintMinutesRange.value = m;
  timeValue.textContent = String(m);
  updateTimeLapEstimate();
}

async function updateTimeLapEstimate() {
  const trackId = trackSelect.value;
  const minutes = parseInt(stintMinutesRange.value, 10) || 30;
  if (!trackId) {
    timeLapsEstimate.textContent = "≈ — laps (select a track)";
    return;
  }
  const track = tracksCache.find((t) => t.id === trackId);
  if (!track) {
    timeLapsEstimate.textContent = "≈ — laps";
    return;
  }
  const laps = lapsFromStintMinutes(track, minutes);
  const lapSec = estimateLapTimeSeconds(track);
  timeLapsEstimate.textContent = `≈ ${laps} laps (${formatLapTime(lapSec)} per lap)`;
}

function setStintMode(mode) {
  stintMode = mode;
  stintModeBtns.forEach((btn) => {
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const isLaps = mode === "laps";
  stintLapsPanel.hidden = !isLaps;
  stintTimePanel.hidden = isLaps;
  if (!isLaps) updateTimeLapEstimate();
}

async function loadGames() {
  registry = await createDataRegistry("data");
  const games = registry.listGames();
  gameSelect.innerHTML = "";
  for (const game of games) {
    const opt = document.createElement("option");
    opt.value = game.id;
    opt.textContent = `${game.name}${game.version_label ? ` (${game.version_label})` : ""}`;
    gameSelect.appendChild(opt);
  }
  if (games.length) {
    gameSelect.value = games[0].id;
    await loadCatalogForGame(games[0].id);
  }
}

async function loadCatalogForGame(gameId) {
  if (!registry) return;
  registry.clearCache();

  resetSelect(carSelect, "Choose a car…");
  resetSelect(trackSelect, "Choose a track…");

  const [cars, tracks, games] = await Promise.all([
    registry.getCars(gameId),
    registry.getTracks(gameId),
    Promise.resolve(registry.listGames()),
  ]);

  tracksCache = tracks;

  const game = games.find((g) => g.id === gameId);
  if (game) {
    gameBadge.textContent = game.short_name || game.name;
  }

  fillGroupedSelect(carSelect, cars, "brand", (car) => car.name);
  fillGroupedSelect(trackSelect, tracks, "country", (track) => {
    const layout = track.layout !== "Grand Prix" ? ` (${track.layout})` : "";
    return `${track.name}${layout}`;
  });

  carSelect.disabled = false;
  trackSelect.disabled = false;
  results.hidden = true;
  updateTimeLapEstimate();
}

async function resolveStintLaps() {
  if (stintMode === "laps") {
    return parseInt(lapsRange.value, 10) || 10;
  }
  const trackId = trackSelect.value;
  if (!trackId) throw new Error("Select a track for time-based stint");
  const track = tracksCache.find((t) => t.id === trackId) || (await registry.findTrack(trackId, currentGameId()));
  if (!track) throw new Error("Unknown track");
  return lapsFromStintMinutes(track, parseInt(stintMinutesRange.value, 10) || 30);
}

function setLoading(loading) {
  generateBtn.disabled = loading;
  btnSpinner.hidden = !loading;
  btnLabel.textContent = loading ? "Generating…" : "Generate setup";
}

function renderSection(key, section) {
  const card = document.createElement("article");
  card.className = "section-card";
  if (key === "dampers" || key === "brakes") {
    card.classList.add("span-full");
  }

  const heading = document.createElement("h3");
  heading.textContent = section.title;
  card.appendChild(heading);

  for (const row of section.values) {
    const block = document.createElement("div");
    block.className = "param-row";

    const left = document.createElement("div");
    left.className = "param-block";
    const label = document.createElement("div");
    label.className = "param-label";
    label.textContent = row.label;
    left.appendChild(label);
    if (row.hint) {
      const hint = document.createElement("div");
      hint.className = "param-hint";
      hint.textContent = row.hint;
      left.appendChild(hint);
    }

    const value = document.createElement("div");
    value.className = "param-value";
    value.textContent = row.value;

    block.appendChild(left);
    block.appendChild(value);
    card.appendChild(block);
  }

  return card;
}

function showToast(message) {
  let toast = document.querySelector(".toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 2200);
}

function renderSetup(setup) {
  lastSetup = setup;
  const { meta, fuel_summary: fuel } = setup;

  resultsTitle.textContent = meta.car;
  resultsMeta.textContent = [
    meta.game,
    meta.track,
    meta.stint_display || `${meta.laps} laps`,
    meta.priority,
    meta.goal,
  ].join(" · ");

  if (fuel) {
    fuelBanner.hidden = false;
    fuelLitres.textContent = `${fuel.litres} L`;
    fuelPerLap.textContent = `${fuel.per_lap} L`;
    fuelDistance.textContent = `${fuel.distance_km} km`;
  } else {
    fuelBanner.hidden = true;
  }

  notesList.innerHTML = "";
  for (const note of setup.notes || []) {
    const li = document.createElement("li");
    li.textContent = note;
    notesList.appendChild(li);
  }

  sectionsContainer.innerHTML = "";
  const order = [
    "tyres",
    "electronics",
    "fuel_strategy",
    "suspension",
    "dampers",
    "aerodynamics",
    "brakes",
  ];
  for (const key of order) {
    const section = setup.sections[key];
    if (section) {
      sectionsContainer.appendChild(renderSection(key, section));
    }
  }

  tipsContainer.innerHTML = "";
  for (const tip of setup.tuning_tips || []) {
    const item = document.createElement("div");
    item.className = "tip-item";
    item.innerHTML = `<div class="tip-issue">${tip.issue}</div><p class="tip-fix">${tip.fix}</p>`;
    tipsContainer.appendChild(item);
  }

  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setupToPlainText(setup) {
  const lines = [
    `ACE Setup — ${setup.meta.car}`,
    `Game: ${setup.meta.game}`,
    `Track: ${setup.meta.track}`,
    `Stint: ${setup.meta.stint_display || setup.meta.laps + " laps"} · ${setup.meta.priority} · ${setup.meta.goal}`,
    "",
  ];
  if (setup.fuel_summary) {
    const f = setup.fuel_summary;
    lines.push(`Fuel: ${f.litres} L (~${f.per_lap} L/lap, ${f.distance_km} km)`);
    lines.push("");
  }
  for (const section of Object.values(setup.sections)) {
    lines.push(`[${section.title}]`);
    for (const row of section.values) {
      lines.push(`  ${row.label}: ${row.value}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

stintModeBtns.forEach((btn) => {
  btn.addEventListener("click", () => setStintMode(btn.dataset.mode));
});

lapsRange.addEventListener("input", syncLapsDisplay);
stintMinutesRange.addEventListener("input", syncTimeDisplay);
trackSelect.addEventListener("change", updateTimeLapEstimate);

gameSelect.addEventListener("change", () => {
  loadCatalogForGame(gameSelect.value).catch(() => showToast("Could not load game data"));
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!registry) {
    showToast("Data not loaded yet");
    return;
  }

  const carId = carSelect.value;
  const trackId = trackSelect.value;
  if (!carId || !trackId) {
    showToast("Choose a car and track");
    return;
  }

  setLoading(true);

  try {
    const laps = await resolveStintLaps();
    const setup = await generateSetup(
      carId,
      trackId,
      {
        goal: document.getElementById("goal").value,
        priority: document.getElementById("priority").value,
        laps,
        game_id: currentGameId(),
        stint_mode: stintMode,
        stint_minutes: stintMode === "time" ? parseInt(stintMinutesRange.value, 10) : null,
      },
      registry
    );
    renderSetup(setup);
  } catch (err) {
    showToast(err.message || "Failed to generate setup");
  } finally {
    setLoading(false);
  }
});

copyBtn.addEventListener("click", async () => {
  if (!lastSetup) return;
  try {
    await navigator.clipboard.writeText(setupToPlainText(lastSetup));
    showToast("Setup copied to clipboard");
  } catch {
    showToast("Could not copy — select text manually");
  }
});

syncLapsDisplay();
syncTimeDisplay();
setStintMode("laps");
loadGames().catch(() => showToast("Could not load games"));
