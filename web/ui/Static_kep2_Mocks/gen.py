# Generates every frame and index.html for Aurora-kep2.2. mock.css is hand-written.
# Usage: python gen.py [out_dir]  (default: this folder)
import os
import sys
out = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
CSS = ["tokens", "page", "shell", "forms", "dropdown", "dashboard", "tuning"]
LINKS = "\n".join(f'  <link rel="stylesheet" href="../styles/{c}.css" />' for c in CSS) + '\n  <link rel="stylesheet" href="mock.css" />'
CHEV = '<img src="../icons/chevron-down.svg" alt="" class="mk-chev" />'


def page(title, body, banner=""):
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
{LINKS}
</head>
<body>{banner}
  <div id="screen-container">
{body}
  </div>
</body>
</html>
'''


def top(paused=False, failed=False):
    pause = '<button type="button" class="btn btn-secondary btn-icon" aria-label="Resume"><img src="../icons/play-rockyroad.svg" alt="" class="top-bar-trailing-icon" /></button>' if paused else '<button type="button" class="btn btn-secondary btn-icon" aria-label="Pause"><img src="../icons/pause-rockyroad.svg" alt="" class="top-bar-trailing-icon" /></button>'
    if failed:
        pause = ""  # A failed host has nothing to pause, so the button is hidden, not disabled.
    return f'''    <div class="top-bar-slot db-top-bar-slot">
      <div class="top-bar top-bar-with-logo">
        <span></span>
        <h1 class="top-bar-title"><img src="../icons/aurora-logo.png" alt="Aurora" class="top-bar-logo" /></h1>
        <div class="top-bar-trailing">
          {pause}
          <button type="button" class="btn btn-secondary btn-icon top-bar-power-btn" aria-label="Stop"><img src="../icons/power-svgrepo-com.svg" alt="" class="top-bar-trailing-icon" /></button>
        </div>
      </div>
    </div>'''


def banner(text, actions=""):
    # Failed build: no X, and a button only when one click can resolve the error (ErrorOverlay.md).
    return f'''
  <div id="shell-banner-slot"><div class="shell-banner"><div class="shell-banner-inner"><div class="shell-banner-row"><div class="shell-banner-content">
    <p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> {text}</p>{actions}
  </div></div></div></div></div>'''


def acc(t):
    return f'      <div><div class="accordion-section"><button type="button" class="accordion-header" aria-expanded="false"><span class="accordion-title">{t}</span><span class="accordion-chevron" aria-hidden="true"></span></button><div class="accordion-content" hidden></div></div></div>'


ACCS = "\n".join(acc(t) for t in ["Zone Mapping", "Tuning", "Output", "Paired devices"])
VERSION = '    <div class="db-version"><p>v1.1.4</p></div>'

ROWMENU_CUSTOM = ["Edit graph", "Rename", "Duplicate", "Move up", "Move down", "Hide", "Delete"]
ROWMENU_BUILTIN = ["Edit graph", "Duplicate", "Hide"]
ROWMENU_HIDDEN = ["Edit graph", "Unhide", "Duplicate"]
ROWMENU_HIDDEN_CUSTOM = ["Edit graph", "Rename", "Unhide", "Duplicate", "Delete"]


def rowmenu(items, desc=None):
    # A touch-opened menu leads with the description, which is not a menuitem, so the menu points at it.
    h = '<div class="mk-rowmenu" role="menu"' + (' aria-describedby="mk-menu-desc"><p class="mk-menu-desc" id="mk-menu-desc">' + desc + '</p>' if desc else '>')
    for it in items:
        d = " dropdown-option-divided" if it == "Delete" else ""
        h += f'<button type="button" class="dropdown-option{d}" role="menuitem">{it}</button>'
    return h + '</div>'


def confirm(name, fallback=None):
    # Delete's second step replaces the row menu in the same spot. Focus starts on Cancel.
    run = f" It&rsquo;s running now, so {fallback} starts instead." if fallback else ""
    return f'''<div class="mk-rowmenu mk-confirm" role="alertdialog" aria-labelledby="mk-confirm-t" aria-describedby="mk-confirm-b"><p class="mk-confirm-t" id="mk-confirm-t">Delete {name}?</p><p class="mk-confirm-b" id="mk-confirm-b">{run.strip()} This can&rsquo;t be undone.</p><div class="mk-confirm-actions"><button type="button" class="btn btn-secondary mk-focus">Cancel</button><button type="button" class="btn btn-primary">Delete</button></div></div>'''


def startmenu(items):
    # New effect asks for a start point. The label is the menu's name, not an item.
    h = '<div class="mk-rowmenu mk-startmenu" role="menu" aria-label="Start from" data-row="new"><p class="mk-menu-desc" aria-hidden="true">Start from</p>'
    return h + "".join(f'<button type="button" class="dropdown-option" role="menuitem">{it}</button>' for it in items) + '</div>'


DESC = {
    "Screen colors": "Matches the lights to the colors at the edges of your screen.",
    "Music pulse": "Pulses the lights with the beat of whatever is playing.",
    "Fire": "Warm flicker that flares with bass and loud moments.",
    "Rainbow drift": "Slow color wheel that speeds up with audio energy and screen motion.",
    "Candle": "Soft, steady glow that follows the dominant screen color.",
    "Strobe": "Hard white flashes on every beat.",
    "Plasma": "Swirling colors sampled from the screen.",
}


LAYERS = []  # tree frames: tooltips and row menus, rendered in the panel outside the tree


def opt(name, sel=False, secondary=None, menu=None, tip=False, hov=False, rename=None, rename_err=None, focus=False):
    tree = ROWS == "tree"
    cls = "mk-opt" + (" selected" if sel else "") + (" tip-on" if tip and not tree else "") + (" hov" if hov else "") + (" menu-open" if menu and tree else "") + (" mk-focus" if focus else "")
    rid = name.lower().replace(" ", "-")
    chk = "&#10003;" if sel else ""
    stxt = f'<div class="mk-opt-secondary">{secondary}</div>' if secondary else ""
    desc = DESC.get(name, "A custom effect.")
    tab_more = ' tabindex="-1" aria-hidden="true"' if tree else ' tabindex="-1"'
    more = f'<button type="button" class="mk-more{" open" if menu else ""}" aria-label="Actions for {name}" aria-haspopup="menu" aria-expanded="{str(bool(menu)).lower()}"{tab_more}>&#8943;</button>'
    inner = f'<span class="mk-check" aria-hidden="true">{chk}</span><span class="mk-opt-text"><span class="mk-opt-name">{name}</span>{stxt}</span>'
    if rename is not None:
        # Rename edits in place: the field takes the row's name and the ellipsis goes until it closes.
        err = f'<span class="mk-rename-err" id="{rid}-rename-err"><span class="warn-glyph" aria-hidden="true"></span> {rename_err}</span>' if rename_err else ""
        described = f' aria-describedby="{rid}-rename-err" aria-invalid="true"' if rename_err else ""
        field = f'<input type="text" class="text-input mk-rename" value="{rename}" maxlength="80" aria-label="Rename {name}"{described} />'
        return f'''            <div class="mk-opt mk-renaming{" selected" if sel else ""}" data-id="{rid}"><span class="mk-check" aria-hidden="true">{chk}</span><span class="mk-opt-text">{field}{err}</span></div>'''
    if tree:
        # A treeitem cannot hold a button, so the ellipsis is mouse-only and Right opens the row menu.
        pick = f'<div role="treeitem" class="mk-pick" tabindex="{0 if sel else -1}" aria-selected="{str(sel).lower()}"' + f' aria-describedby="{rid}-tip" aria-haspopup="menu" aria-keyshortcuts="ArrowRight Shift+F10">{inner}</div>'
        # Tooltip and menu leave the tree and its scroll region; layers.js places them under the row.
        LAYERS.append(f'<div class="mk-tip" role="tooltip" id="{rid}-tip" data-row="{rid}"{"" if tip else " hidden"}>{desc}</div>')
        if menu and "mk-confirm" in menu:
            LAYERS.append(menu.replace('class="mk-rowmenu mk-confirm"', f'class="mk-rowmenu mk-confirm" data-row="{rid}"', 1))
        elif menu:
            LAYERS.append(menu.replace('class="mk-rowmenu"', f'class="mk-rowmenu" data-row="{rid}" aria-label="Actions for {name}"', 1))
        return f'''            <div class="{cls}" data-id="{rid}">{pick}{more}</div>'''
    # Row buttons: one tab stop for the list (roving tabindex), arrows move focus without committing.
    pick = f'<button type="button" class="mk-pick" tabindex="{0 if sel else -1}"' + (' aria-current="true"' if sel else "") + f' aria-describedby="{rid}-tip">{inner}</button>'
    return f'''            <div class="{cls}">{pick}{more}<div class="mk-tip" role="tooltip" id="{rid}-tip">{desc}</div>{menu or ""}</div>'''


MANY = ["Aurora borealis", "Ember glow", "Ocean swell", "Neon pulse", "Sunset fade", "Strobe party", "Forest canopy", "Lava lamp", "Night drive", "Heartbeat"]


NO_CUSTOM = False
ROWS = "tree"


def section(gid, title, rows, collapsed=False, cue=None):
    right = '<span class="mk-cue" aria-hidden="true">&#10003;</span><span class="sr-only">contains the selected effect</span>' if (collapsed and cue) else ""
    if ROWS == "tree":
        # The group node is the treeitem. Its name comes from the header, not its children.
        cue_hidden = "" if right else " hidden"
        return f'''          <div class="mk-section" role="treeitem" tabindex="-1" aria-expanded="{str(not collapsed).lower()}" aria-labelledby="{gid}"><div class="mk-group mk-group-toggle"><span class="mk-head" id="{gid}"><img src="../icons/chevron-down.svg" alt="" class="mk-chev mk-twisty" /><span>{title}</span><span class="mk-cue" aria-hidden="true"{cue_hidden}>&#10003;</span><span class="sr-only"{cue_hidden}>, contains the selected effect</span></span></div>
          <div role="group" id="{gid}-list"{" hidden" if collapsed else ""}>
{rows}
          </div></div>'''
    return f'''          <div class="mk-section"><h3 class="mk-group mk-group-toggle"><button type="button" id="{gid}" aria-expanded="{str(not collapsed).lower()}" aria-controls="{gid}-list"><img src="../icons/chevron-down.svg" alt="" class="mk-chev mk-twisty" /><span>{title}</span>{right}</button></h3>
          <div role="group" id="{gid}-list" aria-labelledby="{gid}"{" hidden" if collapsed else ""}>
{rows}
          </div></div>'''


def groups(menu_for=None, hidden=None, many=False, collapsed=(), tip=None, hide_builtin=False, over=None, sel="Fire", extra=()):
    # A group renders only when it holds a visible effect. `over` gives one row's opt() arguments.
    over = over or {}
    def bm(n): return rowmenu(ROWMENU_BUILTIN) if menu_for == n else None
    def cm(n): return rowmenu(ROWMENU_CUSTOM) if menu_for == n else None
    def hm(n): return rowmenu(ROWMENU_HIDDEN if n in ("Screen colors", "Music pulse") else ROWMENU_HIDDEN_CUSTOM) if menu_for == n else None
    t = lambda n: n == tip
    def o(n, **kw): return opt(n, **{**kw, **over.get(n, {})})
    builtin = [] if hide_builtin else [o("Screen colors", menu=bm("Screen colors"), tip=t("Screen colors")), o("Music pulse", menu=bm("Music pulse"), tip=t("Music pulse"))]
    custom = [o("Fire", sel=sel == "Fire", tip=t("Fire")), o("Rainbow drift", menu=cm("Rainbow drift"), tip=t("Rainbow drift")), o("Candle", tip=t("Candle"))]
    custom += [o(n) for n in extra]
    if many:
        custom += [opt(n, menu=cm(n)) for n in MANY]
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


def picker(label, popup=False, menu_for=None, hidden=None, many=False, scroll=False, collapsed=(), tip=None, hide_builtin=False, switching=None, failed=None, over=None, sel="Fire", extra=(), editor=True, new_menu=None):
    panel = ""
    # The trigger is named by the field label, and aria-controls points at the panel.
    trig = ' id="effects-trigger" aria-labelledby="effects-label effects-trigger" aria-controls="effects-panel"'
    # Switch states: the label stays on what is running, the pick only shows in the status line.
    status = ""
    if switching:
        trig = ' class="dropdown-trigger" disabled aria-busy="true"' + trig
        status = f'\n      <p class="status-text db-effect-switching" role="status">Switching to {switching}&hellip;</p>'
    else:
        trig = ' class="dropdown-trigger"' + trig
    if failed:
        status = f'\n      <p class="status-text status-text-error"><span class="warn-glyph" aria-hidden="true"></span> {failed}</p>'
    plabel = 'id="effects-panel" aria-labelledby="effects-label"'
    body = groups(menu_for, hidden, many, collapsed, tip, hide_builtin, over, sel, extra)
    if new_menu:
        LAYERS.append(new_menu)
    layers = "".join(f"\n          {l}" for l in LAYERS)
    LAYERS.clear()
    # Tree frame: one tree spans the scrolling list and the pinned footer, and New effect is its last item.
    nid = ' data-id="new" aria-haspopup="menu" aria-expanded="true"' if new_menu else ""
    new = f'<div role="treeitem" class="mk-new{" hov" if new_menu else ""}" tabindex="-1"{nid}>+ New effect</div>' if ROWS == "tree" else '<button type="button" class="mk-new">+ New effect</button>'
    scroll_cls = " mk-scrolling" if scroll else ""
    # A build with no graph editor has no New effect, so the footer goes with it.
    foot = f'\n          <div class="mk-foot">{new}</div>' if editor else ""
    inner = f'''        <div class="mk-scroll{scroll_cls}">
{body}
        </div>{foot}'''
    if ROWS == "tree":
        inner = f'''        <div role="tree" class="mk-tree" aria-labelledby="effects-label">
{inner}
        </div>{layers}'''
    if popup:
        panel = f'''
        <div class="mk-panel-pop" role="dialog" {plabel}>
{inner}
        </div>'''
    return f'''    <div class="db-controls mk-picker field">
      <label class="field-label" id="effects-label">Effect</label>
      <div class="dropdown dropdown-fill{" open" if popup else ""}">
        <button type="button"{trig} aria-haspopup="dialog" aria-expanded="{str(popup).lower()}"><span class="mk-trigger-main"><span class="dropdown-label">{label}</span></span>{CHEV}</button>{panel}
      </div>{status}
    </div>'''


def device(kind):
    v = '<div class="field"><label class="field-label">Monitor</label><div class="dropdown dropdown-fill"><button type="button" class="dropdown-trigger"><span class="dropdown-label">Auto (primary)</span>' + CHEV + '</button></div></div>'
    a = '<p class="status-text device-field-hint">Uses your system\'s default audio device.</p>'
    return {"audio": a, "video": v, "both": v + "\n      " + a}[kind]


def skeleton(picker_html, dev, extra="", paused=False, failed=False):
    return top(paused, failed) + "\n" + picker_html + f'''
    <div class="db-top-tier">
      <div class="db-device-slot">{dev}</div>
    </div>
    <div class="db-accordions">
{ACCS}
    </div>
