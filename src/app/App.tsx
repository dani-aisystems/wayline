import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense, type ReactNode } from "react";
import { useProfile } from "../state/profile";
import { LensProvider } from "../components/lens/Lens";
import { Shell } from "./Shell";
import { UpdatePrompt } from "./UpdatePrompt";
import { Welcome } from "../pages/Welcome";
import { Onboarding } from "../pages/Onboarding";
import { Today } from "../pages/Today";
import { Review } from "../pages/Review";
import { LibraryAlphabet, LibraryCefr, LibraryExpressions, LibraryGrammar, LibraryHome, LibraryMistakes, LibraryReading, LibraryWords } from "../pages/library/Library";
import { Practice } from "../pages/session/Practice";
// Exam preparation (and its content) loads only when a learner opens it.
const ExamHome = lazy(() => import("../pages/exam/ExamHome").then((m) => ({ default: m.ExamHome })));
const ExamRunner = lazy(() => import("../pages/exam/ExamRunner").then((m) => ({ default: m.ExamRunner })));
const ExamGuide = lazy(() => import("../pages/exam/ExamPages").then((m) => ({ default: m.ExamGuide })));
const ExamLesson = lazy(() => import("../pages/exam/ExamPages").then((m) => ({ default: m.ExamLesson })));
const ExamResult = lazy(() => import("../pages/exam/ExamPages").then((m) => ({ default: m.ExamResult })));
import { Settings } from "../pages/Settings";
import { Session } from "../pages/session/Session";
import { Placement } from "../pages/placement/Placement";
import { PlacementResult } from "../pages/placement/PlacementResult";

function RequireProfile({ children }: { children: ReactNode }) {
  const { status, profile } = useProfile();
  if (status === "loading") return null;
  if (!profile) return <Navigate to="/" replace />;
  return children;
}

function RequireOnboarded({ children }: { children: ReactNode }) {
  const { status, profile } = useProfile();
  if (status === "loading") return null;
  if (!profile?.onboardedAt) return <Navigate to="/" replace />;
  return children;
}

function Home() {
  const { status, profile } = useProfile();
  if (status === "loading") return null;
  if (profile?.onboardedAt) return <Navigate to="/today" replace />;
  return <Welcome />;
}

// The artifact viewer can't show path routes in its address bar, so that build keeps routes in memory.
const Router = __ARTIFACT__ ? MemoryRouter : BrowserRouter;

export function App() {
  return (
    <Router>
      <LensProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/start" element={<Onboarding />} />
          <Route path="/placement" element={<RequireProfile><Placement /></RequireProfile>} />
          <Route path="/placement/result/:id" element={<RequireProfile><PlacementResult /></RequireProfile>} />
          <Route path="/session" element={<RequireOnboarded><Session /></RequireOnboarded>} />
          <Route path="/review/session" element={<RequireOnboarded><Session reviewOnly /></RequireOnboarded>} />
          <Route path="/practice" element={<RequireOnboarded><Practice /></RequireOnboarded>} />
          <Route path="/exam/run" element={<RequireOnboarded><Suspense fallback={<div className="page" aria-busy="true" />}><ExamRunner /></Suspense></RequireOnboarded>} />
          <Route element={<RequireOnboarded><Shell /></RequireOnboarded>}>
            <Route path="/today" element={<Today />} />
            <Route path="/review" element={<Review />} />
            <Route path="/exam" element={<Suspense fallback={<div className="page" aria-busy="true" />}><ExamHome /></Suspense>} />
            <Route path="/exam/guide/:paper/:part" element={<Suspense fallback={<div className="page" aria-busy="true" />}><ExamGuide /></Suspense>} />
            <Route path="/exam/lesson/:tag" element={<Suspense fallback={<div className="page" aria-busy="true" />}><ExamLesson /></Suspense>} />
            <Route path="/exam/result/:id" element={<Suspense fallback={<div className="page" aria-busy="true" />}><ExamResult /></Suspense>} />
            <Route path="/library" element={<LibraryHome />} />
            <Route path="/library/words" element={<LibraryWords />} />
            <Route path="/library/expressions" element={<LibraryExpressions />} />
            <Route path="/library/grammar" element={<LibraryGrammar />} />
            <Route path="/library/alphabet" element={<LibraryAlphabet />} />
            <Route path="/library/mistakes" element={<LibraryMistakes />} />
            <Route path="/library/reading" element={<LibraryReading />} />
            <Route path="/library/cefr" element={<LibraryCefr />} />
            <Route path="/words" element={<Navigate to="/library/words" replace />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpdatePrompt />
      </LensProvider>
    </Router>
  );
}
