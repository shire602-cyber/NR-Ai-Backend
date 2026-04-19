import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Global handlers so crashes outside React (async code, dynamic imports, event
// handlers not wrapped by ErrorBoundary) still land in the browser console
// with enough detail to debug — not silently swallowed by the page.
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    const err = event.error;
    const describe =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : `Thrown value: ${String(err)}`;
    // eslint-disable-next-line no-console
    console.error(
      "[window.onerror]",
      describe,
      "\nat",
      event.filename,
      `${event.lineno}:${event.colno}`,
      "\n",
      err instanceof Error ? err.stack : undefined,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const describe =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : `Rejection value: ${typeof reason === "string" ? reason : JSON.stringify(reason)}`;
    // eslint-disable-next-line no-console
    console.error(
      "[unhandledrejection]",
      describe,
      "\n",
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}

createRoot(document.getElementById("root")!).render(<App />);
