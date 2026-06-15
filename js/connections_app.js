// connections_app.js

const RULES_MANIFEST = "rules/manifest.json";
const GRID_COLS = 4;
const GRID_ROWS = 4;
const MAX_PUZZLE_ATTEMPTS = 20000;
// Each inner array is a group of rule-name prefixes that should never be
// chosen together more than once on the same board (i.e. at most one rule
// from a given group may appear in a puzzle at a time). Add or remove
// groups/prefixes here freely -- the puzzle generator below scales to
// however many groups are listed.
const EXCLUSIVE_RULE_GROUPS = [
  ["regions/", "types/"],
  ["colors/", "egg_groups/", "growth_rates/", "shapes/"],
  ["moves/"],
];

const SOLVED_CLASS_COUNT = 4; // solved-0 .. solved-3
const RULE_CATEGORY_ORDER = [
  "types",
  "abilities",
  "moves",
  "colors",
  "shapes",
  "egg_groups",
  "growth_rates",
  "regions",
  "evolution",
  "stats",
  "misc",
];
const RULE_CATEGORY_LABELS = {
  types: "Types",
  abilities: "Abilities",
  moves: "Moves",
  colors: "Colors",
  shapes: "Shapes",
  egg_groups: "Egg Groups",
  growth_rates: "Growth Rates",
  regions: "Regions",
  evolution: "Evolution",
  stats: "Stats",
  misc: "Misc",
};
// ---------- helpers ----------

