import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { ProfileProvider } from "./state/profile";
import { Welcome } from "./pages/Welcome";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProfileProvider>
      <Welcome />
    </ProfileProvider>
  </StrictMode>,
);
