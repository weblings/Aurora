# Generates every frame and index.html for Aurora-kep2.2. mock.css is hand-written.
# Usage: python gen.py [out_dir]  (default: this folder)
import os
import sys
out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
CSS = ["tokens", "page", "shell", "forms", "dropdown", "dashboard", "tuning"]
LINKS = "\n".join(f'  <link rel="stylesheet" href="../styles/{c}.css" />' for c in CSS) + '\n  <link rel="stylesheet" href="mock.css" />'
CHEV = '<img src="../icons/chevron-down.svg" alt="" class="mk-chev" />'


def page(title, body):
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
{LINKS}
</head>
<body>
  <div id="screen-container">
{body}
  </div>
</body>
</html>
'''


TOP = '''    <div class="top-bar-slot db-top-bar-slot">
      <div class="top-bar top-bar-with-logo">
        <span></span>
        <h1 class="top-bar-title"><img src="../icons/aurora-logo.png" alt="Aurora" class="top-bar-logo" /></h1>
        <div class="top-bar-trailing">
          <button type="button" class="btn btn-secondary btn-icon" aria-label="Pause"><img src="../icons/pause-rockyroad.svg" alt="" class="top-bar-trailing-icon" /></button>
          <button type="button" class="btn btn-secondary btn-icon top-bar-power-btn" aria-label="Stop"><img src="../icons/power-svgrepo-com.svg" alt="" class="top-bar-trailing-icon" /></button>
        </div>
      </div>
    </div>'''


def acc(t):
    return f'      <div><div class="accordion-section"><button type="button" class="accordion-header" aria-expanded="false"><span class="accordion-title">{t}</span><span class="accordion-chevron" aria-hidden="true"></span></button><div class="accordion-content" hidden></div></div></div>'


ACCS = "\n".join(acc(t) for t in ["Zone Mapping", "Tuning", "Output", "Paired devices"])
VERSION = '    <div class="db-version"><p>v1.1.4</p></div>'

ROWMENU_CUSTOM = ["Edit graph", "Rename", "Duplicate", "Move up", "Move down", "Hide", "Delete"]
ROWMENU_BUILTIN = ["Duplicate", "Hide"]
ROWMENU_HIDDEN = ["Unhide", "Duplicate"]


def rowmenu(items):
    h = '<div class="mk-rowmenu" role="menu">'
    for it in items:
        d = " dropdown-option-divided" if it == "Delete" else ""
        h += f'<button type="button" class="dropdown-option{d}" role="menuitem">{it}</button>'
    return h + '</div>'


DESC = {
    "Screen colors": "Matches the lights to the colors at the edges of your screen.",
    "Music pulse": "Pulses the lights with the beat of whatever is playing.",
    "Fire": "Warm flicker that flares with bass and loud moments.",
    "Rainbow drift": "Slow color wheel that speeds up with audio energy and screen motion.",
    "Candle": "Soft, steady glow that follows the dominant screen color.",
    "Strobe": "Hard white flashes on every beat.",
    "Plasma": "Swirling colors sampled from the screen.",
}


def opt(name, sel=False, secondary=None, menu=None, tip=False, hov=False):
    cls = "mk-opt" + (" selected" if sel else "") + (" tip-on" if tip else "") + (" hov" if hov else "")
    rid = name.lower().replace(" ", "-")
    chk = "&#10003;" if sel else ""
    stxt = f'<div class="mk-opt-secondary">{secondary}</div>' if secondary else ""
    desc = DESC.get(name, "A custom effect.")
    tab_more = {"button": ' tabindex="-1"', "tree": ' tabindex="-1" aria-hidden="true"'}.get(ROWS, "")
    attrs = f' aria-describedby="{rid}-tip"' + (" checked" if sel else "")
    more = f'<button type="button" class="mk-more{" open" if menu else ""}" aria-label="Actions for {name}" aria-haspopup="menu" aria-expanded="{str(bool(menu)).lower()}"{tab_more}>&#8943;</button>'
    inner = f'<span class="mk-check" aria-hidden="true">{chk}</span><span class="mk-opt-text"><span class="mk-opt-name">{name}</span>{stxt}</span>'
    if ROWS == "tree":
        # A treeitem cannot hold a button, so the ellipsis is mouse-only and Right opens the row menu.
        pick = f'<div role="treeitem" class="mk-pick" tabindex="{0 if sel else -1}" aria-selected="{str(sel).lower()}"' + f' aria-describedby="{rid}-tip" aria-haspopup="menu" aria-keyshortcuts="ArrowRight Shift+F10">{inner}</div>'
    elif ROWS == "button":
        # Row buttons: one tab stop for the list (roving tabindex), arrows move focus without committing.
        pick = f'<button type="button" class="mk-pick" tabindex="{0 if sel else -1}"' + (' aria-current="true"' if sel else "") + f' aria-describedby="{rid}-tip">{inner}</button>'
    else:
        pick = f'<label><input type="radio" class="mk-radio" name="effect"{attrs} />{inner}</label>'
    return f'''            <div class="{cls}">{pick}{more}<div class="mk-tip" role="tooltip" id="{rid}-tip">{desc}</div>{menu or ""}</div>'''


MANY = ["Aurora borealis", "Ember glow", "Ocean swell", "Neon pulse", "Sunset fade", "Strobe party", "Forest canopy", "Lava lamp", "Night drive", "Heartbeat"]


CUE_POS = "right"
NO_CUSTOM = False
ROWS = "radio"


def section(gid, title, rows, collapsed=False, cue=None):
    chk = '<span class="mk-cue" aria-hidden="true">&#10003;</span><span class="sr-only">contains the selected effect</span>' if (collapsed and cue) else ""
    left = chk if CUE_POS == "left" else ""
    right = chk if CUE_POS == "right" else ""
    if ROWS == "tree":
        # The group node is the treeitem. Its name comes from the header, not its children.
        return f'''          <div class="mk-section" role="treeitem" tabindex="-1" aria-expanded="{str(not collapsed).lower()}" aria-labelledby="{gid}"><div class="mk-group mk-group-toggle"><span class="mk-head" id="{gid}"><img src="../icons/chevron-down.svg" alt="" class="mk-chev mk-twisty" /><span>{title}</span><span class="mk-cue" aria-hidden="true" hidden>&#10003;</span><span class="sr-only" hidden>, contains the selected effect</span></span></div>
          <div role="group" id="{gid}-list"{" hidden" if collapsed else ""}>
{rows}
          </div></div>'''
    return f'''          <div class="mk-section"><h3 class="mk-group mk-group-toggle"><button type="button" id="{gid}" aria-expanded="{str(not collapsed).lower()}" aria-controls="{gid}-list"><img src="../icons/chevron-down.svg" alt="" class="mk-chev mk-twisty" />{left}<span>{title}</span>{right}</button></h3>
          <div role="{"group" if ROWS == "button" else "radiogroup"}" id="{gid}-list" aria-labelledby="{gid}"{" hidden" if collapsed else ""}>
{rows}
          </div></div>'''


def groups(menu_for=None, hidden=None, many=False, collapsed=(), tip=None, hide_builtin=False):
    # A group renders only when it holds a visible effect.
    def bm(n): return rowmenu(ROWMENU_BUILTIN) if menu_for == n else None
    def cm(n): return rowmenu(ROWMENU_CUSTOM) if menu_for == n else None
    def hm(n): return rowmenu(ROWMENU_HIDDEN) if menu_for == n else None
    t = lambda n: n == tip
    builtin = [] if hide_builtin else [opt("Screen colors", menu=bm("Screen colors"), tip=t("Screen colors")), opt("Music pulse", menu=bm("Music pulse"), tip=t("Music pulse"))]
    custom = [opt("Fire", sel=True, tip=t("Fire")), opt("Rainbow drift", menu=cm("Rainbow drift"), tip=t("Rainbow drift")), opt("Candle", tip=t("Candle"))]
    if many:
        custom += [opt(n) for n in MANY]
    if NO_CUSTOM:
        custom = []
    hid = ([opt("Screen colors", secondary="Built-in", menu=hm("Screen colors"), hov=NO_CUSTOM), opt("Music pulse", secondary="Built-in")] if hide_builtin else []) + ([] if NO_CUSTOM else [opt("Strobe"), opt("Plasma", menu=hm("Plasma"))]) if hidden else []
    parts = []
    if builtin:
        parts.append(section("g-builtin", "Built-in", "\n".join(builtin), "builtin" in collapsed))
    if custom:
        parts.append(section("g-custom", "Custom", "\n".join(custom), "custom" in collapsed, cue="Fire"))
    if hid:
        parts.append(section("g-hidden", "Hidden", "\n".join(hid), hidden != "expanded"))
    return "\n".join(parts)


def picker(label, popup=False, menu_for=None, hidden=None, many=False, scroll=False, collapsed=(), tip=None, hide_builtin=False):
    panel = ""
    # Button frame also closes two review gaps: trigger named by the field label, and aria-controls.
    live = ROWS in ("button", "tree")
    trig = ' id="effects-trigger" aria-labelledby="effects-label effects-trigger" aria-controls="effects-panel"' if live else ""
    plabel = 'id="effects-panel" aria-labelledby="effects-label"' if live else 'aria-label="Choose effect"'
    body = groups(menu_for, hidden, many, collapsed, tip, hide_builtin)
    # Tree frame: one tree spans the scrolling list and the pinned footer, and New effect is its last item.
    new = '<div role="treeitem" class="mk-new" tabindex="-1">+ New effect</div>' if ROWS == "tree" else '<button type="button" class="mk-new">+ New effect</button>'
    scroll_cls = " mk-scrolling" if scroll else ""
    inner = f'''        <div class="mk-scroll{scroll_cls}">
{body}
        </div>
          <div class="mk-foot">{new}</div>'''
    if ROWS == "tree":
        inner = f'''        <div role="tree" class="mk-tree" aria-labelledby="effects-label">
{inner}
        </div>'''
    if popup:
        panel = f'''
        <div class="mk-panel-pop" role="dialog" {plabel}>
{inner}
        </div>'''
    return f'''    <div class="db-controls mk-picker field">
      <label class="field-label" id="effects-label">Effects</label>
      <div class="dropdown dropdown-fill{" open" if popup else ""}">
        <button type="button" class="dropdown-trigger"{trig} aria-haspopup="dialog" aria-expanded="{str(popup).lower()}"><span class="mk-trigger-main"><span class="dropdown-label">{label}</span></span>{CHEV}</button>{panel}
      </div>
    </div>'''


def device(kind):
    v = '<div class="field"><label class="field-label">Monitor</label><div class="dropdown dropdown-fill"><button type="button" class="dropdown-trigger"><span class="dropdown-label">Auto (primary)</span>' + CHEV + '</button></div></div>'
    a = '<p class="status-text device-field-hint">Uses your system\'s default audio device.</p>'
    return {"audio": a, "both": v + "\n      " + a}[kind]


def skeleton(picker_html, dev, extra=""):
    return TOP + "\n" + picker_html + f'''
    <div class="db-top-tier">
      <div class="db-device-slot">{dev}</div>
    </div>
    <div class="db-accordions">
{ACCS}
    </div>
