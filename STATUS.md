# Desk+ status

## How to run

```bash
cd /workspace/deskplus
npm install
npm run build    # verified exit 0
npm run dev      # interactive
```

## Implemented (success criteria)

- [x] Meeting → pipeline: logging a meeting with temperature Cold/Warm/Hot **creates or updates** the prospect and places it in that kanban column (`logMeetingOutcome` in `src/store/StoreContext.tsx`).
- [x] Today follow-ups: prospect `nextFollowUp`, open tasks, and trade idea `chaseDate` with due = today (or overdue) appear under **Today → Follow-ups due**; overdue highlighted.
- [x] Book meeting → confirmation call (−2d) + confirmation email (−1d) tasks.
- [x] Log call → follow-up email task (+3d); Log email → follow-up call task (+4d).
- [x] Trade ideas with chase dates on Today.
- [x] Cold call list: bulk add, called, needs email, promote to Cold/Warm.
- [x] Prospect type Prospect | Existing client.
- [x] localStorage + Export/Import JSON + EXAMPLE seed + Wipe examples / Wipe all.
- [x] Modules: Today, Pipeline, Cold calls, Meetings, Trade ideas, Tasks.
- [x] Priority 1–5 filters and sorts on Pipeline (Desk-style).
- [x] Dark modern UI inspired by Claude Desk screenshots.

## Known gaps / non-goals

- No backend / multi-device sync (by design). Use Export/Import JSON to move data.
- No drag-and-drop between kanban columns (change temperature via edit prospect or log meeting).
- Promote from cold calls offers Cold/Warm (not Hot) — Hot is set via prospect edit or meeting log.
- Timezones on meetings are stored/displayed labels only (no DST conversion engine).
- Mobile is responsive but not a separate native app.

## Build

`npm run build` exits 0 as of this STATUS write-up.
