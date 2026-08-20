import { useEffect, useRef } from "react";
import type { VaultGraph, VaultNode } from "../../lib/vault";

/**
 * The vault, drawn as an orbital system.
 *
 * Hand-rolled on a 2D canvas rather than reaching for the walkthrough's
 * three.js: everything here is spheres, points and arcs, the whole renderer is
 * one file, and the tab loads without the 257kB the walkthrough pays for. It
 * is lazily imported all the same, because the sprite baking below runs on
 * mount and no other tab should sit through it.
 *
 * Bodies are shaded per pixel — surface normal into 3D noise for albedo, limb
 * darkening at the edge, a terminator facing the star, and a rotation baked as
 * twelve frames. That is what makes a cluster read as an object rather than a
 * circle with a gradient in it.
 */

export interface OrreryProps {
  graph: VaultGraph;
  /** Currently open body, ringed and with its filaments lit. */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Ids that match the search; everything else dims. Null when not searching. */
  matches: Set<string> | null;
  /** Index into `graph.dates` — bodies written later fade to embers. */
  epoch: number;
  /** Rotation of the fourth axis, in radians. */
  wAngle: number;
  orbiting: boolean;
  /** The glass: vignette, reflection and the star's flare. */
  canopy: boolean;
}

interface Placed {
  node: VaultNode;
  sx: number;
  sy: number;
  d: number;
  f: number;
}

const SPRITE_FRAMES = 12;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- noise */

