import {
  GestureRecognizer,
  FilesetResolver,
  DrawingUtils,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task";

// Tuning knobs
const HOLD_MS = 1000;          // hold time for call / fold / all-in
const RAISE_CONFIRM_MS = 600;  // fist hold time to confirm a raise
const COOLDOWN_MS = 1200;      // pause after an action fires
const MIN_SCORE = 0.6;         // min classifier confidence for built-in gestures
const TAP_AMPLITUDE = 0.35;    // check: knock depth, relative to hand size
const DOUBLE_TAP_MS = 900;     // check: max time between the two knocks
const RAISE_TIMEOUT_MS = 1500; // raise mode ends if no palm/fist for this long

// Fake table numbers for the raise meter
const STACK = 1000;
const MIN_RAISE = 20;
const RAISE_STEP = 10;

const ACTIONS = ["check", "call", "fold", "raise", "allin"];
const LABELS = { check: "CHECK", call: "CALL", fold: "FOLD", raise: "RAISE", allin: "ALL-IN" };
const COLORS = { check: "#7cc6ff", call: "#4fd18b", fold: "#ff6b6b", raise: "#f2c14e", allin: "#d18bff" };

const $ = (id) => document.getElementById(id);
const video = $("video");
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const draw = new DrawingUtils(ctx);

let recognizer;
let lastVideoTime = -1;
let fpsFrames = 0;
let fpsLast = performance.now();
let fps = 0;

// Gesture state
let hold = { action: null, start: 0 };
let cooldownUntil = 0;
let raise = { active: false, amount: MIN_RAISE, lastSeen: 0 };
let tap = { phase: "up", extreme: null, taps: [] };

// Evaluation state
const stats = Object.fromEntries(ACTIONS.map((a) => [a, { fired: 0, correct: 0, wrong: 0, missed: 0 }]));
const log = [];

// ---------- setup ----------

$("startBtn").addEventListener("click", start);
$("copyBtn").addEventListener("click", copyResults);
$("resetBtn").addEventListener("click", resetStats);
renderStats();

async function start() {
  $("startBtn").disabled = true;
  setStatus("Loading model…");
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    recognizer = await GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numHands: 2,
    });
    setStatus("Requesting camera…");
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: "user" },
    });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    $("startWrap").remove();
    setStatus("Running");
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    setStatus("Error: " + err.message);
    $("startBtn").disabled = false;
  }
}

function setStatus(text) {
  $("status").textContent = text;
}

// ---------- main loop ----------

function loop() {
  const now = performance.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const res = recognizer.recognizeForVideo(video, now);
    const hands = res.landmarks.map((lm, i) => ({
      lm,
      gesture: res.gestures[i]?.[0]?.categoryName ?? "None",
      score: res.gestures[i]?.[0]?.score ?? 0,
      side: res.handedness[i]?.[0]?.categoryName ?? "?",
    }));
    const progress = update(hands, now);
    render(hands, progress, now);
    countFps(now);
  }
  requestAnimationFrame(loop);
}

// Decides what the hands are doing. Returns hold progress (0..1) for the ring, or null.
function update(hands, now) {
  if (now < cooldownUntil) {
    resetHold();
    return null;
  }

  const confident = (h, name) => h.gesture === name && h.score >= MIN_SCORE;
  let candidate = null;
  let holdMs = HOLD_MS;

  if (hands.length >= 2 && hands.every((h) => confident(h, "Open_Palm"))) {
    candidate = "allin";
    raise.active = false;
  } else if (hands.length >= 1) {
    const h = hands[0];

    if (confident(h, "Thumb_Up")) {
      candidate = "call";
    } else if (confident(h, "Thumb_Down")) {
      candidate = "fold";
      raise.active = false;
    } else if (confident(h, "Open_Palm")) {
      // Palm height sets the raise amount: higher hand = bigger raise
      const y = h.lm[9].y;
      const t = clamp((0.85 - y) / 0.65, 0, 1);
      raise.amount = Math.round((MIN_RAISE + t * (STACK - MIN_RAISE)) / RAISE_STEP) * RAISE_STEP;
      raise.active = true;
      raise.lastSeen = now;
    } else if (raise.active && confident(h, "Closed_Fist")) {
      candidate = "raise";
      holdMs = RAISE_CONFIRM_MS;
      raise.lastSeen = now;
    }

    // Knocking: three back fingers curled (fist or pointing). Not while raising or thumbs up/down.
    const thumb = confident(h, "Thumb_Up") || confident(h, "Thumb_Down");
    if (!candidate && !raise.active && !thumb && backFingersCurled(h.lm)) {
      if (detectDoubleTap(h.lm, now)) {
        fire("check", now);
        return null;
      }
    } else {
      resetTap();
    }
  } else {
    resetTap();
  }

  if (raise.active && now - raise.lastSeen > RAISE_TIMEOUT_MS) raise.active = false;

  // Hold-to-confirm
  if (!candidate) {
    resetHold();
    return null;
  }
  if (hold.action !== candidate) hold = { action: candidate, start: now };
  const progress = (now - hold.start) / holdMs;
  if (progress >= 1) {
    fire(candidate, now);
    return null;
  }
  return progress;
}

// Tracks the index fingertip going down then up; two such knocks in a row = check.
function detectDoubleTap(lm, now) {
  const y = lm[8].y;
  const amp = TAP_AMPLITUDE * handSize(lm);

  if (tap.extreme === null) tap.extreme = y;
  if (tap.phase === "up") {
    tap.extreme = Math.min(tap.extreme, y); // highest point so far
    if (y > tap.extreme + amp) {
      tap.phase = "down";
      tap.extreme = y;
    }
  } else {
    tap.extreme = Math.max(tap.extreme, y); // lowest point so far
    if (y < tap.extreme - amp) {
      tap.phase = "up";
      tap.extreme = y;
      tap.taps.push(now);
    }
  }
  tap.taps = tap.taps.filter((t) => now - t <= DOUBLE_TAP_MS);
  return tap.taps.length >= 2;
}

