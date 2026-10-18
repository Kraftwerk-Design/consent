import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ACTIVE_CONTROLLER, CONTROLLER_EVENT, type ConsentHandle, type Controller } from '../core/controller'
import { resolveConfig } from '../config'
import type { ConsentSnapshot } from '../core/snapshot'

export interface FakeController {
  readonly handle: ConsentHandle
  /** Grant exactly these categories and notify subscribers. */
  grant(...ids: string[]): void
  subscribers(): number
  /** Clear subscribers and stop being the active controller, notifying elements, like `destroy()`. */
  destroy(): void
}

/**
 * Installs a controller stub (`has` / `subscribe` / `require` / `prompt`, default
 * config, age gate passed) as the page's active controller.
 */
export function installFakeController(defaultCategory = 'analytics'): FakeController {
  const subscribers = new Set<(next: ConsentSnapshot, prev: ConsentSnapshot) => void>()
  const snapshot = (categories: Record<string, boolean>): ConsentSnapshot =>
    Object.freeze({ stage: 'ready', recorded: true, gpc: 'none', categories: Object.freeze(categories) })
  let current = snapshot({})

  const handle: ConsentHandle = {
    ready: Promise.resolve(),
    getSnapshot: () => current,
    subscribe(fn) {
      subscribers.add(fn)
      return () => {
        subscribers.delete(fn)
      }
    },
    has: (category = defaultCategory) => current.categories[category] === true,
    require: vi.fn((category?: string) => {
      if (handle.has(category)) return true
      handle.prompt(category)
      return false
    }),
    prompt: vi.fn(),
    destroy: () => fake.destroy(),
  }

  const page = globalThis as { [ACTIVE_CONTROLLER]?: Controller | null }
  const fake: FakeController = {
    handle,
    grant(...ids) {
      const prev = current
      current = snapshot(Object.fromEntries(ids.map((id) => [id, true])))
      for (const fn of [...subscribers]) fn(current, prev)
    },
    subscribers: () => subscribers.size,
    destroy() {
      subscribers.clear()
      if (page[ACTIVE_CONTROLLER]?.handle !== handle) return
      page[ACTIVE_CONTROLLER] = null
      document.dispatchEvent(new Event(CONTROLLER_EVENT))
    },
  }
  page[ACTIVE_CONTROLLER] = { handle, config: resolveConfig(), ageGate: null }
  document.dispatchEvent(new Event(CONTROLLER_EVENT))
  return fake
}

export interface GatedEmbedSpec {
  tag: string
  /** Registers the element. Called before every test; must be idempotent. */
  define(): void
  /** A fresh element with a `[data-poster]` and its content source. The kit sets `category` / `autoactivate`. */
  make(): HTMLElement
  /** Mounted content nodes and iframes inside the element. */
  probe(el: HTMLElement): { activeNodes: number; iframes: number }
}

const CATEGORY = 'functionality'
const OTHER = 'analytics'
const nextTick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve))

/**
 * Lifecycle contract every gated element must pass (S-K1–K6, K8–K12, K14, K16).
 * Window listeners are counted by matching `addEventListener` /
 * `removeEventListener` pairs; ones released via `{ once }` or `{ signal }`
 * still count as live.
 */
