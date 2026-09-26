# STEELER Testbed 1.3.5-rc2

Follow-up to rc1 based on user testing:

- Home uses six compact metric columns, including average speed, in a single row. Reduced gaps and padding, flexible widths and wrapping inside fields prevent long values from pushing a metric onto a second row. The six-column strip is retained on tablet and phone layouts.
- Replaced the category-picker button/modal with inline suggestions styled like Origin/Destination port suggestions. Focus or typing shows up to six matching existing categories. Selecting a suggestion replaces the category at the cursor and preserves other comma-separated categories. Other already-selected categories and categories found only on deleted passages are excluded. New categories remain free text. Escape dismisses suggestions; Arrow Down focuses the first suggestion.
- App and service-worker versions are aligned at 1.3.5-rc2. No storage schema, sync protocol or live changes.

Validation: syntax and cached-asset checks, existing DOM/browser regression suite updated for category suggestions, and browser layout assertions at 1280, 1024, 768 and 390 pixels. Home layout visually inspected in the local app browser. The earlier iPad/offline and real two-device acceptance gates still apply before live promotion.
