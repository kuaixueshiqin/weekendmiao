import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ensureAuth } from "./lib/chatHistory";

// Kick off anonymous sign-in immediately so RLS-scoped queries work.
ensureAuth();

createRoot(document.getElementById("root")!).render(<App />);
