const carSelect = document.getElementById("car");
const trackSelect = document.getElementById("track");
const lapsRange = document.getElementById("laps");
const lapsExact = document.getElementById("laps-exact");
const lapsValue = document.getElementById("laps-value");
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

const GAME_ID = "ac_evo";
let lastSetup = null;

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

function syncLaps(fromExact) {
  let n = fromExact ? parseInt(lapsExact.value, 10) : parseInt(lapsRange.value, 10);
  if (Number.isNaN(n)) n = 10;
  n = Math.min(200, Math.max(1, n));
  lapsRange.value = Math.min(60, n);
  lapsExact.value = n;
  lapsValue.textContent = String(n);
}

lapsRange.addEventListener("input", () => {
  lapsExact.value = lapsRange.value;
  syncLaps(false);
});

lapsExact.addEventListener("change", () => syncLaps(true));

async function loadCatalog() {
  const [carsRes, tracksRes, gamesRes] = await Promise.all([
    fetch(`/api/cars?game_id=${GAME_ID}`),
    fetch(`/api/tracks?game_id=${GAME_ID}`),
    fetch("/api/games"),
  ]);
  const cars = await carsRes.json();
  const tracks = await tracksRes.json();
  const games = await gamesRes.json();
  const game = games.find((g) => g.id === GAME_ID);
  if (game) {
    const badge = document.getElementById("game-badge");
    if (badge) badge.textContent = game.name;
  }

  for (const { key, items } of groupOptions(cars, "brand")) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = key;
    for (const car of items) {
      const opt = document.createElement("option");
      opt.value = car.id;
      opt.textContent = car.name;
      optgroup.appendChild(opt);
    }
    carSelect.appendChild(optgroup);
  }

  for (const { key, items } of groupOptions(tracks, "country")) {
    const optgroup = document.createElement("optgroup");
    optgroup.label = key;
    for (const track of items) {
      const opt = document.createElement("option");
      opt.value = track.id;
      const layout = track.layout !== "Grand Prix" ? ` (${track.layout})` : "";
      opt.textContent = `${track.name}${layout}`;
      optgroup.appendChild(opt);
    }
    trackSelect.appendChild(optgroup);
  }
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
    meta.track,
    `${meta.laps} laps`,
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
    `Track: ${setup.meta.track}`,
    `Laps: ${setup.meta.laps} · ${setup.meta.priority} · ${setup.meta.goal}`,
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

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setLoading(true);

  const payload = {
    car_id: carSelect.value,
    track_id: trackSelect.value,
    goal: document.getElementById("goal").value,
    priority: document.getElementById("priority").value,
    laps: parseInt(lapsExact.value, 10) || 10,
    game_id: GAME_ID,
  };

  try {
    const res = await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to generate setup");
    renderSetup(data);
  } catch (err) {
    showToast(err.message);
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

syncLaps(false);
loadCatalog().catch(() => showToast("Could not load cars and tracks"));
