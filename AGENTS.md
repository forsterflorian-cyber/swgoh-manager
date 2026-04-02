\# AGENTS.md - SWGOH Manager



\## Project context



This is a strategic planning app for Star Wars: Galaxy of Heroes Territory Battles. It is built with Next.js App Router, NextAuth.js, Neon Postgres, Vercel, and partly Prisma plus manual SQL migrations.



The product is for strategic preparation by guild officers, not live TB execution. Core areas include planning, targets, assignments, public target board, fixture/demo mode, and matching/simulation logic.



Current priority is correctness, stability, strategic model integrity, and UX clarity. Do not add new features unless explicitly requested.



\## Core rules



\- Preserve the planning model and assignment integrity.

\- Do not introduce gameplay assumptions that are not already present in the data model or documented logic.

\- Favor correctness and explainability over cleverness.

\- Keep changes minimal and testable.



\## Domain rules



\- Treat matching, assignment, capacity handling, and public board output as critical logic.

\- Respect planet\_category and category capacity logic.

\- Preserve penalties and blocking logic around member capacity limits.

\- Demo / fixture mode must remain safe and non-destructive.

\- Public routes must not accidentally gain write capability or leak private data.



\## Data and migration rules



\- Be conservative with schema changes.

\- When touching DB logic, explicitly consider:

&#x20; - guild isolation

&#x20; - assignment consistency

&#x20; - fixture/demo behavior

&#x20; - public vs authenticated route boundaries

\- Manual SQL migrations must be reviewed for correctness and rollback impact.

\- Do not silently reshape important planner semantics in SQL or server logic.



\## Algorithm and simulator rules



\- Matching and simulator logic must be explainable step by step.

\- Avoid hidden heuristics unless explicitly requested.

\- Preserve deterministic behavior where possible.

\- When changing algorithm behavior, state exactly:

&#x20; - what changed

&#x20; - why it changed

&#x20; - which outputs are expected to differ

\- Distinguish clearly between:

&#x20; - actual data

&#x20; - hypothetical upgrades

&#x20; - hypothetical acquisitions

&#x20; - simulated actions



\## UX rules



\- Keep officer-facing views operational and interpretable.

\- Avoid UI language that overpromises certainty if the model is heuristic.

\- Public board output should remain readable, copyable, and stable.

\- Do not add decorative complexity at the cost of clarity.



\## Review focus



When reviewing code, prioritize:

1\. simulation correctness

2\. assignment consistency

3\. guild/public boundary safety

4\. migration risk

5\. explainability of planner output



\## Preferred response style



\- Be exact and technical.

\- Call out incorrect assumptions immediately.

\- Give file-level findings.

\- Separate:

&#x20; - model issue

&#x20; - implementation issue

&#x20; - UX consequence

&#x20; - residual uncertainty

