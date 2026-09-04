export const WORLD_SIZE = 1000;
export const CENTER = WORLD_SIZE / 2;
export const ARENA_RADIUS = 445;

export const CONFIG = Object.freeze({
  fixedStep: 1 / 120,
  fastThreshold: 58,
  thermalThreshold: 24,
  startEnergy: 100,
  turnRate: 5.4,
  steeringEnergyBonus: 0.35,
  steeringDeadzone: 0.035,
  neutronRadius: 8,
  deuteriumRadius: 11,
  deuteriumMinSpeed: 13,
  deuteriumMaxSpeed: 27,
  deuteriumCollisionKick: 9,
  fuelRadius: 34,
  thermalCaptureRate: 0.034,
  thermalGraceSeconds: 2.2,
  fissionTransitionSeconds: 0.78,
  burstLifetime: 5.2,
  burstSpawnRate: 0.085,
  burstMinThermalSeconds: 4
});

export const EnergyBand = Object.freeze({ FAST: "fast", RESONANCE: "resonance", THERMAL: "thermal" });
export const GamePhase = Object.freeze({ READY: "ready", PLAYING: "playing", FISSION: "fission", PAUSED: "paused", GAMEOVER: "gameover" });
export const Material = Object.freeze({ MODERATOR: "moderator", DEUTERIUM: "deuterium", FUEL: "fuel", POISON: "poison", ABSORBER: "absorber", BOUNDARY: "boundary" });
export const InteractionOutcome = Object.freeze({
  SCATTER: "scatter",
  PASS: "pass",
  FAST_FISSION: "fast-fission",
  POISON_CAPTURE: "poison-capture",
  THERMAL_FISSION: "thermal-fission",
  PARASITIC_CAPTURE: "parasitic-capture",
  CONTROL_CAPTURE: "control-capture",
  FAST_LEAK: "fast-leak",
  THERMAL_LEAK: "thermal-leak",
  LINEAGE_JUMP: "lineage-jump"
});

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
export function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
export function energyBand(energy) {
  if (energy > CONFIG.fastThreshold) return EnergyBand.FAST;
  if (energy > CONFIG.thermalThreshold) return EnergyBand.RESONANCE;
  return EnergyBand.THERMAL;
}

export function speedForEnergy(energy) {
  return 62 + Math.sqrt(clamp(energy, 1, 100) / 100) * 195;
}

export function scatterEnergy(energy, incidence) {
  const headOn = clamp(Math.abs(incidence), 0, 1);
  return clamp(energy * (0.86 - headOn * 0.23), 8, 100);
}

export function thermalCaptureProbability(exposureSeconds) {
  const active = Math.max(0, exposureSeconds - CONFIG.thermalGraceSeconds);
  return 1 - Math.exp(-CONFIG.thermalCaptureRate * active);
}

export function resolveFuelInteraction(band) {
  return band === EnergyBand.THERMAL ? InteractionOutcome.THERMAL_FISSION : InteractionOutcome.PASS;
}

export function createEmptyStats() {
  return {
    births: 0,
    slowingStarts: 0,
    thermalized: 0,
    deuteriumHits: 0,
    fastFissions: 0,
    thermalFuelAbsorptions: 0,
    thermalFissions: 0,
    nonFuelThermalAbsorptions: 0,
    newNeutrons: 0,
    fastLeaks: 0,
    thermalLeaks: 0,
    poisonCaptures: 0,
    lineageJumps: 0
  };
}

export function mergeStats(left, right) {
  const result = createEmptyStats();
  for (const key of Object.keys(result)) result[key] = Number(left?.[key] || 0) + Number(right?.[key] || 0);
  return result;
}

export function calculateLedger(stats) {
  const base = Math.max(1, stats.thermalFissions * 2.43);
  const epsilon = stats.thermalFissions ? (base + stats.fastFissions * 2.5) / base : 1;
  const p = stats.slowingStarts ? clamp(stats.thermalized / stats.slowingStarts, 0, 1) : 0;
  const thermalAbsorptions = stats.thermalFuelAbsorptions + stats.nonFuelThermalAbsorptions;
  const f = thermalAbsorptions ? stats.thermalFuelAbsorptions / thermalAbsorptions : 0;
  const eta = stats.thermalFuelAbsorptions ? stats.newNeutrons / stats.thermalFuelAbsorptions : 0;
  const pf = stats.births ? clamp(1 - stats.fastLeaks / stats.births, 0, 1) : 0;
  const pt = stats.thermalized ? clamp(1 - stats.thermalLeaks / stats.thermalized, 0, 1) : 0;
  const k = epsilon * p * f * eta * pf * pt;
  return { epsilon, p, f, eta, pf, pt, k };
}

