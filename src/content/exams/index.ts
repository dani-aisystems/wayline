import { ExamPack, type ExamId, type ExamTask, type Paper, type PartGuide, type TagLesson } from "./schema";

const modules = import.meta.glob("./packs/*.json", { eager: true, import: "default" });

export type ExamLibrary = {
  tasks: Map<string, ExamTask>;
  guides: PartGuide[];
  lessons: Map<string, TagLesson>;
};

export function buildExamLibrary(raw: unknown[]): ExamLibrary {
  const lib: ExamLibrary = { tasks: new Map(), guides: [], lessons: new Map() };
  for (const r of raw) {
    const pack = ExamPack.parse(r);
    for (const t of pack.tasks) lib.tasks.set(t.id, t);
    lib.guides.push(...pack.guides);
    for (const l of pack.lessons) lib.lessons.set(l.tag, l);
  }
  return lib;
}

export const examLibrary = buildExamLibrary(Object.values(modules));

export function tasksFor(exam: ExamId, paper?: Paper, part?: number, lib = examLibrary): ExamTask[] {
  return [...lib.tasks.values()].filter((t) => t.exam === exam && (!paper || t.paper === paper) && (part === undefined || t.part === part));
}

export function guideFor(exam: ExamId, paper: Paper, part: number, lib = examLibrary): PartGuide | undefined {
  return lib.guides.find((g) => g.exam === exam && g.paper === paper && g.part === part);
}

/** Sets that contain a complete mock test for this exam. */
export function mockSets(exam: ExamId, lib = examLibrary): string[] {
  return [...new Set(tasksFor(exam, undefined, undefined, lib).filter((t) => t.set.startsWith("mock")).map((t) => t.set))].sort();
}

/** Question numbers and tags in a task, whatever its kind. */
export function questionsOf(t: ExamTask): { n: number; tag: string }[] {
  switch (t.kind) {
    case "listen-mc":
      return t.extracts.flatMap((e) => e.questions);
    case "listen-matching":
      return t.tasks.flatMap((x) => x.questions);
    case "writing":
      return [{ n: 1, tag: "write.content" }];
    case "speaking":
      return [{ n: 1, tag: `speak.${["interview", "long-turn", "collaboration", "discussion"][t.part - 1]}` }];
    default:
      return t.questions;
  }
}
