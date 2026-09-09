import {
  ARENA_RADIUS,
  CENTER,
  CONFIG,
  EnergyBand,
  GamePhase,
  OUTCOME_COPY,
  WORLD_SIZE,
  createEmptyStats,
  createGame,
  energyBand,
  mergeStats,
  setInput,
  startGame,
  stepGame,
  thermalCaptureProbability,
  togglePause
} from "./engine.js";
import { renderChamber, renderNeutron } from "./renderer.js";

const canvas = document.querySelector("#game-canvas");
const context = canvas.getContext("2d", { alpha: false });
const elements = Object.fromEntries([
  "score-value", "lineage-value", "best-value", "signal-value", "energy-readout", "energy-fill", "energy-marker",
  "state-card", "state-name", "state-copy", "objective-index", "objective-title", "objective-copy",
  "canvas-message", "start-overlay", "gameover-overlay", "pause-overlay", "report-title", "report-explanation",
  "report-score", "report-lineage", "report-best", "report-tip", "death-label",
  "start-button", "restart-button", "pause-button", "resume-button", "guide-button", "sound-button", "joystick", "joystick-knob"
].map((id) => [id, document.getElementById(id)]));

const STORAGE_KEY = "neutron-drift-candu-v1";
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const keys = new Set();
let game = createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
let previousPhase = game.phase;
let previousBand = game.neutron.band;
let best = 0;
let lifetimeStats = createEmptyStats();
let soundEnabled = true;
let guideEnabled = true;
let audioContext = null;
let lastTime = performance.now();
let accumulator = 0;
let messageTimeout = 0;

try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  best = Number(stored.best || 0);
  lifetimeStats = mergeStats(createEmptyStats(), stored.stats || {});
  soundEnabled = stored.sound !== false;
  guideEnabled = stored.guide !== false;
} catch { /* Local storage is optional. */ }

function saveProgress(includeRun = false) {
  if (includeRun) lifetimeStats = mergeStats(lifetimeStats, game.stats);
  best = Math.max(best, game.generation);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ best, stats: lifetimeStats, sound: soundEnabled, guide: guideEnabled })); } catch { /* Optional. */ }
}

function tone(frequency, duration = 0.08, type = "sine", volume = 0.035, glide = 0) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    if (glide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + glide), audioContext.currentTime + duration);
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Sound should never block play. */ }
}

function playEventSound() {
  if (game.phase === GamePhase.FISSION && previousPhase !== GamePhase.FISSION) {
    tone(150, .35, "sawtooth", .035, 420);
    setTimeout(() => tone(430, .22, "sine", .025, 250), 90);
  } else if (game.phase === GamePhase.GAMEOVER && previousPhase !== GamePhase.GAMEOVER) {
    tone(180, .45, "triangle", .035, -110);
  } else if (game.neutron.band !== previousBand) {
    tone(game.neutron.band === EnergyBand.THERMAL ? 620 : 390, .16, "sine", .025, 90);
  }
  previousPhase = game.phase;
  previousBand = game.neutron.band;
}

function beginRun() {
  game = createGame(crypto.getRandomValues(new Uint32Array(1))[0]);
  startGame(game);
  previousPhase = game.phase;
  previousBand = game.neutron.band;
  accumulator = 0;
  elements["start-overlay"].classList.remove("visible");
  elements["gameover-overlay"].classList.remove("visible");
  elements["pause-overlay"].classList.remove("visible");
  tone(250, .13, "sine", .025, 180);
}

function pauseGame(force) {
  togglePause(game, force);
  const paused = game.phase === GamePhase.PAUSED;
  elements["pause-overlay"].classList.toggle("visible", paused);
  elements["pause-button"].textContent = paused ? "Resume" : "Pause";
  elements["pause-button"].setAttribute("aria-label", paused ? "Resume game" : "Pause game");
}

function keyVector() {
  let x = 0;
  let y = 0;
  if (keys.has("ArrowLeft") || keys.has("a") || keys.has("A")) x -= 1;
  if (keys.has("ArrowRight") || keys.has("d") || keys.has("D")) x += 1;
  if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) y -= 1;
  if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) y += 1;
  setInput(game, x, y);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "w", "a", "s", "d", "W", "A", "S", "D", " "].includes(event.key)) event.preventDefault();
  if (event.key === " " || event.key === "Escape" || event.key.toLowerCase() === "p") {
    if ([GamePhase.PLAYING, GamePhase.FISSION, GamePhase.PAUSED].includes(game.phase)) pauseGame();
    return;
  }
  keys.add(event.key);
  keyVector();
});
window.addEventListener("keyup", (event) => { keys.delete(event.key); keyVector(); });
window.addEventListener("blur", () => { keys.clear(); setInput(game, 0, 0); });
document.addEventListener("visibilitychange", () => { if (document.hidden) pauseGame(true); });

