/**
 * Wayline logo. Source of truth: brand-src/wayline-logo.png → scripts/build-brand.py → public/brand/.
 * The wordmark has an ink version for light surfaces and a white version for dark ones;
 * CSS shows the right one for the active theme (system or forced).
 */
export function LogoMark({ height = 28 }: { height?: number }) {
  return <img className="logo-mark" src="/brand/mark-128h.png" alt="" height={height} width={Math.round(height * 1.89)} />;
}

export function Wordmark({ height = 28 }: { height?: number }) {
  const wordHeight = Math.round(height * 0.72);
  const wordWidth = Math.round(wordHeight * 3.89);
  return (
    <span className="wordmark" role="img" aria-label="Wayline">
      <LogoMark height={height} />
      <img className="wordmark-word wordmark-word-ink" src="/brand/wordmark-text-ink.png" alt="" height={wordHeight} width={wordWidth} />
      <img className="wordmark-word wordmark-word-white" src="/brand/wordmark-text-white.png" alt="" height={wordHeight} width={wordWidth} />
    </span>
  );
}
