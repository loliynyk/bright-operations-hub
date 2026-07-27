# 005 — Finance Core Hardening

Status: Approved
Owner: Bright OS
Date: 2026-07-27

---

# IMPORTANT

Do not redesign, rename, remove, or broadly refactor anything that is already built.

The following are considered stable and must remain visually and structurally intact:

- Ukrainian UI
- Navigation
- Design System
- Client pages
- Finance tab
- Children page
- Charges
- Payments
- Receivables
- Expenses
- Cash Flow
- P&L
- Existing migrations

Only additive improvements and backend hardening are allowed.

Always create NEW migrations.

---

# Goal

Turn the existing Finance prototype into a production-grade operational finance engine while preserving the current UI.

---

# Scope

## 1. Transactional Payment Reallocation

Move manual payment reallocation into a PostgreSQL RPC.

Requirements:

- lock Payment row
- require status = posted
- validate all Charges belong to same Client
- allocation sum <= payment amount
- prevent Charge over-allocation
- replace allocations atomically
- update Client Credit atomically
- update Charge statuses
- Timeline events
- rollback on failure
- concurrency safe

Current UI must remain unchanged.

---

## 2. Transactional Payment Posting

Move payment creation into PostgreSQL RPC.

Must:

- create Payment
- FIFO allocate to oldest Charges
- support partial payments
- support one payment covering multiple Charges
- create/update Client Credit
- Timeline events
- optional idempotency key

---

## 3. Transactional Payment Void

Voiding must:

- lock Payment
- reverse allocations
- reverse Client Credit
- recalculate Charge balances
- mark Payment void
- Timeline event
- rollback on failure

---

## 4. Automatic Client Credit

Whenever new Charges are generated:

Automatically consume existing Client Credit.

Rules:

- oldest credit first
- partial application supported
- update remaining credit
- update Charge status
- Timeline event

Never create fake Payments.

---

## 5. Contract → Charge Lifecycle

Replace current first-three-month logic.

Initial generation:

Generate Charges

Contract Start

↓

Current Quarter End

↓

Next Quarter End

or Contract End Date if sooner.

Requirements:

- preserve first month proration
- unique(contract_id, period_month)
- idempotent

---

## 6. Quarterly Extension

Add callable server action/RPC:

extend_contract_charges()

Requirements:

- extend active Contracts
- safe to run repeatedly
- no duplicate Charges
- no scheduler yet

---

## 7. Safe Charge Recalculation

Commercial edits after confirmation:

Editable:

- Monthly Price
- Discount
- Manual Discount
- Plan
- Price Version
- Start Date
- End Date

Rules:

Paid Charges
→ NEVER changed

Partial Charges
→ NEVER changed

Past unpaid Charges
→ NEVER changed automatically

Future unpaid Charges
→ recalculated

Historical corrections
→ Adjustment Charges

Cancelled periods
→ cancel future Charges only

Timeline records every change.

---

## 8. Deterministic Financial State

Audit financial calculations.

Single source of truth:

Charge Balance

=

Charge Amount

-

Allocations

-

Applied Credit

Statuses:

- pending
- partial
- paid
- overdue
- cancelled

Client Debt:

Σ Charges

-

Σ Allocations

-

Applied Credit

Client Credit:

Remaining unapplied credit only.

---

## 9. Workflow Fix

Current workflow incorrectly marks

"Нарахування створені"

after Contract confirmation.

Instead:

Status should become complete ONLY if Charge records exist.

---

## 10. Timeline

Every financial mutation must produce Timeline entries.

Events:

- payment posted
- payment allocated
- payment reallocated
- payment voided
- credit created
- credit applied
- Charges generated
- Charges extended
- Charges recalculated
- Charge adjusted
- Charge cancelled

Metadata:

- actor
- IDs
- amount
- periods
- timestamp

---

# Verification

Verify all scenarios:

✓ 15,500 Charge

10,000 Payment

↓

Partial

5,500 Debt

---

✓ 31,000 Payment

↓

covers two Charges

---

✓ Overpayment

↓

Client Credit

---

✓ New Charge

↓

Consumes Credit

---

✓ Reallocation

↓

Atomic

---

✓ Void

↓

Fully reversed

---

✓ Duplicate Charge Generation

↓

No duplicates

---

✓ Future Price Change

↓

Future unpaid Charges updated

---

✓ Paid historical Charges unchanged

---

✓ Earlier Contract End

↓

Future unpaid Charges cancelled only

---

✓ Workflow status reflects actual Charge existence

---

# Deliverables

- new migrations
- PostgreSQL RPCs
- server functions
- updated Finance backend
- Timeline events
- tests
- successful build
- concise implementation summary

---

End.