let joystickPointer = null;
function updateJoystick(event) {
  const rect = elements.joystick.getBoundingClientRect();
  const x = event.clientX - (rect.left + rect.width / 2);
  const y = event.clientY - (rect.top + rect.height / 2);
  const radius = rect.width * .34;
  const length = Math.hypot(x, y);
  const scale = length > radius ? radius / length : 1;
  const px = x * scale;
  const py = y * scale;
  elements["joystick-knob"].style.transform = `translate(${px}px, ${py}px)`;
  setInput(game, px / radius, py / radius);
}
function releaseJoystick(event) {
  if (joystickPointer !== null && (!event || event.pointerId === joystickPointer)) {
    joystickPointer = null;
    elements["joystick-knob"].style.transform = "translate(0, 0)";
    setInput(game, 0, 0);
  }
}
elements.joystick.addEventListener("pointerdown", (event) => {
  joystickPointer = event.pointerId;
  elements.joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});
elements.joystick.addEventListener("pointermove", (event) => { if (event.pointerId === joystickPointer) updateJoystick(event); });
elements.joystick.addEventListener("pointerup", releaseJoystick);
elements.joystick.addEventListener("pointercancel", releaseJoystick);
elements.joystick.addEventListener("lostpointercapture", releaseJoystick);

elements["start-button"].addEventListener("click", beginRun);
elements["restart-button"].addEventListener("click", beginRun);
elements["pause-button"].addEventListener("click", () => pauseGame());
elements["resume-button"].addEventListener("click", () => pauseGame(false));
elements["guide-button"].addEventListener("click", () => {
  guideEnabled = !guideEnabled;
  elements["guide-button"].textContent = guideEnabled ? "Guide on" : "Guide off";
  elements["guide-button"].setAttribute("aria-label", guideEnabled ? "Hide flight guide" : "Show flight guide");
  saveProgress(false);
});
elements["sound-button"].addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  elements["sound-button"].textContent = soundEnabled ? "Sound on" : "Sound off";
  elements["sound-button"].setAttribute("aria-label", soundEnabled ? "Mute sound" : "Enable sound");
  saveProgress(false);
  if (soundEnabled) tone(480, .1, "sine", .025, 100);
});


function drawSteeringGuide(ctx) {
  const magnitude = Math.hypot(game.input.x, game.input.y);
  if (!guideEnabled || game.phase !== GamePhase.PLAYING || magnitude < CONFIG.steeringDeadzone) return;
  const directionX = game.input.x / magnitude;
  const directionY = game.input.y / magnitude;
  const start = 20;
  const end = 55;
  ctx.save();
  ctx.strokeStyle = "rgba(200, 255, 248, .48)";
  ctx.fillStyle = "rgba(200, 255, 248, .75)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(game.neutron.x + directionX * start, game.neutron.y + directionY * start);
  ctx.lineTo(game.neutron.x + directionX * end, game.neutron.y + directionY * end);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(game.neutron.x + directionX * end, game.neutron.y + directionY * end, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  const targetWidth = Math.max(1, Math.round(rect.width * ratio));
  const targetHeight = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) { canvas.width = targetWidth; canvas.height = targetHeight; }
  const scale = Math.min(canvas.width / WORLD_SIZE, canvas.height / WORLD_SIZE);
  const offsetX = (canvas.width - WORLD_SIZE * scale) / 2;
  const offsetY = (canvas.height - WORLD_SIZE * scale) / 2;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#050b0e"; context.fillRect(0, 0, canvas.width, canvas.height);
  context.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  renderChamber(context, game, reducedMotion);
  drawSteeringGuide(context);
  if (game.phase !== GamePhase.FISSION || game.fission?.timer > CONFIG.fissionTransitionSeconds * .35) renderNeutron(context, game.neutron, reducedMotion);
}

function formatEnergy(energy) {
  if (energy > CONFIG.fastThreshold) return `${(energy / 50).toFixed(2)} MeV`;
  if (energy > CONFIG.thermalThreshold) return `${Math.round(energy * 42)} eV`;
  return `${(0.025 + energy / CONFIG.thermalThreshold * .16).toFixed(3)} eV`;
}

