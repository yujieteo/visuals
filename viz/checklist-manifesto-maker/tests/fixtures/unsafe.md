# Trip \<script\>alert(1)\</script\> --\> \<\!-- x --\>

> **Example — adapt and review before use.** It is not an approved procedure.

Checklist Manifesto Maker Markdown, schema version 1. Checklist cl1, revision 2.

## Checklist details

- Intended users: A person packing for a trip out and back on the same day
- Equipment: A day bag
- Applicability: A trip that starts and ends on the same day
- Source references: Written for this page as an example. It is not an approved procedure.
- Reviewer record required before a Run: no
- Author review: revision 2 reviewed
- Reviewer records: none

## Pause point 1: Before departure (Do–Confirm)

Complete the work, then use the checklist to confirm the required items.

Details: Pack the bag first, then confirm each item with the bag open.

- [ ] Pack \[water\](javascript:alert(1)) and \<img src=x onerror=alert(1)\>
- [ ] Pack a charged phone and its charger.
  - Details: \# not a heading / ::: narration / \#\# nor a frame / --\>
- [ ] Pack a layer for the forecast weather.
- [ ] Pack a snack. (optional)
- [ ] **Critical check:** Confirm \`code\` \*stars\* \_under\_ \| pipe \& \$5 \\ backslash
  - Details: Tickets, passes or identity documents that the trip needs.
  - Not applicable when: The trip needs no ticket, pass or identity document.
  - If it fails: Do not leave yet. Find or replace the documents first.
- [ ] Put the documents in a closed inner pocket.
  - Depends on: “Confirm \`code\` \*stars\* \_under\_ \| pipe \& \$5 \\ backslash”
- [ ] **Critical check:** Confirm the time of the last return transport.
  - Not applicable when: You return on foot or in your own vehicle.
  - If it fails: Do not leave until you know how you will get back.

Stop conditions here: “The required travel documents are missing.”

## Pause point 2: Before return (Read–Do)

Read each item, do the action, then record its result.

Details: Read each item before you set off back.

- [ ] Collect every item you brought.
- [ ] **Critical check:** Confirm the required travel documents are present.
  - Not applicable when: The trip needs no ticket, pass or identity document.
  - If it fails: Do not set off. Search the bag and the places you visited.
- [ ] Check the departure time of the return transport.
- [ ] Check that the phone has charge for the journey.
- [ ] Tell your contact that you are on the way back.

Stop conditions here: “The return transport is cancelled.”

## Stop conditions

- **Stop:** The required travel documents are missing.
  - Stop instruction: Stop --\!\> now
  - Applies at: Pause point 1: Before departure
- **Stop:** The return transport is cancelled.
  - Stop instruction: Stay at a safe, staffed place. Do not set off another way until you have a plan.
  - Escalation: “You cannot arrange a way back.”
  - Applies at: Pause point 2: Before return

## Escalation conditions

- **Escalate:** You cannot arrange a way back.
  - Named person or role: Your named emergency contact
  - Escalation action: Call your named contact and agree on a way back.
  - Applies at: Pause point 2: Before return

## Recovery routes

### Recovery route: Find or replace the documents

- Trigger: critical check “Confirm \`code\` \*stars\* \_under\_ \| pipe \& \$5 \\ backslash” fails; stop condition “The required travel documents are missing.” is reported
- Recovery steps:
  1. Empty the bag and check every pocket.
  2. Check the last place you used the documents.
  3. If they are still missing, replace them or change the plan.
- Restart checks:
  - [ ] The documents are in the bag.
- Restart at: Pause point 1: Before departure

### Recovery route: Search for the documents before return

- Trigger: critical check “Confirm the required travel documents are present.” fails
- Recovery steps:
  1. Search the bag and your pockets.
  2. Retrace the places you visited.
  3. If they cannot be found, ask the staff at the station or venue.
- Restart checks:
  - [ ] The documents are in the bag.
- Restart at: Pause point 2: Before return

## Run progress

No Run is recorded.

<!-- checklist-manifesto-maker:state
{
  "format": "checklist-manifesto-maker",
  "schemaVersion": 1,
  "checklist": {
    "id": "cl1",
    "title": "Trip \u003cscript\u003ealert(1)\u003c/script\u003e --\u003e \u003c!-- x --\u003e",
    "revision": 2,
    "example": "day-trip",
    "requiresReview": false,
    "details": {
      "intendedUsers": "A person packing for a trip out and back on the same day",
      "equipment": "A day bag",
      "applicability": "A trip that starts and ends on the same day",
      "sources": "Written for this page as an example. It is not an approved procedure.",
      "notes": ""
    },
    "originalText": "",
    "pausePoints": [
      {
        "id": "p1",
        "title": "Before departure",
        "mode": "do-confirm",
        "details": "Pack the bag first, then confirm each item with the bag open.",
        "items": [
          {
            "id": "s1",
            "kind": "step",
            "text": "Pack [water](javascript:alert(1)) and \u003cimg src=x onerror=alert(1)\u003e",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s2",
            "kind": "step",
            "text": "Pack a charged phone and its charger.",
            "details": "# not a heading\n::: narration\n## nor a frame\n--\u003e",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s3",
            "kind": "step",
            "text": "Pack a layer for the forecast weather.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s4",
            "kind": "step",
            "text": "Pack a snack.",
            "details": "",
            "required": false,
            "dependsOn": []
          },
          {
            "id": "c1",
            "kind": "check",
            "text": "Confirm `code` *stars* _under_ | pipe & $5 \\ backslash",
            "details": "Tickets, passes or identity documents that the trip needs.",
            "required": true,
            "dependsOn": [],
            "applicability": "The trip needs no ticket, pass or identity document.",
            "ifFailed": "Do not leave yet. Find or replace the documents first."
          },
          {
            "id": "s5",
            "kind": "step",
            "text": "Put the documents in a closed inner pocket.",
            "details": "",
            "required": true,
            "dependsOn": [
              "c1"
            ]
          },
          {
            "id": "c2",
            "kind": "check",
            "text": "Confirm the time of the last return transport.",
            "details": "",
            "required": true,
            "dependsOn": [],
            "applicability": "You return on foot or in your own vehicle.",
            "ifFailed": "Do not leave until you know how you will get back."
          }
        ]
      },
      {
        "id": "p2",
        "title": "Before return",
        "mode": "read-do",
        "details": "Read each item before you set off back.",
        "items": [
          {
            "id": "s6",
            "kind": "step",
            "text": "Collect every item you brought.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "c3",
            "kind": "check",
            "text": "Confirm the required travel documents are present.",
            "details": "",
            "required": true,
            "dependsOn": [],
            "applicability": "The trip needs no ticket, pass or identity document.",
            "ifFailed": "Do not set off. Search the bag and the places you visited."
          },
          {
            "id": "s7",
            "kind": "step",
            "text": "Check the departure time of the return transport.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s8",
            "kind": "step",
            "text": "Check that the phone has charge for the journey.",
            "details": "",
            "required": true,
            "dependsOn": []
          },
          {
            "id": "s9",
            "kind": "step",
            "text": "Tell your contact that you are on the way back.",
            "details": "",
            "required": true,
            "dependsOn": []
          }
        ]
      }
    ],
    "stopConditions": [
      {
        "id": "x1",
        "text": "The required travel documents are missing.",
        "instruction": "Stop --!\u003e now",
        "escalation": "",
        "at": [
          "p1"
        ]
      },
      {
        "id": "x2",
        "text": "The return transport is cancelled.",
        "instruction": "Stay at a safe, staffed place. Do not set off another way until you have a plan.",
        "escalation": "e1",
        "at": [
          "p2"
        ]
      }
    ],
    "escalationConditions": [
      {
        "id": "e1",
        "text": "You cannot arrange a way back.",
        "contact": "Your named emergency contact",
        "action": "Call your named contact and agree on a way back.",
        "at": [
          "p2"
        ]
      }
    ],
    "recoveryRoutes": [
      {
        "id": "r1",
        "title": "Find or replace the documents",
        "triggers": [
          "c1",
          "x1"
        ],
        "steps": [
          {
            "id": "a1",
            "text": "Empty the bag and check every pocket."
          },
          {
            "id": "a2",
            "text": "Check the last place you used the documents."
          },
          {
            "id": "a3",
            "text": "If they are still missing, replace them or change the plan."
          }
        ],
        "restartChecks": [
          {
            "id": "k1",
            "text": "The documents are in the bag."
          }
        ],
        "restartAt": "p1"
      },
      {
        "id": "r2",
        "title": "Search for the documents before return",
        "triggers": [
          "c3"
        ],
        "steps": [
          {
            "id": "a4",
            "text": "Search the bag and your pockets."
          },
          {
            "id": "a5",
            "text": "Retrace the places you visited."
          },
          {
            "id": "a6",
            "text": "If they cannot be found, ask the staff at the station or venue."
          }
        ],
        "restartChecks": [
          {
            "id": "k2",
            "text": "The documents are in the bag."
          }
        ],
        "restartAt": "p2"
      }
    ],
    "none": {
      "stop": false,
      "escalation": false,
      "recovery": false
    },
    "seq": 1
  },
  "reviewers": [],
  "reviewedRevision": 2,
  "trialNotes": "",
  "run": null
}
-->
