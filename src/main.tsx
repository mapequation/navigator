import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { RootStore, StoreContext } from "./stores";

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");
createRoot(root).render(
  <StrictMode>
    <StoreContext.Provider value={new RootStore()}>
      <App />
    </StoreContext.Provider>
  </StrictMode>,
);
