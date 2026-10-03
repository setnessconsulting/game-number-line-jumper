import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./app/globals.css";
import { NumberLineJumperGamePlatformRuntime } from "./lib/numberLineJumper/gamePlatformSdk";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Number Line Jumper root element was not found.");
}

const gamePlatformSdk = new NumberLineJumperGamePlatformRuntime();
const hasGamePlatformSession = gamePlatformSdk.connect();

if (hasGamePlatformSession) {
  window.addEventListener("pagehide", () => gamePlatformSdk.destroy(), { once: true });
}

createRoot(rootElement).render(
  <StrictMode>
    <App gamePlatformSdk={hasGamePlatformSession ? gamePlatformSdk : null} />
  </StrictMode>,
);
