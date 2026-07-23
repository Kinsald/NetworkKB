# -*- coding: utf-8 -*-
"""Build data/search-index.json from every panel in index.html.

For each panel we capture: id, parent section, page title, page
description, and every card-title / badge / concept-title string inside
it — this is what lets a search for "HSRP" or "SOA record" hit even
though neither term is in the panel's own title. This is a build-time
index, not a runtime DOM scan, so search stays fast even as the site
grows — search.js just fetches this JSON once and matches against it.
"""
import re
import json
import os
import html as htmlmod

SRC = os.path.join(os.path.dirname(__file__), "..", "index.html")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "search-index.json")

with open(SRC, encoding="utf-8") as f:
    html = f.read()

# Section display names (top-nav labels) keyed by data-parent value.
# Several sections were merged this round (DNS->fundamentals,
# switching->routing, nat->acl, wireless->qos) — the search results still
# show which ORIGINAL sub-topic an entry belongs to via its own title,
# this mapping is just the top-level umbrella label shown above it.
SECTION_NAMES = {
    "home": "Home", "fundamentals": "Fundamentals", "acl": "ACL & NAT",
    "routing": "Routing & Switching", "design": "Design",
    "security": "Security", "qos": "QoS & Wireless", "tools": "Tools",
}

def strip_tags(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    s = htmlmod.unescape(s)
    return re.sub(r'\s+', ' ', s).strip()

# Find each panel block (from its opening tag to the matching </div> that
# closes it) by tracking div depth, same technique used earlier for the
# reference-card injection.
panel_starts = [(m.start(), m.group(1), m.group(2)) for m in
                 re.finditer(r'<div id="([a-z0-9-]+)" class="panel" data-parent="([a-z]+)">', html)]

entries = []
for start, pid, parent in panel_starts:
    # walk forward to find this panel's matching closing </div>
    i = start + len('<div id="X" class="panel" data-parent="Y">')  # placeholder length, recompute properly below
    tag_open_end = html.index('>', start) + 1
    i = tag_open_end
    depth = 1
    while depth > 0 and i < len(html):
        nxt_open = html.find('<div', i)
        nxt_close = html.find('</div>', i)
        if nxt_close == -1:
            break
        if nxt_open != -1 and nxt_open < nxt_close:
            depth += 1
            i = nxt_open + 4
        else:
            depth -= 1
            i = nxt_close + 6
    block = html[tag_open_end:i]

    title_m = re.search(r'<div class="page-title">(.*?)</div>', block, re.DOTALL)
    desc_m = re.search(r'<div class="page-desc">(.*?)</div>', block, re.DOTALL)
    title = strip_tags(title_m.group(1)) if title_m else pid
    desc = strip_tags(desc_m.group(1)) if desc_m else ''

    headings = re.findall(r'<div class="card-title"[^>]*>(.*?)</div>', block, re.DOTALL)
    headings += re.findall(r'<div class="concept-title"[^>]*>(.*?)</div>', block, re.DOTALL)
    headings = [strip_tags(h) for h in headings]
    headings = [h for h in headings if h and len(h) < 80]  # drop anything too long to be a real heading

    # Reference tables are where a lot of the actual acronyms/terms live
    # (e.g. the DNS record-type table has "SRV" and "SOA" as plain table
    # cells, not headings) — pull the first <td> of every row plus any
    # <option> text (dropdown choices, e.g. record types, banner types)
    # so those terms are searchable too.
    first_cells = re.findall(r'<tr>\s*<td[^>]*>(.*?)</td>', block, re.DOTALL)
    first_cells = [strip_tags(c) for c in first_cells]
    first_cells = [c for c in first_cells if c and len(c) < 40]
    options = re.findall(r'<option[^>]*>(.*?)</option>', block, re.DOTALL)
    options = [strip_tags(o) for o in options]
    options = [o for o in options if o and len(o) < 60]

    labels = re.findall(r'<label class="flabel"[^>]*>(.*?)</label>', block, re.DOTALL)
    labels = [strip_tags(l) for l in labels]
    labels = [l for l in labels if l and l != '\xa0' and len(l) < 60]

    # Two tiers, scored differently in search.js: `headings` are a strong
    # signal (this page has an actual section ABOUT this term — e.g. a
    # card titled "HSRP on a distribution pair"), while `terms` are a
    # weaker signal (the word merely appears somewhere — a table cell, a
    # dropdown option, a form label). Keeping them separate is what lets
    # a page whose heading IS "HSRP ..." outrank a page that only
    # mentions HSRP once in a parenthetical aside.
    headings_text = ' '.join(dict.fromkeys(headings))
    terms_text = ' '.join(dict.fromkeys(first_cells + options + labels))

    entries.append({
        "id": pid,
        "section": SECTION_NAMES.get(parent, parent),
        "parent": parent,
        "title": title,
        "desc": desc,
        "headings": headings_text,
        "terms": terms_text,
    })

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=1)

print(f"Indexed {len(entries)} panels -> {OUT}")
print("Sample entry:", json.dumps(entries[10], indent=2)[:400])
