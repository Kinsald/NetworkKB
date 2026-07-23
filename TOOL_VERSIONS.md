# Tool Versions

Each interactive tool in NetworkKB is versioned independently from the
overall product (see [CHANGELOG.md](./CHANGELOG.md) for that). This is
what actually lets you track "what changed in the DNS builder specifically"
across sessions, rather than everything being lumped into one product
version number.

Same semver rules as the product: **MAJOR** for a tool being rebuilt or
gaining a fundamentally new capability, **MINOR** for a real feature
added to an existing tool, **PATCH** for a bug fix with no behavior
change beyond "now it works correctly."

> **A note on the early entries below:** versioning wasn't tracked from
> day one — it started in v3.1.0. Everything before that line is a
> best-effort reconstruction from the project history, not a
> contemporaneous record. Treat the pre-3.1.0 entries as "roughly what
> happened, in roughly this order" rather than a precise audit trail.
> Everything from v3.1.0 onward is tracked in real time, as it happens.

---

## Current versions

| Tool | Version | Panel(s) |
|---|---|---|
| Design Helper | **2.0.0** | `design-helper` |
| Flashcards | **1.2.0** | `flashcards` |
| OSPF Cost Calculator | **1.0.1** | `ospf-cost` |
| DNS Record Builder | **1.0.0** | `dns-builder` |
| Shared Responsibility Model | **1.0.0** | `cloud-responsibility` |
| Changelog Viewer | **1.0.0** | `changelog` |
| Banner Generator | **1.0.0** | `banner-gen` |
| Subnet Calculator | **1.0.0** | `subnet-calc` |
| Wildcard Calculator | **1.0.0** | `wildcard-calc` |
| ACL Builder | **1.0.0** | `acl-builder` |
| Config Validator | **1.0.0** | `acl-validator` |
| VLAN Planner | **1.0.0** | `vlan-planner` |
| Global Search | **1.0.0** | (site-wide, `/` shortcut) |

---

## Design Helper — history

- **v1.0.0** — Initial build: site requirements form, topology/sizing
  math, text-based device/VLAN/topology tables, a visual SVG topology
  diagram (access/distribution/core/AP layers) with toggleable layers
  and clickable device icons opening a config-preview modal, a
  generated starter IOS config, and Save/Load via the PHP+SQLite
  backend.
- **v1.1.0** — Layer-toggle legend moved from a horizontal bar above
  the diagram to a vertical column beside it (more width for the
  diagram itself). Requirements form and the four detail cards
  (topology/devices/VLANs/config) became collapsible, auto-collapsing
  after a design is generated.
- **v2.0.0** — Major capability addition: perimeter firewall, DMZ zone,
  and Wireless LAN Controller as new optional appliances, with a strict
  bordered External/DMZ/Internal visual split. New device-click modal
  content for each. Caught and fixed pre-release: a zone-boundary
  geometry bug (the Internal zone's border was clipping 3px into the
  first device row) and an unresolved `currentColor` reference in one
  icon glyph.

## Flashcards — history

- **v1.0.0** — Initial 56-card deck with flip-to-reveal and Got-it/
  Didn't-know grading.
- **v1.1.0** — Fixed a scoring bug where grading before flipping a card
  could desync the correct/total counts (e.g. showing "2/1 correct").
  Grading buttons were hard-disabled via the HTML `disabled` attribute
  until a card was flipped.
- **v1.2.0** — The v1.1.0 fix introduced a new problem: flipping a card
  back to the front left the grading buttons *visually* enabled but
  functionally inert — a click did nothing, with zero feedback, which
  read as the tool being broken again. Redesigned to a two-click-confirm
  pattern instead of hard-disabling: the first click before flipping now
  reveals the answer, a second click grades — every click does something
  visible. Also added a plain-language on-page message if
  `data/flashcards.json` fails to load (most commonly from opening the
  page as `file://` instead of through a web server), replacing a
  silent, indefinite "Loading…" state.

## OSPF Cost Calculator — history

- **v1.0.0** — Initial calculator (bandwidth + reference bandwidth →
  cost).
- **v1.0.1** — Fixed a duplicate `id="ospf-cost"` shared between the
  panel container and the output span, which meant `getElementById`
  returned the wrong element and the tool never displayed a result.
  Renamed the output span, added a divide-by-zero guard, and capped
  cost at OSPF's real maximum (65535).

## DNS Record Builder, Banner Generator, Subnet/Wildcard Calculators,
## ACL Builder, Config Validator, VLAN Planner — history

All still at their initial release version — built once, no functional
bugs found or capabilities added since. (The DNS Record Builder shipped
with one bug — the form was blank until the record-type dropdown was
touched — but it was caught and fixed before delivery, so v1.0.0 is
what actually reached you.)

## Shared Responsibility Model — history

- **v1.0.0** — Initial release: click On-Premises/IaaS/PaaS/SaaS, the
  9-layer stack (data down to physical facility) re-renders showing
  customer vs. provider ownership per layer. Loads pre-populated (IaaS
  selected by default) rather than blank until touched — a lesson
  carried over directly from the DNS Record Builder's v1.0.0 bug.

## Changelog Viewer — history

- **v1.0.0** — Initial release: a version dropdown under Tools that
  renders the selected release's New/Updated/Fixed/Removed bullets,
  reading from `data/changelog.json` (generated from `CHANGELOG.md` by
  `scripts/build_changelog_json.py`, never hand-edited directly).

## Global Search — history

- **v1.0.0** — Initial release: `/` to open, matches page titles,
  headings, reference-table entries, dropdown options, and form labels
  via a pre-built index (`data/search-index.json`); multi-word AND
  matching; heading matches weighted above incidental table/label
  mentions; arrow-key navigation; Escape to close; permanent
  in-overlay disclaimer about what search does and doesn't cover.
