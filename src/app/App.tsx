import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { useProfile } from "../state/profile";
import { LensProvider } from "../components/lens/Lens";
import { Shell } from "./Shell";
import { UpdatePrompt } from "./UpdatePrompt";
import { Welcome } from "../pages/Welcome";
import { Onboarding } from "../pages/Onboarding";
import { Today } from "../pages/Today";
import { Review } from "../pages/Review";
import { Words } from "../pages/Words";
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
          <Route element={<RequireOnboarded><Shell /></RequireOnboarded>}>
            <Route path="/today" element={<Today />} />
            <Route path="/review" element={<Review />} />
            <Route path="/words" element={<Words />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <UpdatePrompt />
      </LensProvider>
    </Router>
  );
}
