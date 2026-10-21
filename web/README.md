# EasioProtect web interface

React + TypeScript + Vite + Tailwind CSS + shadcn/ui.

```powershell
npm install
npm run dev     # http://localhost:5173, API calls go to the Go server on :8080
npm run build   # writes ../internal/web/dist, which the Go binary embeds
```

`src/api/` (client and types) uses only `fetch`, so the React Native app can
reuse it. Add shadcn components with `npx shadcn@latest add <name>`.
