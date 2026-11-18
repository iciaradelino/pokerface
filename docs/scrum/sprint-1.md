# Sprint 1

**Dates:** 11–18 November 2026. **Status:** finished.
**Product Owner:** Ali. **Scrum Master:** Laura. **Developers:** everyone (Ali, Olivia, Lara, Laura, Iciar, Matteo).

## Sprint goal

Deploy our skeleton to Azure with the pipeline in the first two days, then ship one feature end to end: create a profile and play a hand with buttons between two browsers, with the chip results saved to the players service.

## Planning

The team selected the work below for the sprint, in this order, and kept the sprint goal as written. Ali, as Product Owner, owns the order of the backlog. Item 1, the pipeline, was due in the first two days, and nothing else was to be merged until it worked.

### Selected work

Taken from the Sprint 1 list in [plan.md](../../plan.md).

| Order | Story | Owner |
|---|---|---|
| 1 | [#2](https://github.com/iciaradelino/pokerface/issues/2) Deploy the skeleton to Azure through the pipeline. Nothing else is merged until this works. | Matteo |
| 2 | [#1](https://github.com/iciaradelino/pokerface/issues/1) Create a profile with a name, and [#3](https://github.com/iciaradelino/pokerface/issues/3) view, edit and delete it | Laura (service), Iciar (pages) |
| 3 | [#4](https://github.com/iciaradelino/pokerface/issues/4) Create a private table and [#5](https://github.com/iciaradelino/pokerface/issues/5) join it by code | Lara |
| 4 | [#7](https://github.com/iciaradelino/pokerface/issues/7) Play a hand with buttons | Olivia |
| 5 | [#10](https://github.com/iciaradelino/pokerface/issues/10) Save my chip results | Laura |
| 6 | [#11](https://github.com/iciaradelino/pokerface/issues/11) Clear message when part of the app is down | Lara, Iciar |

Left for Sprint 2: gestures ([#12](https://github.com/iciaradelino/pokerface/issues/12), [#13](https://github.com/iciaradelino/pokerface/issues/13)), leaderboard ([#15](https://github.com/iciaradelino/pokerface/issues/15)), webcams ([#17](https://github.com/iciaradelino/pokerface/issues/17)) and monitoring ([#16](https://github.com/iciaradelino/pokerface/issues/16)), as in the plan. Still to place: [#6](https://github.com/iciaradelino/pokerface/issues/6), [#8](https://github.com/iciaradelino/pokerface/issues/8), [#9](https://github.com/iciaradelino/pokerface/issues/9) and [#14](https://github.com/iciaradelino/pokerface/issues/14).

### Carried over from Sprint 0

- Azure credentials for `rg-sdd-3a-g5` and the GitHub secrets. They block the first item.
- CI with the 70% coverage gate. Until it runs, nothing counts as Done under our [Definition of Done](definition-of-done.md).
- The local environment, the UI shell and the Definition of Done document, which are Done once CI passes and the pipeline deploys them.
- Work that members started early in Sprint 0 and merged on 10 November: players CRUD, hand results and leaderboard ([#21](https://github.com/iciaradelino/pokerface/pull/21), [#22](https://github.com/iciaradelino/pokerface/pull/22), [#23](https://github.com/iciaradelino/pokerface/pull/23)). It is Done once the pipeline deploys it.

## Done

| Item | Result |
|---|---|
| CI ([#49](https://github.com/iciaradelino/pokerface/pull/49)) | On every PR and push: lint, format check, tests with the 70% coverage gate per service, production dependency audit and image builds. A Compose job starts the full stack with SQL Server and checks both services and the UI. Merged and green; CI has nothing to deploy, so the Product Owner accepted it as Done. |

## Not done

Everything below works locally and is tested in CI, but under our [Definition of Done](definition-of-done.md) an application change is only Done once the pipeline deploys it to Azure.

| Item | Status | Next step |
|---|---|---|
| [#2](https://github.com/iciaradelino/pokerface/issues/2) Deploy to Azure through the pipeline | CI is merged and green. We can access `rg-sdd-3a-g5`, but it has no resources yet, the `sdd-3a-g5-github` identity is not visible to us and no Actions secrets are configured. The professor said on Blackboard that we will get a message when the managed identity is ready; we have no date. The Bicep, deployment workflow and smoke check are written and validated locally in [#51](https://github.com/iciaradelino/pokerface/pull/51), not run on Azure. | Review and merge #51, then configure the identity and run the first deployment as soon as IE confirms it is ready. |
| [#1](https://github.com/iciaradelino/pokerface/issues/1) Create a profile with a name | Players CRUD ([#22](https://github.com/iciaradelino/pokerface/pull/22), [#33](https://github.com/iciaradelino/pokerface/pull/33)) and the create-player screen ([#31](https://github.com/iciaradelino/pokerface/pull/31)). Works locally. | Deploy. |
| [#3](https://github.com/iciaradelino/pokerface/issues/3) View, edit and delete my profile | The service endpoints and the UI API client exist and are tested. The UI has no page to edit or delete a profile yet. | Add the profile page, then deploy. |
| [#4](https://github.com/iciaradelino/pokerface/issues/4) Create a private table | Tables API and schema ([#25](https://github.com/iciaradelino/pokerface/pull/25), [#28](https://github.com/iciaradelino/pokerface/pull/28)), lobby screen ([#32](https://github.com/iciaradelino/pokerface/pull/32)). Works locally. | Deploy. |
| [#5](https://github.com/iciaradelino/pokerface/issues/5) Join a table by code | Join endpoint with the players check and timeout ([#28](https://github.com/iciaradelino/pokerface/pull/28)), waiting room ([#34](https://github.com/iciaradelino/pokerface/pull/34)). Works locally. | Deploy. |
| [#7](https://github.com/iciaradelino/pokerface/issues/7) Play a hand with buttons | Poker engine and adapter ([#29](https://github.com/iciaradelino/pokerface/pull/29), [#30](https://github.com/iciaradelino/pokerface/pull/30)), live tables, actions, turn timer and WebSocket ([#37](https://github.com/iciaradelino/pokerface/pull/37), [#42](https://github.com/iciaradelino/pokerface/pull/42), [#43](https://github.com/iciaradelino/pokerface/pull/43)), table screen and Start game ([#36](https://github.com/iciaradelino/pokerface/pull/36), [#46](https://github.com/iciaradelino/pokerface/pull/46)). A full hand plays between two browsers locally. | Deploy. |
| [#10](https://github.com/iciaradelino/pokerface/issues/10) Save my chip results | Results endpoint ([#23](https://github.com/iciaradelino/pokerface/pull/23)) and results sent from `game` with retries ([#44](https://github.com/iciaradelino/pokerface/pull/44)). Works locally. | Deploy. |
| [#11](https://github.com/iciaradelino/pokerface/issues/11) Clear message when part of the app is down | Calls from `game` to `players` have timeouts ([#28](https://github.com/iciaradelino/pokerface/pull/28)). The UI shows "Player service unavailable" and "Tables unavailable" on the create-player, lobby, waiting room and table screens. Works locally. | Test both failure directions on Azure, then deploy. |

### Started early

Sprint 2 stories that members started once their Sprint 1 work was merged. They are not Done until the pipeline deploys them.

- Gesture recognition module ([#48](https://github.com/iciaradelino/pokerface/pull/48), part of [#12](https://github.com/iciaradelino/pokerface/issues/12)). Ali.
- WebRTC video and audio module ([#41](https://github.com/iciaradelino/pokerface/pull/41), part of [#17](https://github.com/iciaradelino/pokerface/issues/17)), not wired into the table yet. Laura.
- Decision records for storage, the poker engine and the game service ([#27](https://github.com/iciaradelino/pokerface/pull/27), [#45](https://github.com/iciaradelino/pokerface/pull/45), [#50](https://github.com/iciaradelino/pokerface/pull/50)).

## Review

We held the Review on 18 November in the team chat. We showed that a player can create a profile, create a table, join it by code from a second browser and play a full hand with buttons, with the chip results saved to the players service, all running locally with Compose. We also showed CI running on every PR. The Product Owner accepted CI as Done. The Product Owner accepted the other stories as working locally, but they are not Done because nothing is deployed to Azure yet. We met the feature part of the sprint goal locally, but not the deployment part. All Not done stories move to Sprint 2, with the Azure deployment first.

## Retrospective

**Went well**

- A full hand works end to end locally: profile, table, a hand with buttons and saved results.
- CI now builds and starts the full stack with SQL Server and checks both services and the UI.
- Every change reached `main` through a reviewed pull request.

**To improve**

- We missed our Sprint 0 agreement to deploy Hello World to Azure by 12 November. CI was not ready by then, and GitHub's Azure login is still not confirmed because the managed identity has not been provided yet.
- We agreed that nothing else would be merged until the pipeline worked, but we kept merging features, so none of them could be deployed and counted as Done.
- Most PRs were merged in the last two days of the sprint, which left little time for review.

**Agreement for Sprint 2:** review the deployment code while we wait for IE, then make the first successful pipeline deployment our first priority as soon as the identity is ready.

## Next steps

- Sprint 2 roles: Lara is Product Owner and Olivia is Scrum Master.
- Review and merge the deployment PR ([#51](https://github.com/iciaradelino/pokerface/pull/51)), and deploy as soon as IE confirms the managed identity.
- Move the Not done stories to Sprint 2 in the GitHub Project, with #2 first.
- Lara brings the Sprint 2 goal and backlog to Planning.
