#!/usr/bin/env python3
"""Read-only structural checks for the documented feature-idea Markdown format."""

import argparse
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

TICKET = r"[A-Z][A-Z0-9]*-\d+"
RISK = r"R\d+"
STATUSES = {"Backlog", "Ready", "In progress", "Blocked", "Done"}
LINK = re.compile(r"!?\[([^\]\n]+)\]\((<[^>\n]+>|[^()\s]+)\)")
ATOM = r'([A-Za-z][\w-]*)(?:\["([^"\n]+)"\])?'


class Unsupported(ValueError):
    pass


def outside_fences(text):
    result, fence = [], None
    for line in text.splitlines():
        marker = re.match(r"^\s*(`{3,}|~{3,})(.*)$", line)
        if marker:
            run, tail = marker.groups()
            if fence is None:
                fence = run
            elif run[0] == fence[0] and len(run) >= len(fence) and not tail.strip():
                fence = None
            result.append("")
        else:
            result.append(line if fence is None else "")
    return "\n".join(result)


def metadata(text, key):
    found = re.findall(rf"^- \*\*{re.escape(key)}:\*\* (.+)$", text, re.M)
    if len(found) != 1:
        raise Unsupported(f"Expected one '- **{key}:** Value' metadata line")
    return found[0].strip()


def ids(value, pattern):
    # Read link labels rather than double-counting IDs embedded in destinations.
    plain = LINK.sub(lambda m: m[1], value)
    return re.findall(rf"\b(?:{pattern})\b", plain)


def one_id(value, pattern):
    found = ids(value, pattern)
    if len(found) != 1:
        raise Unsupported(f"Expected one ID in {value!r}")
    return found[0]


def table(text, required):
    lines = outside_fences(text).splitlines()
    for pos, line in enumerate(lines):
        if not line.startswith("|"):
            continue
        headers = [v.strip() for v in line.strip("|").split("|")]
        if not set(required) <= set(headers):
            continue
        if pos + 1 >= len(lines) or not re.fullmatch(r"[| :\-]+", lines[pos + 1]):
            raise Unsupported("Missing Markdown table separator")
        rows = []
        for row in lines[pos + 2:]:
            if not row.startswith("|"):
                break
            cells = [v.strip() for v in row.strip("|").split("|")]
            if "\\|" in row or len(cells) != len(headers):
                raise Unsupported("Complex or malformed Markdown table cells")
            rows.append(dict(zip(headers, cells)))
        return rows
    raise Unsupported(f"Missing table columns: {', '.join(required)}")


def anchors(text):
    found, used = set(), {}
    for heading in re.findall(r"^ {0,3}#{1,6} +(.+?)\s*#*\s*$", outside_fences(text), re.M):
        heading = LINK.sub(lambda m: m[1], heading)
        heading = re.sub(r"<[^>]*>", "", heading)
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        number = used.get(slug, 0)
        candidate = slug if number == 0 else f"{slug}-{number}"
        while candidate in found:
            number += 1
            candidate = f"{slug}-{number}"
        used[slug] = number + 1
        found.add(candidate)
    found.update(re.findall(r'<a\s+(?:id|name)=["\']([^"\']+)["\']', text))
    return found


def check_links(path, text, errors, unsupported):
    clean = outside_fences(text)
    # Inline code is documentation about syntax rather than a navigable link.
    clean = re.sub(r"`+[^`\n]*`+", "", clean)
    residue = LINK.sub("", clean)
    if re.search(r"!?\[[^\]\n]+\]\(|\[[^\]\n]+\]\[[^\]\n]*\]|^\s*\[[^\]]+\]:", residue, re.M):
        unsupported.append(f"{path}: complex/reference Markdown links require manual review")
    for match in LINK.finditer(clean):
        target = match[2].strip("<>")
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc:
            continue
        destination = path.parent / unquote(parsed.path) if parsed.path else path
        if not destination.exists():
            errors.append(f"{path}: broken link {target}")
        elif parsed.fragment and destination.suffix.lower() == ".md":
            if unquote(parsed.fragment) not in anchors(destination.read_text(encoding="utf-8")):
                errors.append(f"{path}: missing anchor {target}")


