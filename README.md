# Desk+ — FX sales CRM

A bookmarkable, client-only SPA for FX sales: cold calls → pipeline → meetings → today follow-ups, without Excel.

Built with **Vite + React + TypeScript**. Data lives in `localStorage` (no backend). Persistence key: **`deskplus-v2`** (fresh start; older `deskplus-v1` data is ignored).

## Quick start

```bash
cd deskplus
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

Vite is configured with `base: './'` so relative asset paths work on Netlify Drop and other static hosts.

## Deploy with Netlify Drop (bookmarkable link)

1. Build: `npm run build`
2. Zip the **contents** of `dist/` (so `index.html` is at the root of the zip), or use the pre-built `/workspace/DeskPlus-Netlify-Drop.zip`
3. Open [https://app.netlify.com/drop](https://app.netlify.com/drop) (or [netlify.com/drop](https://www.netlify.com/drop))
4. Drag the zip or the `deskplus-netlify-drop` folder onto the page
5. Bookmark the URL Netlify gives you

Data is stored **per browser** in `localStorage` — it does not sync across devices. Use **Export JSON** to back up.

See `NETLIFY_DROP.md` for a short checklist.

## Views

| View | Purpose |
|------|---------|
| **Today** | KPI cards + calls / follow-ups split into **Overdue** and **Due today** (calendar-reminder feel), plus meetings today. |
| **Pipeline** | Kanban **Cold / Warm / Hot**. Filter min priority; sort by next follow-up / priority / name. |
| **Cold calls** | Bulk add (one company per line), mark called / needs email, promote → Cold or Warm pipeline. |
| **Meetings** | Book (auto confirmation tasks) + log outcomes (attended / no-show) which update pipeline temperature. |
| **Trade ideas** | Pair, structure, idea, chase date, status Open/Done/Dead/Parked. Chases due today surface on Today. |
| **Tasks** | Freeform + auto-created follow-ups; complete / delete; overdue styling. |

## Critical behaviours

1. **Log meeting** with a chosen temperature → create/update prospect and place it in that Cold/Warm/Hot column.
2. Follow-ups with due date = today appear under **Today → Due today**; past due under **Overdue** (highlighted).
3. **Book meeting** auto-creates:
   - confirmation **call** task due `meetingDate − 2 days`
   - confirmation **email** task due `meetingDate − 1 day`
4. **Log call** → follow-up **email** task due in **3 days**. **Log email** → follow-up **call** task due in **4 days**.
5. Trade idea chase dates due today/overdue appear on Today.
6. Prospect **type**: Prospect | Existing client.
7. Persistence: `localStorage` key `deskplus-v2`, plus **Export / Import JSON**, EXAMPLE seed, **Wipe examples** / **Wipe all**.

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
