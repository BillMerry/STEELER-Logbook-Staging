# 1.3.5-rc6 — Full-refill comparisons

Refill history now uses full refills as the only comparison boundaries. A full row includes all partial litres and costs since the preceding full refill, and compares them with recorded engine use and unique OOB nights across that same period. Partial fills need no fuel reading and show purchase amounts only. They are marked as included in a subsequent full refill or waiting for the next one. Totals/averages use full rows only to avoid counting partial purchases twice; pending partials remain outside totals. The first full refill establishes a baseline.

The separate secondary full-to-full table and technical Details dropdown are removed. A Location dropdown shows the location entered on each refill; existing blank locations remain “Not recorded”. The refuel entry form supports free text and saved-port suggestions.

Refill history, Consecutive nights on board and Passage Analytics are independently collapsible and closed by default. Their current open/closed state is preserved while figures refresh.

The optional manual figure is now explicitly fuel used since the previous full refill (`refuel.fuelUsedSinceFull`) and shown only for full fills. The old per-refill field remains stored, but is used only where its interval is already a full-to-full period without partial fills. It is never silently treated as a whole cycle across partial fills. Location and the new field are backed up and synced with their original entries.

Checks include multiple partial fills without boundary readings, carry-forward and pending partials, no double counting, legacy/manual figures, deleted partials, location save/restore, and browser checks for the three collapsed sections. Tank estimates remain on the existing rc5 logic. Staging only; live promotion is separate.
