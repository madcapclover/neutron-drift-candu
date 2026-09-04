import test from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_RADIUS,
  CENTER,
  CONFIG,
  EnergyBand,
  GamePhase,
  InteractionOutcome,
  calculateLedger,
  createEmptyStats,
  createGame,
  energyBand,
  mergeStats,
  mulberry32,
  resolveFuelInteraction,
  scatterEnergy,
  setInput,
  stepGame,
  thermalCaptureProbability,
  togglePause
} from "../engine.js";

test("seeded random sequences are repeatable", () => {
  const first = mulberry32(1234);
  const second = mulberry32(1234);
  assert.deepEqual(Array.from({ length: 8 }, first), Array.from({ length: 8 }, second));
});

test("energy bands use centralized thresholds", () => {
  assert.equal(energyBand(100), EnergyBand.FAST);
  assert.equal(energyBand(CONFIG.fastThreshold), EnergyBand.RESONANCE);
  assert.equal(energyBand(CONFIG.thermalThreshold), EnergyBand.THERMAL);
});

test("the calandria uses a spacious nineteen-channel radial layout", () => {
  const { fuels } = createGame(12);
  assert.equal(fuels.length, 19);
  let minimumSpacing = Number.POSITIVE_INFINITY;
  for (let left = 0; left < fuels.length; left += 1) {
    for (let right = left + 1; right < fuels.length; right += 1) {
      minimumSpacing = Math.min(minimumSpacing, Math.hypot(fuels[left].x - fuels[right].x, fuels[left].y - fuels[right].y));
    }
  }
  assert.ok(minimumSpacing > 170);
});

test("a new run starts centrally with ample flight time", () => {
  const game = createGame(14);
  const radialDistance = Math.hypot(game.neutron.x - CENTER, game.neutron.y - CENTER);
  assert.equal(game.neutron.lastFuelId, 0);
  assert.ok(ARENA_RADIUS - radialDistance > 380);
});

test("head-on scattering removes more energy than a glancing collision", () => {
  assert.ok(scatterEnergy(90, 1) < scatterEnergy(90, .2));
  assert.ok(scatterEnergy(90, 1) > 0);
});

test("deuterium drifts and rebounds inside the calandria", () => {
  const game = createGame(15);
  game.phase = GamePhase.PLAYING;
  game.fuels = [];
  game.poisonedFuelIds = [];
  game.rods = [];
  Object.assign(game.neutron, { x: CENTER, y: CENTER, vx: 0, vy: 0 });
  const boundaryRadius = ARENA_RADIUS - CONFIG.deuteriumRadius - 5;
  game.atoms = [{
    id: 0,
    x: CENTER + boundaryRadius - .2,
    y: CENTER,
    vx: CONFIG.deuteriumMaxSpeed,
    vy: 0,
    phase: 0,
    flash: 0
  }];
  stepGame(game, .05);
  assert.ok(game.atoms[0].x <= CENTER + boundaryRadius);
  assert.ok(game.atoms[0].vx < 0);
});

test("ordinary fuel guarantees fission only at thermal speed", () => {
  assert.equal(resolveFuelInteraction(EnergyBand.FAST, 0), InteractionOutcome.PASS);
  assert.equal(resolveFuelInteraction(EnergyBand.FAST, .9), InteractionOutcome.PASS);
  assert.equal(resolveFuelInteraction(EnergyBand.RESONANCE, 0), InteractionOutcome.PASS);
  assert.equal(resolveFuelInteraction(EnergyBand.RESONANCE, .9), InteractionOutcome.PASS);
  assert.equal(resolveFuelInteraction(EnergyBand.THERMAL, 0), InteractionOutcome.THERMAL_FISSION);
  assert.equal(resolveFuelInteraction(EnergyBand.THERMAL, .99), InteractionOutcome.THERMAL_FISSION);
});

test("a resonance-band fuel contact passes through safely", () => {
  const game = createGame(11);
  const fuel = game.fuels[8];
  game.phase = GamePhase.PLAYING;
  game.random = () => 0;
  game.poisonedFuelIds = [];
  Object.assign(game.neutron, {
    x: fuel.x,
    y: fuel.y,
    vx: 0,
    vy: 0,
    energy: 40,
    band: EnergyBand.RESONANCE,
    lastFuelId: null,
    fuelCooldown: 0
  });
  stepGame(game, CONFIG.fixedStep);
  assert.equal(game.phase, GamePhase.PLAYING);
  assert.equal(game.outcome, null);
  assert.match(game.message, /keep moderating/i);
});

