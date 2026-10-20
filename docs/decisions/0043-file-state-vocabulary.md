# Decision 0043: One File-State Vocabulary For Desktop And Phone

## Status

Accepted

## Context

The desktop and phone file lists showed the same review state in different ways:

- **Desktop** had no change-type marker, put review state in a leading dot, and
  marked changed-after-review files with a pulsing dot after the name.
- **Phone** showed change type as a letter tile, put review state at the end of
  the row, and marked a changed-after-review file five ways at once: a left border,
  a dot after the name, a "Review again" chip, an alert icon and a tinted row.

Files with no line changes rendered `+0 -0` with five red blocks on desktop and
grey blocks on the phone. Someone switching between the two clients had to relearn
what each marker meant. The pulsing dots also went against the quiet-motion rule in
[`professional-ui-redesign.md`](../professional-ui-redesign.md).

## Decision

Both clients encode file state the same way:

| Signal               | Encoding                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| Change type          | Letter tile at the start of the row: `A` green, `M`/`R` blue, `D` muted                        |
| Review state         | Trailing glyph: hollow ring unreviewed, green check reviewed, amber alert changed after review |
| Changed after review | Amber left rule on the row plus the amber glyph; no pulsing, no extra dots, no row tint        |
| Line counts          | `+a -d` on one line; the block bar only where there is width; nothing for zero line changes    |

Wording follows the same rule on both clients:

- "changed after review" in sentences and accessible labels;
- "Review again" as the short chip label, where a client shows one;
- "needs attention" for the count of such files.

The tab bar and the collapsed file rail keep their compact coloured dots. They
summarise state rather than list files.

## Consequences

- Each client keeps platform-appropriate sizes, but a reviewer reads the same marker
  the same way on both.
- Amber stays reserved for the changed-after-review state, as the visual direction
  requires.
- New file-list states must be added to this table and to both clients together.
