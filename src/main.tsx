import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import App from "./app/App.tsx";
import "./styles/index.css";
import { initCrashReporting } from "./app/Lib/crashReporting";

// No-op today (no VITE_SENTRY_DSN configured yet) — see crashReporting.ts.
initCrashReporting();

// ColdWatch is a light-only app. Force "light" theme so next-themes never
// adds class="dark" to <html>, which would override our CSS vars.
createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} forcedTheme="light">
    <App />
  </ThemeProvider>
);