function randomPointInArena(random, margin = 65) {
  const angle = random() * Math.PI * 2;
  const radius = Math.sqrt(random()) * (ARENA_RADIUS - margin);
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function fuelLattice() {
  const channels = [{ id: 0, x: CENTER, y: CENTER, radius: CONFIG.fuelRadius }];
  const rings = [
    { count: 6, radius: 190, offset: 0 },
    { count: 12, radius: 350, offset: Math.PI / 12 }
  ];
  for (const ring of rings) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = ring.offset + index * Math.PI * 2 / ring.count;
      channels.push({
        id: channels.length,
        x: CENTER + Math.cos(angle) * ring.radius,
        y: CENTER + Math.sin(angle) * ring.radius,
        radius: CONFIG.fuelRadius
      });
    }
  }
  return channels;
}

function makeDeuterium(random, fuels) {
  const atoms = [];
  let attempts = 0;
  while (atoms.length < 62 && attempts < 2000) {
    attempts += 1;
    const point = randomPointInArena(random, 36);
    if (fuels.every((fuel) => distance(point, fuel) > fuel.radius + 30) && atoms.every((atom) => distance(point, atom) > 31)) {
      const angle = random() * Math.PI * 2;
      const speed = CONFIG.deuteriumMinSpeed + random() * (CONFIG.deuteriumMaxSpeed - CONFIG.deuteriumMinSpeed);
      atoms.push({
        id: atoms.length,
        ...point,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        phase: random() * Math.PI * 2,
        flash: 0
      });
    }
  }
  return atoms;
}

function choosePoisonedFuels(random, fuels, excludeId, generation) {
  const count = Math.min(7, 2 + Math.floor((generation - 1) / 4));
  const candidates = fuels.filter((fuel) => fuel.id !== excludeId).map((fuel) => fuel.id);
  for (let index = candidates.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
  }
  return candidates.slice(0, count);
}

function makeControlRods(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: CENTER + (index - (count - 1) / 2) * 180,
    y: CENTER,
    width: 18,
    height: 210,
    phase: index * 1.7
  }));
}

function spawnNeutron(random, fuels, fuelIndex = null) {
  const fuel = fuels[fuelIndex ?? 0];
  const distanceFromCenter = Math.hypot(fuel.x - CENTER, fuel.y - CENTER);
  const angle = distanceFromCenter > 260
    ? Math.atan2(CENTER - fuel.y, CENTER - fuel.x) + (random() - 0.5) * 1.0
    : random() * Math.PI * 2;
  const energy = CONFIG.startEnergy;
  const speed = speedForEnergy(energy);
  return {
    x: fuel.x + Math.cos(angle) * (fuel.radius + 14),
    y: fuel.y + Math.sin(angle) * (fuel.radius + 14),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    energy,
    band: EnergyBand.FAST,
    thermalExposure: 0,
    lastFuelId: fuel.id,
    fuelCooldown: 0.3,
    atomCooldown: 0,
    trail: []
  };
}

export function createGame(seed = Date.now()) {
  const random = mulberry32(seed);
  const fuels = fuelLattice();
  const neutron = spawnNeutron(random, fuels);
  const stats = createEmptyStats();
  stats.births = 1;
  stats.slowingStarts = 1;
  return {
    seed,
    random,
    phase: GamePhase.READY,
    phaseBeforePause: GamePhase.PLAYING,
    time: 0,
    generation: 1,
    score: 0,
    neutron,
    fuels,
    atoms: makeDeuterium(random, fuels),
    poisonedFuelIds: choosePoisonedFuels(random, fuels, neutron.lastFuelId, 1),
    rods: [],
    burst: null,
    burstCooldown: 7,
    input: { x: 0, y: 0 },
    stats,
    effects: [],
    message: "Born fast — slow down in heavy water",
    messageTime: 2.4,
    outcome: null,
    fission: null,
    thermalizedThisBirth: false
  };
}

