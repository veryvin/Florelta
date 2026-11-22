import { ago } from '../data/db';

export default function Chart({ pts = [], u = '', th, minVal, maxVal }) {
  const W = 640, H = 230, P = 34;
  if (!pts || !pts.length) {
    return (
      <div className="w-full h-[230px] flex items-center justify-center text-mut text-sm">
        No history data available
      </div>
    );
  }

  // Normalize points: handle both raw numbers and { t, v } objects
  const nowMs = Date.now();
  const normalized = pts.map((p, i) => {
    if (typeof p === 'number') {
      return { v: p, t: nowMs - (pts.length - 1 - i) * 2000 };
    }
    return { v: p?.v ?? 0, t: p?.t ?? nowMs };
  });

  const vs = normalized.map((p) => p.v);
  let lo = minVal != null ? minVal : Math.min(...vs);
  let hi = maxVal != null ? maxVal : Math.max(...vs);

  if (lo === hi) {
    lo = Math.max(0, lo - 1);
    hi = hi + 1;
  }
  if (minVal == null && maxVal == null) {
    const pd = (hi - lo) * 0.15 || 1;
    lo -= pd;
    hi += pd;
  }

  const X = (i) => P + (i * (W - P - 10)) / Math.max(1, normalized.length - 1);
  const Y = (v) => {
    const clamped = Math.max(lo, Math.min(hi, v));
    return H - 24 - ((clamped - lo) / (hi - lo)) * (H - 44);
  };

  const line = normalized.map((p, i) => `${X(i)},${Y(p.v)}`).join(' ');
  const refs = [['wl', '#e08a00'], ['wh', '#e08a00'], ['cl', '#d6336c'], ['ch', '#d6336c']]
    .filter(([k]) => th && th[k] != null && th[k] >= lo && th[k] <= hi);

  return (
    <svg className="w-full h-[230px] block" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Sensor trend chart">
      {[0, 1, 2, 3].map((i) => {
        const v = lo + ((hi - lo) * i) / 3;
        return (
          <g key={i}>
            <line x1={P} x2={W - 10} y1={Y(v)} y2={Y(v)} stroke="#dbe8e2" />
            <text x="2" y={Y(v) + 4} fontSize="11" fill="#5d7a72">{v >= 100 ? v.toFixed(0) : v.toFixed(1)}</text>
          </g>
        );
      })}
      {refs.map(([k, c]) => (
        <g key={k}>
          <line x1={P} x2={W - 10} y1={Y(th[k])} y2={Y(th[k])} stroke={c} strokeDasharray="5 4" />
          <text x={W - 12} y={Y(th[k]) - 3} fontSize="10" textAnchor="end" fill={c}>
            {k[0] === 'c' ? 'critical' : 'warning'} {th[k]}
          </text>
        </g>
      ))}
      <polygon points={`${P},${H - 24} ${line} ${X(normalized.length - 1)},${H - 24}`} fill="#1c7ed6" opacity=".1" />
      <polyline points={line} fill="none" stroke="#1c7ed6" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx={X(normalized.length - 1)} cy={Y(vs[vs.length - 1])} r="5" fill="#2f9e44" />
      <text x={P} y={H - 6} fontSize="11" fill="#5d7a72">{ago(normalized[0].t)}</text>
      <text x={W - 10} y={H - 6} fontSize="11" textAnchor="end" fill="#5d7a72">
        now ({vs[vs.length - 1]?.toFixed?.(1) ?? vs[vs.length - 1]} {u.trim()})
      </text>
    </svg>
  );
}
