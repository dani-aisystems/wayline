import { useState } from "react";
import type { Resource } from "../../content/exams/resources";
import { useProfile } from "../../state/profile";

/** Links to official resources. Videos load from YouTube only after the learner chooses to play them. */
export function Resources({ items }: { items: Resource[] }) {
  const { t } = useProfile();
  return (
    <ul className="ex-resources">
      {items.map((r) => (
        <li key={r.url}>{r.video ? <Video r={r} /> : <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>}{r.kind !== "video" && <span className="card-meta"> · {t(`exam.res.${r.kind}`)}</span>}</li>
      ))}
    </ul>
  );
}

function Video({ r }: { r: Resource }) {
  const { t } = useProfile();
  const [on, setOn] = useState(false);
  return (
    <div className="ex-video">
      <p><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></p>
      {on ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${r.video}`}
          title={r.title}
          loading="lazy"
          allow="encrypted-media; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button type="button" className="btn btn-quiet btn-small" onClick={() => setOn(true)}>{t("exam.playVideo")}</button>
      )}
      <p className="card-meta">{t("exam.videoNote")}</p>
    </div>
  );
}
