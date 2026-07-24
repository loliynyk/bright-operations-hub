# Bright OS Canonical Data Model

## Core Entities

- Branch
- Service
- Lead
- LeadAnswer
- Client
- Child
- Group
- Employee
- Contract
- ContractTemplate
- SubscriptionPlan
- PriceVersion
- Discount
- Charge
- Payment
- Expense
- Timeline
- User

## Root Principle

Everything belongs to a Branch.

Lead
→ Client
→ Contract
→ Charges
→ Payments
→ Dashboard

The database must never duplicate information that can be derived automatically.