export function describeGatedEmbed(spec: GatedEmbedSpec): void {
  describe(`<${spec.tag}> gated-element contract`, () => {
    let ctl: FakeController
    let listeners: [string, unknown][]

    beforeEach(() => {
      spec.define()
      ctl = installFakeController()
      listeners = []
      const add = window.addEventListener.bind(window)
      const remove = window.removeEventListener.bind(window)
      vi.spyOn(window, 'addEventListener').mockImplementation((type, fn, options) => {
        listeners.push([type, fn])
        add(type, fn, options)
      })
      vi.spyOn(window, 'removeEventListener').mockImplementation((type, fn, options) => {
        const at = listeners.findIndex(([t, f]) => t === type && f === fn)
        if (at >= 0) listeners.splice(at, 1)
        remove(type, fn, options)
      })
    })

    afterEach(() => {
      document.body.innerHTML = ''
      ctl.destroy()
      vi.restoreAllMocks()
    })

    const make = ({ auto = true, category = CATEGORY } = {}): HTMLElement => {
      const el = spec.make()
      el.setAttribute('category', category)
      if (auto) el.setAttribute('autoactivate', '')
      return el
    }
    const connect = (el: HTMLElement, parent: HTMLElement = document.body): HTMLElement => {
      parent.append(el)
      return el
    }
    const poster = (el: HTMLElement): HTMLElement => el.querySelector<HTMLElement>('[data-poster]')!
    const nodes = (el: HTMLElement): number => spec.probe(el).activeNodes
    const iframes = (el: HTMLElement): number => spec.probe(el).iframes
    const expectBlocked = (el: HTMLElement): void => {
      expect(nodes(el)).toBe(0)
      expect(iframes(el)).toBe(0)
      expect(el.getAttribute('state')).toBe('blocked')
      expect(poster(el).hidden).toBe(false)
    }
    const expectSameChildren = (el: HTMLElement, children: Element[]): void => {
      expect(el.children).toHaveLength(children.length)
      children.forEach((child, i) => expect(el.children[i]).toBe(child))
    }
    const expectActive = (el: HTMLElement): void => {
      expect(nodes(el)).toBe(1)
      expect(el.getAttribute('state')).toBe('active')
      expect(poster(el).hidden).toBe(true)
    }

    it('S-K1 stays inert without consent for its category', () => {
      expectBlocked(connect(make()))
    })

    it('S-K2 mounts once on a grant and ignores further notifications', () => {
      const el = connect(make())
      ctl.grant(CATEGORY)
      expectActive(el)
      const mounted = [...el.children]

      ctl.grant(CATEGORY, OTHER)
      ctl.grant(CATEGORY)

      expectSameChildren(el, mounted)
    })

    it('S-K2 mounts on connect when already granted', () => {
      ctl.grant(CATEGORY)
      expectActive(connect(make()))
    })

    it('S-K3 another category’s grant does not mount it', () => {
      ctl.grant(OTHER)
      const el = connect(make())
      ctl.grant(OTHER)
      expectBlocked(el)
    })

    it('S-K4 poster click mounts when granted', () => {
      ctl.grant(CATEGORY)
      const el = connect(make({ auto: false }))
      expectBlocked(el)

      poster(el).click()

      expectActive(el)
    })

    it('S-K4 poster click without consent opens the consent UI', () => {
      const el = connect(make({ auto: false }))
      poster(el).click()
      expect(ctl.handle.prompt).toHaveBeenCalledTimes(1)
      expectBlocked(el)
    })

    it('S-K5 withdraw unmounts and releases listeners', () => {
      ctl.grant(CATEGORY)
      const el = connect(make())

      ctl.grant()

      expectBlocked(el)
      expect(listeners.length).toBe(0)
    })

    it('S-K5 a manual mount needs a new click after withdraw and re-grant', () => {
      ctl.grant(CATEGORY)
      const el = connect(make({ auto: false }))
      poster(el).click()
      ctl.grant()
      ctl.grant(CATEGORY)
      expectBlocked(el)
    })

    it('S-K6 disconnect releases the subscription, the content and listeners', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      el.remove()
      await nextTick()

      expect(ctl.subscribers()).toBe(0)
      expect(nodes(el)).toBe(0)
      expect(iframes(el)).toBe(0)
      expect(listeners.length).toBe(0)
    })

    it('S-K8 reconnect in the same task keeps the live mount', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      const mounted = [...el.children]
      const live = listeners.length
      const other = connect(document.createElement('div'))

      el.remove()
      other.append(el)
      await nextTick()

      expectSameChildren(el, mounted)
      expectActive(el)
      expect(listeners.length).toBe(live)
      expect(ctl.subscribers()).toBe(1)
    })

    it('S-K9 move across tasks leaves exactly one content node', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      const other = connect(document.createElement('div'))

      el.remove()
      await nextTick()
      other.append(el)

      expectActive(el)
      expect(document.querySelectorAll('iframe')).toHaveLength(iframes(el))
      expect(ctl.subscribers()).toBe(1)
    })

    it('S-K9 a click-activated mount survives a move across tasks', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make({ auto: false }))
      poster(el).click()
      const other = connect(document.createElement('div'))

      el.remove()
      await nextTick()
      other.append(el)

      expectActive(el)
      expect(ctl.subscribers()).toBe(1)
    })

    it('S-K10 withdraw while detached → reconnect shows the poster only', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      el.remove()
      await nextTick()

      ctl.grant()
      connect(el)

      expectBlocked(el)
    })

    it('S-K11 an activated clone connected without consent drops its copied content', () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      const clone = el.cloneNode(true) as HTMLElement
      ctl.grant()

      connect(clone)

      expectBlocked(clone)
    })

    it('S-K11 an activated clone connected with consent has only its own mount', () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      const clone = el.cloneNode(true) as HTMLElement
      el.remove()

      connect(clone)

      expectActive(clone)
    })

    it('S-K12 window listeners balance across moves and removal', async () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      const live = listeners.length
      const other = connect(document.createElement('div'))

      for (const parent of [other, document.body, other]) {
        el.remove()
        await nextTick()
        parent.append(el)
        expect(listeners.length).toBe(live)
      }
      el.remove()
      await nextTick()

      expect(listeners.length).toBe(0)
    })

    it('S-K14 a poster click before consent mounts on the next grant', () => {
      const el = connect(make({ auto: false }))
      poster(el).click()

      ctl.grant(OTHER)
      ctl.grant(CATEGORY)

      expectActive(el)
    })

    it('S-K14 a pending click survives a move across tasks', async () => {
      const el = connect(make({ auto: false }))
      poster(el).click()

      el.remove()
      await nextTick()
      connect(el)
      ctl.grant(CATEGORY)

      expectActive(el)
    })

    it('binds when a controller starts after it connected', () => {
      ctl.destroy()
      const auto = connect(make())
      const manual = connect(make({ auto: false }))
      const gone = connect(make())
      gone.remove()

      ctl = installFakeController()
      ctl.grant(CATEGORY)
      expectActive(auto)
      expectBlocked(manual)
      expectBlocked(gone)

      poster(manual).click()
      expectActive(manual)
      expect(ctl.subscribers()).toBe(2)
    })

    it('writes no inline style on the host or poster', () => {
      ctl.grant(CATEGORY)
      const el = connect(make())
      ctl.grant()
      ctl.grant(CATEGORY)

      expect(el.hasAttribute('style')).toBe(false)
      expect(poster(el).hasAttribute('style')).toBe(false)
    })

    it('S-K16 destroy() unmounts active elements; after re-init they follow the new controller', () => {
      ctl.grant(CATEGORY)
      const auto = connect(make())
      const manual = connect(make({ auto: false }))
      const pending = connect(make({ auto: false, category: OTHER }))
      poster(manual).click()
      poster(pending).click()
      expectActive(manual)
      const first = ctl

      first.destroy()

      for (const el of [auto, manual, pending]) expectBlocked(el)
      expect(listeners.length).toBe(0)
      expect(first.subscribers()).toBe(0)

      ctl = installFakeController()
      ctl.grant(CATEGORY, OTHER)

      expectActive(auto)
      expectBlocked(manual)
      expectBlocked(pending)
      expect(ctl.subscribers()).toBe(3)

      poster(manual).click()
      expectActive(manual)
    })
  })
}

