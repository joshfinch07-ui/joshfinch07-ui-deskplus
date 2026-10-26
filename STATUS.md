# Desk+ status

## How to run

```bash
cd /workspace/deskplus
npm install
npm run build    # verified exit 0
npm run dev      # interactive
```

## Netlify Drop package

- Source: `/workspace/deskplus` (Vite `base: './'`)
- Unzipped deploy folder: `/workspace/deskplus-netlify-drop/` (`index.html` at top level)
- Zip: `/workspace/DeskPlus-Netlify-Drop.zip`
- Instructions: `NETLIFY_DROP.md` / README Netlify Drop section
- **Redeploy over the SAME Netlify site** (e.g. `resilient-gelato-4ed32c.netlify.app`) so browser `localStorage` is kept. A brand-new Drop URL starts empty (or with EXAMPLE seed).

## Implemented (success criteria)

- [x] Meeting → pipeline: logging a meeting with temperature Cold/Warm/Hot **creates or updates** the prospect and places it in that kanban column (`logMeetingOutcome` in `src/store/StoreContext.tsx`).
- [x] Today follow-ups: prospect `nextFollowUp`, open tasks, trade idea `chaseDate`, and **open Cold leads** `followUpDate` with due = today or overdue appear under **Today**, split into clear **Overdue** and **Due today** sections (calendar-reminder feel); overdue highlighted. Cold leads labelled “Cold lead — …”.
- [x] Book meeting → confirmation call (−2d) + confirmation email (−1d) tasks.
- [x] Log call → follow-up email task (+3d); Log email → follow-up call task (+4d).
- [x] Trade ideas with chase dates on Today.
- [x] Cold call list: bulk add, called, needs email, promote to Cold/Warm.
- [x] **Cold leads** tab: condensed one-row-per-lead UI (company, contact, follow-up, volume/FX, notes, quick actions); separate from pipeline Cold and Cold calls dial list.
- [x] Prospect type Prospect | Existing client.
- [x] localStorage key **`deskplus-v2`** unchanged; old saves missing `coldLeads` migrate to `[]` so pipeline/meetings/tasks/trade ideas stay intact. Export/Import JSON includes `coldLeads`. EXAMPLE seed only; wipe-examples clears them.
- [x] Footer note: “Saved in this browser · Export JSON to back up”.
- [x] Modules: Today, Pipeline, Cold calls, **Cold leads**, Meetings, Trade ideas, Tasks.
- [x] Priority 1–5 filters and sorts on Pipeline (Desk-style).
- [x] Dark modern UI inspired by Claude Desk screenshots.
- [x] Packaged for Netlify Drop (relative `base`, zip + folder).

## Email briefs + cloud sync (2026-09-29)

- Prospects, Cold leads, Tasks, Trade ideas (+ optional on Meetings/Cold calls types): `contactEmail`, `briefWhat` ("What to say"), `briefHow` ("How to write it"); tasks/trade ideas also `contactName` and fall back field-by-field to the linked prospect.
- ⚙ Settings: Default email style (`data.settings.defaultEmailStyle`) + Cloud sync panel.
- Today follow-ups show ✉ chips (Brief ready / Brief · no email / No brief); click to edit. Cold leads keep one-line rows; Edit expands contact email + brief.
- Migration (`src/store/migrate.ts`): lossless, keeps `version: 1`, adds `schemaRev: 2`, `settings`, `updatedAt`; verbatim pre-upgrade copy in `deskplus-v2-pre-emailbriefs-backup`; rolling backups in `deskplus-v2-backups` before any overwrite; unreadable saves copied to `deskplus-v2-unreadable-<ts>`.
- Cloud sync (`src/sync/`): private GitHub repo file via Contents API, token in `deskplus-sync` localStorage only; refuses public repos; debounced push (4 s); pull on load/focus; empty never overwrites non-empty; conflicts ask.
- `public/_headers`: CSP (connect-src self + api.github.com only), no-referrer, nosniff, frame DENY.
- Tests: `/workspace/deskplus-test/test_{migration,features,sync}.mjs` (Playwright + system Chrome; GitHub mocked).
- Reader: `/workspace/deskplus-sync/read_due.py`.

## Calls + Done + outcomes (rev3 "CallsDone", 2026-09-29) — zip `/workspace/DeskPlus-Netlify-Update-CallsDone.zip`

- Every follow-up is ✉ Email or 📞 Call (`followUpType`, default email; call-kind tasks default call) with `contactPhone`. Call labels: Call points / Approach (optional) / Called ✓. Chips: ✉ Email ready · ✉ Brief · no email · ✉ No brief · 📞 Call ready · 📞 Points · no phone · 📞 No call points.
- **Nothing on Today vanishes without a next step.** The round check, “Sent ✓ / Called ✓” and “No answer / Push” (on follow-ups *and* Calls to make) all open one outcome popover (`components/DonePopover.tsx`):
  - **Done ✓**: logs activity, resets `attempts` to 0, reschedules (default = Settings gap, 3 business days). Options: clear “What to say”, also complete linked due tasks, next type.
  - **No answer / Push back**: logs `{outcome:'no-answer', attempt:n}`, `attempts+1`, keeps the brief, reschedules by cadence step `steps[min(attempts, len-1)]`. Tasks stay open (dueDate moves) and the attempt is also logged on the linked prospect.
  - **Close…** (explicit): cold lead Done/Parked · trade Done/Dead/Parked · task complete (no follow-up task) · prospect nextFollowUp cleared (+ optional cool one step). Sets `closedAt`.
  - Date: quick +1/+2/+3/+5 business days, +1 wk, plus DateInput override (“custom”). Business days skip Sat/Sun only (no public holidays).
  - Undo toast (10 s) for every outcome and Reopen (`store/done.ts` `applyOutcome`/`applyReopen`/`applyUndo`, pure).
