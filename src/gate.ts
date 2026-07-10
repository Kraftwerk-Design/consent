import { hasConsent, onConsentChange, requireConsent } from './analytics'

/** Hide an element without depending on a CSS framework's utility class. */
export function hide(el: HTMLElement | null | undefined): void {
  if (el) el.style.display = 'none'
}

/** Restore an element to its stylesheet-defined display. */
export function show(el: HTMLElement | null | undefined): void {
  if (el) el.style.display = ''
}

export interface ConsentGate {
  /** Reveal/prepare the gated thing. Return false if it can't (no consent). */
  activate: () => boolean
  /** Tear it back down and restore the placeholder. */
  deactivate: () => void
  /** Elements whose click should activate (or prompt for) consent. */
  triggers: (HTMLElement | null | undefined)[]
  /** Activate automatically as soon as consent is present. */
  autoActivate: boolean
  /** Consent category this gate depends on. Defaults to the default gate category. */
  category?: string
}

/**
 * Gate any activate/deactivate behavior behind analytics consent — a video, an
 * iframe embed, a map, a social widget, a chat box. Handles: initial state from
 * consent + autoActivate, click → activate-or-prompt, and live activation/
 * teardown as consent changes. A manually-activated target is left running
 * across benign re-dispatches while consent is still valid, and only torn down
 * when consent is withdrawn.
 *
 * Returns a teardown function that releases everything this call wired up
 * (the consent-change subscription and the trigger click listeners). Callers
 * that don't need to tear the gate down (e.g. a gate that lives for the page's
 * whole lifetime) can simply ignore the return value; callers embedding the
 * gate in something with its own lifecycle (a custom element's
 * `disconnectedCallback`, for example) should call it to avoid leaking a
 * document-level listener per instance.
 */
export function setupConsentGate(gate: ConsentGate): () => void {
  let activated = false

  const activate = (): boolean => {
    const ok = gate.activate()
    if (ok) activated = true
    return ok
  }

  const deactivate = (): void => {
    gate.deactivate()
    activated = false
  }

  const category = gate.category

  const onTrigger = (event: Event): void => {
    event.preventDefault()
    if (activate()) return
    requireConsent(category)
  }

  gate.triggers.forEach((el) => el?.addEventListener('click', onTrigger))

  const sync = (): void => {
    if (!hasConsent(category)) {
      deactivate()
      return
    }
    if (gate.autoActivate || activated) activate()
  }

  sync()
  const unsubscribe = onConsentChange(sync, category)

  return (): void => {
    unsubscribe()
    gate.triggers.forEach((el) => el?.removeEventListener('click', onTrigger))
  }
}
