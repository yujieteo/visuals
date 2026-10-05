---
title: Publish a static page
subtitle: Revision 2, 2 pause points, an example to adapt and review
voice: bf_emma
---

::: narration
This deck presents the checklist Publish a static page, revision 2, with 2 pause points. A checklist supplements a procedure; it does not replace it.
:::

# Set-up

::: narration
Part 1. Set-up.
:::

## The checklist and who uses it

- Example — adapt and review before use. It is not an approved procedure.
- Intended users: A person who publishes pages to a static website
- Equipment: The page files, a local preview and the publishing tool
- Applicability: Publishing one page to an existing static site
- Source references: Written for this page as an example. Adapt it to your own publishing procedure.
- Reviewer: Reviewer records are stale: none is for revision 2

::: narration
The checklist is Publish a static page. It is for A person who publishes pages to a static website. It is an example: adapt it and review it before use. Reviewer records are supplied by the user and are not verified.
:::

# Method

::: narration
Part 2. Method.
:::

## How each pause point is used

- Read–Do: read each item, do the action, then record its result.
- Do–Confirm: complete the work, then confirm the required items.
- A normal step is marked done; a critical check records passed, failed, unknown or not applicable.
- Not applicable needs an authored rule and a recorded reason.

::: narration
Each pause point is read do or do confirm. Normal steps are marked done. Critical checks record passed, failed, unknown, or not applicable with a reason. Nothing is marked automatically.
:::

# Results

::: narration
Part 3. Results.
:::

## Pause point 1: Before publication (Read–Do)

Read each item, do the action, then record its result.

- [ ] Open the page in the local preview.
- [ ] Read the title and the first paragraph aloud.
- [ ] Open every link on the page once.
- [ ] **Critical check:** Confirm the intended page and destination.
  - If it fails: Stop. Do not publish: the page or the destination is wrong.
- [ ] **Critical check:** Confirm a backup of the live site exists.
  - If it fails: Do not publish until a backup exists.
- [ ] Run the publish command.

::: notes
Confirm the intended page and destination.: The file is the page you mean to publish, and the destination is the intended site and path.
:::

::: narration
Pause point 1, Before publication, is read do. It has 4 normal steps and 2 critical checks. The critical checks are: Confirm the intended page and destination; Confirm a backup of the live site exists.
:::

## Pause point 2: After publication (Do–Confirm)

Complete the work, then use the checklist to confirm the required items.

- [ ] Open the live page in a private window.
- [ ] Read the title and the first paragraph on the live page.
- [ ] **Critical check:** Confirm the live page shows the new version.
  - If it fails: Do not announce the page.
- [ ] Open every link on the live page once.
- [ ] Announce the page.
- **Stop:** The live site shows an error page. Stop publishing changes. Restore the previous version from the backup.

::: narration
Pause point 2, After publication, is do confirm. It has 4 normal steps and 1 critical check. The critical checks are: Confirm the live page shows the new version. Stop if the live site shows an error page.
:::

# Checks and takeaway

::: narration
Part 4. Checks and takeaway.
:::

## Stop and escalation conditions

- **Stop:** The live site shows an error page. Instruction: Stop publishing changes. Restore the previous version from the backup.
- **Escalate:** The previous version cannot be restored. Ask The site owner: Tell the site owner the time of publication and what the error page shows.

::: narration
There is one stop condition. A reported stop blocks normal progress. 1 escalation condition names a person or role to ask for help.
:::

## Recovery and restart

- **Recovery route:** Correct the page or destination. Trigger: critical check “Confirm the intended page and destination.” fails.
  1. Do not run the publish command.
  2. Correct the page file or the destination setting.
  3. Open the corrected page in the local preview.
  - Restart check: The local preview shows the intended page.
  - Restart check: The destination setting names the intended site and path.
  - Restart at: Pause point 1: Before publication
- **Recovery route:** Restore the previous version. Trigger: critical check “Confirm the live page shows the new version.” fails; stop condition “The live site shows an error page.” is reported.
  1. Restore the previous version from the backup.
  2. Open the live page in a private window.
  - Restart check: The live site shows the previous version.
  - Restart at: Pause point 1: Before publication

::: narration
There are 2 recovery routes. A restart needs every restart check confirmed, and it clears the results that depend on the failure.
:::

## Takeaway

- Normal progress needs a valid result for every required item at the pause point.
- Test the checklist with its intended users on a representative task, then revise it.

::: key
A failed or unknown critical check, or a reported stop condition, blocks normal progress. Completed boxes do not prove that the work is correct.
:::

::: narration
A failed or unknown critical check, or a reported stop condition, blocks normal progress. Test the checklist with its intended users before relying on it.
:::

