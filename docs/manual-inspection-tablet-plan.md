# 検査台タブレット (Type 3: manual, no OPC) + 工程別不良グループ — Plan

Status: **planning** (2026-11-17). Nothing below is built yet except the defect-group 複製 button.
Every rule here is a **current guess by the user** and is expected to change. Keep the logic in
the few places listed under "Change points" so a rule change is a small edit, not a rewrite.

Branches (KSG repo):
- `feature/submit-confirm-modal` — submit confirmation modal + manual 作業数 edit (pushed)
- `feature/ng-group-duplicate` — 複製 button on 不良グループ tab (local)
- `feature/manual-inspection-tablet` — this plan; stacked on `feature/ng-group-duplicate`

---

## 1. Tablet types

| Type | Equipment config | Product source | 作業数 source |
|---|---|---|---|
| 1. OPC + kanban | `opcVariables.kanbanVariable` set | OPC kanban → masterDB | OPC production counter |
| 2. OPC, no kanban | `kanbanVariable` empty | 製品選択 modal (products where `設備` = equipment) | OPC production counter |
| 3. **Manual / 検査台** (new) | equipment marked manual (no OPC) | **all products** (search) + **品番 QR scan** | **収容数 per scan/button + manual extra** |

Tablet → equipment link is unchanged (`tabletDB.設備名` → `equipment.設備名`). The mode lives on the equipment.

## 2. Defect groups per process: DEFERRED (2026-11-17)

User decision: **skip per-process defect groups for now.** Type 3 tablets use the same defect group as
every other tablet: `product.ngGroupId` of the selected 品番. Keep the NG-group lookup in one place so the
per-process idea below can be added later.

Earlier idea (parked, may come back):
- 不良グループ tab gets sub-tabs per process (巻き込み工程 / 検査工程); each group belongs to one process
  (missing value = 巻き込み); one default group per process as fallback.
- Resolution: product's group for the process → process default → none, in one server helper.

## 3. Type 3 tablet flow

1. Login → choose 技能員 (same UI as now).
2. Select product: dropdown/search over all products, **or** scan a 品番 QR.
   - If several masterDB products share the scanned 品番, **the user picks which one** (picker modal).
   - **Once a product is locked it cannot be changed.** The user must submit or 全リセット first.
   - **Start time = pressing 作業開始** (same as the other types; corrected 2026-11-17).
3. Counting (作業数):
   - Each **subsequent scan of the same 品番 QR** adds 収容数 (e.g. +150).
   - A button adds 収容数 manually too.
   - **Manual extra**: user can add or **subtract** any amount (e.g. 150 + 5 = 155, or −5).
   - **Wrong 品番 QR** while a product is locked → error/warning "wrong kanban", nothing changes.
4. Defects: NG buttons from the resolved 検査工程 group (section 2).
5. Same UI as other types, **including 作業中断 and 機械トラブル**.
6. データ送信 → same confirmation modal (作業数 editable) → **end time = submit time**.
7. Submit or 全リセット clears the locked 品番, so a new 品番 can be scanned.

QR content = plain 品番 string (there are no kanban cards at tables).
Scanner = **USB barcode scanner acting as a keyboard**, sending Enter after each scan. The tablet listens for
fast keystrokes ending in Enter, globally (no input box needs focus).

OPC-only things disabled in this mode: socket variable subscriptions, OPC reset modal, kanban-conflict modal, OPC status dot.

Submitted record: same `submittedDB` shape plus a **`process` field** (user confirmed) to tell 検査 records from
巻き込み ones, and `input_mode: 'manual'`.
Do NOT set `work_count_manual` for every manual record. That flag means "OPC value was corrected" and drives the 手動 badge.
New keys must be added to every fixed-key list (ksgServer `KNOWN_KEYS`, `SUBMITTED_DB_FIXED_FIELDS`,
`SUBMITTED_DB_NON_EDITABLE_FIELDS`, submittedDB.js, analytics.js, index.html), or they show up as defect columns.

## 4. Out of scope for now
- Google Sheets for inspection records (user undecided). Note: Sheets targets are keyed by ngGroup,
  so inspection groups will not match any existing target until one is configured.

## 5. Change points (keep logic here)
- Server: one `resolveNgGroupForProcess(db, product, process)` helper used by every tablet product endpoint.
- Client tablet: one `getTabletInputMode()` / mode branch, not scattered `if (manual)` checks.
- Process list: one constant shared by the admin sub-tabs and the product modal.

Possible future changes the user flagged: defects per item (product) instead of per process, etc.

## 6. Answers so far (2026-11-17)
- Type 3 is always manual, always 検査, never mixed with 巻き込み (a different part of the factory).
- Product list: all products, searchable.
- Same UI including 作業中断 / 機械トラブル.
- Google Sheets: ignore for now.

## 7. Open questions
(see the conversation of 2026-11-17; record answers here)
