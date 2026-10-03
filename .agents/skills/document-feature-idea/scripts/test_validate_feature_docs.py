"""Isolated behavioral tests. Run with python3; no external dependencies."""

import hashlib
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

CHECKER = Path(__file__).with_name("validate_feature_docs.py")


class CheckerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.root = self.base / "feature"
        (self.root / "tickets").mkdir(parents=True)
        self.write("../README.md", """# Ideas
| ID | Idea | Status |
| --- | --- | --- |
| FP-001 | [Feature](feature/PLAN.md) | Planned / not scheduled |
""")
        self.write("PLAN.md", """# Feature
- **ID:** FP-001
- **Status:** Planned / not scheduled
[Tickets](TICKETS.md) and [risks](RISKS.md).
""")
        self.write("TICKETS.md", """# Tickets
| ID | Ticket | Status | Depends on |
| --- | --- | --- | --- |
| [XX-01](tickets/XX-01.md) | First | Backlog | — |
| [XX-02](tickets/XX-02.md) | Second | Backlog | [XX-01](tickets/XX-01.md) |
| [XX-03](tickets/XX-03.md) | Independent | Backlog | — |

```mermaid
flowchart TD
    XX01["XX-01 First"] --> XX02["XX-02 Second"]
    XX03["XX-03 Independent"]
```
""")
        self.write("RISKS.md", """# Risks
| ID | Risk | Severity | Likelihood | Responsible tickets |
| --- | --- | --- | --- | --- |
| [R01](#r01) | Incorrect result | High | Medium | XX-01, XX-02 |

## R01
**Mitigation:** Validate the result.
**Verification:** Relevant acceptance checks.
""")
        for number in range(1, 4):
            ticket = f"XX-0{number}"
            deps = "[XX-01](XX-01.md)" if number == 2 else "None"
            risks = "[R01](../RISKS.md#r01)" if number < 3 else "None"
            self.write(f"tickets/{ticket}.md", f"""# {ticket}: Outcome
- **Status:** Backlog
- **Depends on:** {deps}
- **Risks:** {risks}
- [ ] Observable result.
""")

    def write(self, name, content):
        (self.root / name).write_text(content, encoding="utf-8")

    def replace(self, name, old, new):
        path = self.root / name
        content = path.read_text(encoding="utf-8")
        self.assertIn(old, content)
        path.write_text(content.replace(old, new), encoding="utf-8")

    def snapshot(self):
        return {str(p.relative_to(self.base)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in self.base.rglob("*") if p.is_file()}

    def check(self, code=0, diagnostic="PASS:"):
        before = self.snapshot()
        result = subprocess.run([sys.executable, str(CHECKER), str(self.root)],
                                capture_output=True, text=True)
        self.assertEqual(self.snapshot(), before, "Checker modified input files")
        self.assertEqual(result.returncode, code, result.stdout + result.stderr)
        self.assertIn(diagnostic, result.stdout + result.stderr)

    def test_valid_package_and_isolated_node(self):
        self.check()

    def test_repeated_labels_and_unlabeled_edges(self):
        self.replace("TICKETS.md", '    XX03["XX-03 Independent"]',
                     '    XX01["XX-01 First"] --> XX02\n    XX03["XX-03 Independent"]')
        self.check()

    def test_local_links_code_examples_and_duplicate_headings(self):
        with (self.root / "PLAN.md").open("a") as f:
            f.write('\n## Repeated\n## Repeated\n[second](#repeated-1)\n'
                    '[space](<with space.md>)\n`[example](absent.md)`\n'
                    '```md\n[example](absent.md)\n```\n')
        self.write("with space.md", "# Reference\n")
        self.check()

    def test_broken_link(self):
        self.replace("PLAN.md", "TICKETS.md", "absent.md")
        self.check(1, "broken link")

    def test_missing_anchor(self):
        self.replace("PLAN.md", "TICKETS.md", "TICKETS.md#absent")
        self.check(1, "missing anchor")

    def test_duplicate_ticket_id(self):
        self.write("tickets/duplicate.md", (self.root / "tickets/XX-01.md").read_text())
        self.check(1, "Duplicate ticket ID")

    def test_unknown_dependency(self):
        self.replace("tickets/XX-02.md", "[XX-01](XX-01.md)", "XX-99")
        self.check(1, "missing dependency XX-99")

    def test_cycle(self):
        self.replace("tickets/XX-01.md", "**Depends on:** None", "**Depends on:** XX-02")
        self.check(1, "contains a cycle")

    def test_table_dependency_disagreement(self):
        self.replace("TICKETS.md", "| [XX-01](tickets/XX-01.md) |\n", "| — |\n")
        self.check(1, "between ticket index and files")

    def test_graph_disagreement(self):
        self.replace("TICKETS.md", 'XX01["XX-01 First"] --> XX02["XX-02 Second"]',
                     'XX01["XX-01 First"]\n    XX02["XX-02 Second"]')
        self.check(1, "between Mermaid graph and files")

    def test_unknown_risk_owner(self):
        self.replace("RISKS.md", "XX-01, XX-02", "XX-01, XX-99")
        self.check(1, "nonexistent responsible ticket")

    def test_risk_ownership_disagreement(self):
        self.replace("RISKS.md", "XX-01, XX-02", "XX-01")
        self.check(1, "Risk ownership mismatch")

    def test_no_material_risks(self):
        self.write("RISKS.md", "# Risks\nNo material risks identified.\n")
        for name in ("XX-01", "XX-02"):
            self.replace(f"tickets/{name}.md", "[R01](../RISKS.md#r01)", "None")
        self.check()

    def test_duplicate_proposal_id(self):
        with (self.base / "README.md").open("a") as f:
            f.write("| FP-001 | [Duplicate](feature/PLAN.md) | Planned / not scheduled |\n")
        self.check(1, "Duplicate proposal IDs")

    def test_wrong_status(self):
        self.replace("tickets/XX-01.md", "**Status:** Backlog", "**Status:** Done")
        self.check(1, "index/file status mismatch")

    def test_backlog_completed_checks(self):
        self.replace("tickets/XX-01.md", "- [ ]", "- [x]")
        self.check(1, "Backlog ticket contains completed")

    def test_unsupported_graph(self):
        self.replace("TICKETS.md", " --> ", " -->|blocks| ")
        self.check(2, "Unsupported Mermaid syntax")

    def test_unsupported_reference_links(self):
        with (self.root / "PLAN.md").open("a") as f:
            f.write("\n[details][reference]\n[reference]: TICKETS.md\n")
        self.check(2, "reference Markdown links")

    def test_unsupported_custom_table(self):
        self.replace("TICKETS.md", "| Depends on |", "| Blocked by |")
        self.check(2, "Missing table columns")

    def test_missing_input(self):
        (self.root / "PLAN.md").unlink()
        self.check(2, "Need PLAN.md")


if __name__ == "__main__":
    unittest.main()