''' + VERSION + extra


SCROLL_JS = '<script>document.querySelector(".mk-scroll").scrollTop = 150;</script>'
LIVE_JS = '''
    <p class="sr-only" role="status" id="mk-live"></p>
    <p class="status-text mk-log" aria-hidden="true">Last action: <span id="mk-log">none</span></p>
    <script src="frame8.js"></script>'''
w = lambda name, title, body: open(f"{out}/{name}", "w", encoding="utf-8").write(page(title, body))
w("frame1.html", "kep2 frame 1: built-in row menu", skeleton(picker("Fire", True, "Screen colors", hidden="collapsed"), device("audio")))
w("frame2.html", "kep2 frame 2: hidden group open", skeleton(picker("Fire", True, "Plasma", hidden="expanded"), device("audio")))
w("frame3.html", "kep2 frame 3: long list scrolls", skeleton(picker("Fire", True, None, hidden="collapsed", many=True, scroll=True), device("audio")) + SCROLL_JS)
CUE_POS = "right"
w("frame4.html", "kep2 frame 4a: check right", skeleton(picker("Fire", True, None, hidden="collapsed", collapsed=("builtin", "custom")), device("audio")))
CUE_POS = "left"
w("frame4b.html", "kep2 frame 4b: check left", skeleton(picker("Fire", True, None, hidden="collapsed", collapsed=("builtin", "custom")), device("audio")))
CUE_POS = "right"
w("frame5.html", "kep2 frame 5: description tooltip", skeleton(picker("Fire", True, None, hidden="collapsed", tip="Rainbow drift"), device("audio")))
w("frame6.html", "kep2 frame 6: built-ins hidden", skeleton(picker("Fire", True, "Screen colors", hidden="expanded", hide_builtin=True), device("audio")))
NO_CUSTOM = True
w("frame7.html", "kep2 frame 7: only hidden", skeleton(picker("No effect selected", True, None, hidden="expanded", hide_builtin=True), ""))
NO_CUSTOM = False
ROWS = "button"
w("frame8.html", "kep2 frame 8: button rows, keyboard live", skeleton(picker("Fire", True, None, hidden="collapsed"), device("audio"), LIVE_JS))
ROWS = "tree"
w("frame9.html", "kep2 frame 9: tree, keyboard live", skeleton(picker("Fire", True, None, hidden="collapsed"), device("audio"), LIVE_JS.replace("frame8.js", "frame9.js")))
ROWS = "radio"
w("frame1-both.html", "kep2 frame 4: both effect closed", skeleton(picker("Rainbow drift"), device("both")))


def fig(cap, src, cls, h):
    return f'<figure><figcaption>{cap}</figcaption><iframe class="{cls}" style="height:{h}px" src="{src}"></iframe></figure>'


idx = f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>kep2 static mocks (Aurora-kep2.2)</title>
  <style>
    body {{ margin: 0; padding: 24px; background: #111; color: #eee; font: 14px/1.4 system-ui, sans-serif; }}
    h1 {{ font-size: 20px; margin: 0 0 4px; }}
    h2 {{ font-size: 16px; margin: 32px 0 4px; }}
    p {{ margin: 0 0 8px; color: #bbb; max-width: 760px; }}
    .row {{ display: flex; gap: 24px; align-items: flex-start; flex-wrap: wrap; }}
    figure {{ margin: 0; }}
    figcaption {{ font-size: 12px; color: #999; margin-bottom: 6px; }}
    iframe {{ border: 1px solid #444; background: #0a0a0a; display: block; }}
    .w {{ width: 760px; }} .n {{ width: 390px; }}
  </style>
</head>
<body>
  <h1>Effect dropdown with an attached panel (Aurora-kep2.2)</h1>
  <p>No Video/Audio toggle. An "Effects" label sits above the trigger like Monitor below it. The panel is non-modal (no scrim, closes on outside click or Esc), a labeled dialog holding radios and buttons. Built-in rows can only be duplicated or hidden. Hidden is a collapsed-by-default group with no count and only renders when non-empty. Every group header collapses. No row is dimmed: failures such as a missing input surface only through the shell banner after the click. The running effect has no Hide item. Rows carry no input badges. A secondary text line under the name is used only for "Built-in" on hidden built-ins.</p>

  <h2>Frame 1: built-in row menu</h2>
  <p>Fire selected. Built-in rows offer Duplicate and Hide. Hidden is collapsed at the bottom. In the real panel the row menu must render outside the scroll region so it is not clipped.</p>
  <div class="row">
    {fig("~760px, open", "frame1.html", "w", 640)}
    {fig("390px, open", "frame1.html", "n", 640)}
  </div>

  <h2>Frame 2: custom row menu, Hidden expanded</h2>
  <p>Unhide and Duplicate on a hidden row. The Hidden header is a disclosure button (aria-expanded).</p>
  <div class="row">
    {fig("390px, Hidden open, row menu on a hidden effect", "frame2.html", "n", 640)}
  </div>

  <h2>Frame 3: long list</h2>
  <p>The list scrolls inside the panel. Group headers stick within their section and the New effect footer stays pinned.</p>
  <div class="row">
    {fig("390px, scrolled", "frame3.html", "n", 640)}
  </div>

  <h2>Frame 4: groups collapsed</h2>
  <p>Every group header is a disclosure button with the chevron on the left edge, lined up with New effect. A collapsed group that holds the selected effect shows a check on the header (the trigger already names the effect). Two placements to compare.</p>
  <div class="row">
    {fig("4a: check on the right of the header", "frame4.html", "n", 640)}
    {fig("4b: check left of the word, after the chevron", "frame4b.html", "n", 640)}
  </div>

  <h2>Frame 5: description tooltip</h2>
  <p>Hovering or focusing a row shows its description (role=tooltip, linked by aria-describedby on the radio). Touch has no hover, so the description is a supplement and nothing essential lives only in it. Like the row menu, it must render outside the scroll region.</p>
  <div class="row">
    {fig("390px, hover on Rainbow drift", "frame5.html", "n", 640)}
  </div>

  <h2>Frame 6: both built-ins hidden</h2>
  <p>A group renders only when it holds a visible effect. With both built-ins hidden the Built-in header is gone and they sit under Hidden. Custom and Hidden follow the same rule.</p>
  <div class="row">
    {fig("390px, built-ins hidden", "frame6.html", "n", 640)}
  </div>

  <h2>Frame 6b: built-ins hidden and no custom effects</h2>
  <p>Only Hidden renders. Nothing is visible to select, which conflicts with the rule that the selected effect cannot be hidden. See the open question.</p>
  <div class="row">
    {fig("390px, only Hidden (Screen colors hovered, Music pulse at rest)", "frame7.html", "n", 640)}
  </div>

  <h2>Frame 8: button rows instead of radios (interactive)</h2>
  <p>Same look as frame 1 with rows built as buttons (aria-current on the running effect) inside role=group. This frame works: Up/Down/Home/End move focus without switching, Enter, Space or click switches, Right and Left hop between a row and its ellipsis, Esc returns to the trigger, group headers collapse. The list is one tab stop. The trigger is named "Effects, Fire". The last action prints under the page and is announced through a live region.</p>
  <div class="row">
    {fig("390px, click a row then use the keyboard", "frame8.html", "n", 640)}
  </div>

  <h2>Frame 9: tree (interactive)</h2>
  <p>The list is an ARIA tree: group headers are expandable nodes and effects are their children, all in one arrow sequence. Up/Down walk headers and rows. Right expands a group or steps into it, Left collapses it or steps out to its header. Enter or Space switches on a row and toggles on a header. Typing a letter jumps to a match. A treeitem cannot hold a button, so the ellipsis is mouse-only. On a row, Right opens its actions menu (like stepping into a group) and Left or Esc closes it. Shift+F10 and the Menu key do the same. The row announces that it has a menu. Hide and Unhide work and show where focus lands. The panel is one tab stop. New effect is the last item in the arrow sequence, so Down from the last row (or End) lands on it and Up returns.</p>
  <div class="row">
    {fig("390px, click a row then use the keyboard", "frame9.html", "n", 640)}
  </div>

  <h2>Frame 7: closed</h2>
  <div class="row">
    {fig("390px, closed, both effect", "frame1-both.html", "n", 640)}
  </div>

</body>
</html>
'''
open(f"{out}/index.html", "w", encoding="utf-8").write(idx)
