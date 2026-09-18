# Desk+ — FX sales CRM

A bookmarkable, client-only SPA for FX sales: cold calls → pipeline → meetings → today follow-ups, without Excel.

Built with **Vite + React + TypeScript**. Data lives in `localStorage` (no backend).

**Live:** https://joshfinch07-ui.github.io/joshfinch07-ui-deskplus/

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Production build

```bash
npm install
npm run build
npm run preview   # optional local serve of dist/
```

`vite.config.ts` uses `base: './'` so the production build works on GitHub project Pages and other static hosts.

### GitHub Pages

Pushing to `main` runs `.github/workflows/pages.yml`: `npm ci`, `npm run build`, then `upload-pages-artifact` + `deploy-pages` for `dist/`.

Repo Settings → Pages → Source must be **GitHub Actions**.

## Views

| View | Purpose |
|------|---------|
| **Today** | KPI cards + calls to make, follow-ups due (tasks, prospect chase dates, trade idea chases), meetings today. Overdue highlighted. |
| **Pipeline** | Kanban **Cold / Warm / Hot**. Filter min priority; sort by next follow-up / priority / name. |
| **Cold calls** | Bulk add (one company per line), mark called / needs email, promote → Cold or Warm pipeline. |
| **Meetings** | Book (auto confirmation tasks) + log outcomes (attended / no-show) which update pipeline temperature. |
| **Trade ideas** | Pair, structure, idea, chase date, status Open/Done/Dead/Parked. Chases due today surface on Today. |
| **Tasks** | Freeform + auto-created follow-ups; complete / delete; overdue styling. |

## Critical behaviours

1. **Log meeting** with a chosen temperature → create/update prospect and place it in that Cold/Warm/Hot column.
2. Follow-ups with due date = today appear under **Today → Follow-ups due** (calendar-reminder feel). Overdue rows are highlighted.
3. **Book meeting** auto-creates:
   - confirmation **call** task due `meetingDate − 2 days`
   - confirmation **email** task due `meetingDate − 1 day`
4. **Log call** → follow-up **email** task due in **3 days**. **Log email** → follow-up **call** task due in **4 days**.
5. Trade idea chase dates due today/overdue appear on Today.
6. Prospect **type**: Prospect | Existing client.
7. Persistence: `localStorage` key `deskplus-v1`, plus **Export / Import JSON**, EXAMPLE seed, **Wipe examples** / **Wipe all**.

## Data schema (export JSON)

```ts
{
  version: 1,
  prospects: Prospect[],
  coldCalls: ColdCall[],
  meetings: Meeting[],
  tasks: Task[],
  tradeIdeas: TradeIdea[]
}
```

Dates are `YYYY-MM-DD` strings. See `src/types.ts` for full field lists.

## Stack

- Vite 8 + React 19 + TypeScript
- `date-fns` for date helpers
- No server, no auth — bookmark and go
