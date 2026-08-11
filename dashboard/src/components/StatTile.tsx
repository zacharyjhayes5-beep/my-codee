interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}

export function StatTile({ label, value, sub, accent }: StatTileProps) {
  return (
    <div className={`stat-tile${accent ? " accent" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