''' + VERSION + (LAYERS_JS if ROWS == "tree" else "") + extra


LAYERS_JS = '\n    <script src="layers.js"></script>'
SCROLL_JS = '<script>document.querySelector(".mk-scroll").scrollTop = 150;</script>'
LIVE_JS = '''
    <p class="sr-only" role="status" id="mk-live"></p>
    <p class="status-text mk-log" aria-hidden="true">Last action: <span id="mk-log">none</span></p>
    <script src="frame8.js"></script>'''
w = lambda name, title, body, bn="": open(f"{out}/{name}", "w", encoding="utf-8").write(page(title, body, bn))
w("frame1.html", "kep2 frame 1: built-in row menu", skeleton(picker("Fire", True, "Screen colors", hidden="collapsed"), device("audio")))
w("frame2.html", "kep2 frame 2: hidden group open", skeleton(picker("Fire", True, "Plasma", hidden="expanded"), device("audio")))
w("frame3.html", "kep2 frame 3: long list scrolls", skeleton(picker("Fire", True, "Lava lamp", hidden="collapsed", many=True, scroll=True), device("audio"), SCROLL_JS))
w("frame4.html", "kep2 frame 4: groups collapsed", skeleton(picker("Fire", True, None, hidden="collapsed", collapsed=("builtin", "custom")), device("audio")))
w("frame5.html", "kep2 frame 5: description tooltip", skeleton(picker("Fire", True, None, hidden="collapsed", tip="Rainbow drift"), device("audio")))
w("frame6.html", "kep2 frame 6: built-ins hidden", skeleton(picker("Fire", True, "Screen colors", hidden="expanded", hide_builtin=True), device("audio")))
NO_CUSTOM = True
w("frame7.html", "kep2 frame 7: only hidden", skeleton(picker("No effect running", True, None, hidden="expanded", hide_builtin=True), ""))
NO_CUSTOM = False
ROWS = "button"
w("frame8.html", "kep2 frame 8: button rows, keyboard live", skeleton(picker("Fire", True, None, hidden="collapsed"), device("audio"), LIVE_JS))
ROWS = "tree"
w("frame9.html", "kep2 frame 9: tree, keyboard live", skeleton(picker("Fire", True, None, hidden="collapsed"), device("audio"), LIVE_JS.replace("frame8.js", "frame9.js")))
w("frame1-both.html", "kep2 frame 4: both effect closed", skeleton(picker("Rainbow drift"), device("both")))
w("frame10.html", "kep2 frame 10: switching", skeleton(picker("Fire", switching="Rainbow drift"), device("audio")))
w("frame11.html", "kep2 frame 11: build failed, no action", skeleton(picker("No effect running"), device("video"), failed=True), banner("Couldn&rsquo;t start Rainbow drift: no audio input is set up."))
RETRY_ROW = '''
    <div class="shell-banner-actions"><button type="button" class="btn btn-secondary">Retry</button><a class="btn btn-secondary" style="text-decoration: none;" href="#">Open Settings</a></div>'''
w("frame11b.html", "kep2 frame 11b: build failed, Retry", skeleton(picker("No effect running"), device("video"), failed=True), banner("Couldn&rsquo;t start Rainbow drift: <strong>Screen Recording is off.</strong> Allow it in the macOS prompt if one appears, or turn it on in System Settings, then Retry.", RETRY_ROW))
w("frame13.html", "kep2 frame 13: request rejected, effect gone", skeleton(picker("Fire", failed="Rainbow drift no longer exists."), device("audio")))
w("frame13b.html", "kep2 frame 13b: request rejected, other causes", skeleton(picker("Fire", failed="Rainbow drift didn&rsquo;t start."), device("audio")))
w("frame12.html", "kep2 frame 12: paused", skeleton(picker("Fire"), device("audio"), paused=True))

# Aurora-kep2.6: what each row menu item leads to, and the menus in each gated state.
ROWMENU_CUSTOM_NO_EDITOR = [i for i in ROWMENU_CUSTOM if i != "Edit graph"]
ROWMENU_CUSTOM_NO_ADMIN = [i for i in ROWMENU_CUSTOM if i != "Delete"]
ANNOUNCE = lambda t: f'\n    <p class="sr-only" role="status">{t}</p>\n    <p class="status-text mk-log" aria-hidden="true">Announced: {t}</p>'
pick = lambda **kw: skeleton(picker(kw.pop("label", "Fire"), True, None, hidden="collapsed", **kw), device("audio"))
w("frame14.html", "kep2 frame 14: rename in place", pick(over={"Rainbow drift": {"rename": "Rainbow drift"}}))
w("frame14b.html", "kep2 frame 14b: rename, name taken", pick(over={"Rainbow drift": {"rename": "Candle", "rename_err": "Another effect is named Candle."}}))
w("frame15.html", "kep2 frame 15: delete confirm", pick(over={"Rainbow drift": {"menu": confirm("Rainbow drift")}}))
w("frame15b.html", "kep2 frame 15b: delete confirm, running effect", pick(over={"Fire": {"menu": confirm("Fire", "Screen colors")}}))
w("frame16.html", "kep2 frame 16: new effect start point", pick(new_menu=startmenu(["Screen colors", "Music pulse"])))
w("frame17.html", "kep2 frame 17: duplicated", skeleton(picker("Fire", True, None, hidden="collapsed", extra=("Fire (Copy)",), over={"Fire (Copy)": {"focus": True}}), device("audio"), ANNOUNCE("Duplicated as Fire (Copy).")))
w("frame18.html", "kep2 frame 18: no graph editor, custom row", pick(editor=False, over={"Rainbow drift": {"menu": rowmenu(ROWMENU_CUSTOM_NO_EDITOR)}}))
w("frame18b.html", "kep2 frame 18b: no graph editor, built-in row", pick(editor=False, over={"Screen colors": {"menu": rowmenu(["Duplicate", "Hide"])}}))
w("frame18c.html", "kep2 frame 18c: not Admin", pick(over={"Rainbow drift": {"menu": rowmenu(ROWMENU_CUSTOM_NO_ADMIN)}}))
w("frame19.html", "kep2 frame 19: light test", pick(label="Light test", sel=None, over={"Rainbow drift": {"menu": rowmenu(ROWMENU_CUSTOM)}}))
# The saved active effect underneath a test has no check, and its menu leaves out Delete (a delete would end the test).
w("frame19b.html", "kep2 frame 19b: light test, saved active row", pick(label="Light test", sel=None, over={"Fire": {"menu": rowmenu(["Edit graph", "Rename", "Duplicate", "Move down", "Hide"])}}))
w("frame20.html", "kep2 frame 20: long-press menu", pick(over={"Rainbow drift": {"menu": rowmenu(ROWMENU_CUSTOM, desc=DESC["Rainbow drift"])}}))


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
  <p>No Video/Audio toggle. An "Effect" label sits above the trigger like Monitor below it. The panel is non-modal (no scrim, closes on outside click or Esc), a labeled dialog holding an ARIA tree. Frame 9 is the working spec, frames 1-7 are static states of the same tree, and frame 8 is the rejected button-row alternative. Tooltips and row menus render in the panel outside the tree and its scroll region, under their row, flipped above it when they would leave the viewport. Built-in rows offer Edit graph, Duplicate and Hide. Hidden is a collapsed-by-default group with no count and only renders when non-empty. Every group header collapses. No row is dimmed: failures such as a missing input surface only after the click, through the shell banner (failed build) or an inline line (rejected request). The running effect has no Hide item. Rows carry no input badges. A secondary text line under the name is used only for "Built-in" on hidden built-ins.</p>

  <h2>Frame 1: built-in row menu</h2>
  <p>Fire selected. Built-in rows offer Edit graph, Duplicate and Hide. Hidden is collapsed at the bottom. The row menu sits in the panel outside the tree, under its row.</p>
  <div class="row">
    {fig("~760px, open", "frame1.html", "w", 640)}
    {fig("390px, open", "frame1.html", "n", 640)}
  </div>

  <h2>Frame 2: custom row menu, Hidden expanded</h2>
  <p>Edit graph, Unhide and Duplicate on a hidden built-in. A hidden custom row (Plasma here) also has Rename and Delete. The Hidden header is an expandable tree node (aria-expanded).</p>
  <div class="row">
    {fig("390px, Hidden open, row menu on a hidden effect", "frame2.html", "n", 640)}
  </div>

  <h2>Frame 3: long list</h2>
  <p>The list scrolls inside the panel. Group headers stick within their section and the New effect footer stays pinned. The Lava lamp menu would run off the bottom, so it flips above its row. It lives outside the scroll region, so the list does not clip it.</p>
  <div class="row">
    {fig("390px, scrolled, row menu near the bottom", "frame3.html", "n", 640)}
  </div>

  <h2>Frame 4: groups collapsed</h2>
  <p>Every group header is an expandable tree node with the chevron on the left edge, lined up with New effect. A collapsed group that holds the selected effect shows a check at the right of its header (the trigger already names the effect).</p>
  <div class="row">
    {fig("390px, groups collapsed", "frame4.html", "n", 640)}
  </div>

  <h2>Frame 5: description tooltip</h2>
  <p>Hovering or focusing a row shows its description (role=tooltip, linked by aria-describedby on the row). Like the row menu, it renders in the panel outside the tree and its scroll region. Touch has no hover, so the description is a supplement and nothing essential lives only in it.</p>
  <div class="row">
    {fig("390px, hover on Rainbow drift", "frame5.html", "n", 640)}
  </div>

  <h2>Frame 6: both built-ins hidden</h2>
  <p>A group renders only when it holds a visible effect. With both built-ins hidden the Built-in header is gone and they sit under Hidden. Custom and Hidden follow the same rule.</p>
  <div class="row">
    {fig("390px, built-ins hidden", "frame6.html", "n", 640)}
  </div>

  <h2>Frame 6b: built-ins hidden and no custom effects</h2>
  <p>Only Hidden renders. Its rows can still be picked: a hidden effect may run and keeps its check inside Hidden. Only the running effect's menu drops Hide.</p>
  <div class="row">
    {fig("390px, only Hidden (Screen colors hovered, Music pulse at rest)", "frame7.html", "n", 640)}
  </div>

  <h2>Frame 8: button rows (rejected, interactive)</h2>
  <p>Kept for the record: the tree in frame 9 was chosen. Same look as frame 1 with rows built as buttons (aria-current on the running effect) inside role=group. This frame works: Up/Down/Home/End move focus without switching, Enter, Space or click switches, Right and Left hop between a row and its ellipsis, Esc returns to the trigger, group headers collapse. The list is one tab stop. The trigger is named "Effect, Fire". The last action prints under the page and is announced through a live region.</p>
  <div class="row">
    {fig("390px, click a row then use the keyboard", "frame8.html", "n", 640)}
  </div>

  <h2>Frame 9: tree (the spec, interactive)</h2>
  <p>The list is an ARIA tree: group headers are expandable nodes and effects are their children, all in one arrow sequence. Up/Down walk headers and rows. Right expands a group or steps into it, Left collapses it or steps out to its header. Enter or Space switches on a row and toggles on a header. Typing a letter jumps to a match. A treeitem cannot hold a button, so the ellipsis is mouse-only. On a row, Right opens its actions menu (like stepping into a group) and Left or Esc closes it. Shift+F10 and the Menu key do the same. The row announces that it has a menu. Hide and Unhide work and show where focus lands. The panel is one tab stop. New effect is the last item in the arrow sequence, so Down from the last row (or End) lands on it and Up returns.</p>
  <div class="row">
    {fig("390px, click a row then use the keyboard", "frame9.html", "n", 640)}
  </div>

  <h2>Frame 7: closed</h2>
  <p>Also the success state of a switch: the label moves to the new effect only once the running pipeline confirms it, and the live region announces "Switched to Rainbow drift."</p>
  <div class="row">
    {fig("390px, closed, both effect", "frame1-both.html", "n", 640)}
  </div>

  <h2>Switch states</h2>
  <p>A pick closes the panel and focus returns to the trigger. The trigger text is always what is on the lights, never the pick. The pick shows only as a status line under the trigger.</p>
  <div class="row">
    {fig("10: switching. Disabled, aria-busy, Fire still named", "frame10.html", "n", 300)}
    {fig("12: paused. The effect keeps its name, the top bar shows Resume", "frame12.html", "n", 300)}
  </div>
  <h2>Failed build</h2>
  <p>The old effect stopped, the pick stays saved and the host is failed, so Pause is hidden. The banner names the effect and the reason, with no X. A button shows only when one click can resolve the error. Retry resends the saved config, so it helps when something can change outside Aurora, like a permission, and not when the input does not exist. The pickers follow the requested effect, as real controls only, so the default audio device sentence does not show here.</p>
  <div class="row">
    {fig("11: no audio input. Retry cannot fix it, so no button", "frame11.html", "n", 420)}
    {fig("11b: permission. Retry and Open Settings", "frame11b.html", "n", 520)}
  </div>
  <h2>Request rejected</h2>
  <p>Nothing ran, so the old effect keeps running and the trigger already says which. An inline line gives the cause and clears once the running effect changes.</p>
  <div class="row">
    {fig("13: unknown_effect. The effect was deleted elsewhere", "frame13.html", "n", 300)}
    {fig("13b: any other cause, such as a PUT that never arrived", "frame13b.html", "n", 300)}
  </div>
  <p>Saved but not applied shows the frame 7 look with the shell banner above. An unreachable daemon is the shell takeover. Neither adds a line here. With nothing set to run the trigger reads "No effect running" (frame 6b).</p>

  <h1 style="margin-top:48px">Row menu follow-on flows (Aurora-kep2.6)</h1>
  <p>What happens after each row menu item, and the menus in each gated state. Decisions are in the bead's design field.</p>

  <h2>Rename</h2>
  <p>The row's name becomes a text field holding the title, all selected, and the ellipsis goes until it closes. Enter or leaving the field saves. Esc cancels. An empty or unchanged name closes without a request. A name another effect already shows keeps the field open with a line under it. Focus returns to the row and the live region says "Renamed to X." Built-ins have no Rename.</p>
  <div class="row">
    {fig("14: editing", "frame14.html", "n", 640)}
    {fig("14b: the name is taken", "frame14b.html", "n", 640)}
  </div>

  <h2>Delete confirm</h2>
  <p>Delete replaces the row menu with a confirm in the same spot. Focus starts on Cancel, and Esc or Cancel goes back to the row. A Delete press counts only if it started on the confirm, so a double tap on the menu item cannot delete. For the running effect the confirm names the built-in that starts instead, and the delete then runs the switch states (panel closes, "Switching to Screen colors&hellip;"). Any other delete keeps the panel open, moves focus like Hide and says "X deleted."</p>
  <div class="row">
    {fig("15: not running", "frame15.html", "n", 640)}
    {fig("15b: running, names the built-in", "frame15b.html", "n", 640)}
  </div>

  <h2>New effect</h2>
  <p>New effect opens a Start from menu with the built-ins. Each opens the graph editor on that built-in, which already saves a built-in as a new effect. A build with only one built-in skips the menu. Starting from a custom effect is Duplicate then Edit graph, so the editor needs no new parameter.</p>
  <div class="row">
    {fig("16: start point", "frame16.html", "n", 640)}
  </div>

  <h2>Duplicate</h2>
  <p>The copy is titled "X (Copy)" ("X (Copy 2)", "X (Copy 3)" when taken), goes last in Custom, and never runs. The panel stays open, focus moves to the copy and it scrolls into view. It does not start a rename.</p>
  <div class="row">
    {fig("17: Fire duplicated as Fire (Copy)", "frame17.html", "n", 640)}
  </div>

  <h2>Gated menus</h2>
  <p>Gated items are left out, never shown disabled, like Hide on the running effect. Hidden custom rows carry Rename and Delete too, so Not Admin drops Delete there as well. Move up is left out on the first row of a group and Move down on the last.</p>
  <div class="row">
    {fig("18: no graph editor, custom row. No New effect footer", "frame18.html", "n", 640)}
    {fig("18b: no graph editor, built-in row", "frame18b.html", "n", 640)}
    {fig("18c: not Admin, no Delete", "frame18c.html", "n", 640)}
  </div>
  <p>Light test: the test is not a row, so no row is checked and every menu is unchanged. Menu items that never touch the running pipeline (Hide, Unhide, Move, Rename, Duplicate, Edit graph, New effect, Delete of another effect) leave the test alone. Picking a row ends it. Deleting the saved active effect underneath the test would also end it, so that row's menu leaves out Delete (frame 19b), and the shell banner's Stop test button is the way out. Keep and Revert stay with the client that started it.</p>
  <div class="row">
    {fig("19: light test running", "frame19.html", "n", 640)}
    {fig("19b: the saved active effect (Fire), no Delete", "frame19b.html", "n", 640)}
  </div>

  <h2>Long-press</h2>
  <p>A menu opened by touch (long-press on the row or a tap on the ellipsis) starts with the description as a plain line. Mouse and keyboard keep the tooltip instead. An effect with no description has no line.</p>
  <div class="row">
    {fig("20: long-press on Rainbow drift", "frame20.html", "n", 640)}
  </div>

</body>
</html>
'''
open(f"{out}/index.html", "w", encoding="utf-8").write(idx)
