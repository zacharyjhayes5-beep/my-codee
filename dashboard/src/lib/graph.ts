import type { LineId, Prospect, ProspectStatus } from "../types";

export type NodeKind = "prospect" | "line" | "area";

export interface GraphNode {
  id: string;
  kind: NodeKind;
  label: string;
  /** Prospect nodes only. */
  status?: ProspectStatus;
  prospectId?: string;
  r: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Pinned by a drag — the simulation leaves it alone. */
  pinned?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const WIDTH = 900;
export const HEIGHT = 620;

const lineLabels: Record<LineId, string> = {
  property: "Property",
  casualty: "Casualty",
  life: "Life",
};

/** Deterministic scatter so the layout starts the same way every mount. */
function seededPoint(seed: number) {
  const golden = 2.399963229728653;
  const angle = seed * golden;
  const radius = 40 + Math.sqrt(seed) * 34;
  return {
    x: WIDTH / 2 + Math.cos(angle) * radius,
    y: HEIGHT / 2 + Math.sin(angle) * radius,
  };
}

/**
 * Prospects sit between the line-of-business hubs they're shopping and the
 * area they live in, so households and territories fall into clusters on
 * their own.
 */
export function buildGraph(prospects: Prospect[]): Graph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  let seed = 1;

  const lineIds: LineId[] = ["property", "casualty", "life"];
  lineIds.forEach((id, i) => {
    // Hubs start spread across the canvas to open the layout up.
    const angle = (i / lineIds.length) * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      id: `line:${id}`,
      kind: "line",
      label: lineLabels[id],
      r: 30,
      x: WIDTH / 2 + Math.cos(angle) * 210,
      y: HEIGHT / 2 + Math.sin(angle) * 150,
      vx: 0,
      vy: 0,
    });
  });

  const areas = new Set<string>();
  for (const p of prospects) {
    const area = p.area.trim();
    if (area) areas.add(area);
  }

  for (const area of areas) {
    const point = seededPoint(seed++);
    nodes.push({
      id: `area:${area.toLowerCase()}`,
      kind: "area",
      label: area,
      r: 18,
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
    });
  }

  for (const p of prospects) {
    const point = seededPoint(seed++);
    nodes.push({
      id: `prospect:${p.id}`,
      kind: "prospect",
      label: p.name || "Untitled",
      status: p.status,
      prospectId: p.id,
      r: 11 + Math.min(7, p.notes.length * 2),
      x: point.x,
      y: point.y,
      vx: 0,
      vy: 0,
    });

    for (const line of p.lines) {
      edges.push({
        id: `${p.id}-${line}`,
        source: `prospect:${p.id}`,
        target: `line:${line}`,
      });
    }

    const area = p.area.trim();
    if (area) {
      edges.push({
        id: `${p.id}-area`,
        source: `prospect:${p.id}`,
        target: `area:${area.toLowerCase()}`,
      });
    }
  }

  return { nodes, edges };
}

/**
 * One tick of a plain force-directed layout: everything pushes apart,
 * connected pairs pull together, and a weak pull keeps the whole thing
 * centred. Small graphs, so the naive O(n^2) pass is fine.
 */
export function tick(graph: Graph, alpha: number) {
  const { nodes, edges } = graph;
  const repulsion = 9800;
  const springLength = 155;
  const springStrength = 0.05;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let distSq = dx * dx + dy * dy;
      if (distSq < 0.01) {
        // Identical positions would divide by zero — nudge them apart.
        dx = (i % 2 === 0 ? 1 : -1) * 0.7;
        dy = (j % 2 === 0 ? 1 : -1) * 0.7;
        distSq = dx * dx + dy * dy;
      }
      const dist = Math.sqrt(distSq);
      const minGap = a.r + b.r + 14;
      // Extra shove when circles would overlap, so labels stay readable.
      const force = (repulsion / distSq) * (dist < minGap ? 2.4 : 1);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const edge of edges) {
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const force = (dist - springLength) * springStrength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;
    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }

  for (const n of nodes) {
    // Weak pull to centre keeps disconnected nodes from drifting off canvas.
    n.vx += (WIDTH / 2 - n.x) * 0.0026;
    n.vy += (HEIGHT / 2 - n.y) * 0.0026;

    if (n.pinned) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }

    n.vx *= 0.82;
    n.vy *= 0.82;
    n.x += Math.max(-24, Math.min(24, n.vx * alpha));
    n.y += Math.max(-24, Math.min(24, n.vy * alpha));

    const pad = n.r + 6;
    n.x = Math.max(pad, Math.min(WIDTH - pad, n.x));
    n.y = Math.max(pad, Math.min(HEIGHT - pad, n.y));
  }
}

/** Node ids directly connected to the given node. */
export function neighborsOf(graph: Graph, id: string): Set<string> {
  const set = new Set<string>();
  for (const e of graph.edges) {
    if (e.source === id) set.add(e.target);
    if (e.target === id) set.add(e.source);
  }
  return set;
}
