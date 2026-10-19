# Domain glossary

- **Category**: a consent category (`necessary`, `analytics`, …) registered with the banner. `readOnly` categories are always granted.
- **GPC state**: `none`, `default-off` (signal + `allowGpcOverride`) or `locked` (signal, no override).
- **Clamp / clamped category**: a category GPC turns off. The `gpc: true` categories, else the gate category; never `readOnly`. Locked: unregistered and never effective. Default-off: registered, off until the visitor opts in.
- **Category plan**: everything derived from config + GPC state for one page load: what the library registers, which cookies to erase, effective consent for the library's state, and the Keep off choice (`core/categories.ts`).
- **Library session**: one run of vanilla-cookieconsent: reports `'load'` and `'choice'` changes, reads its state, shows the UI, resets (`core/library.ts`).
- **Snapshot**: the effective consent state (`stage`, `recorded`, `gpc`, `categories`); the `consent:change` detail.
- **Change**: a distinct move from one snapshot to the next, caused by a `'load'` or a `'choice'`. Its `prev` on the first change is the snapshot before the library reported (`pending` or `awaiting-age`). It carries whether the reload policy reloads the page.
- **Snapshot store**: owns the current snapshot for one page load and turns library session reports into changes (`core/snapshot.ts`).
- **Age gate**: an optional site-rendered gate; until the visitor passes it (`confirmAge()` or the age cookie) nothing in the consent stack runs. One `AgeGate` per page owns the cookie, the pass and the wait (`ageGate.ts`).
- **Integration**: a vendor consent-signal adapter (`googleConsentMode`, `metaPixel`) that receives each snapshot change.
- **Gated element**: a custom element whose content mounts only while its category is granted.
