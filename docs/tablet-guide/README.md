# KSG tablet guide — how it was made

Source for `KSG_Tablet_Registration_Guide 20261117.docx` (repo root).
Written 2026-11-17. Read this before updating the guide.

## Japanese admin / leader edition (2026-11-19)

`build_ja.js` → `KSG_タブレット登録ガイド_管理者・リーダー向け 20261119.docx` (repo root). Japanese, admin/office/leader only:
chapters 1–5 + troubleshooting (renumbered 6) + checklist; drops Pi setup (ch. 6), internals (ch. 8), Pi checklist and dev notes.
Engineering issues are pointed at 技術担当. Diagrams are Japanese and simplified: `diagrams_ja.py` → `shots/fig_ja_*.png`.
Fonts: Arial + Yu Gothic (eastAsia). Rebuild with `npm run diagrams:ja && npm run build:ja`, then the same Word TOC step
(change DEST). If you change a fact in build.js, change it in build_ja.js too.

## Files

| File | What it is |
|---|---|
| `build.js` | All the text of the guide (chapters 1–8 + appendices) and the docx assembly. Edit content here. |
| `lib.js` | Helpers over docx-js: `H1/H2/P`, `bullets`, `steps` (each call restarts numbering), `table(headers, rows, relativeWidths)`, `callout(note\|warn\|tip, title, lines)`, `code(lines)`, `figure(file, caption, widthPx)`. Inline markup in any text: `**bold**`, `` `code` ``. |
| `diagrams.py` | Draws `shots/fig_architecture.png`, `fig_order.png`, `fig_modes.png` with Pillow + Hiragino font (macOS). |
| `shots/NN_*.jpg` | Raw screenshots (1512×790) from the live admin/tablet pages. |
| `shots/c_NN_*.jpg` | Cropped versions actually used in the doc (crop boxes listed below). |

## Rebuild

```bash
cd docs/tablet-guide
npm install            # docx-js 9
npm run diagrams       # only if diagrams.py changed
npm run build          # writes the docx to the repo root
```

Then open it in Word once to fill the table of contents (docx-js writes an empty TOC field).
Scripted, without the "update fields?" prompt:

```bash
DEST="/Users/karlsome/Documents/GitHub/KSG/KSG_Tablet_Registration_Guide 20261117.docx"
osascript <<EOF
with timeout of 240 seconds
tell application "Microsoft Word"
  activate
  delay 6
  open POSIX file "$DEST"
  delay 6
  set d to document 1
  update (table of contents 1 of d)
  save d
  save as d file name "Macintosh HD:Users:karlsome:Documents:GitHub:KSG:_preview.pdf" file format format PDF
  close d saving no
end tell
end timeout
EOF
```

Check the PDF (`pdftoppm -png -r 40 _preview.pdf pg`, make a contact sheet), then delete `_preview.pdf`.
LibreOffice and pandoc are not installed on this Mac — Word is the renderer.

## Gotchas learned

- Do **not** set `features: { updateFields: true }` in the Document: Word then shows a modal on open and AppleScript times out (error -1712). If that happens: `osascript -e 'tell application "Microsoft Word" to quit saving no'`.
- Word (sandboxed) cannot "save as" into `/private/tmp`; use an HFS path under the home folder.
- Page = A4, 1" margins, content width 9026 DXA. Tables use DXA widths only.
- Images: `figure()` keeps image + caption together (`keepNext`); callouts are one non-splitting table cell.

## How the screenshots were taken (repeat for a new edition)

1. Claude in Chrome, new tab, admin URL with `?token=…#master-db` (user supplies a fresh token).
2. **Stub dialogs first** on every page you click Register/Save on — native `alert()` freezes the extension:
   `window.alert=m=>{};window.confirm=()=>true;` (on the tablet page use `confirm=()=>false`).
3. Use the computer tool with `save_to_disk: true`; copy files from the printed temp path into `shots/` with descriptive names.
4. Test data used and **deleted afterwards**: equipment `TEST-GUIDE` (本社工場, kanbanVariable `kenyokiRHKanban`) and `TEST-GUIDE-MANUAL` (no kanban var); tablets `TEST-GUIDE-KANBAN` / `TEST-GUIDE-MANUAL`; temporarily added both equipments to user `karl`, then removed.
5. Tablet login: Claude must not type passwords on the production host — the user logs in themselves.
6. Cleanup order matters:
   - Clear each test tablet's dashboard session **from that tablet's own token** before deleting it:
     stop timers first (`clearInterval(tabletSessionHeartbeatInterval); clearTimeout(tabletSessionSyncTimeout); workStartTime=null`), then `POST /api/tablet/session {clear:true}`, then block `fetch`, remove `tabletAuth`, close tab. Otherwise the 15 s heartbeat re-creates the session.
   - Verify with `GET /api/admin/dashboard-machine-status` (headers `X-Session-User`, `X-Session-DB-Name: KSG`, Bearer token) → no TEST rows.
   - Restore the user (User Management › Edit › set `selectedUserEquipment` › Save).
   - Delete via page fetch: `POST /deleteTablet {tabletId, dbName:'KSG', username}` and `POST /deleteEquipment {equipmentId, dbName:'KSG'}`; confirm counts are back (22 tablets / 22 equipment on 2026-11-17).
7. Browser localStorage is shared across tablet names: leftover unsent work in the user's Chrome shows up on any test tablet (and on the dashboard). Use an incognito/separate profile for the tablet tab next time.

## Crop boxes (x0, y0, x1, y1 on 1512×790 shots)

Modals ≈ (440,110,1060,695); list pages ≈ (50,140,1512,390–420); tablet page ≈ (270,8,1245,690–790);
login card (560,150,952,640); product picker (480,100,1032,690). Exact values were in a one-off PIL script — re-derive from the screenshot.

## Content sources (verify against code before editing facts)

- Admin forms: `public/js/masterDB.js` (`/createTablet`, quick-create modal ~line 3180), `public/js/userManagement.js`.
- Tablet behaviour: `public/js/tablet.js` on **main** (feature branches may differ — e.g. `feature/submit-confirm-modal`).
- Server: `ksgServer.js` — `userHasTabletAccess`, `/tabletLogin`, `/api/tablet/*`, `/api/opcua/*`.
- Pi: `raspberry_pi/opcua_client.py`, `opcua-client.service`, `requirements.txt`.
- Style reference: SCNA_Integration_Guide (shared drive, 製造技術G/NCカッター-レーザーカッター/SCNA NCCUTTER).
