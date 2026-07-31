import { useId, useMemo } from "react";
import { compileExpr } from "@shared/expr";
import type { PlotSpec, PlotSeries } from "@shared/blocks";

// An in-house renderer rather than a charting library. Plotly, d3, and chart.js
// are each heavier than this need, and every one of them wants to inject styles
// or fetch fonts. What is actually required here is a function curve, a scatter,
// an arrow, a bar, and a number line, which is a few hundred lines of SVG.

const WIDTH = 420;
const HEIGHT = 260;
const PAD = { top: 14, right: 16, bottom: 30, left: 40 };
const SAMPLES = 240;

const SERIES_COLORS = [
  "text-accent",
  "text-primary",
  "text-sky-400",
  "text-amber-400",
  "text-rose-400",
  "text-emerald-400",
];

type Bounds = { x0: number; x1: number; y0: number; y1: number };

/** Every finite point a series contributes, used for both drawing and autoscaling. */
function sampleSeries(series: PlotSeries, x0: number, x1: number): [number, number][] {
  if (series.points) return series.points;
  if (series.vectors) return series.vectors.flatMap((v) => [v.from, v.to]);
  if (!series.expr) return [];
  const fn = compileExpr(series.expr);
  if (!fn) return [];
  const out: [number, number][] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const x = x0 + ((x1 - x0) * i) / SAMPLES;
    const y = fn({ x });
    if (Number.isFinite(y)) out.push([x, y]);
  }
  return out;
}

/** Round a span outward to a readable interval so the axis lands on whole ticks. */
function niceStep(span: number): number {
  if (span <= 0) return 1;
  const raw = span / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalized = raw / magnitude;
  const step = normalized >= 5 ? 5 : normalized >= 2 ? 2 : 1;
  return step * magnitude;
}

function ticksFor(min: number, max: number): number[] {
  const step = niceStep(max - min);
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : Number(v.toFixed(6)));
  }
  return out.slice(0, 12);
}

function formatTick(v: number): string {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  if (abs >= 10000 || abs < 0.01) return v.toExponential(1);
  return String(Number(v.toFixed(3)));
}

