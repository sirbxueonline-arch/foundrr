import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyTheme, readTheme } from "./components/ThemeToggle";
import "./index.css";

// Apply the saved theme BEFORE first render so dark users never flash light.
applyTheme(readTheme());

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
