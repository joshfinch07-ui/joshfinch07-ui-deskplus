# Desk+ — Netlify Drop

Deploy a static, bookmarkable copy of Desk+ with no account plumbing required beyond Netlify Drop.

## Steps

1. Go to **https://app.netlify.com/drop** (or **https://www.netlify.com/drop**).
2. Drag **`/workspace/DeskPlus-Netlify-Drop.zip`** (or the folder **`/workspace/deskplus-netlify-drop/`**) onto the drop zone.
3. Wait for the deploy; Netlify shows a public URL (e.g. `https://something.netlify.app`).
4. **Bookmark that URL** — that is your Desk+ link.

You can also drag a freshly built `dist/` folder if `index.html` is at the top level of what you upload.

## Keep existing data (important)

Desk+ stores everything in **this browser’s `localStorage`** under the key `deskplus-v2`. That storage is scoped to the **site origin**.

- **Redeploy over the SAME Netlify site** (e.g. drag onto / update `resilient-gelato-4ed32c.netlify.app`) so `localStorage` on that origin is kept.
- A **brand-new Drop URL** is a new origin and starts empty (or with EXAMPLE seed on first visit).
- Use **Export JSON** before switching URLs if you need to move data; **Import JSON** to restore.

Clearing site data, using another browser/device, or a private window also starts empty (or with EXAMPLE seed).
