import type { ExamId, Paper } from "./schema";

/**
 * Official and reliable preparation resources. Links only — Wayline doesn't copy their content.
 * Videos are official Cambridge English recordings on YouTube, loaded only when the learner presses play.
 */
export type Resource = { title: string; url: string; kind: "official" | "video" | "sample"; paper?: Paper; video?: string };

export const RESOURCES: Record<ExamId, Resource[]> = {
  "b2-first": [
    { title: "B2 First exam format", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/first/format/", kind: "official" },
    { title: "B2 First handbook for teachers (task types, marking, sample papers)", url: "https://www.cambridgeenglish.org/images/167791-b2-first-handbook.pdf", kind: "sample" },
    { title: "Preparing for B2 First: free sample tests and practice", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/first/preparation/", kind: "sample" },
    { title: "Converting practice test scores to the Cambridge English Scale", url: "https://www.cambridgeenglish.org/images/210434-converting-practice-test-scores-to-cambridge-english-scale-scores.pdf", kind: "official" },
    { title: "B2 First statement of results explained", url: "https://www.cambridgeenglish.org/it/Images/664445-b2-statement-of-results-factsheet.pdf", kind: "official" },
    { title: "B2 First Speaking test: Florine and María (Cambridge English)", url: "https://www.youtube.com/watch?v=-tqeI9t4x9E", kind: "video", paper: "speaking", video: "-tqeI9t4x9E" },
  ],
  "c1-advanced": [
    { title: "C1 Advanced exam format", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/format/", kind: "official" },
    { title: "C1 Advanced handbook for teachers (task types, marking, sample papers)", url: "https://www.cambridgeenglish.org/Images/167804-c1-advanced-handbook.pdf", kind: "sample" },
    { title: "Preparing for C1 Advanced: free sample tests and practice", url: "https://www.cambridgeenglish.org/exams-and-tests/qualifications/advanced/preparation/", kind: "sample" },
    { title: "Converting practice test scores to the Cambridge English Scale", url: "https://www.cambridgeenglish.org/images/210434-converting-practice-test-scores-to-cambridge-english-scale-scores.pdf", kind: "official" },
    { title: "C1 Advanced statement of results explained", url: "https://www.cambridgeenglish.org/Images/664448-c1-statement-of-results-factsheet.pdf", kind: "official" },
    { title: "Assessing Speaking for C1 Advanced: a guide for teachers", url: "https://www.cambridgeenglish.org/Images/735851-teacher-guide-for-speaking-c1-advanced.pdf", kind: "official", paper: "speaking" },
    { title: "Examiner commentary on the C1 Advanced Speaking test video", url: "https://www.cambridgeenglish.org/images/167862-speaking-test-video-c1-advanced.pdf", kind: "official", paper: "speaking" },
    { title: "C1 Advanced Speaking test: Raphael and Maude (Cambridge English)", url: "https://www.youtube.com/watch?v=5nGESyDgmdw", kind: "video", paper: "speaking", video: "5nGESyDgmdw" },
  ],
};

export function resourcesFor(exam: ExamId, paper?: Paper): Resource[] {
  return RESOURCES[exam].filter((r) => (paper ? r.paper === paper || (!r.paper && r.kind !== "video") : true));
}
