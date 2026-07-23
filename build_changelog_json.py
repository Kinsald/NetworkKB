# -*- coding: utf-8 -*-
"""Parse CHANGELOG.md into data/changelog.json for the in-app viewer.

CHANGELOG.md stays the single source of truth — it's the normal,
human-editable format anyone would expect a changelog to be in (and
what GitHub/any repo viewer renders directly). This script is a
one-way parser: edit the markdown, run this, ship the JSON. Same
pattern as build_search_index.py — the JSON is a build artifact, not
something you hand-edit.

Output shape:
[
  {
    "version": "3.2.0",
    "date": "2026-07-21",
    "sections": {
      "New": ["<html> bullet text", ...],
      "Updated": [...],
      "Fixed": [...],
      "Removed": [...]
    }
  },
  ...
]
Only sections that actually appear for that version are included, so
the browser doesn't render empty "Fixed" headers for a release with no
fixes.

Writing convention for CHANGELOG.md bullets: write each bullet as ONE
LONG LINE, not manually hard-wrapped at ~72 chars. Markdown renders it
identically either way (GitHub collapses soft line breaks), but this
parser's continuation-joining used to occasionally insert a stray space
when a manual wrap landed mid-word or mid slash-chain (e.g. "multi-"
then "cloud" on the next line). Single-line bullets sidestep the whole
problem rather than requiring a fix every time it recurs.
"""
import re
import json
import os

SRC = os.path.join(os.path.dirname(__file__), "..", "CHANGELOG.md")
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "changelog.json")

with open(SRC, encoding="utf-8") as f:
    text = f.read()

def md_inline_to_html(s):
    """Minimal markdown->HTML for the handful of patterns this file
    actually uses: **bold**, `code`, [text](url), and escaping raw <>&."""
    s = s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`([^`]+?)`', r'<code>\1</code>', s)
    s = re.sub(r'\[([^\]]+?)\]\(([^)]+?)\)', r'<a href="\2" target="_blank" rel="noopener noreferrer">\1</a>', s)
    return s

# Split on version headers: "## [3.2.0] — 2026-07-21"
version_pattern = re.compile(r'^## \[([^\]]+)\] — (\d{4}-\d{2}-\d{2})\s*$', re.MULTILINE)
matches = list(version_pattern.finditer(text))

releases = []
for i, m in enumerate(matches):
    version, date = m.group(1), m.group(2)
    block_start = m.end()
    block_end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
    block = text[block_start:block_end]

    # Find ### section headers within this version's block
    sec_pattern = re.compile(r'^### (New|Updated|Fixed|Removed)\s*$', re.MULTILINE)
    sec_matches = list(sec_pattern.finditer(block))
    sections = {}
    for j, sm in enumerate(sec_matches):
        sec_name = sm.group(1)
        sec_start = sm.end()
        sec_end = sec_matches[j + 1].start() if j + 1 < len(sec_matches) else len(block)
        sec_text = block[sec_start:sec_end]

        # Parse bullets: a line starting with "- " begins a bullet;
        # subsequent indented lines (not starting a new bullet or a
        # markdown rule) are continuations, joined with a space.
        bullets = []
        current = None
        for line in sec_text.split('\n'):
            if line.startswith('- '):
                if current is not None:
                    bullets.append(current.strip())
                current = line[2:]
            elif line.strip() == '' or line.strip() == '---':
                continue
            elif current is not None and (line.startswith('  ') or line.startswith('\t')):
                current += ' ' + line.strip()
        if current is not None:
            bullets.append(current.strip())

        sections[sec_name] = [md_inline_to_html(b) for b in bullets]

    releases.append({"version": version, "date": date, "sections": sections})

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(releases, f, ensure_ascii=False, indent=2)

print(f"Parsed {len(releases)} releases -> {OUT}")
for r in releases:
    counts = {k: len(v) for k, v in r["sections"].items()}
    print(f"  v{r['version']} ({r['date']}): {counts}")
