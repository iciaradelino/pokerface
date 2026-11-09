# Sprint 0

**Dates:** 4–10 November 2026. **Status:** in progress.
**Product Owner:** Iciar. **Scrum Master:** Matteo.

## Sprint goal

Set up our repository, backlog and local environment so we can start deploying the app in Sprint 1.

## Selected work

- Set up the GitHub Project and initial user stories.
- Protect `main` and give the professor access to the repository.
- Run both services, their databases and the UI with Docker Compose.
- Write our Definition of Done.
- Get the group's Azure credentials and add them to GitHub secrets.

The local setup is part of [#2](https://github.com/iciaradelino/pokerface/issues/2). The rest of that issue is the Azure pipeline deployment in Sprint 1. Monitoring (#16) comes later.

## Progress

| Item | Status |
|---|---|
| Backlog | We set up the GitHub Project with 17 user stories. |
| Branch protection | We created the `protect-main` ruleset, but it still needs activating. Iciar needs to do this because Matteo does not have admin access. |
| Local environment | Both services and the UI run with Compose. Both `/health` endpoints return 200. Ready for PR review. |
| Definition of Done | We have a [draft](definition-of-done.md) to review together. |
| Service contracts | Our proposed formats are in `plan.md`. Lara is leading the contracts discussion. |
| Professor access | We still need to confirm that the professor has repository access. |
| Azure credentials | We are class 3A, group 5. We need the professor's group credentials and access to `rg-sdd-3a-g5`, then we can configure GitHub secrets. |

We ran four endpoint tests per service and checked database isolation, migration tracking and cleanup of health-check rows. With SQL Server stopped, both services return 503; after restarting it, they recover to 200. CI, the 70% coverage gate and Azure deployment are still to do.

## Planning decisions

We agreed to use Node.js + Express for the backends and React + Vite for the UI. We divided the work into gestures, the poker engine, the game service, players and video, the UI, and DevOps and monitoring. The owners are listed in `plan.md`.

Matteo is handling Compose and the Sprint 0 setup.

## Review

To fill in at the end of the sprint: what we demonstrated, what the Product Owner accepted and what we need to carry into Sprint 1.

## Retrospective

To fill in together: what went well, what we should improve and one action for the next sprint.

## Next steps

- Open and review the local setup PR.
- Agree on the Definition of Done and complete the Review and Retrospective notes.
- Activate branch protection and confirm professor access.
- Add the group Azure credentials to GitHub secrets.
- Deploy Hello World through the pipeline in the first two days of Sprint 1, starting 11 November.