test("thermal capture pressure has a grace period and rises cumulatively", () => {
  assert.equal(thermalCaptureProbability(CONFIG.thermalGraceSeconds), 0);
  assert.ok(thermalCaptureProbability(20) > thermalCaptureProbability(10));
  assert.ok(thermalCaptureProbability(20) < 1);
});

test("input vectors are normalized", () => {
  const game = createGame(1);
  setInput(game, 10, -10);
  assert.ok(Math.abs(Math.hypot(game.input.x, game.input.y) - 1) < 1e-10);
});

test("steering responds quickly and becomes more precise as the neutron slows", () => {
  const makeSteeringGame = (energy) => {
    const game = createGame(13);
    game.phase = GamePhase.PLAYING;
    game.fuels = [];
    game.atoms = [];
    game.poisonedFuelIds = [];
    game.rods = [];
    Object.assign(game.neutron, { x: CENTER, y: CENTER, vx: 200, vy: 0, energy, band: energyBand(energy) });
    setInput(game, 0, -1);
    return game;
  };
  const fast = makeSteeringGame(100);
  const thermal = makeSteeringGame(10);
  stepGame(fast, .05);
  stepGame(thermal, .05);
  const fastTurn = Math.abs(Math.atan2(fast.neutron.vy, fast.neutron.vx));
  const thermalTurn = Math.abs(Math.atan2(thermal.neutron.vy, thermal.neutron.vx));
  assert.ok(fastTurn >= .26);
  assert.ok(thermalTurn > fastTurn);
});

test("pause and resume preserve the prior active phase", () => {
  const game = createGame(2);
  game.phase = GamePhase.PLAYING;
  togglePause(game, true);
  assert.equal(game.phase, GamePhase.PAUSED);
  togglePause(game, false);
  assert.equal(game.phase, GamePhase.PLAYING);
});

test("boundary exits are classified by energy band", () => {
  const fast = createGame(3);
  fast.phase = GamePhase.PLAYING;
  fast.neutron.x = CENTER + ARENA_RADIUS + 30;
  fast.neutron.y = CENTER;
  fast.neutron.energy = 90;
  fast.neutron.band = EnergyBand.FAST;
  stepGame(fast, CONFIG.fixedStep);
  assert.equal(fast.outcome, InteractionOutcome.FAST_LEAK);
  assert.equal(fast.stats.fastLeaks, 1);

  const thermal = createGame(4);
  thermal.phase = GamePhase.PLAYING;
  thermal.neutron.x = CENTER + ARENA_RADIUS + 30;
  thermal.neutron.y = CENTER;
  thermal.neutron.energy = 10;
  thermal.neutron.band = EnergyBand.THERMAL;
  stepGame(thermal, CONFIG.fixedStep);
  assert.equal(thermal.outcome, InteractionOutcome.THERMAL_LEAK);
  assert.equal(thermal.stats.thermalLeaks, 1);
});

test("a thermal fuel interaction can start and complete a new generation", () => {
  const game = createGame(5);
  const fuel = game.fuels[8];
  game.phase = GamePhase.PLAYING;
  game.random = () => 0;
  game.poisonedFuelIds = [];
  Object.assign(game.neutron, {
    x: fuel.x,
    y: fuel.y,
    vx: 0,
    vy: 0,
    energy: 12,
    band: EnergyBand.THERMAL,
    lastFuelId: null,
    fuelCooldown: 0,
    thermalExposure: 1
  });
  stepGame(game, CONFIG.fixedStep);
  assert.equal(game.phase, GamePhase.FISSION);
  assert.equal(game.stats.thermalFissions, 1);
  for (let index = 0; index < 20; index += 1) stepGame(game, .05);
  assert.equal(game.phase, GamePhase.PLAYING);
  assert.equal(game.generation, 2);
  assert.equal(game.neutron.band, EnergyBand.FAST);
  const outwardDot = (game.neutron.x - CENTER) * game.neutron.vx + (game.neutron.y - CENTER) * game.neutron.vy;
  assert.ok(outwardDot < 0, "outer-ring fission should launch the next neutron inward");
});

