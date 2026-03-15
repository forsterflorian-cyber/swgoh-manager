\# SWGOH Manager – AI Context



\## Purpose

Strategic planning tool for Star Wars: Galaxy of Heroes Territory Battles.

This is for guild officers preparing plans, not for live TB execution.



\## Stack

\- Next.js App Router

\- NextAuth.js

\- Neon Postgres

\- Vercel

\- Prisma partly used

\- Manual SQL migrations also exist



\## Core rules

\- Strategic Planner lives at `/planning/platoons`

\- Main views: overview, priorities, targets

\- Public board lives at `/public/guild/\[slug]/targets`

\- Demo fixture mode exists at `/planning/platoons?fixture=demo`

\- Demo fixture mode must stay read-only



\## Capacity model

\- Capacity is tracked by `planet\_category`

\- Categories include LS, DS, MIX, SPECIAL

\- Max 10 units per member per category

\- Penalty at 7–9

\- Block at >= 10



\## Important behavior

\- This app is for planning and assignment logic, not real-time battle operations

\- Matching/readiness logic must respect the category model correctly

\- Public board behavior must remain stable

\- Avoid broad refactors unless explicitly necessary



\## Current working style

\- First priority is bug fixing, stability, hardening

\- Only add new features when explicitly requested



\## Known current issue to investigate

\- There may be a bug around MIX category handling in the planner / dataset / matching flow

\- Suspected area: imported TB dataset or category mapping logic

