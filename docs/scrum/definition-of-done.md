# Definition of Done

Draft for our Sprint 0 review.

We consider an item Done when:

1. We have met its acceptance criteria and the Product Owner accepts it.
2. Our tests pass. CI checks lint, formatting, tests, at least 70% core-logic coverage per service, and image builds. We use local SQL Server for database tests, never Azure SQL.
3. Another team member approves the PR, CI is green, and we merge the change into `main`.
4. The pipeline deploys the change to Azure and both `/health` endpoints pass. We link the deployment run and commit in the PR.
5. We use versioned migrations for database changes and keep existing data. We do not edit applied migrations. Each service accesses only its own database, and we keep secrets out of Git, images and logs.
6. We update the relevant docs and `AI_USAGE.md`, and include the test results or demo in the issue or PR.

Agreement date: to be added after our review.