export function startGame(game) {
  if (game.phase === GamePhase.READY) game.phase = GamePhase.PLAYING;
  return game;
}

export function setInput(game, x, y) {
  const length = Math.hypot(x, y);
  game.input.x = length > 1 ? x / length : x;
  game.input.y = length > 1 ? y / length : y;
}

export function togglePause(game, forced) {
  if (forced === true && game.phase !== GamePhase.PAUSED && [GamePhase.PLAYING, GamePhase.FISSION].includes(game.phase)) {
    game.phaseBeforePause = game.phase;
    game.phase = GamePhase.PAUSED;
  } else if (forced === false && game.phase === GamePhase.PAUSED) {
    game.phase = game.phaseBeforePause;
  } else if (forced == null) {
    if (game.phase === GamePhase.PAUSED) game.phase = game.phaseBeforePause;
    else if ([GamePhase.PLAYING, GamePhase.FISSION].includes(game.phase)) {
      game.phaseBeforePause = game.phase;
      game.phase = GamePhase.PAUSED;
    }
  }
  return game;
}

function pushEffect(game, type, x, y, color, life = 0.65) {
  game.effects.push({ type, x, y, color, life, maxLife: life });
  if (game.effects.length > 70) game.effects.splice(0, game.effects.length - 70);
}

function announce(game, message, duration = 1.7) {
  game.message = message;
  game.messageTime = duration;
}

function endGame(game, outcome) {
  if (game.phase === GamePhase.GAMEOVER) return;
  game.phase = GamePhase.GAMEOVER;
  game.outcome = outcome;
  game.input.x = 0;
  game.input.y = 0;
}

function beginFission(game, kind, fuel) {
  if (game.phase !== GamePhase.PLAYING) return;
  const count = game.random() < 0.57 ? 2 : 3;
  if (kind === InteractionOutcome.FAST_FISSION) {
    game.stats.fastFissions += 1;
    game.score += 650;
    announce(game, `Fission — ${count} fast neutrons born`, 2);
  } else {
    game.stats.thermalFuelAbsorptions += 1;
    game.stats.thermalFissions += 1;
    game.stats.newNeutrons += count;
    game.score += 1000 + Math.max(0, 400 - Math.round(game.neutron.thermalExposure * 20));
    announce(game, `Fission — generation ${game.generation + 1}`, 2);
  }
  game.phase = GamePhase.FISSION;
  game.fission = { timer: CONFIG.fissionTransitionSeconds, fuelId: fuel.id, count, kind };
  pushEffect(game, "fission", fuel.x, fuel.y, kind === InteractionOutcome.FAST_FISSION ? "#ffb85a" : "#71f6e7", 0.9);
}

function finishFission(game) {
  const fuel = game.fuels.find((item) => item.id === game.fission.fuelId);
  game.generation += 1;
  game.neutron = spawnNeutron(game.random, game.fuels, fuel.id);
  game.stats.births += 1;
  game.stats.slowingStarts += 1;
  game.thermalizedThisBirth = false;
  game.burst = null;
  game.burstCooldown = 6 + game.random() * 5;
  const rodCount = game.generation >= 5 ? Math.min(3, 1 + Math.floor((game.generation - 5) / 5)) : 0;
  game.poisonedFuelIds = choosePoisonedFuels(game.random, game.fuels, fuel.id, game.generation);
  game.rods = makeControlRods(rodCount);
  game.fission = null;
  game.phase = GamePhase.PLAYING;
}

function steerNeutron(game, dt) {
  const neutron = game.neutron;
  if (Math.hypot(game.input.x, game.input.y) < CONFIG.steeringDeadzone) return;
  const current = Math.atan2(neutron.vy, neutron.vx);
  const target = Math.atan2(game.input.y, game.input.x);
  let difference = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  const energyAssist = 1 + (1 - neutron.energy / CONFIG.startEnergy) * CONFIG.steeringEnergyBonus;
  const maximumTurn = CONFIG.turnRate * energyAssist * dt;
  difference = clamp(difference, -maximumTurn, maximumTurn);
  const next = current + difference;
  const speed = speedForEnergy(neutron.energy);
  neutron.vx = Math.cos(next) * speed;
  neutron.vy = Math.sin(next) * speed;
}

