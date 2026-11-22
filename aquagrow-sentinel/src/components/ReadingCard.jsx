import { memo } from 'react';
import { Link } from '../hooks/useRouter';
import Sparkline from './Sparkline';
import { formatSafeRange } from '../lib/readingStatus';
import { getMoistureCategory, getTurbidityCategory, getPhCategory } from '../services/esp32';

const STATUS_META = {
  normal: {
    label: 'Normal',
    chip: 'bg-status-normal-bg text-status-normal-fg',
    accent: '',
  },
  warning: {
    label: 'Warning',
    chip: 'bg-status-warning-bg text-status-warning-fg',
    accent: 'border-l-2 border-l-status-warning-line',
  },
  critical: {
    label: 'Critical',
    chip: 'bg-status-critical-bg text-status-critical-fg',
    accent: 'border-l-2 border-l-status-critical-line',
  },
  offline: {
    label: 'Offline',
    chip: 'bg-status-offline-bg text-status-offline-fg',
    accent: '',
  },
  nodata: {
    label: 'No data',
    chip: 'bg-status-offline-bg text-status-offline-fg',
    accent: '',
  },
  nosensor: {
    label: 'No sensor',
    chip: 'bg-slate-100 text-slate-600 border border-slate-200',
    accent: '',
  },
};

function buildReadableLabel(metric, statusLabel, formattedValue) {
  if (metric.isNoSensor) return `${metric.label}, No sensor`;
  const valuePart =
    metric.value === null
      ? 'no reading'
      : metric.unit
        ? `${formattedValue} ${metric.unit}`
        : formattedValue;

  let rangePart = '';
  const u = metric.unit ? ` ${metric.unit}` : '';
  if (metric.safeMin != null && metric.safeMax != null) {
    rangePart = `, safe range ${metric.safeMin} to ${metric.safeMax}${u}`;
  } else if (metric.safeMin != null) {
    rangePart = `, safe minimum ${metric.safeMin}${u}`;
  } else if (metric.safeMax != null) {
    rangePart = `, safe maximum ${metric.safeMax}${u}`;
  }

  return `${metric.label}, ${valuePart}, ${statusLabel}${rangePart}`;
}

const ReadingCard = memo(function ReadingCard({
  metric,
  selected = false,
  onSelect,
  href,
  areaId,
}) {
  const isNoSensor = Boolean(metric.isNoSensor || metric.status === 'nosensor');
  const meta = isNoSensor
    ? STATUS_META.nosensor
    : STATUS_META[metric.status] || STATUS_META.offline;

  const formattedValue = isNoSensor
    ? 'No sensor'
    : metric.value === null
      ? '–'
      : typeof metric.value === 'string'
        ? metric.value
        : typeof metric.value === 'number'
          ? metric.value.toFixed(metric.decimals ?? 1)
          : String(metric.value);

  // Moisture classification & bar
  const moistureInfo =
    metric.key === 'moisture' && !isNoSensor && typeof metric.value === 'number'
      ? getMoistureCategory(metric.value)
      : null;

  // Turbidity voltage-based classification
  const turbLabel =
    metric.key === 'turb' && !isNoSensor
      ? metric.extraLabel || (metric.voltage != null ? getTurbidityCategory(metric.voltage) : null)
      : null;

  // pH classification
  const phLabel =
    metric.key === 'ph' && !isNoSensor && typeof metric.value === 'number'
      ? metric.extraLabel || getPhCategory(metric.value)
      : null;

  const classificationLabel =
    moistureInfo?.label || turbLabel || phLabel || metric.extraLabel || null;

  const safeCaption = !isNoSensor ? formatSafeRange(metric.safeMin, metric.safeMax, metric.unit) : null;
  const accessibleSummary = buildReadableLabel(metric, meta.label, formattedValue);

  const isButton = !href && typeof onSelect === 'function';
  const isSelected = Boolean(isButton && selected);

  const surfaceClass = isSelected
    ? 'bg-primary-100 ring-1 ring-primary-300 border-primary-300'
    : 'bg-white/95 supports-[backdrop-filter]:bg-white/85 supports-[backdrop-filter]:backdrop-blur-md border-white/50';

  const interactiveClass =
    href || isButton
      ? 'cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2'
      : '';

  const rootClass = `rounded-2xl p-4 min-h-[148px] h-full flex flex-col text-left border shadow-sm transition-colors duration-150 motion-reduce:transition-none ${surfaceClass} ${meta.accent} ${interactiveClass}`;

  const body = (
    <>
      {!href && !isButton && <span className="sr-only">{accessibleSummary}</span>}

      <div className="flex items-start justify-between gap-2 w-full" aria-hidden={href || isButton ? 'true' : undefined}>
        <span className="text-sm font-medium text-slate-700 line-clamp-2 flex-1 min-w-0 leading-snug">
          {metric.label}
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {classificationLabel && !isNoSensor && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                moistureInfo ? `${moistureInfo.barColor} text-white` : 'bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              {classificationLabel}
            </span>
          )}
          <span className={`inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-xs font-medium shrink-0 transition-colors duration-150 motion-reduce:transition-none ${meta.chip}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
            <span>{meta.label}</span>
          </span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline w-full" aria-hidden={href || isButton ? 'true' : undefined}>
        {isNoSensor ? (
          <span className="text-[20px] leading-8 font-semibold text-slate-400">
            No sensor
          </span>
        ) : (
          <>
            <span className="text-[28px] leading-8 font-semibold tabular-nums text-ink">
              {formattedValue}
            </span>
            {metric.value !== null && metric.unit && (
              <span className="text-sm text-slate-600 ml-1">{metric.unit}</span>
            )}
          </>
        )}
      </div>

      {/* Soil moisture colored bar: red (<30), green (30-70), blue (>70) */}
      {metric.key === 'moisture' && !isNoSensor && typeof metric.value === 'number' && moistureInfo && (
        <div className="mt-2.5 w-full">
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
            <div
              className={`h-full transition-all duration-300 ${moistureInfo.barColor}`}
              style={{ width: `${Math.max(0, Math.min(100, metric.value))}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-slate-600 mt-1 font-medium">
            <span>&lt;30% (Dry)</span>
            <span>30–70% (Moist)</span>
            <span>&gt;70% (Wet)</span>
          </div>
        </div>
      )}

      {/* Turbidity voltage info */}
      {metric.key === 'turb' && metric.voltage != null && !isNoSensor && (
        <div className="mt-1 text-[11.5px] text-slate-600">
          Sensor voltage: <span className="font-semibold text-slate-700">{metric.voltage.toFixed(2)}V</span>
        </div>
      )}

      {/* Sparkline (when available and not replaced by progress bar) */}
      {metric.key !== 'moisture' && !isNoSensor && metric.history?.length > 0 && (
        <div className="mt-auto pt-2 w-full">
          <Sparkline values={metric.history} status={metric.status} />
        </div>
      )}

      {safeCaption && !isNoSensor && (
        <div className="mt-1.5 text-xs text-slate-600 truncate w-full" aria-hidden={href || isButton ? 'true' : undefined}>
          {safeCaption}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link to={href} aria-label={accessibleSummary} className={rootClass}>
        {body}
      </Link>
    );
  }

  if (isButton) {
    return (
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={accessibleSummary}
        onClick={() => onSelect(areaId, metric.key)}
        className={rootClass}
      >
        {body}
      </button>
    );
  }

  return <div className={rootClass}>{body}</div>;
});

export default ReadingCard;
