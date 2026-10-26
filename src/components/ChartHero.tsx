/**
 * The welcome illustration: a small chart with contour lines and the learner's route,
 * which draws itself once on load (the page's single orchestrated motion).
 */
export function ChartHero() {
  return (
    <svg className="chart-hero" viewBox="0 0 480 360" aria-hidden="true" focusable="false">
      <g className="chart-contours" fill="none" strokeWidth="1.25">
        <path d="M40 300 C70 220 150 200 210 230 C280 265 330 250 380 200 C420 160 450 170 470 190" />
        <path d="M60 330 C110 260 170 250 230 270 C300 295 360 285 410 240 C440 212 460 220 475 232" />
        <path d="M250 70 C310 40 390 60 410 110 C430 160 380 190 320 180 C260 170 210 120 250 70 Z" />
        <path d="M275 92 C315 74 370 86 382 117 C394 148 360 165 322 158 C284 151 250 120 275 92 Z" />
        <path d="M300 112 C325 103 352 110 358 125 C364 140 344 148 324 145 C304 142 286 125 300 112 Z" />
        <path d="M30 130 C60 90 120 80 150 110 C180 140 160 180 110 185 C60 190 15 165 30 130 Z" />
        <path d="M60 135 C80 112 115 108 132 125 C148 142 136 164 106 166 C76 168 50 152 60 135 Z" />
      </g>
      <g className="chart-soundings" fontSize="11">
        <text x="196" y="160">12</text>
        <text x="430" y="300">27</text>
        <text x="70" y="250">8</text>
      </g>
      <path
        className="chart-route"
        d="M70 300 C120 290 140 250 170 220 C200 190 240 205 270 200 C310 193 315 140 330 128"
        fill="none"
        pathLength={1}
      />
      <circle className="chart-start" cx="70" cy="300" r="7" />
      <circle className="chart-here" cx="330" cy="128" r="9" />
    </svg>
  );
}
