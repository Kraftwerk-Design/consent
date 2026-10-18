import { activeHandle, CONTROLLER_EVENT } from '../core/controller'

/**
 * Builds a gated element's content inside `host` and returns its teardown, or
 * null when it can't (e.g. a missing attribute). Append direct children only;
 * don't replace the host's content (e.g. `innerHTML`). Appended children are
 * removed on unmount; the teardown releases everything else (listeners,
 * timers).
 */
export type Mount = (host: HTMLElement) => (() => void) | null

export interface GateOptions {
  /** Consent category to wait for. Defaults to the default gate category. */
  category?: string
  /** Elements whose click mounts, or opens the consent UI and mounts on the next grant. */
  triggers: (HTMLElement | null | undefined)[]
  /** Mount as soon as the category is granted, without a click. */
  autoActivate: boolean
  /** Builds the gated thing and returns its teardown, or null when it can't (retried on the next click or grant). */
  mount: () => (() => void) | null
}

const TOKEN = 'data-consent-gated'

/**
 * Gate a bespoke widget (chat, custom SDK) behind consent for a category.
 * Mounts on a grant (with `autoActivate`, or after a trigger click), unmounts
 * when the category is withdrawn. Call after `initConsent()`; the handle's
 * `destroy()` unmounts it for good. Returns a teardown that unsubscribes,
 * removes the trigger listeners and unmounts.
 */
export function attachGate(options: GateOptions): () => void {
  return bindGate(options, { current: false })
}

// `intent` (the visitor clicked a trigger) outlives the binding so an element
// re-bound after a move keeps a manual activation or a pending click.
// `onRetire` runs after the binding's controller is destroyed or replaced.
function bindGate(
  { category, triggers, autoActivate, mount }: GateOptions,
  intent: { current: boolean },
  onRetire?: () => void,
): () => void {
  const handle = activeHandle()
  if (!handle) {
    console.warn('[consent] attachGate() needs initConsent() first.')
    return () => {}
  }

  let granted = handle.has(category)
  let unmount: (() => void) | null = null

  const sync = (): void => {
    const want = granted && (autoActivate || intent.current)
    if (want && !unmount) {
      try {
        unmount = mount()
      } catch (error) {
        queueMicrotask(() => {
          throw error
        })
      }
    } else if (!want && unmount) {
      const release = unmount
      unmount = null
      release()
    }
  }

  const onTrigger = (event: Event): void => {
    if (activeHandle() !== handle) return
    event.preventDefault()
    intent.current = true
    if (handle.require(category)) {
      granted = true
      sync()
    }
  }

  const unsubscribe = handle.subscribe(() => {
    const now = handle.has(category)
    if (now === granted) return
    granted = now
    if (!now) intent.current = false
    sync()
  })
  const release = (): void => {
    unsubscribe()
    for (const el of triggers) el?.removeEventListener('click', onTrigger)
    document.removeEventListener(CONTROLLER_EVENT, retire)
    granted = false
    sync()
  }

  const retire = (): void => {
    if (activeHandle() === handle) return
    intent.current = false
    release()
    onRetire?.()
  }

  for (const el of triggers) el?.addEventListener('click', onTrigger)
  document.addEventListener(CONTROLLER_EVENT, retire)
  sync()

  return release
}

/**
 * Register a consent-gated custom element. `mount` builds its content in the
 * element's light DOM once its category (the `category` attribute, else the
 * default gate category) is granted: on connect with `autoactivate`, else on a
 * `[data-poster]` click. The host carries `state="blocked|active"`; the poster
 * is `hidden` while active.
 *
 * `category` and `autoactivate` are read at connect. Moving the element within
 * one task keeps the mount; a later move re-creates it, keeping a click's
 * activation. A clone (e.g. a router's page snapshot) drops the content it
 * copied. Elements connected before `initConsent()` bind when it runs.
 * `destroy()` unmounts them and clears a click's activation; they bind to the
 * next controller.
 *
 * Idempotent per tag. The class is defined lazily so importing this module
 * never references `HTMLElement` (safe in Node/SSR).
 */
export function defineGatedElement(tag: string, mount: Mount): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return

  class GatedElement extends HTMLElement {
    readonly #token = Math.random().toString(36).slice(2)
    readonly #intent = { current: false }
    #detach: (() => void) | null = null
    #poster: HTMLElement | null = null
    readonly #onController = (): void => {
      if (this.isConnected && !this.#detach) this.connectedCallback()
    }

    connectedCallback(): void {
      if (this.#detach) return
      for (const node of this.#stamped()) {
        if (node.getAttribute(TOKEN) !== this.#token) node.remove()
      }
      this.#poster = this.querySelector('[data-poster]')
      this.#render(false)
      if (!activeHandle()) {
        document.addEventListener(CONTROLLER_EVENT, this.#onController, { once: true })
        return
      }
      this.#detach = bindGate(
        {
          category: this.getAttribute('category') ?? undefined,
          triggers: [this.#poster],
          autoActivate: this.hasAttribute('autoactivate'),
          mount: () => this.#mount(),
        },
        this.#intent,
        () => {
          this.#detach = null
          if (this.isConnected) this.connectedCallback()
        },
      )
    }

    disconnectedCallback(): void {
      document.removeEventListener(CONTROLLER_EVENT, this.#onController)
      queueMicrotask(() => {
        if (this.isConnected || !this.#detach) return
        this.#detach()
        this.#detach = null
      })
    }

    #stamped(): Element[] {
      return Array.from(this.children).filter((node) => node.hasAttribute(TOKEN))
    }

    #mount(): (() => void) | null {
      const before = new Set(this.children)
      let teardown: (() => void) | null = null
      try {
        teardown = mount(this)
      } finally {
        for (const node of this.children) {
          if (!before.has(node)) node.setAttribute(TOKEN, this.#token)
        }
        if (!teardown) for (const node of this.#stamped()) node.remove()
      }
      if (!teardown) return null
      this.#render(true)
      return () => {
        teardown()
        for (const node of this.#stamped()) node.remove()
        this.#render(false)
      }
    }

    #render(active: boolean): void {
      this.setAttribute('state', active ? 'active' : 'blocked')
      if (this.#poster) this.#poster.hidden = active
    }
  }

  customElements.define(tag, GatedElement)
}
