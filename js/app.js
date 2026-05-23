const gameSelect = document.getElementById("game");
const carSelect = document.getElementById("car");
const trackSelect = document.getElementById("track");
const lapsRange = document.getElementById("laps");
const lapsValue = document.getElementById("laps-value");
const stintMinutesInput = document.getElementById("stint-minutes");
const stintMinutesPreset = document.getElementById("stint-minutes-preset");
const stintMinutesSlider = document.getElementById("stint-minutes-slider");
const stintLapsPanel = document.getElementById("stint-laps-panel");
const stintTimePanel = document.getElementById("stint-time-panel");
const timeLapsEstimate = document.getElementById("time-laps-estimate");
const stintModeBtns = document.querySelectorAll(".stint-mode-btn");
const form = document.getElementById("setup-form");
const results = document.getElementById("results");
const resultsTitle = document.getElementById("results-title");
const resultsMeta = document.getElementById("results-meta");
const notesList = document.getElementById("notes-list");
const setupAvailability = document.getElementById("setup-availability");
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

const SECTION_ORDER = [
  "tyres",
  "electronics",
  "fuel_strategy",
  "suspension",
  "dampers",
  "aerodynamics",
  "brakes",
];

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

function getStintMinutes() {
  return Math.min(240, Math.max(5, parseInt(stintMinutesInput.value, 10) || 30));
}

function setStintMinutes(minutes) {
  const m = Math.min(240, Math.max(5, minutes));
  stintMinutesInput.value = m;
  stintMinutesSlider.value = Math.min(120, m);
  const presetMatch = [...stintMinutesPreset.options].find(
    (o) => o.value !== "custom" && parseInt(o.value, 10) === m
  );
  stintMinutesPreset.value = presetMatch ? String(m) : "custom";
  updateTimeLapEstimate();
}

function syncStintMinutesFromInput() {
  setStintMinutes(getStintMinutes());
}

function syncStintMinutesFromSlider() {
  setStintMinutes(parseInt(stintMinutesSlider.value, 10) || 30);
}

async function updateTimeLapEstimate() {
  const trackId = trackSelect.value;
  const minutes = getStintMinutes();
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
  stintLapsPanel.classList.toggle("is-hidden", !isLaps);
  stintTimePanel.classList.toggle("is-hidden", isLaps);
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
  return lapsFromStintMinutes(track, getStintMinutes());
}

function setLoading(loading) {
  generateBtn.disabled = loading;
  btnSpinner.hidden = !loading;
  btnLabel.textContent = loading ? "Generating…" : "Generate setup";
}

function renderParamRows(section) {
  const frag = document.createDocumentFragment();
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
    frag.appendChild(block);
  }
  return frag;
}

function activateSetupTab(tabKey) {
  sectionsContainer.querySelectorAll(".setup-tab").forEach((tab) => {
    const active = tab.dataset.tab === tabKey;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
  sectionsContainer.querySelectorAll(".setup-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tabKey);
  });
}

function renderSetupTabs(setup) {
  const available = SECTION_ORDER.filter((key) => setup.sections[key]);
  sectionsContainer.innerHTML = "";

  if (!available.length) return;

  const tabsRoot = document.createElement("div");
  tabsRoot.className = "setup-tabs";

  const tabList = document.createElement("div");
  tabList.className = "setup-tabs-list";
  tabList.setAttribute("role", "tablist");

  const panelsWrap = document.createElement("div");
  panelsWrap.className = "setup-tabs-panels";

  available.forEach((key, index) => {
    const section = setup.sections[key];

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `setup-tab${index === 0 ? " active" : ""}`;
    tab.dataset.tab = key;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", index === 0 ? "true" : "false");
    tab.setAttribute("aria-controls", `tab-panel-${key}`);
    tab.textContent = section.title;
    tab.addEventListener("click", () => activateSetupTab(key));

    const panel = document.createElement("div");
    panel.className = `setup-tab-panel${index === 0 ? " active" : ""}`;
    panel.id = `tab-panel-${key}`;
    panel.dataset.tab = key;
    panel.setAttribute("role", "tabpanel");
    panel.appendChild(renderParamRows(section));

    tabList.appendChild(tab);
    panelsWrap.appendChild(panel);
  });

  tabsRoot.appendChild(tabList);
  tabsRoot.appendChild(panelsWrap);
  sectionsContainer.appendChild(tabsRoot);
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

  if (meta.available_sections?.length) {
    setupAvailability.hidden = false;
    setupAvailability.textContent =
      `${meta.param_count} adjustable parameters across ${meta.available_sections.join(", ")} — ` +
      "only values this car class can change in-game.";
  } else {
    setupAvailability.hidden = true;
  }

  notesList.innerHTML = "";
  for (const note of setup.notes || []) {
    const li = document.createElement("li");
    li.textContent = note;
    notesList.appendChild(li);
  }

  renderSetupTabs(setup);

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
stintMinutesInput.addEventListener("change", syncStintMinutesFromInput);
stintMinutesInput.addEventListener("input", syncStintMinutesFromInput);
stintMinutesSlider.addEventListener("input", syncStintMinutesFromSlider);
stintMinutesPreset.addEventListener("change", () => {
  if (stintMinutesPreset.value === "custom") {
    stintMinutesInput.focus();
    return;
  }
  setStintMinutes(parseInt(stintMinutesPreset.value, 10));
});
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
        stint_minutes: stintMode === "time" ? getStintMinutes() : null,
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
setStintMinutes(30);
setStintMode("laps");
loadGames().catch(() => showToast("Could not load games"));
