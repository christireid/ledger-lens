<!-- PR contract — spec §25.2. Every box is normative; delete only rows that
     genuinely cannot apply (e.g. no UI change → state coverage row). -->

## What & why

<!-- One paragraph. Link the owning spec section(s). -->

## Checklist (§25.2)

- [ ] **Spec-first (§17.5):** any API, error-code, schema, or budget change amends the owning spec section in this PR — code and spec never diverge across a merge.
- [ ] **Cross-reference check:** section numbers cited in code comments and tests still point at the right sections after the amendment.
- [ ] **Migration check:** forward-only; expand-and-contract for renames (§23.6); rollback lever named below (redeploy / forward-fix / flag, §23.8).
- [ ] **State coverage:** UI changes enumerate which §03.5 states were touched and show kitchen-sink coverage (§04.13).
- [ ] **A11y and perf:** new patterns carry a §19.3-style spec reference; budget-adjacent changes cite the §20.2 table and cross-check `perf-budgets.json` ceilings against §20.3.
- [ ] **Fixture discipline:** changes to the demo seed regenerate dependent goldens in this PR (§15.7, §12.8, §23.10).

**Rollback lever for this change:** <!-- redeploy | forward-fix | flag -->
