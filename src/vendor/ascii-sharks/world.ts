/**
 * Artificial-life sim for the hero: tiny fish schools and the sharks that hunt them.
 *
 * Fish: Reynolds boids (separation / alignment / cohesion) in Couzin-style
 * zones, with a blind spot behind each fish. Alarm spreads from fish to fish
 * through the school (a "wave of agitation"), so a whole school bolts even
 * when only its edge can see the shark. Fleeing fish break sideways around the
 * shark's path, which gives the fountain effect seen in real bait balls.
 *
 * Sharks: Reynolds steering (wander + pursuit + separation) on a
 * follow-the-leader spine. Hunger builds over time and drops when they eat.
 * They prefer fish in sparse spots, since dense schools confuse predators,
 * so stragglers get picked off. Eaten fish come back later as new schools
 * swimming in from the edges, which keeps the population steady.
 */
import { angleDiff, clamp, current, rand, randInt, TAU } from "./math";
import { pickSpecies, SPECIES } from "./species";

export const SHARK_NODES = 20;

export type SharkKind = "classic" | "hammerhead" | "zebra" | "tiger" | "greathammer" | "mako" | "thresher" | "nurse";

/** Which sharks to put in the water; size is relative to the biggest. */
export type SharkSpec = { kind: SharkKind; size: number };

// The landing hero: four of the same shark at different depths.
const DEFAULT_SHARKS: SharkSpec[] = [
  { kind: "classic", size: 1 },
  { kind: "classic", size: 0.7 },
  { kind: "classic", size: 0.84 },
  { kind: "classic", size: 0.77 },
];

export interface Fish {
  x: number;
  y: number;
  vx: number;
  vy: number;
  species: number;
  /** 0 calm → 1 panicking. Spreads to neighbours. */
  alarm: number;
  alive: boolean;
  respawnAt: number;
  /** Tail-beat phase. */
  phase: number;
  /** Smoothed angular velocity (rad/s); hard turns flash silver. */
  turn: number;
  /** 0.55 far → 1 near. */
  depth: number;
  /** Rotation sense shared by a school when it mills into a bait ball. */
  millDir: 1 | -1;
}

export interface Shark {
  id: number;
  kind: SharkKind;
  length: number;
  /** Spine positions, snout first: [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  heading: number;
  speed: number;
  /** Tail-beat phase; drives the body wave in the renderer. */
  phase: number;
  /** Smoothed angular velocity (rad/s); the shark banks its fins into turns. */
  turn: number;
  hunger: number;
  wander: number;
  orbitDir: 1 | -1;
  orbitRadius: number;
  target: Fish | null;
  retargetAt: number;
  /** 0 far / dim → 1 near / bright. */
  depth: number;
  /** Local change: an away shark swims out of the frame and waits there until called back. */
  away: boolean;
}

export interface WorldEvent {
  kind: "eat" | "splash";
  x: number;
  y: number;
}

const FISH_SEPARATION_K = 420;
const FISH_ALIGN_K = 1.4;
const FISH_COHESION_K = 1;
const FISH_FLEE_K = 1100;
const BLIND_COS = -0.6; // ~127° either side of the heading is visible

export class World {
  width = 0;
  height = 0;
  time = 0;
  fish: Fish[] = [];
  sharks: Shark[] = [];
  events: WorldEvent[] = [];
  /** Local change: `movedAt` is the world time of the last pointer move, so sharks lose interest in a cursor that sits still. */
  pointer = { x: 0, y: 0, active: false, movedAt: -1e9 };
  /** Local change: bait dropped by a click; every shark in the water races for it until one gets there. */
  bait: { x: number; y: number; until: number } | null = null;

  // Local changes: knobs the page turns while it scrolls.
  /** A current, in px/s, that carries every fish (and nudges the sharks). Fish swept out one side come back in the other. */
  drift = { x: 0, y: 0 };
  /** Where the sharks patrol around and keep clear of; null means the middle of the frame. */
  focus: { x: number; y: number } | null = null;
  /** Half-size in px of the zone around the focus that sharks steer out of; null keeps the default. */
  clear: { rx: number; ry: number } | null = null;
  /** How hard sharks are pushed out of that zone (1 = upstream's gentle nudge). */
  clearStrength = 1;
  /** Share of the fish population that may be in the water, 0..1. Lower it to thin the schools out. */
  fishShare = 1;

