# Domain glossary

- **Category**: a consent category (`necessary`, `analytics`, …) registered with the banner. `readOnly` categories are always granted.
- **GPC state**: `none`, `default-off` (signal + `allowGpcOverride`) or `locked` (signal, no override).
- **Clamp / clamped category**: a category GPC turns off. The `gpc: true` categories, else the gate category; never `readOnly`. Locked: unregistered and never effective. Default-off: registered, off until the visitor opts in.
- **Category plan**: everything derived from config + GPC state for one page load: what the library registers, which cookies to erase, effective consent for the library's state, and the Keep off choice (`core/categories.ts`).
- **Library session**: one run of vanilla-cookieconsent: reports `'load'` and `'choice'` changes, reads its state, shows the UI, resets (`core/library.ts`).
- **Snapshot**: the effective consent state (`stage`, `recorded`, `gpc`, `categories`); the `consent:change` detail.
- **Integration**: a vendor consent-signal adapter (`googleConsentMode`, `metaPixel`) that receives each snapshot change.
- **Gated element**: a custom element whose content mounts only while its category is granted.
