import { useEffect, useMemo, useRef, useState } from "react";
import type { LineId, Prospect } from "../types";
import { seriesColors, stageClass } from "../lib/defaultData";
import {
  HEIGHT,
  WIDTH,
  buildGraph,
  neighborsOf,
  tick,
  type Graph,
  type GraphNode,
} from "../lib/graph";

interface LeadMapProps {
  prospects: Prospect[];
  onOpenProspect: () => void;
}

const stageColor: Record<string, string> = {
  New: "var(--text-muted)",
  Attempting: "var(--text-secondary)",
  Contacted: "var(--accent)",
  Qualifying: "var(--accent)",
  Quoting: "var(--status-serious)",
  "Review Scheduled": "var(--status-warning)",
  Opportunity: "var(--status-warning)",
  Won: "var(--status-good)",
  Nurture: "var(--text-muted)",
  Closed: "var(--neon-red)",
};

function nodeColor(node: GraphNode): string {
  if (node.kind === "line") {
    const id = node.id.replace("line:", "") as LineId;
    return seriesColors[id];
  }
  if (node.kind === "area") return "var(--text-secondary)";
  return stageColor[node.stage ?? "New"] ?? "var(--accent)";
}

export function LeadMap({ prospects, onOpenProspect }: LeadMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; pointerId: number } | null>(null);
  const frameRef = useRef<number>(0);
  const alphaRef = useRef(1);

  const initial = useMemo(() => buildGraph(prospects), [prospects]);
  const graphRef = useRef<Graph>(initial);
  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  // Rebuild when the prospect list changes, then re-heat the layout.
  useEffect(() => {
    graphRef.current = initial;
    alphaRef.current = 1;
    setSelected(null);
  }, [initial]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      const alpha = alphaRef.current;
      if (alpha > 0.02 || dragRef.current) {
        tick(graphRef.current, Math.max(0.12, alpha));
        alphaRef.current = Math.max(0.02, alpha * 0.985);
        setFrame((f) => f + 1);
      }
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const graph = graphRef.current;
  const highlighted = useMemo(
    () => (selected ? neighborsOf(graph, selected) : null),
    [selected, graph]
  );

  const selectedNode = selected ? graph.nodes.find((n) => n.id === selected) : null;
  const selectedProspect =
    selectedNode?.prospectId != null
      ? prospects.find((p) => p.id === selectedNode.prospectId)
      : null;

  function toSvgPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function onPointerDown(e: React.PointerEvent, node: GraphNode) {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { id: node.id, pointerId: e.pointerId };
    node.pinned = true;
    setSelected(node.id);
    alphaRef.current = Math.max(alphaRef.current, 0.5);
  }

  function onPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const node = graphRef.current.nodes.find((n) => n.id === drag.id);
    if (!node) return;
    const point = toSvgPoint(e.clientX, e.clientY);
    node.x = point.x;
    node.y = point.y;
    setFrame((f) => f + 1);
  }

  function endDrag() {
    const drag = dragRef.current;
    if (!drag) return;
    const node = graphRef.current.nodes.find((n) => n.id === drag.id);
    if (node) node.pinned = false;
    dragRef.current = null;
    alphaRef.current = Math.max(alphaRef.current, 0.4);
  }

  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  return (
    <div className="tab-panel">
      <section className="op-panel map-panel">
        <header className="op-panel-head">
          Lead map
          <span className="map-legend">
            {(["property", "casualty", "life"] as LineId[]).map((id) => (
              <span key={id}>
                <i style={{ background: seriesColors[id] }} />
                {id}
              </span>
            ))}
            <span>
              <i className="ring" />
              area
            </span>
          </span>
        </header>

        {prospects.length === 0 ? (
          <p className="empty">
            No leads yet — the map draws itself once there are prospects to plot.
          </p>
        ) : (
          <>
            <p className="map-hint">
              Each lead links to the lines it wants and the area it's in. Drag a node to pull
              the layout around; click one to trace its connections.
            </p>
            <svg
              ref={svgRef}
              className="map-svg"
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerLeave={endDrag}
              onPointerCancel={endDrag}
            >
              <g className="map-edges">
                {graph.edges.map((edge) => {
                  const a = byId.get(edge.source);
                  const b = byId.get(edge.target);
                  if (!a || !b) return null;
                  const active =
                    selected != null && (edge.source === selected || edge.target === selected);
                  const dimmed = selected != null && !active;
                  return (
                    <line
                      key={edge.id}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      className={`map-edge${active ? " active" : ""}${dimmed ? " dim" : ""}`}
                    />
                  );
                })}
              </g>

              <g className="map-nodes">
                {graph.nodes.map((node) => {
                  const color = nodeColor(node);
                  const active =
                    selected === node.id || (highlighted ? highlighted.has(node.id) : false);
                  const dimmed = selected != null && !active;
                  return (
                    <g
                      key={node.id}
                      className={`map-node kind-${node.kind}${dimmed ? " dim" : ""}${
                        selected === node.id ? " selected" : ""
                      }`}
                      transform={`translate(${node.x} ${node.y})`}
                      onPointerDown={(e) => onPointerDown(e, node)}
                    >
                      <circle r={node.r + 6} fill={color} className="map-node-halo" />
                      <circle
                        r={node.r}
                        fill={node.kind === "prospect" ? "var(--surface-2)" : color}
                        stroke={color}
                        strokeWidth={node.kind === "prospect" ? 2.5 : 1.5}
                      />
                      <text y={node.r + 15} className="map-label">
                        {node.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {selectedProspect && (
              <div className="map-detail">
                <div>
                  <strong>{selectedProspect.name}</strong>
                  <span className={`status-chip ${stageClass[selectedProspect.stage]}`}>
                    {selectedProspect.stage}
                  </span>
                </div>
                <span className="map-detail-meta">
                  {selectedProspect.area || "No area set"} ·{" "}
                  {selectedProspect.lines.length || "no"} line
                  {selectedProspect.lines.length === 1 ? "" : "s"} ·{" "}
                  {selectedProspect.notes.length} note
                  {selectedProspect.notes.length === 1 ? "" : "s"}
                </span>
                {selectedProspect.nextAction && (
                  <span className="map-detail-meta">Next: {selectedProspect.nextAction}</span>
                )}
                <button className="link-btn" onClick={onOpenProspect}>
                  Open in Prospects →
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