const PERM = new Uint8Array(512);
{
  const p: number[] = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const hash3 = (x: number, y: number, z: number) =>
  PERM[(PERM[(PERM[x & 255] + y) & 255] + z) & 255] / 255;

function vnoise(x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const u = fade(x - xi);
  const v = fade(y - yi);
  const w = fade(z - zi);
  return lerp(
    lerp(
      lerp(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u),
      lerp(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u),
      v,
    ),
    lerp(
      lerp(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u),
      lerp(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u),
      v,
    ),
    w,
  );
}

function fbm(x: number, y: number, z: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * freq, y * freq, z * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/* ---------------------------------------------------------------- colour */

function rgbOf(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function lighten(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${Math.round(r + (255 - r) * t)},${Math.round(g + (255 - g) * t)},${Math.round(b + (255 - b) * t)})`;
}
function darken(hex: string, t: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgb(${Math.round(r * (1 - t))},${Math.round(g * (1 - t))},${Math.round(b * (1 - t))})`;
}

/* ---------------------------------------------------------------- sprites */

type Style = "banded" | "cratered" | "terran";

/** One sphere, shaded per pixel. Albedo only — the lighting is applied at draw. */
function sphereSprite(px: number, base: string, seed: number, style: Style, lon: number) {
  const c = document.createElement("canvas");
  c.width = px;
  c.height = px;
  const x = c.getContext("2d");
  if (!x) return c;
  const img = x.createImageData(px, px);
  const d = img.data;
  const r = px / 2;
  const col = rgbOf(base);
  const cl = Math.cos(lon);
  const sl = Math.sin(lon);

  for (let yy = 0; yy < px; yy++) {
    for (let xx = 0; xx < px; xx++) {
      const i = (yy * px + xx) * 4;
      const nx = (xx - r + 0.5) / r;
      const ny = (yy - r + 0.5) / r;
      const s = nx * nx + ny * ny;
      if (s > 1) {
        d[i + 3] = 0;
        continue;
      }
      const nz = Math.sqrt(1 - s);
      // Rotate the sample around the polar axis, which is what spins it.
      const wx = nx * cl + nz * sl;
      const wz = -nx * sl + nz * cl;

      let v: number;
      if (style === "banded") {
        const warp = fbm(wx * 2.1 + seed, ny * 2.4, wz * 2.1, 4);
        v = 0.5 + 0.5 * Math.sin(ny * 7.5 + warp * 4.2 + seed);
        v = v * 0.62 + fbm(wx * 5 + seed, ny * 9, wz * 5, 4) * 0.38;
      } else if (style === "cratered") {
        const n1 = fbm(wx * 4.2 + seed, ny * 4.2, wz * 4.2, 5);
        const n2 = fbm(wx * 13 + seed, ny * 13, wz * 13, 3);
        v = n1 * 0.72 + n2 * 0.28;
        if (v < 0.46) v *= 0.72;
      } else {
        v = fbm(wx * 2.6 + seed, ny * 2.6, wz * 2.6, 6) * 0.7 + fbm(wx * 7 + seed * 2, ny * 7, wz * 7, 4) * 0.3;
      }

      const shade = 0.42 + 0.72 * v;
      const limb = 0.35 + 0.65 * Math.pow(nz, 0.45);
      const atmo = Math.pow(1 - nz, 3) * 0.5;
      d[i] = Math.min(255, col[0] * shade * limb + 255 * atmo * 0.2);
      d[i + 1] = Math.min(255, col[1] * shade * limb + 255 * atmo * 0.28);
      d[i + 2] = Math.min(255, col[2] * shade * limb + 255 * atmo * 0.42);
      d[i + 3] = 255 * Math.min(1, (1 - s) * r * 1.2);
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}

export default function Orrery({
  graph,
  selectedId,
  onSelect,
  matches,
  epoch,
  wAngle,
  orbiting,
  canopy,
}: OrreryProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  /** Everything the loop reads but must not restart for. */
  const live = useRef({ selectedId, matches, epoch, wAngle, orbiting, canopy });
  live.current = { selectedId, matches, epoch, wAngle, orbiting, canopy };
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    const hostEl = hostRef.current;
    if (!canvasEl || !hostEl) return;
    const context = canvasEl.getContext("2d");
    if (!context) return;
    // Captured with their types after the guards: TypeScript drops the
    // narrowing again inside the nested draw functions below.
    const canvas: HTMLCanvasElement = canvasEl;
    const host: HTMLElement = hostEl;
    const ctx: CanvasRenderingContext2D = context;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { nodes, byId, maxOrbit } = graph;

    /* ---------------- camera ---------------- */
    const home = { yaw: -0.6, pitch: 0.44, dist: Math.round(maxOrbit * 2.35) };
    const cam = { ...home, tYaw: home.yaw, tPitch: home.pitch, tDist: home.dist };
    /** Set once, from the real panel size — a fixed distance under-fills a
        short viewport and crops a tall one. */
    let framed = false;
    let W = 0;
    let H = 0;
    let CX = 0;
    let CY = 0;
    let clock = 0;
    let hoveredId: string | null = null;

    /* ---------------- sprites ---------------- */
    const spriteCache = new Map<string, HTMLCanvasElement[]>();
    function spritesFor(n: VaultNode, px: number) {
      const key = `${n.id}@${px}`;
      const hit = spriteCache.get(key);
      if (hit) return hit;
      const style: Style =
        n.kind === "cluster" ? (n.deg > 4 ? "banded" : "terran") : n.words > 900 ? "terran" : "cratered";
      let seed = 0;
      for (let i = 0; i < n.id.length; i++) seed = (seed * 31 + n.id.charCodeAt(i)) % 997;
      const frames: HTMLCanvasElement[] = [];
      for (let f = 0; f < SPRITE_FRAMES; f++) {
        frames.push(sphereSprite(px, n.color, seed * 0.017, style, (f / SPRITE_FRAMES) * TAU));
      }
      spriteCache.set(key, frames);
      return frames;
    }

    /* ---------------- the star ---------------- */
    const SUN_PX = 180;
    const sunCv = document.createElement("canvas");
    sunCv.width = SUN_PX;
    sunCv.height = SUN_PX;
    const sunContext = sunCv.getContext("2d");
    if (!sunContext) return;
    const sunCx: CanvasRenderingContext2D = sunContext;
    const sunImg = sunCx.createImageData(SUN_PX, SUN_PX);
    function renderSun(t: number) {
      const d = sunImg.data;
      const r = SUN_PX / 2;
      for (let yy = 0; yy < SUN_PX; yy++) {
        for (let xx = 0; xx < SUN_PX; xx++) {
          const i = (yy * SUN_PX + xx) * 4;
          const nx = (xx - r + 0.5) / r;
          const ny = (yy - r + 0.5) / r;
          const s = nx * nx + ny * ny;
          if (s > 1) {
            d[i + 3] = 0;
            continue;
          }
          const nz = Math.sqrt(1 - s);
          const granule = fbm(nx * 5.5, ny * 5.5 + t * 0.35, nz * 5.5 + t * 0.22, 4);
          const cells = fbm(nx * 2.2 + 11, ny * 2.2, nz * 2.2 + t * 0.06, 3);
          const heat = (0.62 + 0.55 * (granule * 0.62 + cells * 0.38)) * Math.pow(nz, 0.42);
          d[i] = Math.min(255, 255 * heat * 1.02 + 40);
          d[i + 1] = Math.min(255, 232 * heat * 0.9 + 12);
          d[i + 2] = Math.min(255, 150 * heat * 0.62);
          d[i + 3] = 255 * Math.min(1, (1 - s) * r * 1.4);
        }
      }
      sunCx.putImageData(sunImg, 0, 0);
    }
    renderSun(0);

    /* ---------------- sky ---------------- */
    const CLASSES: [number, number, number][] = [
      [155, 176, 255],
      [202, 216, 255],
      [248, 247, 255],
      [255, 244, 234],
      [255, 222, 180],
      [255, 190, 140],
    ];
    const WEIGHTS = [0.05, 0.1, 0.2, 0.28, 0.22, 0.15];
    const stars = Array.from({ length: 2600 }, () => {
      // Over half sit near one plane, so the sky has a galactic band in it
      // rather than an even scatter of confetti.
      const band = Math.random() < 0.55;
      const th = Math.random() * TAU;
      const ph = band
        ? Math.PI / 2 + (Math.random() + Math.random() + Math.random() - 1.5) * 0.3
        : Math.acos(2 * Math.random() - 1);
      const R = 3000 + Math.random() * 3200;
      let pick = Math.random();
      let ci = 2;
      for (let i = 0; i < WEIGHTS.length; i++) {
        pick -= WEIGHTS[i];
        if (pick < 0) {
          ci = i;
          break;
        }
      }
      return {
        x: R * Math.sin(ph) * Math.cos(th),
        y: R * Math.cos(ph),
        z: R * Math.sin(ph) * Math.sin(th),
        w: (Math.random() * 2 - 1) * 1100,
        m: Math.pow(Math.random(), 2.4),
        tw: Math.random() * TAU,
        c: CLASSES[ci],
      };
    });
    const clouds = Array.from({ length: 6 }, (_, i) => ({
      a: Math.random() * TAU,
      r: 0.3 + Math.random() * 0.55,
      lat: (Math.random() - 0.5) * 0.5,
      c: [
        [92, 64, 190],
        [26, 96, 158],
        [150, 52, 120],
        [38, 86, 132],
        [188, 92, 64],
      ][i % 5] as [number, number, number],
      s: 0.03 + Math.random() * 0.032,
    }));

    /** Each body's own orbital phase, so they do not all start in a line. */
    const phase = new Map(nodes.map((n) => [n.id, Math.random() * TAU]));

    /* ---------------- bloom ---------------- */
    const bloomCv = document.createElement("canvas");
    const bloomCx = bloomCv.getContext("2d");
    const canBlur = (() => {
      const t = document.createElement("canvas").getContext("2d");
      if (!t) return false;
      t.filter = "blur(2px)";
      return t.filter === "blur(2px)";
    })();

    /* ---------------- geometry ---------------- */
    function place(n: VaultNode, t: number, out: number[]): number[] {
      if (!n.parent) {
        out[0] = out[1] = out[2] = out[3] = 0;
        return out;
      }
      const parent = byId.get(n.parent);
      const base = [0, 0, 0, 0];
      if (parent?.parent) place(parent, t, base);
      const a = (phase.get(n.id) ?? 0) + t * (TAU / n.period);
      const x = Math.cos(a) * n.r;
      const y = Math.sin(a) * n.r * Math.sin(n.incline);
      const z = Math.sin(a) * n.r * Math.cos(n.incline);
      out[0] = base[0] + x;
      out[1] = base[1] + y;
      out[2] = base[2] + z;
      // The fourth coordinate: how far off the link-depth axis this body sits.
      out[3] = base[3] + (n.w - 0.5) * n.r * 1.35;
      return out;
    }

    /**
     * Four dimensions down to two.
     *
     * The xw and zw planes rotate first — that is the actual 4D rotation, and
     * why turning the dial swings bodies past each other instead of merely
     * scaling them. What survives is an ordinary 3D point, which then goes
     * through the camera.
     */
    function project(q: number[]) {
      const w = live.current.wAngle;
      const cw = Math.cos(w);
      const sw = Math.sin(w);
      const x = q[0] * cw - q[3] * sw;
      const fourth = q[0] * sw + q[3] * cw;
      const z = q[2] * Math.cos(w * 0.63) - fourth * Math.sin(w * 0.63);
      const y = q[1];

      const cy = Math.cos(cam.yaw);
      const sy = Math.sin(cam.yaw);
      const X = x * cy - z * sy;
      const Z = x * sy + z * cy;
      const cp = Math.cos(cam.pitch);
      const sp = Math.sin(cam.pitch);
      const Y = y * cp - Z * sp;
      const depth = Math.max(40, y * sp + Z * cp + cam.dist);
      const f = 760 / depth;
      return { sx: CX + X * f, sy: CY + Y * f, d: depth, f };
    }

    function alphaOf(n: VaultNode): number {
      let a = 1;
      if (n.kind !== "vault" && n.epoch > live.current.epoch) a *= 0.09;
      const m = live.current.matches;
      if (m) a *= m.has(n.id) ? 1 : 0.1;
      return a;
    }

    /* ---------------- drawing ---------------- */
    function drawBackdrop() {
      ctx.fillStyle = "#03050c";
      ctx.fillRect(0, 0, W, H);
      clouds.forEach((n, i) => {
        const ang = n.a - cam.yaw;
        const cx = CX + Math.sin(ang) * W * 0.85;
        const cy = CY + n.lat * H * 0.9 + cam.pitch * 160;
        const rad = Math.max(W, H) * n.r;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        const pulse = n.s * (0.86 + 0.14 * Math.sin(clock * 0.08 + i));
        g.addColorStop(0, `rgba(${n.c[0]},${n.c[1]},${n.c[2]},${pulse})`);
        g.addColorStop(0.42, `rgba(${n.c[0]},${n.c[1]},${n.c[2]},${pulse * 0.32})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });
    }

    function drawStars() {
      for (const s of stars) {
        const p = project([s.x, s.y, s.z, s.w]);
        if (p.d < 60) continue;
        const tw = 0.72 + 0.28 * Math.sin(clock * (1.1 + s.m) + s.tw);
        const a = (0.1 + s.m * 0.85) * tw * Math.min(1, 1700 / p.d);
        if (a <= 0.012) continue;
        const r = (0.3 + s.m * 1.5) * Math.min(1.7, p.f * 2.6);
        ctx.fillStyle = `rgba(${s.c[0]},${s.c[1]},${s.c[2]},${a})`;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, TAU);
        ctx.fill();
        if (s.m > 0.55) {
          ctx.globalAlpha = a * 0.3;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, r * 4.5, 0, TAU);
          ctx.fill();
          if (s.m > 0.86) {
            const L = r * (5 + s.m * 9);
            ctx.globalAlpha = a * 0.42;
            ctx.strokeStyle = `rgb(${s.c[0]},${s.c[1]},${s.c[2]})`;
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(p.sx - L, p.sy);
            ctx.lineTo(p.sx + L, p.sy);
            ctx.moveTo(p.sx, p.sy - L);
            ctx.lineTo(p.sx, p.sy + L);
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawOrbit(n: VaultNode) {
      const parent = n.parent ? byId.get(n.parent) : null;
      if (!parent) return;
      const a = alphaOf(n) * (n.kind === "cluster" ? 0.5 : 0.32);
      if (a < 0.03) return;
      const base = [0, 0, 0, 0];
      if (parent.parent) place(parent, clock, base);
      ctx.beginPath();
      for (let k = 0; k <= 72; k++) {
        const ang = (phase.get(n.id) ?? 0) + (k / 72) * TAU;
        const q = project([
          base[0] + Math.cos(ang) * n.r,
          base[1] + Math.sin(ang) * n.r * Math.sin(n.incline),
          base[2] + Math.sin(ang) * n.r * Math.cos(n.incline),
          base[3] + (n.w - 0.5) * n.r * 1.35,
        ]);
        if (k === 0) ctx.moveTo(q.sx, q.sy);
        else ctx.lineTo(q.sx, q.sy);
      }
      ctx.closePath();
      ctx.strokeStyle = rgba(n.color, a * (n.kind === "cluster" ? 0.26 : 0.17));
      ctx.lineWidth = n.kind === "cluster" ? 0.9 : 0.6;
      ctx.stroke();
    }

    function drawFilaments(points: Map<string, Placed>) {
      for (const [aId, bId] of graph.filaments) {
        const a = points.get(aId);
        const b = points.get(bId);
        if (!a || !b) continue;
        const live_ = live.current.selectedId === aId || live.current.selectedId === bId;
        const al = Math.min(alphaOf(a.node), alphaOf(b.node)) * (live_ ? 0.85 : 0.14);
        if (al < 0.03) continue;
        const dx = b.sx - a.sx;
        const dy = b.sy - a.sy;
        const len = Math.hypot(dx, dy) || 1;
        const bow = len * 0.2;
        const cx = (a.sx + b.sx) / 2 - (dy / len) * bow;
        const cy = (a.sy + b.sy) / 2 + (dx / len) * bow;
        const g = ctx.createLinearGradient(a.sx, a.sy, b.sx, b.sy);
        g.addColorStop(0, rgba(a.node.color, al));
        g.addColorStop(0.5, `rgba(214,182,143,${al * 0.9})`);
        g.addColorStop(1, rgba(b.node.color, al));
        ctx.strokeStyle = g;
        ctx.lineWidth = live_ ? 1.3 : 0.7;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.quadraticCurveTo(cx, cy, b.sx, b.sy);
        ctx.stroke();
        if (live_) {
          const t = (clock * 0.35) % 1;
          const px = (1 - t) * (1 - t) * a.sx + 2 * (1 - t) * t * cx + t * t * b.sx;
          const py = (1 - t) * (1 - t) * a.sy + 2 * (1 - t) * t * cy + t * t * b.sy;
          ctx.fillStyle = "rgba(255,255,255,.9)";
          ctx.beginPath();
          ctx.arc(px, py, 1.8, 0, TAU);
          ctx.fill();
        }
      }
    }

    function drawStar(p: Placed, R: number) {
      const cg = ctx.createRadialGradient(p.sx, p.sy, R * 0.92, p.sx, p.sy, R * 8);
      cg.addColorStop(0, "rgba(255,236,190,.34)");
      cg.addColorStop(0.14, "rgba(255,186,92,.15)");
      cg.addColorStop(0.42, "rgba(240,124,48,.05)");
      cg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, R * 8, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(p.sx, p.sy);
      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + clock * 0.02;
        const l = R * (2 + 1.8 * Math.abs(Math.sin(clock * 0.35 + i * 1.7)));
        const rg = ctx.createLinearGradient(0, 0, Math.cos(a) * l, Math.sin(a) * l);
        rg.addColorStop(0, "rgba(255,205,130,.16)");
        rg.addColorStop(1, "rgba(255,150,60,0)");
        ctx.strokeStyle = rg;
        ctx.lineWidth = R * 0.3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
        ctx.stroke();
      }
      ctx.restore();

      ctx.drawImage(sunCv, p.sx - R, p.sy - R, R * 2, R * 2);
      ctx.strokeStyle = "rgba(255,214,150,.55)";
      ctx.lineWidth = Math.max(1, R * 0.05);
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, R * 1.012, 0, TAU);
      ctx.stroke();

      if (!live.current.canopy) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createLinearGradient(p.sx - R * 13, p.sy, p.sx + R * 13, p.sy);
      fg.addColorStop(0, "rgba(120,180,255,0)");
      fg.addColorStop(0.42, "rgba(150,200,255,.13)");
      fg.addColorStop(0.5, "rgba(230,240,255,.30)");
      fg.addColorStop(0.58, "rgba(150,200,255,.13)");
      fg.addColorStop(1, "rgba(120,180,255,0)");
      if (canBlur) ctx.filter = `blur(${Math.max(2, R * 0.1)}px)`;
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, R * 13, R * 0.16, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(p.sx, p.sy, R * 7, R * 0.34, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (canBlur) ctx.filter = "none";
      const dx = CX - p.sx;
      const dy = CY - p.sy;
      for (const [t, size, colour] of [
        [0.45, R * 0.55, "rgba(255,190,120,.10)"],
        [0.85, R * 0.3, "rgba(120,255,200,.09)"],
        [1.3, R * 0.75, "rgba(140,170,255,.07)"],
      ] as [number, number, string][]) {
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(p.sx + dx * t * 2, p.sy + dy * t * 2, size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    function drawBody(o: Placed) {
      const n = o.node;
      const a = alphaOf(n);
      if (a < 0.02) return;
      const R = Math.max(1.1, n.size * Math.min(3.4, o.f * 2.3));

      if (n.kind === "vault") {
        drawStar(o, R);
        return;
      }

      ctx.globalAlpha = a;
      const reach = R * (n.kind === "cluster" ? 3.2 : 4.2);
      const hg = ctx.createRadialGradient(o.sx, o.sy, R * 0.92, o.sx, o.sy, reach);
      hg.addColorStop(0, rgba(n.color, 0.15));
      hg.addColorStop(1, rgba(n.color, 0));
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(o.sx, o.sy, reach, 0, TAU);
      ctx.fill();

      // The star is at the centre of the map, so its screen direction is where
      // the lit side has to face.
      const toStar = Math.atan2(CY - o.sy, CX - o.sx);

      if (R >= 4.5) {
        const px = R > 34 ? 128 : R > 16 ? 96 : 64;
        const frames = spritesFor(n, px);
        const spin = clock / (n.kind === "cluster" ? 26 : 11) + (phase.get(n.id) ?? 0) / TAU;
        const fi = ((Math.floor(spin * SPRITE_FRAMES) % SPRITE_FRAMES) + SPRITE_FRAMES) % SPRITE_FRAMES;
        ctx.drawImage(frames[fi], o.sx - R, o.sy - R, R * 2, R * 2);
      } else {
        const g = ctx.createRadialGradient(
          o.sx + Math.cos(toStar) * R * 0.4,
          o.sy + Math.sin(toStar) * R * 0.4,
          R * 0.05,
          o.sx,
          o.sy,
          R * 1.05,
        );
        g.addColorStop(0, lighten(n.color, 0.5));
        g.addColorStop(0.6, n.color);
        g.addColorStop(1, darken(n.color, 0.7));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(o.sx, o.sy, R, 0, TAU);
        ctx.fill();
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(o.sx, o.sy, R, 0, TAU);
      ctx.clip();
      const sg = ctx.createLinearGradient(
        o.sx + Math.cos(toStar) * R,
        o.sy + Math.sin(toStar) * R,
        o.sx - Math.cos(toStar) * R * 1.05,
        o.sy - Math.sin(toStar) * R * 1.05,
      );
      sg.addColorStop(0, "rgba(0,0,0,0)");
      sg.addColorStop(0.46, "rgba(2,3,8,.16)");
      sg.addColorStop(1, "rgba(1,2,6,.90)");
      ctx.fillStyle = sg;
      ctx.fillRect(o.sx - R, o.sy - R, R * 2, R * 2);
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rim = Math.min(0.55, 0.18 + R * 0.012);
      ctx.beginPath();
      ctx.arc(o.sx, o.sy, R * 0.985, toStar - 1.15, toStar + 1.15);
      ctx.strokeStyle = `rgba(255,238,205,${rim})`;
      ctx.lineWidth = Math.max(0.8, R * 0.075);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.sx, o.sy, R * 0.99, toStar + 2.1, toStar + 4.2);
      ctx.strokeStyle = rgba(n.color, rim * 0.5);
      ctx.lineWidth = Math.max(0.6, R * 0.05);
      ctx.stroke();
      ctx.restore();

      if (n.kind === "cluster" && R > 6) {
        ctx.save();
        ctx.translate(o.sx, o.sy);
        ctx.scale(1, Math.max(0.12, 0.3 + 0.24 * Math.sin(cam.pitch)));
        const ring = ctx.createRadialGradient(0, 0, R * 1.5, 0, 0, R * 2.5);
        ring.addColorStop(0, rgba(n.color, 0));
        ring.addColorStop(0.35, rgba(n.color, 0.3 * a));
        ring.addColorStop(0.6, rgba(n.color, 0.1 * a));
        ring.addColorStop(0.72, rgba(n.color, 0.22 * a));
        ring.addColorStop(1, rgba(n.color, 0));
        ctx.fillStyle = ring;
        ctx.beginPath();
        ctx.arc(0, 0, R * 2.5, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      const isSelected = live.current.selectedId === n.id;
      const isHovered = hoveredId === n.id;
      if (isSelected || isHovered) {
        ctx.globalAlpha = isSelected ? 0.95 : 0.5;
        ctx.strokeStyle = isSelected ? "#ffffff" : n.color;
        ctx.lineWidth = isSelected ? 1.2 : 0.9;
        ctx.beginPath();
        ctx.arc(o.sx, o.sy, R * (isSelected ? 2.4 : 2.1) + 3, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawLabel(o: Placed) {
      const n = o.node;
      const a = alphaOf(n);
      if (a < 0.3) return;
      const selected = live.current.selectedId === n.id || hoveredId === n.id;
      const selectedNode = live.current.selectedId ? byId.get(live.current.selectedId) : null;
      // Opening a cluster names its notes; so does opening one of them.
      const inFocus =
        n.kind === "note" &&
        (live.current.selectedId === n.parent || selectedNode?.parent === n.parent);
      const matched = live.current.matches?.has(n.id) ?? false;
      if (n.kind === "note" && !selected && !inFocus && !matched) return;

      ctx.globalAlpha = a * (selected ? 1 : 0.7);
      ctx.font =
        n.kind === "cluster"
          ? '500 13px ui-sans-serif, system-ui, sans-serif'
          : '400 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = "left";
      const off = Math.max(10, n.size * Math.min(3.4, o.f * 2.3) + 9);
      const width = ctx.measureText(n.title).width;
      ctx.fillStyle = "rgba(3,5,12,.75)";
      ctx.fillRect(o.sx + off - 3, o.sy - 8, width + 6, 15);
      ctx.fillStyle = n.kind === "cluster" ? "#f4f1ea" : rgba(n.color, 1);
      ctx.fillText(n.title, o.sx + off, o.sy + 4);
      ctx.globalAlpha = 1;
    }

    function drawGlass() {
      const vg = ctx.createRadialGradient(
        W / 2,
        H / 2,
        Math.min(W, H) * 0.28,
        W / 2,
        H / 2,
        Math.max(W, H) * 0.78,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,.48)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      if (!live.current.canopy) return;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const rg = ctx.createLinearGradient(0, 0, W * 0.85, H * 0.9);
      rg.addColorStop(0, "rgba(150,190,255,.045)");
      rg.addColorStop(0.28, "rgba(190,215,255,.020)");
      rg.addColorStop(0.45, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      ctx.strokeStyle = "rgba(160,190,235,.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, H * 0.055);
      ctx.quadraticCurveTo(W * 0.5, H * 0.1, W, H * 0.055);
      ctx.stroke();
    }

    /* ---------------- loop ---------------- */
    const points = new Map<string, Placed>();
    const scratch = [0, 0, 0, 0];
    let raf = 0;
    let last = performance.now();
    let sunTick = 0;
    let sunPhase = 0;

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (live.current.orbiting) clock += dt;
      if (!reduced && (sunTick = (sunTick + 1) % 3) === 0) {
        sunPhase += dt * 3;
        renderSun(sunPhase);
      }

      cam.yaw += (cam.tYaw - cam.yaw) * 0.09;
      cam.pitch += (cam.tPitch - cam.pitch) * 0.09;
      cam.dist += (cam.tDist - cam.dist) * 0.09;
      CX = W / 2;
      CY = H / 2;

      drawBackdrop();
      drawStars();

      points.clear();
      const list: Placed[] = [];
      for (const n of nodes) {
        place(n, clock, scratch);
        const p = project(scratch);
        const placed: Placed = { node: n, sx: p.sx, sy: p.sy, d: p.d, f: p.f };
        points.set(n.id, placed);
        list.push(placed);
      }

      for (const n of nodes) if (n.parent) drawOrbit(n);
      drawFilaments(points);

      // Far to near, so a body in front actually occludes one behind it.
      list.sort((a, b) => b.d - a.d);
      for (const o of list) drawBody(o);

      if (canBlur && bloomCx) {
        bloomCx.clearRect(0, 0, bloomCv.width, bloomCv.height);
        bloomCx.filter = "blur(4px) brightness(1.12)";
        bloomCx.drawImage(canvas, 0, 0, bloomCv.width, bloomCv.height);
        bloomCx.filter = "none";
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.15;
        ctx.drawImage(bloomCv, 0, 0, W, H);
        ctx.restore();
      }

      for (const o of list) drawLabel(o);
      drawGlass();
      raf = requestAnimationFrame(frame);
    }

    /* ---------------- input ---------------- */
    function pick(mx: number, my: number): VaultNode | null {
      let best: VaultNode | null = null;
      let bestDepth = Infinity;
      for (const o of points.values()) {
        if (alphaOf(o.node) < 0.2) continue;
        // Never smaller than a 24px target, however far away the body is.
        const R = Math.max(12, o.node.size * Math.min(3.4, o.f * 2.3) + 7);
        if (Math.hypot(o.sx - mx, o.sy - my) < R && o.d < bestDepth) {
          bestDepth = o.d;
          best = o.node;
        }
      }
      return best;
    }

    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let travelled = 0;

    function localPoint(e: PointerEvent | MouseEvent) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onDown(e: PointerEvent) {
      dragging = true;
      travelled = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        travelled += Math.abs(dx) + Math.abs(dy);
        cam.tYaw += dx * 0.005;
        cam.tPitch = Math.max(-1.35, Math.min(1.35, cam.tPitch + dy * 0.005));
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }
      const { x, y } = localPoint(e);
      const hit = pick(x, y);
      hoveredId = hit?.id ?? null;
      canvas.style.cursor = hit ? "pointer" : "grab";
      canvas.title = hit ? `${hit.title} — ${hit.cluster}` : "";
    }
    function onUp(e: PointerEvent) {
      // A drag that happened to end on a body is a drag, not a click.
      if (dragging && travelled < 6) {
        const { x, y } = localPoint(e);
        const hit = pick(x, y);
        selectRef.current(hit ? hit.id : null);
      }
      dragging = false;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      cam.tDist = Math.max(
        140,
        Math.min(maxOrbit * 5, cam.tDist * (1 + Math.sign(e.deltaY) * 0.11)),
      );
    }
    /** The camera from the keyboard, so the map is not pointer-only. */
    function onKey(e: KeyboardEvent) {
      const step = e.shiftKey ? 0.32 : 0.12;
      if (e.key === "ArrowLeft") cam.tYaw -= step;
      else if (e.key === "ArrowRight") cam.tYaw += step;
      else if (e.key === "ArrowUp") cam.tPitch = Math.max(-1.35, cam.tPitch - step);
      else if (e.key === "ArrowDown") cam.tPitch = Math.min(1.35, cam.tPitch + step);
      else if (e.key === "+" || e.key === "=") cam.tDist = Math.max(140, cam.tDist * 0.86);
      else if (e.key === "-") cam.tDist = Math.min(maxOrbit * 5, cam.tDist * 1.16);
      else return;
      e.preventDefault();
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = host.getBoundingClientRect();
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bloomCv.width = Math.max(2, Math.round(W / 2));
      bloomCv.height = Math.max(2, Math.round(H / 2));

      if (!framed) {
        framed = true;
        // 760 is the projection's focal length; this puts the outermost orbit
        // just inside whichever edge is tighter.
        const fit = (maxOrbit * 1.25 * 760) / Math.max(120, Math.min(W / 1.7, H));
        cam.dist = cam.tDist = home.dist = Math.round(Math.max(320, fit));
      }
    }

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", () => (dragging = false));
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("keydown", onKey);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("keydown", onKey);
    };
    // The loop reads live state through a ref, so it is built once per vault.
  }, [graph]);

  return (
    <div className="vault-viewport" ref={hostRef}>
      <canvas
        ref={canvasRef}
        className="vault-canvas"
        tabIndex={0}
        role="application"
        aria-label="Vault map. Arrow keys turn the camera, plus and minus zoom. Use the result list to open a note."
      />
    </div>
  );
}
