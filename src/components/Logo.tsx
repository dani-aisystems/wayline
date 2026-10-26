/**
 * The Wayline mark: one continuous route that starts as a dot (day one),
 * crosses two contour rings and ends in an arrowhead. The route also reads as a "w".
 * Route path and contours are shared with the static SVG files in public/brand/.
 */
export const ROUTE_PATH =
  "M12 17 C15 33 19 46 24 46 C28.5 46 29 31 32 31 C35 31 35.5 46 40 46 C45 46 48.5 33 51.5 20";
export const ARROW_PATH = "M46.8 20.3 L52.4 16.1 L55.6 22.3";

type MarkProps = { size?: number; title?: string; mono?: boolean };

export function LogoMark({ size = 32, title, mono = false }: MarkProps) {
  const route = mono ? "currentColor" : "var(--accent)";
  const contour = mono ? "currentColor" : "var(--line)";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <g fill="none" stroke={contour} strokeWidth="2" opacity={mono ? 0.35 : 1}>
        <ellipse cx="32" cy="38" rx="27" ry="19" />
        <ellipse cx="32" cy="38" rx="15" ry="10" />
      </g>
      <path d={ROUTE_PATH} fill="none" stroke={route} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d={ARROW_PATH} fill="none" stroke={route} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="17" r="5" fill={route} />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span className="wordmark" style={{ fontSize: size }}>
      <LogoMark size={Math.round(size * 1.25)} />
      <span className="wordmark-text">wayline</span>
    </span>
  );
}
