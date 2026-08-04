interface StatTileProps {
  label: string;
  value: string;
  sub?: string;
}

export function StatTile({ label, value, sub }: StatTileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