test("a neighbouring burst transfers control without advancing generation", () => {
  const game = createGame(6);
  game.phase = GamePhase.PLAYING;
  game.random = () => .5;
  game.neutron.energy = 12;
  game.neutron.band = EnergyBand.THERMAL;
  game.neutron.thermalExposure = 1;
  game.burst = { x: game.neutron.x, y: game.neutron.y, radius: 20, life: 3, maxLife: 3 };
  stepGame(game, CONFIG.fixedStep);
  assert.equal(game.generation, 1);
  assert.equal(game.neutron.band, EnergyBand.FAST);
  assert.equal(game.stats.lineageJumps, 1);
  assert.equal(game.burst, null);
});

test("thermal exposure can end in parasitic capture after the grace period", () => {
  const game = createGame(8);
  game.phase = GamePhase.PLAYING;
  game.fuels = [];
  game.atoms = [];
  game.poisonedFuelIds = [];
  game.rods = [];
  game.random = () => 0;
  Object.assign(game.neutron, {
    x: CENTER + 70,
    y: CENTER,
    vx: 0,
    vy: 0,
    energy: 10,
    band: EnergyBand.THERMAL,
    thermalExposure: CONFIG.thermalGraceSeconds + 4
  });
  stepGame(game, CONFIG.fixedStep);
  assert.equal(game.outcome, InteractionOutcome.PARASITIC_CAPTURE);
  assert.equal(game.stats.nonFuelThermalAbsorptions, 1);
});

test("poisoned channels and control absorbers are lethal on contact", () => {
  const poisonGame = createGame(9);
  const poisonedFuel = poisonGame.fuels[8];
  poisonGame.phase = GamePhase.PLAYING;
  poisonGame.random = () => .99;
  poisonGame.poisonedFuelIds = [poisonedFuel.id];
  Object.assign(poisonGame.neutron, { x: poisonedFuel.x, y: poisonedFuel.y, vx: 0, vy: 0, energy: 90, band: EnergyBand.FAST, lastFuelId: null, fuelCooldown: 0 });
  stepGame(poisonGame, CONFIG.fixedStep);
  assert.equal(poisonGame.outcome, InteractionOutcome.POISON_CAPTURE);

  const rodGame = createGame(10);
  rodGame.phase = GamePhase.PLAYING;
  rodGame.fuels = [];
  rodGame.atoms = [];
  rodGame.poisonedFuelIds = [];
  rodGame.random = () => .99;
  Object.assign(rodGame.neutron, { x: CENTER, y: 450, vx: 0, vy: 0, energy: 90, band: EnergyBand.FAST, thermalExposure: 0 });
  rodGame.rods = [{ id: 0, x: CENTER, y: CENTER, width: 18, height: 210, phase: 0 }];
  stepGame(rodGame, CONFIG.fixedStep);
  assert.equal(rodGame.outcome, InteractionOutcome.CONTROL_CAPTURE);
});

test("ledger ratios use aggregate event counts", () => {
  const stats = mergeStats(createEmptyStats(), {
    births: 10,
    slowingStarts: 10,
    thermalized: 8,
    thermalFuelAbsorptions: 4,
    thermalFissions: 3,
    nonFuelThermalAbsorptions: 1,
    newNeutrons: 7,
    fastLeaks: 1,
    thermalLeaks: 2,
    fastFissions: 1
  });
  const ledger = calculateLedger(stats);
  assert.equal(ledger.p, .8);
  assert.equal(ledger.f, .8);
  assert.equal(ledger.eta, 1.75);
  assert.equal(ledger.pf, .9);
  assert.equal(ledger.pt, .75);
  assert.ok(Number.isFinite(ledger.k));
});

test("long fixed-step updates keep bounded transient collections", () => {
  const game = createGame(7);
  game.phase = GamePhase.PLAYING;
  game.neutron.x = CENTER;
  game.neutron.y = CENTER;
  game.neutron.vx = 0;
  game.neutron.vy = 0;
  game.random = () => .99;
  for (let index = 0; index < 25_000; index += 1) {
    if (game.phase === GamePhase.GAMEOVER) break;
    stepGame(game, CONFIG.fixedStep);
  }
  assert.ok(game.neutron.trail.length <= 36);
  assert.ok(game.effects.length <= 70);
});