  /** Fish neighbourhood radius; the spatial hash bucket size matches it. */
  private perception = 60;
  /** Per-species personal space in px (x, y). */
  private sepX: number[] = [];
  private sepY: number[] = [];
  private foreignSep = 40;
  private bucketCols = 0;
  private bucketRows = 0;
  private bucketHead = new Int32Array(0);
  private bucketCount = new Uint16Array(0);
  private bucketNext = new Int32Array(0);
  private lastSpawn = 0;
  private aliveCount = 0;
  private tmp = { x: 0, y: 0 };

  /** fishCount overrides the area-based population (the sidebar wants a single small school). */
  constructor(
    private sharkSpecs: SharkSpec[] = DEFAULT_SHARKS,
    private fishCount?: number,
  ) {}

  resize(width: number, height: number, cellW: number, cellH: number) {
    const first = this.width === 0;
    this.width = width;
    this.height = height;
    // Spacing is set in grid cells so every fish lands in its own cell.
    this.sepX = SPECIES.map((sp) => sp.spacing[0] * cellW);
    this.sepY = SPECIES.map((sp) => sp.spacing[1] * cellH);
    this.perception = Math.max(cellH * 3, cellW * 5.5);
    this.foreignSep = cellW * 3;

    if (first || this.fish.length === 0) {
      this.seed();
      return;
    }
    for (const f of this.fish) {
      f.x = clamp(f.x, 0, width);
      f.y = clamp(f.y, 0, height);
    }
  }

  seed() {
    const { width: W, height: H } = this;
    const minSide = Math.min(W, H);
    const baseLength = clamp(minSide * 0.44, 170, 430);
    const sharkCount = this.sharkSpecs.length;

    this.sharks = [];
    for (let i = 0; i < sharkCount; i++) {
      const { kind, size } = this.sharkSpecs[i];
      const length = baseLength * size;
      const orbitRadius = minSide * rand(0.28, 0.4);
      const a = (i / sharkCount) * TAU + rand(-0.4, 0.4);
      const orbitDir: 1 | -1 = i % 2 === 0 ? 1 : -1;
      const x = W / 2 + Math.cos(a) * orbitRadius * (W / minSide) * 0.9;
      const y = H / 2 + Math.sin(a) * orbitRadius;
      const heading = a + (orbitDir * Math.PI) / 2;
      const nodes = new Float32Array(SHARK_NODES * 2);
      const seg = length / (SHARK_NODES - 1);
      for (let n = 0; n < SHARK_NODES; n++) {
        nodes[n * 2] = x - Math.cos(heading) * seg * n;
        nodes[n * 2 + 1] = y - Math.sin(heading) * seg * n;
      }
      this.sharks.push({
        id: i + 1,
        kind,
        length,
        nodes,
        heading,
        speed: 30,
        phase: rand(0, TAU),
        turn: 0,
        hunger: rand(0.25, 0.75),
        wander: 0,
        orbitDir,
        orbitRadius,
        target: null,
        retargetAt: 0,
        depth: size,
        away: false,
      });
    }
    // Smaller (farther) sharks draw first so the big one swims over them.
    this.sharks.sort((a, b) => a.length - b.length);

    const total = this.fishCount ?? clamp(Math.round((W * H) / 4400), 85, 340);
    this.fish = [];
    while (this.fish.length < total) {
      const species = pickSpecies();
      const sp = SPECIES[species];
      const size = Math.min(randInt(sp.schoolSize[0], sp.schoolSize[1]), total - this.fish.length);
      const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      const cx = rand(W * 0.06, W * 0.94);
      const cy = rand(H * 0.08, H * 0.92);
      // Mostly level headings: fish cruise sideways far more than up or down.
      const dir = (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.5, 0.5);
      for (let k = 0; k < size; k++) {
        this.fish.push({
          x: cx + rand(-1, 1) * this.sepX[species] * Math.sqrt(size),
          y: cy + rand(-1, 1) * this.sepY[species] * Math.sqrt(size) * 0.6,
          vx: Math.cos(dir) * sp.cruise,
          vy: Math.sin(dir) * sp.cruise,
          species,
          alarm: 0,
          alive: true,
          respawnAt: 0,
          phase: rand(0, TAU),
          turn: 0,
          depth: rand(0.55, 1),
          millDir,
        });
      }
    }
    this.bucketNext = new Int32Array(this.fish.length);
  }