- **Cadence**: `settings.defaultCadence` (default steps [2,3,5], max 5; editable in ⚙ Settings); per-item `cadence` from the popover (“change”). Resolution record → linked prospect → default. Today chip “Attempt N” (N = attempts+1), red “Max M reached”. At max the popover asks: Cool to Warm/Cold & push (prospects/linked), Park it (cold lead/trade), Reset counter & push, Change cadence.
- **Recently completed** card on Today (last 7 days, newest first) with ↺ Reopen: completed tasks (`completedAt`), closed cold leads (`closedAt` or, for older closes, `updatedAt`), trades with `closedAt`, prospects with `closedAt` and no date. `setColdLeadStatus`/`setTradeIdeaStatus` now stamp `closedAt`.
- Data: new optional fields only (`followUpType`, `contactPhone`, `activityLog[]` {id,date,at,type,contactName,to,what,how,nextFollowUp,outcome,attempt,note}, `attempts`, `cadence`, `closedAt`; settings `followUpGapDays`, `defaultCadence`). `schemaRev: 3`, `version: 1`; existing records are not rewritten on load; verbatim pre-upgrade copy in `deskplus-v2-pre-rev3-backup`.
- Tests (`/workspace/deskplus-test`): `test_outcomes.mjs` (reproduces the rev2 vanish bug, then Reopen/no-answer/cadence/max prompt/close/undo/sync/reader), `test_done.mjs`, `test_rev3_migration.mjs` (incl. a snapshot of the live data), `test_migration`, `test_features`, `test_sync`, `csp_check`, `blank_check` — all pass.
- Source backup before rev3: `/workspace/deskplus-pre-callsdone-src-backup`.

## Proposals & Sims + prospect hub (rev4, 2026-09-29) — zip `/workspace/DeskPlus-Netlify-Update-Proposals.zip`

- **Trade ideas tab → "Proposals & Sims"** (`views/ProposalsSimsView.tsx`). Proposals: one-line rows (company · sent · pair/volume · proposed · inline status · follow-up · brief chip · 📅 meeting chip), Won/Lost/Open/Parked pills + win rate, status filter, sort (newest sent / follow-up / company / status). Live simulations: grouped by month (newest first), "Roll ▸" copies a Running sim into next month (`rolledFromId`/`rolledToId`, source shows "→ YYYY-MM"). Unlinked records show ⚠; migrated ones a "TI" tag.
- **Prospect = hub.** `CompanyPicker` (type-ahead over prospects; exact normalised match → "Link to"; near match → "⚠ Similar in pipeline" + "Create prospect … anyway"; create only when nothing matches). Proposals/sims require a linked prospect and inherit contact/email/phone/brief (shown as "↳ …" placeholders; fill a field to override). Pipeline cards + prospect form show hub chips (📅 N meetings · 📄 N proposals (Sent) · 📈 N sims (Running) · ⚠ also N cold lead) linking to filtered views.
- **Meetings**: "📄 Send proposal" (prefilled company/prospect/meeting/pairs/volume, dateSent today, follow-up = Settings gap) + proposal chips; proposal rows link back to the meeting.
- **Today**: proposal (Sent/Discussing) and sim (Running/Reviewed) follow-ups; Close options proposal Won/Lost/Parked, sim Converted/Ended; Recently completed + Reopen for both. Items due for the same hub company collapse into one **group row** ("Acme: pipeline follow-up + proposal follow-up") with a group popover ("Apply to" checkboxes, per-part close select, one Undo) and "just this" per part.
- **Duplicates**: banner on Today/Pipeline/Cold leads ("⚠ N possible duplicate compan(y|ies)") → review table → "Merge into selected" (saves a `before-merge …` backup first; fills blanks, joins notes/activity, keeps the soonest open follow-up, removed records kept verbatim in `mergedFrom`, links re-pointed; Undo restores original order) or "Not a duplicate" (`settings.dismissedDuplicates`).
- **Migration**: `schemaRev 4`. `tradeIdeas` → `simulations` (Open→Running, Done→Reviewed, Dead/Parked→Ended; idea→outcome; chaseDate→followUpDate; month = created month; auto-link by normalised prospect name; full original in `migratedFrom.record`), then `tradeIdeas: []`. Other records untouched; `updatedAt` not bumped; verbatim copy in `deskplus-v2-pre-rev4-backup`.
- Tests: new `test_proposals.mjs` (72 checks: live-data migration, Honey Birdette merge/undo, hub chips, Today group row, meeting→proposal, picker, popovers, roll, sync, reader) + all earlier suites updated for rev4 — all pass.
- Source backup before rev4: `/workspace/deskplus-pre-proposals-src-backup`.

## Known gaps / non-goals

- Optional private cloud sync via GitHub (see above); otherwise Export/Import JSON.
- No drag-and-drop between kanban columns (change temperature via edit prospect or log meeting).
- Promote from cold calls offers Cold/Warm (not Hot) — Hot is set via prospect edit or meeting log.
- Timezones on meetings are stored/displayed labels only (no DST conversion engine).
- Mobile is responsive but not a separate native app.
- `deskplus-v1` data is not migrated; v2 starts clean.
- Company matching is by normalised name (drops punctuation and suffixes like Pty/Ltd/Co/Group) — "Acme Co" and "Acme Group" count as the same company.

## Build

`npm run build` exits 0 as of 2026-09-29 (rev4 Proposals & Sims).
