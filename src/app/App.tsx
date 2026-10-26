import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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

export function App() {
  return (
    <BrowserRouter>
      <LensProvider>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/start" element={<Onboarding />} />
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
    </BrowserRouter>
  );
}
