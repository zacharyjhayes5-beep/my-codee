import * as THREE from "three";

/**
 * Surfaces, drawn rather than downloaded.
 *
 * Every texture here is painted onto a canvas at module level and cached. That
 * is a deliberate constraint: the dashboard ships to GitHub Pages with no asset
 * pipeline, and a house that needs six image files is a house that renders
 * untextured the first time a CDN has a bad day. Drawing them costs a few
 * milliseconds once and can never fail to load.
 *
 * Each one returns a colour map plus a matching bump map, because the bump is
 * what makes a flat plane catch light along a board edge or a shingle course.
 */

const cache = new Map<string, { map: THREE.Texture; bumpMap: THREE.Texture }>();

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  return { c, ctx: c.getContext("2d")! };
}

function finish(
  key: string,
  colour: HTMLCanvasElement,
  bump: HTMLCanvasElement,
  repeat: [number, number],
) {
  const map = new THREE.CanvasTexture(colour);
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 8;
  }
  map.colorSpace = THREE.SRGBColorSpace;
  const out = { map, bumpMap };
  cache.set(key, out);
  return out;
}

/** Slight per-pixel grain, so a flat fill never reads as flat. */
function grain(ctx: CanvasRenderingContext2D, size: number, amount: number) {
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

/** Horizontal lap siding: boards with a shadow line under each course. */
export function sidingTexture(base = "#cdc5b6") {
  const key = `siding-${base}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const { c, ctx } = canvas(S);
  const { c: b, ctx: bx } = canvas(S);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = "#808080";
  bx.fillRect(0, 0, S, S);

  const courses = 16;
  const h = S / courses;
  for (let i = 0; i < courses; i++) {
    const y = i * h;
    // Each board very slightly different, the way real siding weathers.
    ctx.fillStyle = `rgba(0,0,0,${0.02 + Math.random() * 0.03})`;
    ctx.fillRect(0, y, S, h);
    // The shadow line under the lap — the whole reason siding reads as siding.
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.fillRect(0, y + h - 2, S, 2);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(0, y, S, 1);

    bx.fillStyle = "#2a2a2a";
    bx.fillRect(0, y + h - 2, S, 2);
    bx.fillStyle = "#e0e0e0";
    bx.fillRect(0, y, S, 1);
  }
  grain(ctx, S, 8);
  return finish(key, c, b, [3, 2]);
}

/** Asphalt shingles: staggered courses with tab notches. */
export function shingleTexture(base = "#2b3038") {
  const key = `shingle-${base}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const { c, ctx } = canvas(S);
  const { c: b, ctx: bx } = canvas(S);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = "#8a8a8a";
  bx.fillRect(0, 0, S, S);

  const rows = 14;
  const h = S / rows;
  const tab = S / 10;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    const offset = (r % 2) * (tab / 2);
    // Course shadow
    ctx.fillStyle = "rgba(0,0,0,0.42)";
    ctx.fillRect(0, y + h - 3, S, 3);
    bx.fillStyle = "#242424";
    bx.fillRect(0, y + h - 3, S, 3);
    // Tab notches
    for (let x = -tab; x < S + tab; x += tab) {
      ctx.fillStyle = "rgba(0,0,0,0.34)";
      ctx.fillRect(x + offset, y + h * 0.45, 2, h * 0.55);
      bx.fillStyle = "#2e2e2e";
      bx.fillRect(x + offset, y + h * 0.45, 2, h * 0.55);
    }
    // Granule variation per tab
    for (let x = -tab; x < S + tab; x += tab) {
      ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      ctx.fillRect(x + offset, y, tab, h - 3);
    }
  }
  grain(ctx, S, 16);
  return finish(key, c, b, [4, 3]);
}

/** Coursed stone for the plinth and chimney. */
export function stoneTexture(base = "#8d867a") {
  const key = `stone-${base}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const { c, ctx } = canvas(S);
  const { c: b, ctx: bx } = canvas(S);

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = "#909090";
  bx.fillRect(0, 0, S, S);

  const rows = 9;
  const h = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * h;
    let x = -Math.random() * 70;
    while (x < S) {
      const w = 46 + Math.random() * 62;
      const shade = 0.9 + Math.random() * 0.2;
      ctx.fillStyle = `rgba(${Math.round(141 * shade)},${Math.round(134 * shade)},${Math.round(122 * shade)},1)`;
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      bx.fillStyle = `rgb(${Math.round(190 * shade)},${Math.round(190 * shade)},${Math.round(190 * shade)})`;
      bx.fillRect(x + 2, y + 2, w - 4, h - 4);
      x += w;
    }
    // Mortar course
    ctx.fillStyle = "rgba(0,0,0,0.2)";
    ctx.fillRect(0, y + h - 3, S, 3);
    bx.fillStyle = "#3a3a3a";
    bx.fillRect(0, y + h - 3, S, 3);
  }
  grain(ctx, S, 12);
  return finish(key, c, b, [2, 1]);
}

/** Mown lawn — mottled green with a faint stripe. */
export function grassTexture() {
  const key = "grass";
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const { c, ctx } = canvas(S);
  const { c: b, ctx: bx } = canvas(S);

  ctx.fillStyle = "#5a6347";
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = "#888";
  bx.fillRect(0, 0, S, S);

  // Broad tonal patches, so the lawn is not uniform at a distance. Lightness
  // only — varying the colour channels independently turns a lawn into orange
  // and yellow blotches, which is exactly what it did the first time.
  for (let i = 0; i < 70; i++) {
    const lighter = Math.random() > 0.5;
    ctx.fillStyle = `rgba(${lighter ? "255,255,255" : "0,0,0"},${0.012 + Math.random() * 0.028})`;
    ctx.beginPath();
    ctx.arc(Math.random() * S, Math.random() * S, 30 + Math.random() * 80, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 6400; i++) {
    const x = Math.random() * S;
    const y = Math.random() * S;
    const g = 62 + Math.random() * 52;
    ctx.fillStyle = `rgba(${Math.round(g * 0.78)},${Math.round(g)},${Math.round(g * 0.56)},0.42)`;
    ctx.fillRect(x, y, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }
  // Mower stripes, barely there — at full strength they read as banding.
  for (let s = 0; s < S; s += 96) {
    ctx.fillStyle = "rgba(255,255,255,0.012)";
    ctx.fillRect(s, 0, 48, S);
  }
  grain(bx, S, 40);
  return finish(key, c, b, [16, 16]);
}

/** Asphalt driveway. */
export function asphaltTexture() {
  const key = "asphalt";
  const hit = cache.get(key);
  if (hit) return hit;

  const S = 512;
  const { c, ctx } = canvas(S);
  const { c: b, ctx: bx } = canvas(S);

  ctx.fillStyle = "#43454a";
  ctx.fillRect(0, 0, S, S);
  bx.fillStyle = "#888";
  bx.fillRect(0, 0, S, S);

  for (let i = 0; i < 9000; i++) {
    const v = Math.random();
    ctx.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${Math.random() * 0.07})`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  grain(ctx, S, 14);
  grain(bx, S, 60);
  return finish(key, c, b, [3, 7]);
}
