# Sprint 2

**Dates:** 19–24 November 2026. **Status:** in progress. The deadline is 24 November at 23:59; the Sprint Reviews are in class on 25 and 26 November.
**Product Owner:** Lara. **Scrum Master:** Olivia. **Developers:** everyone (Ali, Olivia, Lara, Laura, Iciar, Matteo).

## Sprint goal

Deploy Pokerface to Azure through the pipeline, then complete the MVP: a full game playable with buttons and gestures, webcams at the table, the leaderboard, monitoring with an SLO, and all the documentation.

## Planning

We held Planning on friday 20th November. Lara, as Product Owner, set the order below. We kept the agreement from the Sprint 1 Retrospective: the first successful pipeline deployment comes first, as soon as IE provides the managed identity, and we review the deployment code while we wait. Because the sprint ends on the submission deadline, we also agreed to merge small pull requests every day and to have everything merged by 23 November, so that the last day is for deployment, checks and documentation.

### Selected work

| Order | Story | Owner |
|---|---|---|
| 1 | [#2](https://github.com/iciaradelino/pokerface/issues/2) Deploy to Azure through the pipeline (carried over). The workflow and Bicep files are in `main` ([#51](https://github.com/iciaradelino/pokerface/pull/51)) | Matteo |
| 2 | [#12](https://github.com/iciaradelino/pokerface/issues/12) Act with hand gestures and [#13](https://github.com/iciaradelino/pokerface/issues/13) the gesture tutorial | Ali |
| 3 | [#17](https://github.com/iciaradelino/pokerface/issues/17) See and hear the other players at the table | Laura |
| 4 | [#15](https://github.com/iciaradelino/pokerface/issues/15) Leaderboard | Laura (service), Iciar (page) |
| 5 | [#3](https://github.com/iciaradelino/pokerface/issues/3) View, edit and delete my profile (carried over) | Iciar |
| 6 | [#16](https://github.com/iciaradelino/pokerface/issues/16) Monitoring dashboard and SLO | Matteo |
| 7 | [#11](https://github.com/iciaradelino/pokerface/issues/11) Clear message when part of the app is down (carried over), and partial failure checked both ways | Lara, Olivia |
| 8 | [#8](https://github.com/iciaradelino/pokerface/issues/8), [#9](https://github.com/iciaradelino/pokerface/issues/9) Check showdown and payout, and hidden hole cards, against their acceptance criteria (carried over) | Olivia |

Documentation for the submission: `README.md` with the live URL and the team, `docs/data-model.md` matching the migrations, this file, and the decision records (five so far: storage, poker engine, game service architecture, Azure deployment and pipeline, partial failure).

### Carried over from Sprint 1

Merged and accepted by the Sprint 1 Product Owner, but not Done until the pipeline deploys them: [#1](https://github.com/iciaradelino/pokerface/issues/1) create a profile, [#4](https://github.com/iciaradelino/pokerface/issues/4) and [#5](https://github.com/iciaradelino/pokerface/issues/5) create and join a table, [#6](https://github.com/iciaradelino/pokerface/issues/6) see the table, [#7](https://github.com/iciaradelino/pokerface/issues/7) play a hand with buttons, [#10](https://github.com/iciaradelino/pokerface/issues/10) save my chip results, and the turn timer [#14](https://github.com/iciaradelino/pokerface/issues/14) ([#38](https://github.com/iciaradelino/pokerface/pull/38)).

## Progress during the sprint

- **20 November:** IE announced how to access the group subscription. Members accept the invitation to IE's Azure directory and check `rg-sdd-3a-g5`. The pipeline's managed identity `sdd-3a-g5-github` is still being created by IE, so [#2](https://github.com/iciaradelino/pokerface/issues/2) cannot run yet.
- **22 November:** merged the partial failure decision record ([#55](https://github.com/iciaradelino/pokerface/pull/55)), the webcams at the table ([#61](https://github.com/iciaradelino/pokerface/pull/61)), and the shared camera and gesture tutorial ([#62](https://github.com/iciaradelino/pokerface/pull/62), closes [#13](https://github.com/iciaradelino/pokerface/issues/13)). Reviewing #62 found two ways the tutorial's Skip link could send players to another site; both were fixed before merging.
## Done

_To fill in at the end of the sprint: each story that meets the [Definition of Done](definition-of-done.md), with its deployment run._

## Not done

_To fill in at the end of the sprint: each story that is not Done, its status and the next step._

## Review

_To fill in after the Sprint Review in class (25–26 November): what we demonstrated and what the Product Owner accepted._

## Retrospective

_To fill in after the final Retrospective: what went well, what to improve and the main agreement for a next sprint._