  splash(x: number, y: number) {
    this.events.push({ kind: "splash", x, y });
    const r = 240;
    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.hypot(dx, dy);
      if (d > r || d < 1e-3) continue;
      // Flash expansion: everybody nearby bolts straight out.
      const k = (1 - d / r) * 260;
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k;
      f.alarm = 1;
    }
  }

  /** Local change: drops bait at a point (the page calls this on a click or tap). */
  lure(x: number, y: number) {
    this.bait = { x, y, until: this.time + 9 };
  }

  step(dt: number) {
    this.time += dt;
    if (this.bait && this.time >= this.bait.until) this.bait = null;
    this.aliveCount = 0;
    for (const f of this.fish) if (f.alive) this.aliveCount++;
    this.rebuildHash();
    this.stepFish(dt);
    this.stepSharks(dt);
    this.respawn();
  }

  private rebuildHash() {
    const size = this.perception;
    const pad = 2;
    this.bucketCols = Math.ceil(this.width / size) + pad * 2;
    this.bucketRows = Math.ceil(this.height / size) + pad * 2;
    const n = this.bucketCols * this.bucketRows;
    if (this.bucketHead.length !== n) {
      this.bucketHead = new Int32Array(n);
      this.bucketCount = new Uint16Array(n);
    }
    this.bucketHead.fill(-1);
    this.bucketCount.fill(0);
    if (this.bucketNext.length !== this.fish.length) {
      this.bucketNext = new Int32Array(this.fish.length);
    }
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      if (!f.alive) continue;
      const b = this.bucketOf(f.x, f.y);
      this.bucketNext[i] = this.bucketHead[b];
      this.bucketHead[b] = i;
      this.bucketCount[b]++;
    }
  }

  private bucketOf(x: number, y: number) {
    const size = this.perception;
    const c = clamp(Math.floor(x / size) + 2, 0, this.bucketCols - 1);
    const r = clamp(Math.floor(y / size) + 2, 0, this.bucketRows - 1);
    return r * this.bucketCols + c;
  }

  private stepFish(dt: number) {
    const { fish, sharks, pointer, width: W, height: H, time } = this;
    const R = this.perception;
    const R2 = R * R;
    const foreignSep = this.foreignSep;
    const size = this.perception;
    const cols = this.bucketCols;
    const rows = this.bucketRows;
    const head = this.bucketHead;
    const next = this.bucketNext;
    const cur = this.tmp;
    const calmDecay = Math.exp(-dt * 0.7);
    const contagion = Math.min(1, dt * 6);

    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      if (!f.alive) continue;
      const sp = SPECIES[f.species];
      // Alarmed fish want more room: the school flashes apart around a
      // shark and closes back up once the threat fades.
      const spread = 1 + 1.8 * f.alarm;
      const sepX = this.sepX[f.species] * spread;
      const sepY = this.sepY[f.species] * spread;

      const speed = Math.hypot(f.vx, f.vy) || 1;
      const hx = f.vx / speed;
      const hy = f.vy / speed;

      let ax = 0;
      let ay = 0;
      let sx = 0;
      let sy = 0;
      let avx = 0;
      let avy = 0;
      let cx = 0;
      let cy = 0;
      let n = 0;
      let neighbourAlarm = 0;

      const bc = clamp(Math.floor(f.x / size) + 2, 0, cols - 1);
      const br = clamp(Math.floor(f.y / size) + 2, 0, rows - 1);
      for (let r = Math.max(0, br - 1); r <= Math.min(rows - 1, br + 1); r++) {
        for (let c = Math.max(0, bc - 1); c <= Math.min(cols - 1, bc + 1); c++) {
          let j = head[r * cols + c];
          while (j !== -1) {
            if (j !== i) {
              const o = fish[j];
              const dx = o.x - f.x;
              const dy = o.y - f.y;
              const d2 = dx * dx + dy * dy;
              if (d2 < R2 && d2 > 1e-6) {
                const d = Math.sqrt(d2);
                // Blind zone directly behind the fish.
                if ((dx * hx + dy * hy) / d > BLIND_COS) {
                  // Elliptical personal space: wide along x, tight along y.
                  const qx = dx / sepX;
                  const qy = dy / sepY;
                  const q2 = qx * qx + qy * qy;
                  if (q2 < 1) {
                    const q = Math.sqrt(q2) || 1e-3;
                    const k = (1 - q) / q;
                    sx -= qx * k;
                    sy -= qy * k;
                  }
                  if (o.species === f.species) {
                    avx += o.vx;
                    avy += o.vy;
                    cx += dx;
                    cy += dy;
                    n++;
                  } else if (d < foreignSep) {
                    // Different species keep their own schools.
                    const k = ((1 - d / foreignSep) / d) * 0.6;
                    sx -= dx * k;
                    sy -= dy * k;
                  }
                  if (o.alarm > neighbourAlarm) neighbourAlarm = o.alarm;
                }
              }
            }
            j = next[j];
          }
        }
      }

      ax += sx * FISH_SEPARATION_K;
      ay += sy * FISH_SEPARATION_K;
      if (n > 0) {
        const alignK = FISH_ALIGN_K * sp.align;
        const cohesionK = FISH_COHESION_K * sp.cohesion * (1 - 0.8 * f.alarm);
        ax += (avx / n - f.vx) * alignK + (cx / n) * cohesionK;
        ay += (avy / n - f.vy) * alignK + (cy / n) * cohesionK;
        if (sp.mill > 0) {
          // Circle the local centre: the school spins into a bait ball.
          const cl = Math.hypot(cx, cy) || 1;
          ax += (-cy / cl) * f.millDir * sp.mill * (1 - f.alarm);
          ay += (cx / cl) * f.millDir * sp.mill * (1 - f.alarm);
        }
      }

      // Predators. Distance is measured to the nearest point along the front
      // half of the shark, so fish also give the flanks a wide berth.
      let fear = 0;
      for (const sh of sharks) {
        const fearR = sh.length * 0.6 + 60;
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let k = 0; k <= 12; k += 3) {
          const nx = sh.nodes[k * 2];
          const ny = sh.nodes[k * 2 + 1];
          const d2 = (f.x - nx) ** 2 + (f.y - ny) ** 2;
          if (d2 < best) {
            best = d2;
            bx = nx;
            by = ny;
          }
        }
        const d = Math.sqrt(best);
        if (d >= fearR || d < 1e-3) continue;
        let w = 1 - d / fearR;
        w *= w;
        const awayX = (f.x - bx) / d;
        const awayY = (f.y - by) / d;
        // Fountain effect: break to whichever side of the shark's path you're on.
        const shx = Math.cos(sh.heading);
        const shy = Math.sin(sh.heading);
        const side = shx * (f.y - sh.nodes[1]) - shy * (f.x - sh.nodes[0]) >= 0 ? 1 : -1;
        ax += (awayX * 0.7 - shy * side * 0.9) * FISH_FLEE_K * w;
        ay += (awayY * 0.7 + shx * side * 0.9) * FISH_FLEE_K * w;
        fear = Math.max(fear, Math.sqrt(w));
      }

      if (pointer.active) {
        const pr = 130;
        const dx = f.x - pointer.x;
        const dy = f.y - pointer.y;
        const d = Math.hypot(dx, dy);
        if (d < pr && d > 1e-3) {
          const w = (1 - d / pr) ** 2;
          ax += (dx / d) * FISH_FLEE_K * w;
          ay += (dy / d) * FISH_FLEE_K * w;
          fear = Math.max(fear, Math.sqrt(w) * 0.8);
        }
      }

      // Alarm: direct threat sets it, neighbours pass it along (slightly
      // weaker each hop), and it fades on its own.
      let alarm = Math.max(f.alarm * calmDecay, fear);
      const relayed = neighbourAlarm * 0.86;
      if (relayed > alarm) alarm += (relayed - alarm) * contagion;
      f.alarm = alarm;

      // Soft walls. Local change: the top and bottom walls give way to a vertical current,
      // so fish can be carried out of the frame.
      const m = 36;
      const wallY = 1 - Math.min(1, Math.abs(this.drift.y) / 60);
      if (f.x < m) ax += (m - f.x) * 7;
      else if (f.x > W - m) ax -= (f.x - (W - m)) * 7;
      if (f.y < m) ay += (m - f.y) * 7 * wallY;
      else if (f.y > H - m) ay -= (f.y - (H - m)) * 7 * wallY;

      // Ambient current and a little individual restlessness.
      current(f.x, f.y, time, cur);
      ax += cur.x * 0.5 + (Math.random() - 0.5) * sp.jitter;
      ay += cur.y * 0.5 + (Math.random() - 0.5) * sp.jitter;
      // Swim level, except when bolting from danger.
      ay -= f.vy * sp.verticalDrag * (1 - 0.7 * f.alarm);

      // Relax toward a preferred speed that rises with panic.
      const preferred = sp.cruise * (1 + 1.3 * f.alarm);
      ax += (preferred - speed) * hx * 1.6;
      ay += (preferred - speed) * hy * 1.6;

      const before = Math.atan2(f.vy, f.vx);
      f.vx += ax * dt;
      f.vy += ay * dt;
      const maxSpeed = sp.maxSpeed * (1 + 1.8 * f.alarm);
      const s = Math.hypot(f.vx, f.vy);
      if (s > maxSpeed) {
        f.vx *= maxSpeed / s;
        f.vy *= maxSpeed / s;
      } else if (s < sp.minSpeed && s > 1e-3) {
        f.vx *= sp.minSpeed / s;
        f.vy *= sp.minSpeed / s;
      }
      f.turn += (angleDiff(before, Math.atan2(f.vy, f.vx)) / dt - f.turn) * Math.min(1, dt * 8);
      f.phase += dt * (7 + Math.hypot(f.vx, f.vy) * 0.12);
      f.x = clamp(f.x + (f.vx + this.drift.x) * dt, -60, W + 60);
      f.y += (f.vy + this.drift.y) * dt;
      // Local change: a fish carried out through the top or bottom comes back in the other
      // side, unless the water is meant to be emptier now, in which case it stays out.
      if (f.y < -50 || f.y > H + 50) {
        const carried = (f.y < 0 && this.drift.y < -20) || (f.y > H && this.drift.y > 20);
        if (!carried) {
          f.y = clamp(f.y, -60, H + 60);
        } else if (this.aliveCount > this.fishShare * fish.length) {
          f.alive = false;
          f.respawnAt = time;
          this.aliveCount--;
        } else {
          f.y += f.y < 0 ? H + 100 : -(H + 100);
        }
      }
    }
  }

  private stepSharks(dt: number) {
    const { sharks, width: W, height: H, time } = this;
    const minSide = Math.min(W, H);
    // Local change: patrol around the page's focus point when it sets one.
    const cxW = this.focus?.x ?? W / 2;
    const cyW = this.focus?.y ?? H / 2;
    const clearX = this.clear?.rx ?? W * 0.3;
    const clearY = this.clear?.ry ?? H * 0.16;

    for (const sh of sharks) {
      const L = sh.length;
      const nodes = sh.nodes;

      // Local change: the current nudges sharks too, at a fraction of what fish feel.
      const pushX = this.drift.x * 0.35 * dt;
      const pushY = this.drift.y * 0.35 * dt;
      for (let k = 0; k < SHARK_NODES; k++) {
        nodes[k * 2] += pushX;
        nodes[k * 2 + 1] += pushY;
      }

      const hx = nodes[0];
      const hy = nodes[1];

      // Local change: an away shark heads for the nearest side, then waits just out of frame.
      if (sh.away) {
        const exitX = hx < W / 2 ? -L * 1.6 : W + L * 1.6;
        if (hx < -L * 1.3 || hx > W + L * 1.3) {
          sh.speed = 0;
          continue;
        }
        const desired = Math.atan2(clamp(H / 2 - hy, -1, 1) * 0.15, exitX - hx);
        const maxTurn = 1.1 * dt;
        const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
        sh.heading += turned;
        sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);
        sh.speed += ((30 + L * 0.04) * 2.2 - sh.speed) * Math.min(1, dt * 1.1);
        sh.phase += dt * (2 + sh.speed / 24);
        sh.target = null;
        nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
        nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
        this.trailSpine(sh);
        continue;
      }

      sh.hunger = Math.min(1, sh.hunger + dt * 0.03);

      // Momentum.
      let dx = Math.cos(sh.heading);
      let dy = Math.sin(sh.heading);

      // Wander: a slowly drifting offset on a circle ahead of the snout.
      sh.wander = clamp(sh.wander + (Math.random() - 0.5) * dt * 3.2, -1.1, 1.1);
      dx += Math.cos(sh.heading + sh.wander) * 0.45;
      dy += Math.sin(sh.heading + sh.wander) * 0.45;

      // Local change: how much this shark cares about the visitor's cursor right now.
      // Every shark in the frame notices a moving cursor, nearer ones more; interest
      // fades once the cursor has been still for a few seconds.
      let curious = 0;
      /** The shark circles the cursor at this distance instead of running it over. */
      const near = L * 0.45 + 50;
      // From the snout to the spot the shark gathers at (the cursor, or beside the text).
      let px = 0;
      let py = 0;
      let pd = 1;
      if (this.pointer.active && !this.bait) {
        // The text stays readable: a cursor on the text is ignored (the visitor is reading),
        // and one at its edge gathers the sharks just outside the no-swim zone instead.
        let gx = (this.pointer.x - cxW) / clearX;
        let gy = (this.pointer.y - cyW) / clearY;
        const ge = Math.hypot(gx, gy);
        const guard = Math.min(1, this.clearStrength);
        const keep = 1 + ((near * 1.3) / Math.min(clearX, clearY)) * guard;
        if (ge < keep) {
          // Near the middle of the zone the cursor has no side, so each shark keeps its own.
          const sx = (hx - cxW) / clearX;
          const sy = (hy - cyW) / clearY;
          const se = Math.hypot(sx, sy) || 1;
          const own = 0.5 * (1 - clamp(ge / 0.5, 0, 1));
          const ux = gx + (sx / se) * own;
          const uy = gy + (sy / se) * own;
          const ue = Math.hypot(ux, uy) || 1;
          gx = (ux / ue) * keep;
          gy = (uy / ue) * keep;
          // If that side has no room (text against an edge of the frame), use the opposite one.
          const room = Math.min(near, minSide * 0.2);
          const sideX = cxW + gx * clearX;
          const sideY = cyW + gy * clearY;
          if (sideX < room || sideX > W - room) gx = -gx;
          if (sideY < room || sideY > H - room) gy = -gy;
        }
        px = clamp(cxW + gx * clearX, 0, W) - hx;
        py = clamp(cyW + gy * clearY, 0, H) - hy;
        pd = Math.hypot(px, py) || 1;
        const interest = 1 - clamp((time - this.pointer.movedAt - 5) / 3, 0, 1);
        curious = interest * (0.5 + 0.5 * clamp(1 - pd / Math.hypot(W, H), 0, 1));
        // Inside the zone the pull fades, so the push out of it always wins.
        const zx = (hx - cxW) / clearX;
        const zy = (hy - cyW) / clearY;
        curious *= 1 - guard * (1 - clamp(zx * zx + zy * zy, 0, 1));
        curious *= 1 - guard * (1 - clamp((ge - 0.5) / 0.4, 0, 1));
      }

      // Hunt.
      if (time >= sh.retargetAt) {
        sh.target = this.findPrey(sh);
        sh.retargetAt = time + 0.45;
      }
      const t = sh.target;
      let hunting = false;
      let closing = 0;
      if (t && t.alive && sh.hunger > 0.3) {
        // Pursuit: aim at where the fish is about to be.
        const tx = t.x + t.vx * 0.35 - hx;
        const ty = t.y + t.vy * 0.35 - hy;
        const d = Math.hypot(tx, ty) || 1;
        // Local change: a curious shark is only half-heartedly hunting.
        const w = (1.4 + 2.6 * sh.hunger) * (1 - 0.7 * curious);
        dx += (tx / d) * w;
        dy += (ty / d) * w;
        hunting = true;
        closing = clamp(1 - d / (L * 0.9), 0, 1);
      } else {
        // Patrol: a lazy circuit around the headline.
        const rx = (hx - cxW) / (W / minSide);
        const ry = hy - cyW;
        const r = Math.hypot(rx, ry) || 1;
        const radius = sh.orbitRadius * (1 + 0.15 * Math.sin(time * 0.05 + sh.id));
        const radial = clamp((radius - r) / radius, -1, 1);
        dx += ((-ry / r) * sh.orbitDir + (rx / r) * radial * 0.9) * 0.55;
        dy += ((rx / r) * sh.orbitDir + (ry / r) * radial * 0.9) * 0.55;
      }

      // Local change: the visitor's pointer.
      let rushing = false;
      /** 1 far from the bait, 0 on top of it: the shark brakes so it can turn onto it instead of orbiting. */
      let baitRange = 1;
      /** 1 far from the cursor, 0 once the shark is circling it. */
      let cursorRange = 0;
      const bait = this.bait;
      if (bait) {
        // Bait in the water beats everything else: straight at it, fast.
        const bx = bait.x - hx;
        const by = bait.y - hy;
        const d = Math.hypot(bx, by) || 1;
        dx += (bx / d) * 6;
        dy += (by / d) * 6;
        rushing = true;
        baitRange = clamp(d / (L * 0.8), 0, 1);
        if (d < L * 0.1 + 18) {
          this.events.push({ kind: "eat", x: bait.x, y: bait.y });
          this.bait = null;
          sh.hunger = Math.max(0, sh.hunger - 0.3);
        }
      } else if (curious > 0) {
        // Curiosity: swim over to the cursor, then circle it at about half a body
        // length instead of running it over.
        cursorRange = clamp((pd - near) / (L * 2), 0, 1);
        if (pd > near) {
          dx += (px / pd) * 4 * curious;
          dy += (py / pd) * 4 * curious;
        } else {
          const push = 1 - pd / near;
          dx += ((-py / pd) * sh.orbitDir * 2.4 - (px / pd) * 1.6 * push) * curious;
          dy += ((px / pd) * sh.orbitDir * 2.4 - (py / pd) * 1.6 * push) * curious;
        }
      }

      // Give other sharks room.
      for (const other of sharks) {
        if (other === sh) continue;
        for (let k = 0; k < SHARK_NODES; k += 4) {
          const ox = hx - other.nodes[k * 2];
          const oy = hy - other.nodes[k * 2 + 1];
          const d = Math.hypot(ox, oy);
          const range = (L + other.length) * 0.45;
          if (d < range && d > 1e-3) {
            const w = (1 - d / range) * 3;
            dx += (ox / d) * w;
            dy += (oy / d) * w;
          }
        }
      }

      // Keep the headline mostly clear: a soft elliptical no-swim zone.
      const ex = (hx - cxW) / clearX;
      const ey = (hy - cyW) / clearY;
      const e2 = ex * ex + ey * ey;
      if (e2 < 1) {
        const e = Math.sqrt(e2) || 1e-3;
        const w = (1 - e) * (hunting || rushing ? 1 : 2.5) * this.clearStrength;
        dx += (ex / e) * w;
        dy += (ey / e) * w;
      }

      // Turn back once the snout leaves the frame, so bodies dip off-screen
      // now and then but the sharks never wander away for good.
      const over = Math.max(-hx, hx - W, -hy, hy - H);
      if (over > -L * 0.05) {
        const w = clamp((over + L * 0.05) / (L * 0.35), 0, 1) * 3.5;
        // Local change: aim for the middle of the frame, not the focus, which can sit near an edge.
        const toX = W / 2 - hx;
        const toY = H / 2 - hy;
        const d = Math.hypot(toX, toY) || 1;
        dx += (toX / d) * w;
        dy += (toY / d) * w;
      }

      const desired = Math.atan2(dy, dx);
      // Sharks can't pivot on the spot: the turning circle grows with speed.
      const agility = Math.min(rushing ? 3 : hunting ? 1.7 + closing : 0.8 + 0.6 * curious, sh.speed / (L * 0.22));
      const maxTurn = agility * dt;
      const turned = clamp(angleDiff(sh.heading, desired), -maxTurn, maxTurn);
      sh.heading += turned;
      sh.turn += (turned / dt - sh.turn) * Math.min(1, dt * 3);

      const cruise = 30 + L * 0.04;
      const targetSpeed = rushing
        ? cruise * 1.3 + (Math.max(cruise * 3.8, Math.hypot(W, H) / 6) - cruise * 1.3) * baitRange
        : hunting
          ? cruise * (1.45 + closing * 1.5)
          : cruise * (1 + 0.4 * curious) + Math.max(cruise * 1.2, Math.hypot(W, H) / 16) * curious * cursorRange;
      sh.speed += (targetSpeed - sh.speed) * Math.min(1, dt * (rushing ? 2.5 : 1.1));
      sh.phase += dt * (2 + sh.speed / 24);

      nodes[0] += Math.cos(sh.heading) * sh.speed * dt;
      nodes[1] += Math.sin(sh.heading) * sh.speed * dt;
      this.trailSpine(sh);

      // Feed.
      if (sh.hunger > 0.15) {
        const mouthR = L * 0.05 + 8;
        const mx = nodes[0];
        const my = nodes[1];
        for (const f of this.fish) {
          if (!f.alive) continue;
          if ((f.x - mx) ** 2 + (f.y - my) ** 2 < mouthR * mouthR) {
            f.alive = false;
            f.respawnAt = time + rand(3, 8);
            sh.hunger = Math.max(0, sh.hunger - 0.16);
            this.events.push({ kind: "eat", x: f.x, y: f.y });
          }
        }
      }
    }
  }

  /**
   * Follow-the-leader spine, with a stiffness limit per joint so the
   * body bends into a C at most and never folds back on itself.
   * (Local change: moved out of stepSharks so away sharks can use it too.)
   */
  private trailSpine(sh: Shark) {
    const nodes = sh.nodes;
    const seg = sh.length / (SHARK_NODES - 1);
    const maxBend = 0.16;
    let prevAngle = sh.heading + Math.PI;
    for (let k = 1; k < SHARK_NODES; k++) {
      const px = nodes[(k - 1) * 2];
      const py = nodes[(k - 1) * 2 + 1];
      let angle = Math.atan2(nodes[k * 2 + 1] - py, nodes[k * 2] - px);
      angle = prevAngle + clamp(angleDiff(prevAngle, angle), -maxBend, maxBend);
      nodes[k * 2] = px + Math.cos(angle) * seg;
      nodes[k * 2 + 1] = py + Math.sin(angle) * seg;
      prevAngle = angle;
    }
  }

  /** Local change: moves a shark out of frame at once (used for sharks that start away). */
  park(sh: Shark) {
    const dx = (sh.nodes[0] < this.width / 2 ? -1 : 1) * (this.width + sh.length * 2);
    for (let k = 0; k < SHARK_NODES; k++) sh.nodes[k * 2] += dx;
    sh.away = true;
    sh.speed = 0;
  }

  /** Local change: calls an away shark back; one waiting out of frame swims straight in. */
  recall(sh: Shark) {
    if (!sh.away) return;
    sh.away = false;
    const hx = sh.nodes[0];
    if (hx > -sh.length * 0.5 && hx < this.width + sh.length * 0.5) return;
    const y = rand(0.2, 0.8) * this.height;
    const x = hx < this.width / 2 ? -sh.length * 0.2 : this.width + sh.length * 0.2;
    sh.heading = Math.atan2(this.height / 2 - y, this.width / 2 - x);
    const seg = sh.length / (SHARK_NODES - 1);
    for (let k = 0; k < SHARK_NODES; k++) {
      sh.nodes[k * 2] = x - Math.cos(sh.heading) * seg * k;
      sh.nodes[k * 2 + 1] = y - Math.sin(sh.heading) * seg * k;
    }
    sh.speed = (30 + sh.length * 0.04) * 1.8;
    sh.turn = 0;
  }

  /**
   * Pick prey in the shark's forward cone, preferring close fish in sparse
   * buckets (stragglers) over fish buried in a dense school.
   */
  private findPrey(sh: Shark): Fish | null {
    const range = sh.length * 0.9 + 160;
    const hx = sh.nodes[0];
    const hy = sh.nodes[1];
    const fx = Math.cos(sh.heading);
    const fy = Math.sin(sh.heading);
    let best: Fish | null = null;
    let bestScore = Infinity;
    let currentScore = Infinity;

    for (const f of this.fish) {
      if (!f.alive) continue;
      const dx = f.x - hx;
      const dy = f.y - hy;
      const d = Math.hypot(dx, dy);
      if (d > range || d < 1e-3) continue;
      const cos = (dx * fx + dy * fy) / d;
      if (cos < 0.2) continue;
      const crowd = this.bucketCount[this.bucketOf(f.x, f.y)];
      const score = d * (1 + (1 - cos) * 0.8) * (1 + crowd * 0.07);
      if (score < bestScore) {
        bestScore = score;
        best = f;
      }
      if (f === sh.target) currentScore = score;
    }
    // Stick with the current target unless something is clearly better.
    if (sh.target && currentScore < bestScore * 1.3) return sh.target;
    return best;
  }

  private respawn() {
    const { time, width: W, height: H } = this;
    let due: Fish[] = [];
    for (const f of this.fish) if (!f.alive && f.respawnAt <= time) due.push(f);
    if (due.length === 0) return;
    // Local change: no new schools while the water is meant to be emptier than it is.
    const room = Math.floor(this.fishShare * this.fish.length) - this.aliveCount;
    if (room <= 0) return;
    due = due.slice(0, room);
    if (due.length < 6 && time - this.lastSpawn < 9) return;
    this.lastSpawn = time;

    // A new school swims in from a random edge.
    const side = randInt(0, 3);
    const along = rand(0.15, 0.85);
    const x = side === 0 ? -20 : side === 1 ? W + 20 : along * W;
    const y = side === 2 ? -20 : side === 3 ? H + 20 : along * H;
    const inward = Math.atan2(H / 2 - y, W / 2 - x) + rand(-0.5, 0.5);
    const species = pickSpecies();
    const sp = SPECIES[species];
    const millDir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    for (const f of due.slice(0, sp.schoolSize[1])) {
      f.alive = true;
      f.species = species;
      f.alarm = 0;
      f.turn = 0;
      f.millDir = millDir;
      f.x = x + rand(-1, 1) * this.perception;
      f.y = y + rand(-1, 1) * this.perception;
      f.vx = Math.cos(inward) * sp.cruise * 1.4;
      f.vy = Math.sin(inward) * sp.cruise * 1.4;
    }
  }
}