def graph(text, tickets):
    blocks = re.findall(r"^```mermaid\s*\n(.*?)^```\s*$", text, re.M | re.S)
    if len(blocks) != 1:
        raise Unsupported("Expected one Mermaid dependency graph")
    aliases = {ticket.replace("-", ""): ticket for ticket in tickets}
    aliases.update({ticket: ticket for ticket in tickets})
    nodes, raw_edges = set(), set()

    def node(alias, label):
        if label is not None:
            ticket = one_id(label, TICKET)
            if alias in aliases and aliases[alias] != ticket:
                raise Unsupported(f"Conflicting Mermaid label for {alias}")
            aliases[alias] = ticket
        nodes.add(alias)

    lines = [line.strip() for line in blocks[0].splitlines() if line.strip()]
    if not lines or not re.fullmatch(r"(?:flowchart|graph) (?:TD|TB|LR|RL|BT)", lines[0]):
        raise Unsupported("Unsupported Mermaid graph declaration")
    for line in lines[1:]:
        if line.startswith("%%"):
            continue
        edge = re.fullmatch(rf"{ATOM}\s*-->\s*{ATOM}", line)
        single = re.fullmatch(ATOM, line)
        if edge:
            source, source_label, target, target_label = edge.groups()
            node(source, source_label)
            node(target, target_label)
            raw_edges.add((source, target))
        elif single:
            node(*single.groups())
        else:
            raise Unsupported(f"Unsupported Mermaid syntax: {line}")
    unknown = nodes - aliases.keys()
    if unknown:
        raise Unsupported(f"Cannot identify Mermaid nodes: {sorted(unknown)}")
    return {aliases[n] for n in nodes}, {(aliases[a], aliases[b]) for a, b in raw_edges}


def has_cycle(tickets, edges):
    remaining = set(tickets)
    while remaining:
        ready = {n for n in remaining if not any(b == n and a in remaining for a, b in edges)}
        if not ready:
            return True
        remaining -= ready
    return False