function backFingersCurled(lm) {
  // middle, ring, pinky: tip closer to the wrist than the PIP joint
  return [[12, 10], [16, 14], [20, 18]].every(([tip, pip]) => dist(lm[tip], lm[0]) < dist(lm[pip], lm[0]));
}

function handSize(lm) {
  return dist(lm[0], lm[9]);
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function resetHold() {
  hold = { action: null, start: 0 };
}

function resetTap() {
  tap = { phase: "up", extreme: null, taps: [] };
}

function fire(action, now) {
  const detail = action === "raise" ? raise.amount : null;
  cooldownUntil = now + COOLDOWN_MS;
  resetHold();
  resetTap();
  raise.active = false;

  stats[action].fired++;
  log.unshift({ id: log.length, time: new Date(), action, detail, verdict: null });
  renderStats();
  renderLog();
  showBanner(action, detail);
}

// ---------- rendering ----------

function render(hands, progress, now) {
  const w = canvas.width;
  const h = canvas.height;

  // Mirror the video so it behaves like a mirror
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  for (const hand of hands) {
    draw.drawConnectors(hand.lm, GestureRecognizer.HAND_CONNECTIONS, { color: "#f2c14e", lineWidth: 3 });
    draw.drawLandmarks(hand.lm, { color: "#ffffff", radius: 3 });
  }
  ctx.restore();

  // Hold ring around the first hand
  if (progress !== null && hands.length) {
    const c = hands[0].lm[9];
    const x = (1 - c.x) * w;
    const y = c.y * h;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.arc(x, y, 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = COLORS[hold.action];
    ctx.beginPath();
    ctx.arc(x, y, 60, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = COLORS[hold.action];
    ctx.font = "bold 20px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(LABELS[hold.action], x, y - 72);
  }

  if (now < cooldownUntil) {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.fillRect(0, 0, w, h);
  }

  // Raise panel
  $("raiseOff").hidden = raise.active;
  $("raiseOn").hidden = !raise.active;
  if (raise.active) {
    $("raiseBar").style.width = ((raise.amount - MIN_RAISE) / (STACK - MIN_RAISE)) * 100 + "%";
    $("raiseAmt").textContent = raise.amount;
  }

  // Debug panel
  const lines = hands.map(
    (hd, i) => `Hand ${i + 1} (${hd.side}): ${hd.gesture} ${(hd.score * 100).toFixed(0)}%` +
      (backFingersCurled(hd.lm) ? " · knock-ready" : "")
  );
  lines.push(`Knocks: ${tap.taps.length} · FPS: ${fps}`);
  if (now < cooldownUntil) lines.push("Cooldown…");
  $("debug").textContent = hands.length ? lines.join("\n") : `No hands · FPS: ${fps}`;
}

let bannerTimer;
function showBanner(action, detail) {
  const el = $("banner");
  el.textContent = LABELS[action] + (detail ? ` ${detail}` : "");
  el.style.color = COLORS[action];
  el.classList.add("show");
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => el.classList.remove("show"), 900);
}

function countFps(now) {
  fpsFrames++;
  if (now - fpsLast >= 1000) {
    fps = fpsFrames;
    fpsFrames = 0;
    fpsLast = now;
  }
}

// ---------- evaluation ----------

function renderStats() {
  $("stats").innerHTML = ACTIONS.map((a) => {
    const s = stats[a];
    return `<tr><td>${LABELS[a]}</td><td class="num">${s.fired}</td><td class="num">${s.correct}</td>` +
      `<td class="num">${s.wrong}</td><td class="num">${s.missed}</td>` +
      `<td><button class="small" data-miss="${a}">+</button></td></tr>`;
  }).join("");
  for (const b of $("stats").querySelectorAll("[data-miss]")) {
    b.onclick = () => {
      stats[b.dataset.miss].missed++;
      renderStats();
    };
  }
}

function renderLog() {
  $("log").innerHTML = log.map((e) => {
    const cls = e.verdict ?? "";
    const label = LABELS[e.action] + (e.detail ? ` ${e.detail}` : "");
    const buttons = e.verdict ? "" :
      `<button class="small" data-id="${e.id}" data-v="correct">✓</button>` +
      `<button class="small" data-id="${e.id}" data-v="wrong">✗</button>`;
    return `<li class="${cls}"><span class="t">${e.time.toLocaleTimeString()}</span>` +
      `<span class="a">${label}</span>${buttons}</li>`;
  }).join("");
  for (const b of $("log").querySelectorAll("[data-id]")) {
    b.onclick = () => {
      const entry = log.find((e) => e.id === Number(b.dataset.id));
      entry.verdict = b.dataset.v;
      stats[entry.action][b.dataset.v]++;
      renderStats();
      renderLog();
    };
  }
}

function resetStats() {
  for (const a of ACTIONS) stats[a] = { fired: 0, correct: 0, wrong: 0, missed: 0 };
  log.length = 0;
  renderStats();
  renderLog();
}

async function copyResults() {
  const rows = ACTIONS.map((a) => {
    const s = stats[a];
    return `${LABELS[a]}\tfired ${s.fired}\tcorrect ${s.correct}\twrong ${s.wrong}\tmissed ${s.missed}`;
  });
  await navigator.clipboard.writeText(rows.join("\n"));
  setStatus("Results copied");
}