function scatter(game, atom) {
  const neutron = game.neutron;
  const dx = neutron.x - atom.x;
  const dy = neutron.y - atom.y;
  const length = Math.max(0.001, Math.hypot(dx, dy));
  const nx = dx / length;
  const ny = dy / length;
  const speed = Math.max(1, Math.hypot(neutron.vx, neutron.vy));
  atom.vx += neutron.vx / speed * CONFIG.deuteriumCollisionKick;
  atom.vy += neutron.vy / speed * CONFIG.deuteriumCollisionKick;
  const atomSpeed = Math.hypot(atom.vx, atom.vy);
  const maximumAtomSpeed = CONFIG.deuteriumMaxSpeed + CONFIG.deuteriumCollisionKick;
  if (atomSpeed > maximumAtomSpeed) {
    atom.vx = atom.vx / atomSpeed * maximumAtomSpeed;
    atom.vy = atom.vy / atomSpeed * maximumAtomSpeed;
  }
  const approach = clamp(Math.abs((neutron.vx / speed) * nx + (neutron.vy / speed) * ny), 0.18, 1);
  const beforeBand = neutron.band;
  neutron.energy = scatterEnergy(neutron.energy, approach);
  neutron.band = energyBand(neutron.energy);
  const tangentAngle = Math.atan2(ny, nx) + (game.random() - 0.5) * 1.15;
  const nextSpeed = speedForEnergy(neutron.energy);
  neutron.vx = Math.cos(tangentAngle) * nextSpeed;
  neutron.vy = Math.sin(tangentAngle) * nextSpeed;
  neutron.x = atom.x + nx * (CONFIG.deuteriumRadius + CONFIG.neutronRadius + 2);
  neutron.y = atom.y + ny * (CONFIG.deuteriumRadius + CONFIG.neutronRadius + 2);
  neutron.atomCooldown = 0.12;
  atom.flash = 0.35;
  game.stats.deuteriumHits += 1;
  game.score += 24;
  pushEffect(game, "scatter", atom.x, atom.y, neutron.band === EnergyBand.THERMAL ? "#71f6e7" : "#ffb85a", 0.38);
  if (beforeBand !== neutron.band) {
    if (neutron.band === EnergyBand.RESONANCE) announce(game, "Resonance range — avoid fuel", 2.2);
    if (neutron.band === EnergyBand.THERMAL) {
      game.stats.thermalized += 1;
      game.thermalizedThisBirth = true;
      announce(game, "Thermal — seek fuel", 2.2);
    }
  }
}

function updateDeuterium(game, dt) {
  const boundaryRadius = ARENA_RADIUS - CONFIG.deuteriumRadius - 5;
  for (const atom of game.atoms) {
    atom.x += atom.vx * dt;
    atom.y += atom.vy * dt;

    const centerX = atom.x - CENTER;
    const centerY = atom.y - CENTER;
    const radialDistance = Math.hypot(centerX, centerY);
    if (radialDistance > boundaryRadius) {
      const normalX = centerX / radialDistance;
      const normalY = centerY / radialDistance;
      atom.x = CENTER + normalX * boundaryRadius;
      atom.y = CENTER + normalY * boundaryRadius;
      const outwardSpeed = atom.vx * normalX + atom.vy * normalY;
      if (outwardSpeed > 0) {
        atom.vx -= 2 * outwardSpeed * normalX;
        atom.vy -= 2 * outwardSpeed * normalY;
      }
    }

    for (const fuel of game.fuels) {
      const dx = atom.x - fuel.x;
      const dy = atom.y - fuel.y;
      const separation = Math.hypot(dx, dy);
      const minimumSeparation = fuel.radius + CONFIG.deuteriumRadius + 5;
      if (separation > 0 && separation < minimumSeparation) {
        const normalX = dx / separation;
        const normalY = dy / separation;
        atom.x = fuel.x + normalX * minimumSeparation;
        atom.y = fuel.y + normalY * minimumSeparation;
        const inwardSpeed = atom.vx * normalX + atom.vy * normalY;
        if (inwardSpeed < 0) {
          atom.vx -= 2 * inwardSpeed * normalX;
          atom.vy -= 2 * inwardSpeed * normalY;
        }
        break;
      }
    }
  }
}