<!-- checklist-manifesto-maker:state
{
  "format": "checklist-manifesto-maker",
  "schemaVersion": 1,
  "checklist": {
    "id": "cl1",
    "title": "Publish a static page",
    "revision": 2,
    "example": "static-page",
    "requiresReview": false,
    "details": {
      "intendedUsers": "A person who publishes pages to a static website",
      "equipment": "The page files, a local preview and the publishing tool",
      "applicability": "Publishing one page to an existing static site",
      "sources": "Written for this page as an example. Adapt it to your own publishing procedure.",
      "notes": ""
    },
    "originalText": "",
    "pausePoints": [
      {
        "id": "p1",
        "title": "Before publication",
        "mode": "read-do",
        "details": "",
        "items": [
          {
            "id": "s1",
            "kind": "step",
            "text": "Open the page in the local preview.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s2",
            "kind": "step",
            "text": "Read the title and the first paragraph aloud.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s3",
            "kind": "step",
            "text": "Open every link on the page once.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "c1",
            "kind": "check",
            "text": "Confirm the intended page and destination.",
            "details": "The file is the page you mean to publish, and the destination is the intended site and path.",
            "required": true,
            "dependsOn": [],
            "applicability": "",
            "ifFailed": "Stop. Do not publish: the page or the destination is wrong."
          },
          {
            "id": "c2",
            "kind": "check",
            "text": "Confirm a backup of the live site exists.",
            "details": "",
            "required": true,
            "dependsOn": [],
            "applicability": "The site has no live version yet.",
            "ifFailed": "Do not publish until a backup exists."
          },
          {
            "id": "s4",
            "kind": "step",
            "text": "Run the publish command.",
            "details": "",
            "required": true,
            "dependsOn": [
              "c1",
              "c2"
            ]
          }
        ]
      },
      {
        "id": "p2",
        "title": "After publication",
        "mode": "do-confirm",
        "details": "",
        "items": [
          {
            "id": "s5",
            "kind": "step",
            "text": "Open the live page in a private window.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s6",
            "kind": "step",
            "text": "Read the title and the first paragraph on the live page.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "c3",
            "kind": "check",
            "text": "Confirm the live page shows the new version.",
            "details": "",
            "required": true,
            "dependsOn": [],
            "applicability": "",
            "ifFailed": "Do not announce the page."
          },
          {
            "id": "s7",
            "kind": "step",
            "text": "Open every link on the live page once.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s8",
            "kind": "step",
            "text": "Announce the page.",
            "details": "",
            "required": true,
            "dependsOn": [
              "c3"
            ]
          }
        ]
      }
    ],
    "stopConditions": [
      {
        "id": "x1",
        "text": "The live site shows an error page.",
        "instruction": "Stop publishing changes. Restore the previous version from the backup.",
        "escalation": "e1",
        "at": [
          "p2"
        ]
      }
    ],
    "escalationConditions": [
      {
        "id": "e1",
        "text": "The previous version cannot be restored.",
        "contact": "The site owner",
        "action": "Tell the site owner the time of publication and what the error page shows.",
        "at": [
          "p2"
        ]
      }
    ],
    "recoveryRoutes": [
      {
        "id": "r1",
        "title": "Correct the page or destination",
        "triggers": [
          "c1"
        ],
        "steps": [
          {
            "id": "a1",
            "text": "Do not run the publish command."
          },
          {
            "id": "a2",
            "text": "Correct the page file or the destination setting."
          },
          {
            "id": "a3",
            "text": "Open the corrected page in the local preview."
          }
        ],
        "restartChecks": [
          {
            "id": "k1",
            "text": "The local preview shows the intended page."
          },
          {
            "id": "k2",
            "text": "The destination setting names the intended site and path."
          }
        ],
        "restartAt": "p1"
      },
      {
        "id": "r2",
        "title": "Restore the previous version",
        "triggers": [
          "c3",
          "x1"
        ],
        "steps": [
          {
            "id": "a4",
            "text": "Restore the previous version from the backup."
          },
          {
            "id": "a5",
            "text": "Open the live page in a private window."
          }
        ],
        "restartChecks": [
          {
            "id": "k3",
            "text": "The live site shows the previous version."
          }
        ],
        "restartAt": "p1"
      }
    ],
    "none": {
      "stop": false,
      "escalation": false,
      "recovery": false
    },
    "seq": 1
  },
  "reviewers": [
    {
      "id": "rev1",
      "name": "A. Reviewer",
      "revision": 1,
      "date": "2026-10-05",
      "note": "Read on a phone."
    }
  ],
  "reviewedRevision": 1,
  "trialNotes": "The first trial missed the backup check.\nSecond line.",
  "run": {
    "id": "run1",
    "revision": 1,
    "checklist": {
      "id": "cl1",
      "title": "Publish a static page",
      "revision": 1,
      "example": "static-page",
      "requiresReview": false,
      "details": {
        "intendedUsers": "A person who publishes pages to a static website",
        "equipment": "The page files, a local preview and the publishing tool",
        "applicability": "Publishing one page to an existing static site",
        "sources": "Written for this page as an example. Adapt it to your own publishing procedure.",
        "notes": ""
      },
      "originalText": "",
      "pausePoints": [
        {
          "id": "p1",
          "title": "Before publication",
          "mode": "read-do",
          "details": "",
          "items": [
            {
              "id": "s1",
              "kind": "step",
              "text": "Open the page in the local preview.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "s2",
              "kind": "step",
              "text": "Read the title and the first paragraph.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "s3",
              "kind": "step",
              "text": "Open every link on the page once.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "c1",
              "kind": "check",
              "text": "Confirm the intended page and destination.",
              "details": "The file is the page you mean to publish, and the destination is the intended site and path.",
              "required": true,
              "dependsOn": [],
              "applicability": "",
              "ifFailed": "Stop. Do not publish: the page or the destination is wrong."
            },
            {
              "id": "c2",
              "kind": "check",
              "text": "Confirm a backup of the live site exists.",
              "details": "",
              "required": true,
              "dependsOn": [],
              "applicability": "The site has no live version yet.",
              "ifFailed": "Do not publish until a backup exists."
            },
            {
              "id": "s4",
              "kind": "step",
              "text": "Run the publish command.",
              "details": "",
              "required": true,
              "dependsOn": [
                "c1",
                "c2"
              ]
            }
          ]
        },
        {
          "id": "p2",
          "title": "After publication",
          "mode": "do-confirm",
          "details": "",
          "items": [
            {
              "id": "s5",
              "kind": "step",
              "text": "Open the live page in a private window.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "s6",
              "kind": "step",
              "text": "Read the title and the first paragraph on the live page.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "c3",
              "kind": "check",
              "text": "Confirm the live page shows the new version.",
              "details": "",
              "required": true,
              "dependsOn": [],
              "applicability": "",
              "ifFailed": "Do not announce the page."
            },
            {
              "id": "s7",
              "kind": "step",
              "text": "Open every link on the live page once.",
              "details": "",
              "required": true,
              "dependsOn": []
            },
            {
              "id": "s8",
              "kind": "step",
              "text": "Announce the page.",
              "details": "",
              "required": true,
              "dependsOn": [
                "c3"
              ]
            }
          ]
        }
      ],
      "stopConditions": [
        {
          "id": "x1",
          "text": "The live site shows an error page.",
          "instruction": "Stop publishing changes. Restore the previous version from the backup.",
          "escalation": "e1",
          "at": [
            "p2"
          ]
        }
      ],
      "escalationConditions": [
        {
          "id": "e1",
          "text": "The previous version cannot be restored.",
          "contact": "The site owner",
          "action": "Tell the site owner the time of publication and what the error page shows.",
          "at": [
            "p2"
          ]
        }
      ],
      "recoveryRoutes": [
        {
          "id": "r1",
          "title": "Correct the page or destination",
          "triggers": [
            "c1"
          ],
          "steps": [
            {
              "id": "a1",
              "text": "Do not run the publish command."
            },
            {
              "id": "a2",
              "text": "Correct the page file or the destination setting."
            },
            {
              "id": "a3",
              "text": "Open the corrected page in the local preview."
            }
          ],
          "restartChecks": [
            {
              "id": "k1",
              "text": "The local preview shows the intended page."
            },
            {
              "id": "k2",
              "text": "The destination setting names the intended site and path."
            }
          ],
          "restartAt": "p1"
        },
        {
          "id": "r2",
          "title": "Restore the previous version",
          "triggers": [
            "c3",
            "x1"
          ],
          "steps": [
            {
              "id": "a4",
              "text": "Restore the previous version from the backup."
            },
            {
              "id": "a5",
              "text": "Open the live page in a private window."
            }
          ],
          "restartChecks": [
            {
              "id": "k3",
              "text": "The live site shows the previous version."
            }
          ],
          "restartAt": "p1"
        }
      ],
      "none": {
        "stop": false,
        "escalation": false,
        "recovery": false
      },
      "seq": 1
    },
    "status": "active",
    "current": "p1",
    "completed": [],
    "results": {
      "s1": {
        "value": "done",
        "reason": ""
      },
      "s2": {
        "value": "done",
        "reason": ""
      },
      "s3": {
        "value": "done",
        "reason": ""
      },
      "c1": {
        "value": "pending",
        "reason": ""
      },
      "c2": {
        "value": "not-applicable",
        "reason": "The site is new."
      },
      "s4": {
        "value": "pending",
        "reason": ""
      },
      "s5": {
        "value": "pending",
        "reason": ""
      },
      "s6": {
        "value": "pending",
        "reason": ""
      },
      "c3": {
        "value": "pending",
        "reason": ""
      },
      "s7": {
        "value": "pending",
        "reason": ""
      },
      "s8": {
        "value": "pending",
        "reason": ""
      }
    },
    "reports": [],
    "recovery": null,
    "hold": null,
    "notice": "Restarted at Before publication after recovery route “Correct the page or destination”. Cleared the trigger and the results that depend on it: Confirm the intended page and destination; Run the publish command.",
    "log": [
      "Run 1 started on revision 1.",
      "Open the page in the local preview.: Done.",
      "Read the title and the first paragraph.: Done.",
      "Open every link on the page once.: Done.",
      "Confirm a backup of the live site exists.: Not applicable.",
      "Confirm the intended page and destination.: Failed.",
      "Recovery route started: Correct the page or destination.",
      "Restarted at Before publication after recovery route “Correct the page or destination”. Cleared the trigger and the results that depend on it: Confirm the intended page and destination; Run the publish command."
    ]
  }
}
-->
