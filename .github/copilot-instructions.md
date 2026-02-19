# Copilot / AI Agent Instructions for Coldwatch IoT Dashboard

Purpose: Quickly orient AI coding assistants to the project's architecture, developer workflows, and code patterns so they can make precise, minimal-impact changes.

Quick start
- Install deps: `npm i` (repository uses Vite / Tailwind). See `package.json` scripts.
- Dev server: `npm run dev` — runs `vite`.
- Build: `npm run build` — runs `vite build`.

High-level architecture
- Entry: [src/main.tsx](src/main.tsx#L1) mounts the React tree using `createRoot` from `react-dom/client`.
- App shell: [src/app/App.tsx](src/app/App.tsx#L1-L80) wraps the app in `AppProvider` and composes `Sidebar`, `TopBar`, `BottomNav`, and page components from `src/app/pages/`.
- State: global app state and auth-like flags live in `src/app/context/AppContext.tsx` (use `useApp()` to read/write).
- UI primitives: look under `src/app/ui/` — these are small wrappers around Radix/Tailwind patterns and are the canonical place to add cross-cutting UI behavior.

Key patterns and conventions
- Pages are small components under `src/app/pages/` and are switched by `activePage` in `App.tsx` rather than a Router.
- Prefer using the provided UI primitives (`src/app/ui/*`) and Tailwind utility classes; avoid adding new global CSS unless justified.
- Components are responsive-first: `Sidebar` is desktop-only and `BottomNav` is mobile-only; maintain those semantics.
- Use `sonner` for toast notifications; see `src/app/components/ToastContainer.tsx` for usage.

Build & dependency notes
- Project uses Vite + React plugin (`vite` and `@vitejs/plugin-react` in devDeps). Modify `vite.config.ts` if changing build behavior.
- Peer dependencies list React/ReactDOM versions in `package.json`. When adding or upgrading libs, ensure compatibility with those versions.

Common troubleshooting (explicit, actionable)
- Missing types for `react-dom/client`: you may see "Could not find a declaration file for module 'react-dom/client'".
  - Preferred fix: install type packages: `npm i -D @types/react @types/react-dom`.
  - Alternate: add `src/types/react-dom-client.d.ts` with:

    declare module 'react-dom/client';

  - Helpful `tsconfig.json` tweak during iterative work: set `skipLibCheck: true` (but prefer proper typings).

- If editing Tailwind config or classes, re-run the dev server; Vite caches can require a restart.

Where to look for context & examples
- App composition: [src/app/App.tsx](src/app/App.tsx#L1-L80)
- Mount point & theme provider: [src/main.tsx](src/main.tsx#L1-L20)
- UI primitives: directory `src/app/ui/`
- Components: `src/app/components/` (Sidebar, TopBar, BottomNav, ToastContainer)

How to make safe edits
- Keep changes small and focused. Update one component or area at a time and run `npm run dev` to verify.
- Follow existing patterns in `src/app/ui/*` instead of introducing new styling systems.
- When adding TypeScript declarations, prefer adding package `@types/*` first; use local `*.d.ts` only when types are unavailable.

If you modify project config (Vite, Tailwind, package.json)
- Update `README.md` only if user-facing dev instructions change.
- Run `npm run dev` locally to smoke-test; report any build steps that require OS-specific changes.

If anything here is unclear or you want more examples (component wiring, tests, or a suggested `tsconfig.json`), ask and I'll expand specific sections.
