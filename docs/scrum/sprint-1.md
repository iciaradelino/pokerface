# Sprint 1

**Dates:** 11–18 November 2026. **Status:** in progress.
**Product Owner:** Ali. **Scrum Master:** Laura. **Developers:** everyone (Ali, Olivia, Lara, Laura, Iciar, Matteo).

## Sprint goal

Deploy our skeleton to Azure with the pipeline in the first two days, then ship one feature end to end: create a profile and play a hand with buttons between two browsers, with the chip results saved to the players service.

## Planning

_To fill in at Planning: what we agreed, the order of the backlog and any change to the goal._

### Selected work

Proposed from the Sprint 1 list in [plan.md](../../plan.md). The Product Owner confirms or changes it at Planning.

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

_To fill in at the Review._

## Not done

_To fill in at the Review: each item, its status and the next step._

## Review

_To fill in at the Review on 18 November: what we demonstrated and what the Product Owner accepted._

## Retrospective

_To fill in with the whole team: what went well, what to improve and one agreement for Sprint 2._

**Agreement for Sprint 2:** _to be added._

## Next steps

_To fill in at the end of the sprint._