function prettyName(name) {
  return name
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function prettyRuleName(rule) {
  return rule
    .split("/")
    .filter((p) => p.length)
    .map(prettyName)
    .join(" / ");
}

function ruleCategory(ruleName) {
  return ruleName.split("/")[0] || "misc";
}

function prettyCategoryName(category) {
  return RULE_CATEGORY_LABELS[category] || prettyName(category);
}

function prettyRuleValue(ruleName) {
  const parts = ruleName.split("/").filter((p) => p.length);
  return prettyName(parts.slice(1).join(" / ") || ruleName);
}

function compareRuleCategories(a, b) {
  const idxA = RULE_CATEGORY_ORDER.indexOf(a);
  const idxB = RULE_CATEGORY_ORDER.indexOf(b);
  const rankA = idxA === -1 ? RULE_CATEGORY_ORDER.length : idxA;
  const rankB = idxB === -1 ? RULE_CATEGORY_ORDER.length : idxB;
  if (rankA !== rankB) return rankA - rankB;
  return prettyCategoryName(a).localeCompare(prettyCategoryName(b));
}

// Returns the index of the EXCLUSIVE_RULE_GROUPS entry that ruleName belongs
// to, or -1 if it isn't part of any exclusivity group (i.e. it's a "normal"
// rule).
function exclusiveGroupIndex(ruleName) {
  for (let i = 0; i < EXCLUSIVE_RULE_GROUPS.length; i++) {
    if (EXCLUSIVE_RULE_GROUPS[i].some((p) => ruleName.startsWith(p))) {
      return i;
    }
  }
  return -1;
}

function isNormalRule(ruleName) {
  return exclusiveGroupIndex(ruleName) === -1;
}

function apiName(monName) {
  return monName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/'/g, "")
    .replace(/\./g, "");
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function sample(arr, k) {
  return shuffle(arr).slice(0, k);
}

function choice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function setToFrozenKey(set) {
  return Array.from(set).sort().join("|");
}

// ---------- rule loading ----------

async function loadRules() {
  const manifestResp = await fetch(RULES_MANIFEST);
  if (!manifestResp.ok) {
    throw new Error(`Could not load ${RULES_MANIFEST}`);
  }
  const ruleNames = await manifestResp.json();

  const rules = {};
  for (const ruleName of ruleNames) {
    const path = `rules/${ruleName}.txt`;
    const resp = await fetch(path);
    if (!resp.ok) {
      console.warn(`Could not load rule file: ${path}`);
      continue;
    }
    const text = await resp.text();
    const mons = new Set(
      text
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line.length > 0)
    );
    if (mons.size > 0) {
      rules[ruleName] = mons;
    }
  }

  if (Object.keys(rules).length < 4) {
    throw new Error("Need at least 4 rule files with Pokémon in them.");
  }
  return rules;
}

function buildMembershipIndex(rules) {
  const membership = {};
  for (const [ruleName, mons] of Object.entries(rules)) {
    for (const mon of mons) {
      if (!membership[mon]) membership[mon] = new Set();
      membership[mon].add(ruleName);
    }
  }
  return membership;
}

// ---------- puzzle generation ----------

function generatePuzzle(rules) {
  const membership = buildMembershipIndex(rules);

  const allRules = Object.keys(rules).filter((r) => rules[r].size >= 4);
  if (allRules.length < 4) {
    throw new Error("Need at least 4 rule files with Pokémon in them.");
  }

  const groupRules = EXCLUSIVE_RULE_GROUPS.map((_, idx) =>
    allRules.filter((r) => exclusiveGroupIndex(r) === idx)
  );
  const normalRules = allRules.filter(isNormalRule);

  // A "mode" is the set of exclusivity-group indices that will contribute
  // one rule each to this puzzle; the remaining categories come from
  // normalRules. Every non-empty group can contribute at most one rule
  // (enforced again in boardIsValid), and we need enough normal rules to
  // fill out the rest of the board.
  const CATEGORIES_PER_PUZZLE = 4;
  const possibleModes = [];
  const numGroups = EXCLUSIVE_RULE_GROUPS.length;

  for (let mask = 0; mask < 1 << numGroups; mask++) {
    const groupIndices = [];
    let usable = true;
    for (let i = 0; i < numGroups; i++) {
      if (mask & (1 << i)) {
        if (groupRules[i].length === 0) {
          usable = false;
          break;
        }
        groupIndices.push(i);
      }
    }
    if (!usable) continue;
    if (groupIndices.length > CATEGORIES_PER_PUZZLE) continue;
    if (normalRules.length < CATEGORIES_PER_PUZZLE - groupIndices.length) continue;

    possibleModes.push(groupIndices);
  }

  if (possibleModes.length === 0) {
    const groupDescriptions = EXCLUSIVE_RULE_GROUPS.map((g) => g.join("/")).join("; ");
    throw new Error(
      `Need at least ${CATEGORIES_PER_PUZZLE} normal rules, or fewer normal rules ` +
        "plus one rule each from one or more of the mutually-exclusive groups " +
        `(${groupDescriptions}), as long as the total reaches ${CATEGORIES_PER_PUZZLE}.`
    );
  }

  const eligibleRuleSet = new Set(allRules);

  function specificity(mon) {
    const memberRules = membership[mon];
    if (!memberRules) return 0;
    let count = 0;
    for (const r of memberRules) {
      if (eligibleRuleSet.has(r)) count++;
    }
    return count;
  }

  function pickGroup(ruleName, used) {
    let pool = Array.from(rules[ruleName]).filter((mon) => !used.has(mon));
    if (pool.length < 4) return null;

    pool = shuffle(pool);
    pool.sort((a, b) => specificity(a) - specificity(b));

    const biasWindow = Math.max(4, Math.floor((pool.length * 2) / 3));
    const primary = pool.slice(0, biasWindow);

    if (primary.length >= 4) {
      return sample(primary, 4);
    }
    return sample(pool, 4);
  }

  function boardIsValid(used, chosenRules) {
    const counts = {};
    for (const mon of used) {
      const memberRules = membership[mon];
      if (!memberRules) continue;
      for (const rn of memberRules) {
        counts[rn] = (counts[rn] || 0) + 1;
      }
    }

    for (let i = 0; i < EXCLUSIVE_RULE_GROUPS.length; i++) {
      const countInGroup = Array.from(chosenRules).filter(
        (rn) => exclusiveGroupIndex(rn) === i
      ).length;
      if (countInGroup > 1) return false;
    }

    for (const rn of chosenRules) {
      if ((counts[rn] || 0) !== 4) return false;
    }

    for (const [rn, c] of Object.entries(counts)) {
      if (!chosenRules.has(rn) && c === 4) return false;
    }

    return true;
  }

  for (let attempt = 0; attempt < MAX_PUZZLE_ATTEMPTS; attempt++) {
    const mode = choice(possibleModes);

    let chosenRulesList = [];
    for (const groupIdx of mode) {
      chosenRulesList.push(choice(groupRules[groupIdx]));
    }
    chosenRulesList.push(...sample(normalRules, CATEGORIES_PER_PUZZLE - chosenRulesList.length));
    chosenRulesList = shuffle(chosenRulesList);

    const used = new Set();
    const groups = [];
    let ok = true;

    for (const rn of chosenRulesList) {
      const group = pickGroup(rn, used);
      if (group === null) {
        ok = false;
        break;
      }
      groups.push([rn, group]);
      for (const mon of group) used.add(mon);
    }

    if (!ok) continue;

    if (!boardIsValid(used, new Set(chosenRulesList))) continue;

    let tileOrder = groups.flatMap(([, grp]) => grp);
    tileOrder = shuffle(tileOrder);

    return { groups, tileOrder };
  }

  throw new Error(
    "Could not generate a valid board after many attempts. The rule files may be " +
      "too overlapping or too restrictive -- try adding more rule files, or rules " +
      "with less overlap with each other."
  );
}

// ---------- sprite fetching ----------

const SPRITE_CACHE_KEY = "pokenections_sprite_cache_v1";
let spriteUrlCache = {};
try {
  spriteUrlCache = JSON.parse(localStorage.getItem(SPRITE_CACHE_KEY) || "{}");
} catch (e) {
  spriteUrlCache = {};
}

function saveSpriteCache() {
  try {
    localStorage.setItem(SPRITE_CACHE_KEY, JSON.stringify(spriteUrlCache));
  } catch (e) {
    /* ignore quota errors */
  }
}

async function getSpriteUrl(monName) {
  if (spriteUrlCache[monName] !== undefined) {
    return spriteUrlCache[monName];
  }

  try {
    const name = apiName(monName);
    const resp = await fetch(`https://pokeapi.co/api/v2/pokemon/${name}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const sprites = data.sprites || {};
    const url =
      sprites.versions?.["generation-v"]?.["black-white"]?.front_default ||
      sprites.other?.home?.front_default ||
      sprites.other?.["official-artwork"]?.front_default ||
      sprites.front_default ||
      null;

    spriteUrlCache[monName] = url;
    saveSpriteCache();
    return url;
  } catch (e) {
    console.warn(`[sprite] failed to load sprite for '${monName}':`, e);
    spriteUrlCache[monName] = null;
    saveSpriteCache();
    return null;
  }
}

// ---------- game state ----------

class Game {
  constructor(rules) {
    this.rules = rules;
    this.generated = null;
    this.answerSets = new Map(); // frozen key -> rule name
    this.tiles = []; // { name, solvedRule, selected }
    this.solvedRuleToColorIdx = {}; // rule name -> 0..3
    this.solvedGroups = new Set(); // frozen keys
    this.strikes = 0;
    this.finished = false;
    this.won = false;
    this.flashMessage = "";
    this.flashTimer = null;
    this.revealAnswers = false;
  }

  newPuzzle() {
    this.generated = generatePuzzle(this.rules);
    this.answerSets = new Map();
    for (const [rule, group] of this.generated.groups) {
      this.answerSets.set(setToFrozenKey(new Set(group)), rule);
    }
    this.tiles = this.generated.tileOrder.map((mon) => ({
      name: mon,
      solvedRule: null,
      selected: false,
    }));
    this.solvedRuleToColorIdx = {};
    this.solvedGroups = new Set();
    this.strikes = 0;
    this.finished = false;
    this.won = false;
    this.revealAnswers = false;
    this.confettiFired = false;
    this.setFlash("", "neutral", 0);
  }

  setFlash(message, kind = "neutral", durationMs = 1500) {
    this.flashMessage = message;
    this.flashKind = kind;
    if (this.flashTimer) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    if (message && durationMs > 0) {
      this.flashTimer = setTimeout(() => {
        this.flashMessage = "";
        render();
      }, durationMs);
    }
  }

  clearSelection() {
    for (const tile of this.tiles) {
      if (tile.solvedRule === null) tile.selected = false;
    }
  }

  selectedIndices() {
    const out = [];
    this.tiles.forEach((t, i) => {
      if (t.selected) out.push(i);
    });
    return out;
  }

  clickTile(idx) {
    if (this.finished) return;
    const tile = this.tiles[idx];
    if (!tile || tile.solvedRule !== null) return;

    if (tile.selected) {
      tile.selected = false;
    } else {
      if (this.selectedIndices().length < 4) {
        tile.selected = true;
      }
    }
  }

  currentSelectionSet() {
    return new Set(this.tiles.filter((t) => t.selected).map((t) => t.name));
  }

  shuffleBoard() {
    if (this.finished) return;
    const order = shuffle(this.tiles.map((t) => t.name));
    const locked = {};
    for (const t of this.tiles) {
      if (t.solvedRule) locked[t.name] = t.solvedRule;
    }
    this.tiles = order.map((name) => ({
      name,
      solvedRule: locked[name] || null,
      selected: false,
    }));
    this.reorganizeBoard();
  }

  reorganizeBoard() {
    const solvedRules = Object.keys(this.solvedRuleToColorIdx);
    const solvedTiles = [];
    for (const ruleName of solvedRules) {
      for (const tile of this.tiles) {
        if (tile.solvedRule === ruleName) solvedTiles.push(tile);
      }
    }
    const unsolvedTiles = this.tiles.filter((t) => t.solvedRule === null);
    this.tiles = [...solvedTiles, ...unsolvedTiles];
  }

  submit() {
    if (this.finished) return;
    const selected = this.selectedIndices();
    if (selected.length !== 4) {
      this.setFlash("Pick exactly 4 Pokémon.", "bad", 1500);
      return;
    }

    const guess = this.currentSelectionSet();
    const key = setToFrozenKey(guess);

    if (this.answerSets.has(key) && !this.solvedGroups.has(key)) {
      const ruleName = this.answerSets.get(key);
      const colorIdx = this.solvedGroups.size % SOLVED_CLASS_COUNT;
      this.solvedRuleToColorIdx[ruleName] = colorIdx;
      this.solvedGroups.add(key);

      for (const tile of this.tiles) {
        if (guess.has(tile.name)) {
          tile.solvedRule = ruleName;
          tile.selected = false;
        }
      }

      this.reorganizeBoard();
      this.setFlash(`Correct: ${prettyRuleName(ruleName)}`, "good", 1800);

      if (this.solvedGroups.size === 4) {
        this.finished = true;
        this.won = true;
        this.setFlash("You solved all 4 groups.", "good", 0);
        if (!this.confettiFired) {
          this.confettiFired = true;
          fireWinConfetti();
        }
      }
    } else {
      this.strikes += 1;
      this.clearSelection();
      this.setFlash("Nope.", "bad", 1500);
      if (this.strikes >= 4) {
        this.finished = true;
        this.won = false;
        this.revealAnswers = true;
        this.setFlash("Out of strikes.", "bad", 0);
      }
    }
  }
}

// ---------- rendering ----------

let game = null;
const spriteCacheElements = {}; // mon name -> resolved url (or null) once known

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else {
      node.setAttribute(k, v);
    }
  }
  for (const child of children) {
    if (child) node.appendChild(child);
  }
  return node;
}

function renderHeader() {
  const flash = document.getElementById("flash");
  flash.textContent = game.flashMessage || "";
  flash.classList.remove("good", "bad");
  if (game.flashMessage) {
    if (game.flashKind === "good") flash.classList.add("good");
    if (game.flashKind === "bad") flash.classList.add("bad");
  }
}

function renderStrikes() {
  const meter = document.getElementById("strike-meter");
  meter.innerHTML = "";

  for (let i = 0; i < 4; i++) {
    const isStrike = i < game.strikes;
    meter.appendChild(
      el("img", {
        class: "strike-icon",
        src: isStrike ? "images/pokeball_blank.png" : "images/pokeball.png",
        alt: isStrike ? "Strike used" : "Strike available",
      })
    );
  }
}

function buildGroupRow(title, members, rowClass) {
  const membersEl = el("div", { class: "tile-row-members" });

  for (const monName of members) {
    const spriteWrap = el("div", { class: "mini-sprite-wrap" });
    const img = el("img", {
      class: "sprite",
      alt: prettyName(monName),
      style: "display:none;",
    });
    const placeholder = el("div", { class: "sprite-placeholder", text: "..." });

    spriteWrap.appendChild(placeholder);
    spriteWrap.appendChild(img);

    const member = el("div", { class: "tile-row-member" }, [
      spriteWrap,
      el("div", { class: "name", text: prettyName(monName) }),
    ]);
    membersEl.appendChild(member);
    resolveSprite(monName, img, placeholder);
  }

  return el("div", { class: `tile-row ${rowClass}` }, [
    el("div", { class: "tile-row-title", text: title }),
    membersEl,
  ]);
}

function renderBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";

  // Loss state: reveal all 4 correct categories in red
  if (game.finished && !game.won && game.revealAnswers) {
    for (const [ruleName, group] of game.generated.groups) {
      board.appendChild(
        buildGroupRow(prettyRuleName(ruleName), group, "revealed")
      );
    }
    return;
  }

  let i = 0;
  while (i < game.tiles.length) {
    const tile = game.tiles[i];
    const isSolvedQuad =
      tile.solvedRule !== null &&
      i + 3 < game.tiles.length &&
      game.tiles[i + 1].solvedRule === tile.solvedRule &&
      game.tiles[i + 2].solvedRule === tile.solvedRule &&
      game.tiles[i + 3].solvedRule === tile.solvedRule;

    if (isSolvedQuad) {
      const group = game.tiles.slice(i, i + 4);
      const colorIdx = game.solvedRuleToColorIdx[tile.solvedRule];

      board.appendChild(
        buildGroupRow(
          prettyRuleName(tile.solvedRule),
          group.map((t) => t.name),
          `solved-${colorIdx}`
        )
      );

      i += 4;
      continue;
    }

    const classes = ["tile"];
    if (tile.selected) classes.push("selected");

    const spriteWrap = el("div", { class: "sprite-wrap" });
    const img = el("img", {
      class: "sprite",
      alt: prettyName(tile.name),
      style: "display:none;",
    });
    const placeholder = el("div", { class: "sprite-placeholder", text: "..." });
    spriteWrap.appendChild(placeholder);
    spriteWrap.appendChild(img);

    const idx = i;
    const tileEl = el(
      "div",
      {
        class: classes.join(" "),
        onClick: () => {
          game.clickTile(idx);
          renderBoard();
          renderSidebar();
        },
      },
      [spriteWrap, el("div", { class: "name", text: prettyName(tile.name) })]
    );

    board.appendChild(tileEl);
    resolveSprite(tile.name, img, placeholder);
    i += 1;
  }
}

async function resolveSprite(monName, imgEl, placeholderEl) {
  const url = await getSpriteUrl(monName);
  // make sure this image element is still in the DOM / relevant
  if (!imgEl.isConnected) return;

  if (url) {
    imgEl.src = url;
    imgEl.onload = () => {
      imgEl.style.display = "block";
      if (placeholderEl) placeholderEl.style.display = "none";
    };
    imgEl.onerror = () => {
      imgEl.style.display = "none";
      if (placeholderEl) placeholderEl.style.display = "flex";
    };
  } else {
    imgEl.style.display = "none";
    if (placeholderEl) placeholderEl.style.display = "flex";
  }
}

function renderSidebar() {
  renderStrikes();

  document.getElementById("btn-submit").disabled = game.finished;
  document.getElementById("btn-shuffle").disabled = game.finished;
  document.getElementById("btn-clear").disabled = game.finished;

  const newGameBtn = document.getElementById("btn-new");
  newGameBtn.classList.remove("btn-win", "btn-lose");
  if (game.finished) {
    newGameBtn.classList.add(game.won ? "btn-win" : "btn-lose");
  }
}

function buildRulesByCategory(rules) {
  const grouped = {};
  for (const ruleName of Object.keys(rules)) {
    const category = ruleCategory(ruleName);
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(ruleName);
  }

  for (const ruleNames of Object.values(grouped)) {
    ruleNames.sort((a, b) => prettyRuleValue(a).localeCompare(prettyRuleValue(b)));
  }
  return grouped;
}

function renderRulesList(rules) {
  const rulesList = document.getElementById("rules-list");
  rulesList.innerHTML = "";

  const grouped = buildRulesByCategory(rules);
  const categories = Object.keys(grouped).sort(compareRuleCategories);

  for (const category of categories) {
    const ruleNames = grouped[category];
    const values = el("div", { class: "rules-values" });

    for (const ruleName of ruleNames) {
      values.appendChild(el("div", { class: "rules-value", text: prettyRuleValue(ruleName) }));
    }

    const details = el("details", { class: "rules-category" }, [
      el("summary", { class: "rules-category-title" }, [
        el("span", { text: prettyCategoryName(category) }),
        el("span", { class: "rules-count", text: String(ruleNames.length) }),
      ]),
      values,
    ]);

    rulesList.appendChild(details);
  }
}

function rulesOverlay() {
  return document.getElementById("rules-overlay");
}

function isRulesModalOpen() {
  const overlay = rulesOverlay();
  return overlay && !overlay.hidden;
}

function openRulesModal() {
  const overlay = rulesOverlay();
  overlay.hidden = false;
  document.body.classList.add("rules-open");
  document.getElementById("btn-rules-close").focus();
}

function closeRulesModal() {
  const overlay = rulesOverlay();
  overlay.hidden = true;
  document.body.classList.remove("rules-open");
  document.getElementById("btn-rules").focus();
}

function initRulesModal(rules) {
  renderRulesList(rules);

  document.getElementById("btn-rules").addEventListener("click", openRulesModal);
  document.getElementById("btn-rules-close").addEventListener("click", closeRulesModal);
  rulesOverlay().addEventListener("click", (e) => {
    if (e.target === e.currentTarget) {
      closeRulesModal();
    }
  });
}

// ---------- confetti ----------

// Fires a single confetti burst from the left and right edges of the
// window, angled inward, when the player wins.
function fireWinConfetti() {
  // Guard in case the confetti script hasn't loaded for some reason.
  if (typeof confetti !== "function") {
    console.warn("confetti.js not loaded; skipping win animation.");
    return;
  }

  // Left edge, firing up and to the right.
  confetti({
    particleCount: 100,
    angle: 60,
    spread: 70,
    startVelocity: 55,
    origin: { x: 0, y: 0.6 },
  });
  // Right edge, firing up and to the left.
  confetti({
    particleCount: 100,
    angle: 120,
    spread: 70,
    startVelocity: 55,
    origin: { x: 1, y: 0.6 },
  });
}

function render() {
  renderHeader();
  renderBoard();
  renderSidebar();
}

// ---------- bootstrap ----------

async function newGame() {
  document.getElementById("flash").textContent = "Generating puzzle...";
  try {
    game.newPuzzle();
    render();
  } catch (e) {
    const flash = document.getElementById("flash");
    flash.textContent = `Error: ${e.message}`;
    flash.classList.add("bad");
    console.error(e);
  }
}

async function init() {
  document.getElementById("flash").textContent = "Loading rules...";

  let rules;
  try {
    rules = await loadRules();
  } catch (e) {
    const flash = document.getElementById("flash");
    flash.textContent = `Error: ${e.message}`;
    flash.classList.add("bad");
    console.error(e);
    return;
  }

  game = new Game(rules);
  await newGame();
  initRulesModal(rules);

  document.getElementById("btn-submit").addEventListener("click", () => {
    game.submit();
    render();
  });
  document.getElementById("btn-shuffle").addEventListener("click", () => {
    game.shuffleBoard();
    render();
  });
  document.getElementById("btn-clear").addEventListener("click", () => {
    game.clearSelection();
    render();
  });
  document.getElementById("btn-new").addEventListener("click", () => {
    newGame();
  });

  window.addEventListener("keydown", (e) => {
    if (isRulesModalOpen()) {
      if (e.key === "Escape") {
        closeRulesModal();
      }
      return;
    }

    if (e.key === "Enter") {
      game.submit();
      render();
    } else if (e.key === " ") {
      e.preventDefault();
      game.shuffleBoard();
      render();
    } else if (e.key === "Escape") {
      game.clearSelection();
      render();
    } else if (e.key.toLowerCase() === "n") {
      newGame();
    }
  });
}

init();