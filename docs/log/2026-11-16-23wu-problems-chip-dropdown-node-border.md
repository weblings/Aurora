# Graph editor: problems chip, dropdown and node border match the mock

Id: 23wu-problems-chip-dropdown-node-border

`Aurora-23wu` (P3). The deltas were found by comparing a build screenshot with `web/ui/Static_GraphEditor_Mocks_Grille`.

## What changed

- Chip: semibold in the warning tone, chevron kept in the default colour. The refused-save ping and callout borders are solid warning colour (were dashed white).
- Dropdown: rows use Grille menu-item metrics (6 px by 12 px padding, 6 px radius, `popup-bg-hover`). Title 13 px semibold default colour, message 12 px secondary. Width fits the content up to 320 px. The extra list padding is gone, so only the popover's own 4 px remains.
- Node: a node with problems is a solid 1 px warning border and nothing else. The header badge, port mark, param outline, inline param messages and the loose-message list are removed (they were never mocked, only the border was). `ParamWidget` lost its `problems` prop.
- Browser checks that counted `.problem-badge` or `.problem-mark` now count `.aurora-node-problem`.
- Kept: the dropdown row title still reads `Title (id)` from `nodeLabels`, which tells two nodes of one type apart. The mock shows the title alone.

## Verification

- `tsc --noEmit` clean, vitest 253/253.
- Windows release app rebuilt and the result was checked by the owner in the running editor.
- Browser checks `gate`, `add-node` and `refused-save` were edited but not run.

## Lessons

- A mock's hand-drawn popover is not a Grille spec, see "A mock's hand-drawn popover is not a Grille spec" in lessons/components.
