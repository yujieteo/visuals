# Publish a static page

> **Example — adapt and review before use.** It is not an approved procedure.

Checklist Manifesto Maker Markdown, schema version 1. Checklist cl1, revision 2.

## Checklist details

- Intended users: A person who publishes pages to a static website
- Equipment: The page files, a local preview and the publishing tool
- Applicability: Publishing one page to an existing static site
- Source references: Written for this page as an example. Adapt it to your own publishing procedure.
- Reviewer record required before a Run: no
- Author review: revision 2 not reviewed yet
- Reviewer records (user supplied; the app does not verify qualifications or approval):
  - A. Reviewer, revision 1, 2026-10-05: Read on a phone. (stale)

## Pause point 1: Before publication (Read–Do)

Read each item, do the action, then record its result.

- [ ] Open the page in the local preview.
- [ ] Read the title and the first paragraph aloud.
- [ ] Open every link on the page once.
- [ ] **Critical check:** Confirm the intended page and destination.
  - Details: The file is the page you mean to publish, and the destination is the intended site and path.
  - Not applicable when: never (no applicability rule)
  - If it fails: Stop. Do not publish: the page or the destination is wrong.
- [ ] **Critical check:** Confirm a backup of the live site exists.
  - Not applicable when: The site has no live version yet.
  - If it fails: Do not publish until a backup exists.
- [ ] Run the publish command.
  - Depends on: “Confirm the intended page and destination.”, “Confirm a backup of the live site exists.”

Stop conditions here: none.

## Pause point 2: After publication (Do–Confirm)

Complete the work, then use the checklist to confirm the required items.

- [ ] Open the live page in a private window.
- [ ] Read the title and the first paragraph on the live page.
- [ ] **Critical check:** Confirm the live page shows the new version.
  - Not applicable when: never (no applicability rule)
  - If it fails: Do not announce the page.
- [ ] Open every link on the live page once.
- [ ] Announce the page.
  - Depends on: “Confirm the live page shows the new version.”

Stop conditions here: “The live site shows an error page.”

## Stop conditions

- **Stop:** The live site shows an error page.
  - Stop instruction: Stop publishing changes. Restore the previous version from the backup.
  - Escalation: “The previous version cannot be restored.”
  - Applies at: Pause point 2: After publication

## Escalation conditions

- **Escalate:** The previous version cannot be restored.
  - Named person or role: The site owner
  - Escalation action: Tell the site owner the time of publication and what the error page shows.
  - Applies at: Pause point 2: After publication

## Recovery routes

### Recovery route: Correct the page or destination

- Trigger: critical check “Confirm the intended page and destination.” fails
- Recovery steps:
  1. Do not run the publish command.
  2. Correct the page file or the destination setting.
  3. Open the corrected page in the local preview.
- Restart checks:
  - [ ] The local preview shows the intended page.
  - [ ] The destination setting names the intended site and path.
- Restart at: Pause point 1: Before publication

### Recovery route: Restore the previous version

- Trigger: critical check “Confirm the live page shows the new version.” fails; stop condition “The live site shows an error page.” is reported
- Recovery steps:
  1. Restore the previous version from the backup.
  2. Open the live page in a private window.
- Restart checks:
  - [ ] The live site shows the previous version.
- Restart at: Pause point 1: Before publication

## Trial notes

The first trial missed the backup check. / Second line.

## Run progress

- run1 on revision 1: in progress.
- Current pause point: Pause point 1: Before publication. Confirmed: none.
- Results:
  - Open the page in the local preview. (Pause point 1: Before publication): Done
  - Read the title and the first paragraph. (Pause point 1: Before publication): Done
  - Open every link on the page once. (Pause point 1: Before publication): Done
  - Confirm the intended page and destination. (Pause point 1: Before publication): No result
  - Confirm a backup of the live site exists. (Pause point 1: Before publication): Not applicable, because The site is new.
  - Run the publish command. (Pause point 1: Before publication): No result
  - Open the live page in a private window. (Pause point 2: After publication): No result
  - Read the title and the first paragraph on the live page. (Pause point 2: After publication): No result
  - Confirm the live page shows the new version. (Pause point 2: After publication): No result
  - Open every link on the live page once. (Pause point 2: After publication): No result
  - Announce the page. (Pause point 2: After publication): No result
- Log:
  1. Run 1 started on revision 1.
  2. Open the page in the local preview.: Done.
  3. Read the title and the first paragraph.: Done.
  4. Open every link on the page once.: Done.
  5. Confirm a backup of the live site exists.: Not applicable.
  6. Confirm the intended page and destination.: Failed.
  7. Recovery route started: Correct the page or destination.
  8. Restarted at Before publication after recovery route “Correct the page or destination”. Cleared the trigger and the results that depend on it: Confirm the intended page and destination; Run the publish command.

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
            "id": "s1",
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
