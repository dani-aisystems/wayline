import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/global.css";
import { ProfileProvider } from "./state/profile";
import { App } from "./app/App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ProfileProvider>
      <App />
    </ProfileProvider>
  </StrictMode>,
);