def validate(root, index):
    errors, unsupported = [], []
    required = [root / name for name in ("PLAN.md", "TICKETS.md", "RISKS.md")]
    files = sorted((root / "tickets").glob("*.md"))
    if not files or any(not path.is_file() for path in [*required, index]):
        raise Unsupported("Need PLAN.md, TICKETS.md, RISKS.md, tickets/*.md, and an idea index")
    documents = {path: path.read_text(encoding="utf-8") for path in {*root.rglob("*.md"), index}}
    for path, content in sorted(documents.items()):
        check_links(path, content, errors, unsupported)

    def require(condition, message):
        if not condition:
            errors.append(message)

    tickets, ticket_risks, dependencies = {}, set(), set()
    for path in files:
        content = documents[path]
        heading = re.search(rf"^# ({TICKET}): .+$", content, re.M)
        if not heading:
            raise Unsupported(f"{path}: unsupported ticket title")
        ticket = heading[1]
        require(ticket not in tickets, f"Duplicate ticket ID: {ticket}")
        status = metadata(content, "Status")
        require(status in STATUSES, f"{ticket}: unknown status {status}")
        deps_text, risk_text = metadata(content, "Depends on"), metadata(content, "Risks")
        deps, risks = ids(deps_text, TICKET), ids(risk_text, RISK)
        if not deps and deps_text.lower() not in {"none", "—", "-"}:
            raise Unsupported(f"{ticket}: unsupported dependency metadata")
        if not risks and risk_text.lower() not in {"none", "—", "-"}:
            raise Unsupported(f"{ticket}: unsupported risk metadata")
        require(len(deps) == len(set(deps)), f"{ticket}: duplicate dependencies")
        dependencies.update((dep, ticket) for dep in deps)
        ticket_risks.update((risk, ticket) for risk in risks)
        require(not (status == "Backlog" and re.search(r"^- \[[xX]\]", content, re.M)),
                f"{ticket}: Backlog ticket contains completed acceptance checks")
        tickets[ticket] = (path, status)

    rows = table(documents[root / "TICKETS.md"], ("ID", "Status", "Depends on"))
    indexed, index_edges = set(), set()
    for row in rows:
        ticket = one_id(row["ID"], TICKET)
        require(ticket not in indexed, f"Duplicate index ticket: {ticket}")
        indexed.add(ticket)
        index_edges.update((dep, ticket) for dep in ids(row["Depends on"], TICKET))
        if ticket in tickets:
            require(row["Status"] == tickets[ticket][1], f"{ticket}: index/file status mismatch")
            link = LINK.search(row["ID"])
            require(bool(link) and (root / unquote(link[2])).resolve() == tickets[ticket][0].resolve(),
                    f"{ticket}: index points to the wrong ticket file")
    require(indexed == tickets.keys(), f"Ticket index/file mismatch: {sorted(indexed ^ tickets.keys())}")
    require(index_edges == dependencies, "Dependency edges differ between ticket index and files")
    for parent, child in dependencies:
        require(parent in tickets, f"{child}: missing dependency {parent}")
    require(not has_cycle(tickets, dependencies), "Dependency graph contains a cycle")
    try:
        nodes, edges = graph(documents[root / "TICKETS.md"], tickets)
        require(nodes == tickets.keys(), f"Mermaid node mismatch: {sorted(nodes ^ tickets.keys())}")
        require(edges == dependencies, "Dependency edges differ between Mermaid graph and files")
    except Unsupported as exc:
        unsupported.append(str(exc))

    risk_doc = documents[root / "RISKS.md"]
    risk_rows = [] if re.search(r"^No material risks identified\.$", risk_doc, re.M) else table(risk_doc, ("ID", "Responsible tickets"))
    risk_ids, responsibility = set(), set()
    for row in risk_rows:
        risk = one_id(row["ID"], RISK)
        require(risk not in risk_ids, f"Duplicate risk ID: {risk}")
        risk_ids.add(risk)
        owners = ids(row["Responsible tickets"], TICKET)
        require(bool(owners), f"{risk}: no responsible tickets")
        require(risk.lower() in anchors(risk_doc), f"{risk}: missing risk section")
        for owner in owners:
            require(owner in tickets, f"{risk}: nonexistent responsible ticket {owner}")
            responsibility.add((risk, owner))
    for risk, ticket in ticket_risks:
        require(risk in risk_ids, f"{ticket}: nonexistent risk {risk}")
    require(responsibility == ticket_risks,
            f"Risk ownership mismatch (risk, ticket): {sorted(responsibility ^ ticket_risks)}")

    plan = documents[root / "PLAN.md"]
    identity_key = "ID" if re.search(r"^- \*\*ID:\*\*", plan, re.M) else "Idea"
    proposal = one_id(metadata(plan, identity_key), TICKET)
    idea_rows = table(documents[index], ("ID", "Status"))
    proposal_ids = [one_id(row["ID"], TICKET) for row in idea_rows]
    require(len(proposal_ids) == len(set(proposal_ids)), "Duplicate proposal IDs in idea index")
    matches = [row for row in idea_rows if one_id(row["ID"], TICKET) == proposal]
    require(len(matches) == 1, f"{proposal}: missing or duplicate idea-index entry")
    if len(matches) == 1:
        require(matches[0]["Status"] == metadata(plan, "Status"), f"{proposal}: proposal/index status mismatch")
        destinations = [m[2] for value in matches[0].values() for m in LINK.finditer(value)]
        require(any((index.parent / unquote(d)).resolve() == (root / "PLAN.md").resolve() for d in destinations),
                f"{proposal}: idea index does not link to this PLAN.md")
    return errors, unsupported, len(tickets), len(risk_ids), len(dependencies)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("proposal", type=Path)
    parser.add_argument("--index", type=Path, help="Default: proposal's parent README.md")
    args = parser.parse_args()
    root = args.proposal.resolve()
    index = (args.index or root.parent / "README.md").resolve()
    try:
        errors, unsupported, tickets, risks, edges = validate(root, index)
    except (Unsupported, OSError, UnicodeError, ValueError) as exc:
        print(f"UNSUPPORTED/INPUT: {exc}", file=sys.stderr)
        return 2
    for message in errors:
        print(f"ERROR: {message}", file=sys.stderr)
    for message in unsupported:
        print(f"UNSUPPORTED: {message}", file=sys.stderr)
    if errors or unsupported:
        return 2 if unsupported else 1
    print(f"PASS: {tickets} tickets, {risks} risks, {edges} dependency edges; local links and structural consistency. No product behavior or external URLs verified.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
