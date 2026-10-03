---
name: sectionlab
description: Route work on Sectionlab (a static cross-section properties, torsion and moment–curvature tool) to the one playbook that owns it.
---

# Sectionlab: where to start

This file routes work; it holds no workflow steps. Read [README.md](README.md) for
what the tool does and [docs/architecture.md](docs/architecture.md) for how the
pieces fit, then open only the playbook that matches the task.

| Task | Playbook |
| --- | --- |
| Add a library shape (a new catalogue entry, with its reference geometry, fixtures and, optionally, a torsion formula) | [Add a shape](playbooks/add-shape.md) |
| Change how properties, torsion or plastic results are computed | [Change the engine](playbooks/change-engine.md) |
| Run or extend the checks; regenerate reference data | [Verify](playbooks/verify.md) |
| Change the Markdown, YAML, PDF, PNG, print or share-link output | [Change an export](playbooks/change-export.md) |
| Publish a new version on the host site | [Deploy to the site](playbooks/deploy-to-site.md) |

Reference notes:

- [Architecture](docs/architecture.md): modules, data flow and the invariants every change keeps.
- [Model format](docs/model-format.md): every field of the model and its YAML form.
- [Verification](docs/verification.md): what is checked, against what, and to which tolerance.

Rules that apply to every task:

1. Units are mm, MPa, N and N·mm. Never add unit conversions inside the engine.
2. `index.html` is generated: edit `template.html`, `src/` or `raw.json`, then run `python build.py`.
3. The page must keep its "verify independently" notice and must never be described as design-code compliant.
4. The repository is ported to the site as `visuals/sectionlab/`, minus `tests/` and `.github/`: nothing may refer to files outside it.
5. Every change ends with the [Verify](playbooks/verify.md) playbook passing.
