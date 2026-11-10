# Sprint 0

**Dates:** 4–10 November 2026. **Status:** finished.
**Product Owner:** Iciar. **Scrum Master:** Matteo. **Developers:** everyone (Ali, Olivia, Lara, Laura, Iciar, Matteo).

## Sprint goal

Set up our repository, backlog and local environment so we can start deploying the app in Sprint 1.

## Planning

We agreed on the product (Texas Hold'em played over webcams with hand gestures), the MVP scope and the two services, `players` and `game`. We chose Node.js 22 + Express for the backends and React + Vite for the UI, so the whole team works in one language. We divided the work into gestures, the poker engine, the game service, players and video, the UI, and DevOps and monitoring. The owners and shared contracts are in [plan.md](../../plan.md).

### Selected work

- Set up the GitHub Project and initial user stories.
- Protect `main` and give the professor access to the repository.
- Run both services, their databases and the UI with Docker Compose.
- Write our Definition of Done.
- Get the group's Azure credentials and add them to GitHub secrets.

The local setup is part of [#2](https://github.com/iciaradelino/pokerface/issues/2). The rest of that issue is the Azure pipeline deployment in Sprint 1. Monitoring (#16) comes later.

## Done

| Item | Result |
|---|---|
| Backlog | GitHub Project with 17 user stories, each with acceptance criteria. |
| Branch protection | The `protect-main` ruleset is active: changes reach `main` only through a pull request approved by another member. |
| Professor access | The professor accepted the invitation to the repository. |

## Not done

| Item | Status | Next step |
|---|---|---|
| Definition of Done file | We [agreed on the checklist](definition-of-done.md) on 10 November. Delivery of the repository document still needs CI green, as required by the checklist. | Review and merge the updated document through a PR with CI green. |
| Local environment | Merged in [#18](https://github.com/iciaradelino/pokerface/pull/18) and working: SQL Server with one database and login per service, numbered migrations tracked in `schema_migrations`, `/health` on both services, one log line per request. `docker compose up` brings everything up and both `/health` endpoints return 200. Not Done because there is no CI or deployment yet. | Done once CI passes on it and the pipeline deploys it as our Hello World. |
| UI in Compose | Merged in [#19](https://github.com/iciaradelino/pokerface/pull/19) and [#20](https://github.com/iciaradelino/pokerface/pull/20): React + Vite tooling, design tokens, shared components, theme switching, API helpers and app shell. Compose builds and serves the UI on port 5173. Not deployed yet. | Done once CI passes and the pipeline deploys it to the Static Web App. |
| Azure credentials | We are class 3A, group 5. We have not received the group service-principal credentials, and access to `rg-sdd-3a-g5` still needs verification. | Matteo asks the professor, verifies access and adds the GitHub secrets. Blocks the Hello World deployment. |

We ran four endpoint tests per service and checked database isolation, migration tracking and cleanup of health-check rows. With SQL Server stopped, both services return 503; after restarting it, they recover to 200.

## Started early

These are Sprint 1 stories that members started once their part of the setup was ready. They are not Done until CI passes and the pipeline deploys them.

- Players CRUD, hand results and leaderboard, with the data model and API contract ([#21](https://github.com/iciaradelino/pokerface/pull/21), [#22](https://github.com/iciaradelino/pokerface/pull/22), [#23](https://github.com/iciaradelino/pokerface/pull/23)). Laura.
- First version of the poker engine and the repository layout. Olivia.
- Create-player and lobby pages in the UI. Iciar, in progress.

## Review

We demonstrated `docker compose up` from a clean clone, both `/health` endpoints returning 200, the 503 and recovery when SQL Server stops, and the UI served by Compose. The Product Owner accepted the backlog, branch protection and professor access as Done. We agreed on the Definition of Done on 10 November, but its repository document still needs CI green. The Product Owner also accepted the local environment and the UI shell as working, but they are not Done until CI passes and the pipeline deploys them. We met the local setup goal, but Azure deployment is blocked by the missing credentials. We carry the documentation awaiting CI, the local environment, the UI shell and the Azure credentials into Sprint 1.

## Retrospective

**Went well**

- The local skeleton was merged a day before the end of the sprint, so everyone could build on it.
- Every change since the skeleton reached `main` through a pull request.
- Owners for each area were clear from the start, so the UI, players and engine work could run in parallel.

**To improve**

- We still do not have the Azure credentials, and they block the most important milestone of Sprint 1. We should have asked the professor for them earlier in the sprint.
- Most PRs were opened and merged on the last day of the sprint, which left little time for review.
- We have no CI yet, so nothing checks lint, tests or coverage automatically.

**Agreement for Sprint 1:** prioritize the pipeline so Hello World is deployed to Azure by 12 November.

## Next steps

- Sprint 1 roles: Ali is Product Owner and Laura is Scrum Master.
- Add the group Azure credentials to GitHub secrets.
- Add CI with the 70% coverage gate, then deploy Hello World through the pipeline in the first two days of Sprint 1.
