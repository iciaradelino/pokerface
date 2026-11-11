# AI usage

We each record our significant AI-assisted work here and review the explanation before submission.

| Date | Contributor | What I used AI for | How it works and checks |
|---|---|---|---|
| 2026-11-09 | Matteo (`Inventure72`) | Requesting an AI review of my implementation, tests and documentation | Completed the Docker Compose setup, SQL Server configuration, backend services, UI, endpoint tests, database checks and project documentation myself. Asked AI to review my work, check for potential issues and suggest improvements. Identified remaining tasks, including full test coverage, CI, and completing the Sprint Review and Retrospective. |

| 2026-11-11 | Lara (`liglesias1`) | Designing the game service migration (`002_tables.sql`) and review of the game section of `docs/data-model.md` | The AI drafted a first schema. I raised concerns about that draft after considering the options, we implemented the following improvements in the second commit: a binary-collation check on table codes, a `stack` column in `seats` so a restart does not reset chips, and a `hand_players` table so results are retried per player. I ran the migration locally from a clean database, checked `/health` and tested the constraints and the cascading delete with `sqlcmd`. |