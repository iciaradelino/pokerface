# Definition of Done

An item is Done when it meets the applicable checks below. Unfinished work stays in the backlog and is reported as incomplete at the Sprint Review.

## An item is Done when

1. **Accepted.** It meets the acceptance criteria written on its GitHub Project card, and the Product Owner of the sprint accepts it.
2. **Tested.** New or changed logic has automated tests, and all tests pass locally and in CI. Database tests run against SQL Server in a container, never against Azure SQL.
3. **CI green.** CI passes on the pull request: lint, format check, tests with coverage (at least 70% on the core logic of each service), image build and `npm audit`.
4. **Reviewed and merged.** The change reaches `main` through a pull request approved by a team member who is not the author, with CI green. Nobody pushes directly to `main`.
5. **Deployed.** For application changes, the pipeline deploys the merged commit to Azure, and `/health` on both services returns 200 afterwards. The PR or issue links the deployment run.
6. **Safe with data and secrets.** Database changes are new numbered migrations, never edits to applied ones, and keep existing data. Each service touches only its own database. No secrets in Git, images or logs.
7. **Documented.** We update the docs the change affects (`README.md`, `docs/decisions.md`, `docs/data-model.md`, contracts in `plan.md`) and add a row to `AI_USAGE.md` for significant AI-assisted work. The PR shows the test results, or a screenshot or demo for UI changes.

## Before the pipeline exists

In Sprint 0 we had no CI or Azure deployment yet, so code merged then is not Done until CI passes on it and the pipeline deploys it in Sprint 1.

## Items that are not code

Backlog setup and GitHub or Azure configuration have nothing to deploy. They are Done when the result exists, the Product Owner accepts it and another member has checked it (for example, branch protection blocks a direct push to `main`). Changes to files in the repository, documents included, always go through a reviewed PR with CI green.

**Agreed:** 10 November 2026, at the Sprint 0 Review. **Team:** Ali, Olivia, Lara, Laura, Iciar, Matteo.