function updateHUD() {
  const neutron = game.neutron;
  const band = neutron.band;
  elements["score-value"].textContent = String(game.score).padStart(6, "0");
  elements["lineage-value"].textContent = String(game.generation).padStart(2, "0");
  elements["best-value"].textContent = String(Math.max(best, game.generation)).padStart(2, "0");
  elements["signal-value"].textContent = game.phase === GamePhase.READY ? "STANDBY" : game.phase === GamePhase.PAUSED ? "HELD" : game.phase === GamePhase.GAMEOVER ? "LOST" : "TRACKING";
  elements["energy-readout"].textContent = formatEnergy(neutron.energy);
  elements["energy-fill"].style.transform = `scaleX(${neutron.energy / 100})`;
  elements["energy-marker"].style.left = `${neutron.energy}%`;
  elements["state-card"].className = `state-card ${band}`;

  if (band === EnergyBand.FAST) {
    elements["state-name"].textContent = "FAST NEUTRON";
    elements["state-copy"].textContent = "Too energetic to trigger fission. Find deuterium first.";
    elements["objective-index"].textContent = "01";
    elements["objective-title"].textContent = "Moderate your speed";
    elements["objective-copy"].textContent = "Fast neutrons pass through orange fuel. Intercept the drifting deuterium until the energy meter turns cyan.";
  } else if (band === EnergyBand.RESONANCE) {
    elements["state-name"].textContent = "RESONANCE RANGE";
    elements["state-copy"].textContent = "Almost slow enough. One or two more moderator collisions should do it.";
    elements["objective-index"].textContent = "02";
    elements["objective-title"].textContent = "Reach thermal speed";
    elements["objective-copy"].textContent = "Orange fuel still lets you pass at this speed. Green poisoned channels are lethal at every speed.";
  } else {
    const risk = Math.round(thermalCaptureProbability(neutron.thermalExposure) * 100);
    elements["state-name"].textContent = "THERMAL NEUTRON";
    elements["state-copy"].textContent = `Maximum fission bonus. Accumulated outside-fuel capture risk: ${risk}%.`;
    elements["objective-index"].textContent = "03";
    elements["objective-title"].textContent = "Reach fissile fuel";
    elements["objective-copy"].textContent = "Choose a warm orange channel. Avoid radioactive-green poisoned channels and magenta absorbers.";
  }

  const visibleMessage = game.messageTime > 0 && game.phase !== GamePhase.READY && game.phase !== GamePhase.GAMEOVER;
  elements["canvas-message"].textContent = game.message;
  elements["canvas-message"].classList.toggle("show", visibleMessage);
}


function showGameOver() {
  const copy = OUTCOME_COPY[game.outcome] || { title: "Lineage ended", explanation: "This neutron left the chain reaction.", tip: "Try a different route through the moderator." };
  best = Math.max(best, game.generation);
  elements["report-title"].textContent = copy.title;
  elements["report-explanation"].textContent = copy.explanation;
  elements["report-tip"].textContent = copy.tip;
  elements["report-score"].textContent = game.score.toLocaleString();
  elements["report-lineage"].textContent = game.generation;
  elements["report-best"].textContent = best;
  elements["death-label"].textContent = game.generation > 1 ? `LINEAGE ENDED // GENERATION ${String(game.generation).padStart(2, "0")}` : "LINEAGE ENDED";
  elements["gameover-overlay"].classList.add("visible");
  saveProgress(true);
}

function frame(now) {
  const elapsed = Math.min((now - lastTime) / 1000, .1);
  lastTime = now;
  if ([GamePhase.PLAYING, GamePhase.FISSION].includes(game.phase)) {
    accumulator = Math.min(accumulator + elapsed, .18);
    while (accumulator >= CONFIG.fixedStep) {
      stepGame(game, CONFIG.fixedStep);
      accumulator -= CONFIG.fixedStep;
    }
  }
  playEventSound();
  if (game.phase === GamePhase.GAMEOVER && previousPhase === GamePhase.GAMEOVER && !elements["gameover-overlay"].classList.contains("visible")) showGameOver();
  draw();
  updateHUD();
  requestAnimationFrame(frame);
}

elements["sound-button"].textContent = soundEnabled ? "Sound on" : "Sound off";
elements["guide-button"].textContent = guideEnabled ? "Guide on" : "Guide off";
elements["guide-button"].setAttribute("aria-label", guideEnabled ? "Hide flight guide" : "Show flight guide");
elements["best-value"].textContent = String(best).padStart(2, "0");
requestAnimationFrame(frame);