export function Plot({ spec }: { spec: PlotSpec }) {
  const arrowId = useId().replace(/:/g, "");

  const { bounds, curves } = useMemo(() => {
    const [x0, x1] = spec.domain ?? (spec.type === "number_line" ? [-10, 10] : [-5, 5]);
    const sampled = spec.series.map((s) => sampleSeries(s, x0, x1));

    let y0: number;
    let y1: number;
    if (spec.range) {
      [y0, y1] = spec.range;
    } else {
      const ys = sampled.flat().map(([, y]) => y);
      const markerYs = (spec.markers ?? []).map((m) => m.y);
      const all = [...ys, ...markerYs].filter(Number.isFinite);
      if (all.length === 0) {
        y0 = -1;
        y1 = 1;
      } else {
        const lo = Math.min(...all);
        const hi = Math.max(...all);
        // A function with a pole would otherwise autoscale to nothing useful, so
        // the visible window is capped relative to the domain.
        const cap = Math.max(Math.abs(x1 - x0) * 4, 10);
        const padding = Math.max((hi - lo) * 0.12, 0.5);
        y0 = Math.max(lo - padding, -cap);
        y1 = Math.min(hi + padding, cap);
        if (y0 >= y1) { y0 -= 1; y1 += 1; }
      }
    }
    return { bounds: { x0, x1, y0, y1 } as Bounds, curves: sampled };
  }, [spec]);

  const sx = (x: number): number =>
    PAD.left + ((x - bounds.x0) / (bounds.x1 - bounds.x0)) * (WIDTH - PAD.left - PAD.right);
  const sy = (y: number): number =>
    HEIGHT - PAD.bottom - ((y - bounds.y0) / (bounds.y1 - bounds.y0)) * (HEIGHT - PAD.top - PAD.bottom);

  const xTicks = ticksFor(bounds.x0, bounds.x1);
  const yTicks = spec.type === "number_line" ? [] : ticksFor(bounds.y0, bounds.y1);
  const axisY = Math.min(Math.max(sy(0), PAD.top), HEIGHT - PAD.bottom);
  const axisX = Math.min(Math.max(sx(0), PAD.left), WIDTH - PAD.right);

  const inWindow = ([, y]: [number, number]): boolean => y >= bounds.y0 && y <= bounds.y1;

  /** Split at every gap so a pole or a domain hole is not drawn across. */
  const polylines = (points: [number, number][]): string[] => {
    const runs: string[] = [];
    let run: string[] = [];
    for (const point of points) {
      if (inWindow(point)) run.push(`${sx(point[0]).toFixed(2)},${sy(point[1]).toFixed(2)}`);
      else if (run.length > 1) { runs.push(run.join(" ")); run = []; }
      else run = [];
    }
    if (run.length > 1) runs.push(run.join(" "));
    return runs;
  };

  return (
    <figure className="my-2 overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-lg h-auto text-muted-foreground"
        role="img"
        aria-label={spec.xLabel && spec.yLabel ? `${spec.yLabel} against ${spec.xLabel}` : "plot"}
      >
        <defs>
          <marker id={`arrow-${arrowId}`} viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {spec.grid !== false && (
          <g stroke="currentColor" strokeWidth="0.5" opacity="0.15">
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} y1={PAD.top} x2={sx(t)} y2={HEIGHT - PAD.bottom} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={PAD.left} y1={sy(t)} x2={WIDTH - PAD.right} y2={sy(t)} />
            ))}
          </g>
        )}

        <g stroke="currentColor" strokeWidth="1" opacity="0.6">
          <line x1={PAD.left} y1={axisY} x2={WIDTH - PAD.right} y2={axisY} />
          {spec.type !== "number_line" && (
            <line x1={axisX} y1={PAD.top} x2={axisX} y2={HEIGHT - PAD.bottom} />
          )}
        </g>

        <g fill="currentColor" fontSize="8" opacity="0.7">
          {xTicks.map((t) => (
            <text key={`tx${t}`} x={sx(t)} y={axisY + 11} textAnchor="middle">{formatTick(t)}</text>
          ))}
          {yTicks.filter((t) => t !== 0).map((t) => (
            <text key={`ty${t}`} x={axisX - 4} y={sy(t) + 3} textAnchor="end">{formatTick(t)}</text>
          ))}
        </g>

        {spec.series.map((series, i) => {
          const color = SERIES_COLORS[i % SERIES_COLORS.length];
          const points = curves[i];
          const dash = series.style === "dashed" ? "4 3" : undefined;

          if (series.vectors) {
            return (
              <g key={i} className={color} stroke="currentColor" strokeWidth="1.6" fill="currentColor">
                {series.vectors.map((v, j) => (
                  <g key={j}>
                    <line
                      x1={sx(v.from[0])} y1={sy(v.from[1])}
                      x2={sx(v.to[0])} y2={sy(v.to[1])}
                      markerEnd={`url(#arrow-${arrowId})`}
                    />
                    {v.label && (
                      <text x={sx(v.to[0]) + 4} y={sy(v.to[1]) - 4} fontSize="9" stroke="none">
                        {v.label}
                      </text>
                    )}
                  </g>
                ))}
              </g>
            );
          }

          if (spec.type === "bar") {
            const barWidth = Math.max(
              4,
              (WIDTH - PAD.left - PAD.right) / Math.max(points.length * 1.6, 1),
            );
            return (
              <g key={i} className={color} fill="currentColor" opacity="0.75">
                {points.filter(inWindow).map(([x, y], j) => (
                  <rect
                    key={j}
                    x={sx(x) - barWidth / 2}
                    y={Math.min(sy(y), axisY)}
                    width={barWidth}
                    height={Math.abs(axisY - sy(y))}
                  />
                ))}
              </g>
            );
          }

          if (spec.type === "scatter" || (series.points && !series.expr)) {
            return (
              <g key={i} className={color} fill="currentColor">
                {points.filter(inWindow).map(([x, y], j) => (
                  <circle key={j} cx={sx(x)} cy={sy(y)} r="2.6" />
                ))}
              </g>
            );
          }

          return (
            <g key={i} className={color} stroke="currentColor" strokeWidth="1.8" fill="none">
              {polylines(points).map((pts, j) => (
                <polyline key={j} points={pts} strokeDasharray={dash} strokeLinecap="round" />
              ))}
            </g>
          );
        })}

        {(spec.markers ?? []).map((m, i) => (
          <g key={i} className="text-foreground">
            <circle cx={sx(m.x)} cy={sy(m.y)} r="3" fill="currentColor" />
            {m.label && (
              <text x={sx(m.x) + 5} y={sy(m.y) - 5} fontSize="9" fill="currentColor">{m.label}</text>
            )}
          </g>
        ))}

        {spec.xLabel && (
          <text x={WIDTH - PAD.right} y={HEIGHT - 4} fontSize="9" textAnchor="end" fill="currentColor">
            {spec.xLabel}
          </text>
        )}
        {spec.yLabel && (
          <text x={6} y={PAD.top} fontSize="9" fill="currentColor">{spec.yLabel}</text>
        )}
      </svg>

      {spec.series.some((s) => s.label) && (
        <figcaption className="flex flex-wrap gap-3 mt-1 text-[11px] text-muted-foreground">
          {spec.series.map((s, i) =>
            s.label ? (
              <span key={i} className={`flex items-center gap-1 ${SERIES_COLORS[i % SERIES_COLORS.length]}`}>
                <span className="w-3 h-0.5 bg-current rounded-full" />
                <span className="text-muted-foreground">{s.label}</span>
              </span>
            ) : null,
          )}
        </figcaption>
      )}
    </figure>
  );
}
