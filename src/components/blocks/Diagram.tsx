import { useId } from "react";
import type { DiagramSpec, DiagramElement } from "@shared/blocks";
import { Latex } from "./Latex";

// Free-body diagrams, circuits, and geometry do not fit a flowchart tool, which
// is what rules out mermaid. The spec is a whitelist of geometric primitives and
// this renderer builds the element tree from it: every value below is a number
// or a string bound into a text node, and the model never supplies markup.

const LABEL_OFFSET = 6;

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const toXY = (deg: number): [number, number] => [
    cx + r * Math.cos((deg * Math.PI) / 180),
    cy + r * Math.sin((deg * Math.PI) / 180),
  ];
  const [x1, y1] = toXY(start);
  const [x2, y2] = toXY(end);
  const large = Math.abs(end - start) % 360 > 180 ? 1 : 0;
  const sweep = end > start ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
}

/** Where a primitive's label sits, so labels do not have to carry coordinates. */
function labelAnchor(el: DiagramElement): [number, number] | null {
  switch (el.t) {
    case "line": return [(el.x1 + el.x2) / 2, (el.y1 + el.y2) / 2 - LABEL_OFFSET];
    case "circle": return [el.cx, el.cy - el.r - LABEL_OFFSET];
    case "rect": return [el.x + el.w / 2, el.y - LABEL_OFFSET];
    case "arc": return [el.cx, el.cy - el.r - LABEL_OFFSET];
    case "polygon": {
      const xs = el.points.map((p) => p[0]);
      const ys = el.points.map((p) => p[1]);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, Math.min(...ys) - LABEL_OFFSET];
    }
    case "label": return null;
  }
}

export function Diagram({ spec }: { spec: DiagramSpec }) {
  const arrowId = useId().replace(/:/g, "");
  const [, , boxWidth, boxHeight] = spec.viewBox;
  // A LaTeX label cannot be an SVG text node, so it is positioned over the
  // drawing instead, in the same coordinate space.
  const mathLabels = spec.elements.filter(
    (el): el is Extract<DiagramElement, { t: "label" }> => el.t === "label" && el.latex === true,
  );

  return (
    <figure className="my-2 relative w-full max-w-md">
      <svg
        viewBox={spec.viewBox.join(" ")}
        className="w-full h-auto text-foreground"
        role="img"
        aria-label="diagram"
      >
        <defs>
          <marker id={`dia-${arrowId}`} viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
          </marker>
        </defs>

        {spec.elements.map((el, i) => {
          const anchor = labelAnchor(el);
          const label = el.t !== "label" && el.label
            ? <text x={anchor![0]} y={anchor![1]} fontSize="9" textAnchor="middle"
                fill="currentColor" stroke="none">{el.label}</text>
            : null;

          switch (el.t) {
            case "line":
              return (
                <g key={i} stroke="currentColor" strokeWidth="1.5" fill="none">
                  <line
                    x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2}
                    strokeDasharray={el.dashed ? "4 3" : undefined}
                    markerEnd={el.arrow === "end" || el.arrow === "both" ? `url(#dia-${arrowId})` : undefined}
                    markerStart={el.arrow === "both" ? `url(#dia-${arrowId})` : undefined}
                  />
                  {label}
                </g>
              );
            case "circle":
              return (
                <g key={i} stroke="currentColor" strokeWidth="1.5"
                  fill={el.fill ? "currentColor" : "none"}>
                  <circle cx={el.cx} cy={el.cy} r={el.r} />
                  {label}
                </g>
              );
            case "rect":
              return (
                <g key={i} stroke="currentColor" strokeWidth="1.5" fill="none">
                  <rect x={el.x} y={el.y} width={el.w} height={el.h} rx="2" />
                  {label}
                </g>
              );
            case "arc":
              return (
                <g key={i} stroke="currentColor" strokeWidth="1.5" fill="none">
                  <path d={arcPath(el.cx, el.cy, el.r, el.start, el.end)} />
                  {label}
                </g>
              );
            case "polygon":
              return (
                <g key={i} stroke="currentColor" strokeWidth="1.5"
                  fill={el.fill ? "currentColor" : "none"} fillOpacity={el.fill ? 0.15 : undefined}>
                  <polygon points={el.points.map((p) => p.join(",")).join(" ")} />
                  {label}
                </g>
              );
            case "label":
              if (el.latex) return null;
              return (
                <text key={i} x={el.x} y={el.y} fontSize="10" fill="currentColor" textAnchor="middle">
                  {el.text}
                </text>
              );
          }
        })}
      </svg>

      {mathLabels.map((el, i) => (
        <span
          key={`m${i}`}
          className="absolute -translate-x-1/2 -translate-y-1/2 text-xs pointer-events-none"
          style={{ left: `${(el.x / boxWidth) * 100}%`, top: `${(el.y / boxHeight) * 100}%` }}
        >
          <Latex value={el.text} />
        </span>
      ))}
    </figure>
  );
}