function updateNeutron(game, dt) {
  const neutron = game.neutron;
  steerNeutron(game, dt);
  neutron.x += neutron.vx * dt;
  neutron.y += neutron.vy * dt;
  neutron.fuelCooldown = Math.max(0, neutron.fuelCooldown - dt);
  neutron.atomCooldown = Math.max(0, neutron.atomCooldown - dt);
  neutron.trail.push({ x: neutron.x, y: neutron.y, life: 1 });
  if (neutron.trail.length > 36) neutron.trail.shift();
  neutron.trail.forEach((point) => { point.life -= dt * 1.75; });
  neutron.trail = neutron.trail.filter((point) => point.life > 0);

  const fromCenter = Math.hypot(neutron.x - CENTER, neutron.y - CENTER);
  if (fromCenter > ARENA_RADIUS + CONFIG.neutronRadius) {
    if (neutron.band === EnergyBand.THERMAL) {
      game.stats.thermalLeaks += 1;
      endGame(game, InteractionOutcome.THERMAL_LEAK);
    } else {
      game.stats.fastLeaks += 1;
      endGame(game, InteractionOutcome.FAST_LEAK);
    }
    return;
  }

  if (neutron.atomCooldown <= 0) {
    for (const atom of game.atoms) {
      if (distance(neutron, atom) < CONFIG.neutronRadius + CONFIG.deuteriumRadius) {
        scatter(game, atom);
        break;
      }
    }
  }

  for (const fuel of game.fuels) {
    const inside = distance(neutron, fuel) < fuel.radius;
    if (!inside && neutron.lastFuelId === fuel.id && neutron.fuelCooldown <= 0) neutron.lastFuelId = null;
    if (inside && neutron.lastFuelId !== fuel.id && neutron.fuelCooldown <= 0) {
      neutron.lastFuelId = fuel.id;
      neutron.fuelCooldown = 0.36;
      if (game.poisonedFuelIds.includes(fuel.id)) {
        game.stats.poisonCaptures += 1;
        if (neutron.band === EnergyBand.THERMAL) game.stats.nonFuelThermalAbsorptions += 1;
        pushEffect(game, "capture", neutron.x, neutron.y, "#89ff66", 0.72);
        endGame(game, InteractionOutcome.POISON_CAPTURE);
        return;
      }
      const outcome = resolveFuelInteraction(neutron.band);
      if (outcome === InteractionOutcome.PASS) {
        announce(game, neutron.band === EnergyBand.FAST ? "Too fast — passed through fuel" : "Almost there — keep moderating", 1.65);
        game.score += 10;
      } else {
        beginFission(game, outcome, fuel);
        return;
      }
    }
  }

  for (const rod of game.rods) {
    const insertion = (Math.sin(game.time * 0.72 + rod.phase) + 1) / 2;
    const top = CENTER - 340 + insertion * 260;
    if (Math.abs(neutron.x - rod.x) < rod.width + CONFIG.neutronRadius && neutron.y > top && neutron.y < top + rod.height) {
      if (neutron.band === EnergyBand.THERMAL) game.stats.nonFuelThermalAbsorptions += 1;
      endGame(game, InteractionOutcome.CONTROL_CAPTURE);
      return;
    }
  }

  if (neutron.band === EnergyBand.THERMAL) {
    neutron.thermalExposure += dt;
    const activeTime = Math.max(0, neutron.thermalExposure - CONFIG.thermalGraceSeconds);
    if (activeTime > 0 && game.random() < 1 - Math.exp(-CONFIG.thermalCaptureRate * dt)) {
      game.stats.nonFuelThermalAbsorptions += 1;
      endGame(game, InteractionOutcome.PARASITIC_CAPTURE);
      return;
    }
  }

  if (game.burst && distance(neutron, game.burst) < game.burst.radius + CONFIG.neutronRadius) {
    const angle = game.random() * Math.PI * 2;
    neutron.x = game.burst.x;
    neutron.y = game.burst.y;
    neutron.energy = CONFIG.startEnergy;
    neutron.band = EnergyBand.FAST;
    neutron.thermalExposure = 0;
    neutron.vx = Math.cos(angle) * speedForEnergy(neutron.energy);
    neutron.vy = Math.sin(angle) * speedForEnergy(neutron.energy);
    neutron.fuelCooldown = 0.25;
    neutron.lastFuelId = null;
    neutron.trail = [];
    game.thermalizedThisBirth = false;
    game.stats.lineageJumps += 1;
    game.stats.births += 1;
    game.stats.slowingStarts += 1;
    game.score += 125;
    pushEffect(game, "fission", game.burst.x, game.burst.y, "#71f6e7", 0.7);
    game.burst = null;
    game.burstCooldown = 12;
    announce(game, "Lineage jump — fast again", 2);
  }
}

