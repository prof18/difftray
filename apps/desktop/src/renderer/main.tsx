import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/600.css";
import React from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import "./styles/global.css";

const root = document.querySelector("#root");

if (!root) {
  throw new Error("Difftray renderer root was not found.");
}

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
