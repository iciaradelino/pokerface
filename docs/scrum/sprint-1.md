# Sprint 1

**Dates:** 11–18 November 2026. **Status:** the sprint has ended. The Review and the Retrospective are in class (S30).
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

Nothing is Done yet under our [Definition of Done](definition-of-done.md). Every story below is merged into `main` with tests, but none is deployed, because we could not deploy to Azure. The teacher gave us access to Azure through an invitation to the university's Azure directory (sent by Microsoft on behalf of IE), but we have not received it. Without accepting it we cannot see our resource group `rg-sdd-3a-g5`, so we cannot test the deployment workflow and the Bicep files or run the `/health` check after a merge. The pipeline will sign in as the managed identity `sdd-3a-g5-github`, which the teacher is creating for us. The Product Owner has accepted them, so deployment is the only thing missing. The status at the end of the sprint:

| Story | In `main` | Still missing for Done |
|---|---|---|
| [#1](https://github.com/iciaradelino/pokerface/issues/1) Create a profile | Players service ([#22](https://github.com/iciaradelino/pokerface/pull/22)) and the create-profile page | Deployment |
| [#4](https://github.com/iciaradelino/pokerface/issues/4), [#5](https://github.com/iciaradelino/pokerface/issues/5) Create a table and join by code | Tables API, lobby and waiting room | Deployment |
| [#6](https://github.com/iciaradelino/pokerface/issues/6) See the table | Table screen | Deployment |
| [#7](https://github.com/iciaradelino/pokerface/issues/7) Play a hand with buttons | Engine, actions endpoint, WebSocket updates and action bar. Lara played a hand between two browsers locally | Deployment |
| [#10](https://github.com/iciaradelino/pokerface/issues/10) Save my chip results | Results endpoint ([#23](https://github.com/iciaradelino/pokerface/pull/23)) and the game service sending them with retries ([#44](https://github.com/iciaradelino/pokerface/pull/44)) | Deployment |

CI now runs on pull requests (`.github/workflows/ci.yml`), so the test, coverage and build checks of the Definition of Done can pass.

## Not done

| Item | Status | Next step |
|---|---|---|
| [#2](https://github.com/iciaradelino/pokerface/issues/2) Deploy the skeleton to Azure through the pipeline | CI is in `main`. There is no deployment, no Bicep and no `/health` check after a merge. We could not deploy because we have not received the invitation to the Azure directory that gives access to `rg-sdd-3a-g5` | We tell the teacher our group number (5) so they resend it. Then Matteo adds the deployment workflow, the Bicep files and the `/health` check, then every story above can be Done. It was the first item and the goal of the sprint |
| [#3](https://github.com/iciaradelino/pokerface/issues/3) View, edit and delete my profile | The service has it. There is no page for it in the UI | A profile page in Sprint 2, with Iciar |
| [#8](https://github.com/iciaradelino/pokerface/issues/8), [#9](https://github.com/iciaradelino/pokerface/issues/9) Showdown and payout, hidden hole cards | The engine and the private messages implement them. Not checked against their acceptance criteria | Check them at the Review |
| [#11](https://github.com/iciaradelino/pokerface/issues/11) Clear message when part of the app is down | The waiting room shows one. Not checked on the table screen | Check it at the Review |

Left for Sprint 2 as planned: gestures, the leaderboard, webcams and monitoring. The turn timer ([#14](https://github.com/iciaradelino/pokerface/issues/14)) is already in the game service ([#38](https://github.com/iciaradelino/pokerface/pull/38)) but was not placed in a sprint. The video module is already in `main` ([#41](https://github.com/iciaradelino/pokerface/pull/41)), but it is not connected to the table yet.

## Review

_To fill in after the Sprint 1 Review in class (session S30): what we demonstrated and what the Product Owner accepted._

## Retrospective

_To fill in after the Retrospective in class (session S30), with the whole team: what went well, what to improve and one agreement for Sprint 2._

**Agreement for Sprint 2:** _to be added._

## Next steps

_To fill in after S30, together with the Sprint 2 Planning._