function updateBurst(game, dt) {
  game.burstCooldown = Math.max(0, game.burstCooldown - dt);
  if (game.burst) {
    game.burst.life -= dt;
    if (game.burst.life <= 0) game.burst = null;
    return;
  }
  if (game.neutron.band !== EnergyBand.THERMAL || game.neutron.thermalExposure < CONFIG.burstMinThermalSeconds || game.burstCooldown > 0) return;
  if (game.random() < 1 - Math.exp(-CONFIG.burstSpawnRate * dt)) {
    const candidates = game.fuels.filter((fuel) => distance(fuel, game.neutron) > 180);
    const fuel = candidates[Math.floor(game.random() * candidates.length)] || game.fuels[0];
    const angle = game.random() * Math.PI * 2;
    game.burst = {
      x: fuel.x + Math.cos(angle) * (fuel.radius + 50),
      y: fuel.y + Math.sin(angle) * (fuel.radius + 50),
      radius: 18,
      life: CONFIG.burstLifetime,
      maxLife: CONFIG.burstLifetime
    };
    announce(game, "Nearby fission — catch the newborn", 2.1);
  }
}

export function stepGame(game, dt) {
  if (![GamePhase.PLAYING, GamePhase.FISSION].includes(game.phase)) return game;
  dt = clamp(dt, 0, 0.05);
  game.time += dt;
  game.messageTime = Math.max(0, game.messageTime - dt);
  game.effects.forEach((effect) => { effect.life -= dt; });
  game.effects = game.effects.filter((effect) => effect.life > 0);
  game.atoms.forEach((atom) => { atom.flash = Math.max(0, atom.flash - dt); });
  updateDeuterium(game, dt);

  if (game.phase === GamePhase.FISSION) {
    game.fission.timer -= dt;
    if (game.fission.timer <= 0) finishFission(game);
    return game;
  }

  updateNeutron(game, dt);
  if (game.phase === GamePhase.PLAYING) updateBurst(game, dt);
  return game;
}

export const OUTCOME_COPY = Object.freeze({
  [InteractionOutcome.POISON_CAPTURE]: {
    title: "Captured by neutron poison",
    explanation: "A poisoned fuel channel absorbed you before you could continue the lineage.",
    tip: "Radioactive-green channels are poisoned. Give their glow a wide berth at every energy."
  },
  [InteractionOutcome.PARASITIC_CAPTURE]: {
    title: "Parasitic capture",
    explanation: "After thermalizing, you wandered long enough to be absorbed outside the fuel.",
    tip: "Once the energy meter turns cyan, take the shortest safe route to a fuel channel."
  },
  [InteractionOutcome.CONTROL_CAPTURE]: {
    title: "Captured by an absorber",
    explanation: "A control rod removed your neutron from the chain reaction.",
    tip: "Control rods are lethal at every speed. Watch their magenta insertion path before crossing."
  },
  [InteractionOutcome.FAST_LEAK]: {
    title: "Fast leakage",
    explanation: "You crossed the calandria boundary before the moderator could slow you down.",
    tip: "Turn back early and use central moderator lanes while your speed is high."
  },
  [InteractionOutcome.THERMAL_LEAK]: {
    title: "Thermal leakage",
    explanation: "You escaped the reactor boundary after becoming thermal.",
    tip: "Thermal neutrons move slowly; choose a nearby fuel channel rather than drifting outward."
  }
});
