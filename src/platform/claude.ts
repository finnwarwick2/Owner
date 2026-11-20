// Bridge to the claude.ai artifact runtime. Every capability is optional:
// outside the viewer (or when a viewer declines) these resolve to null and the
// game falls back to its offline judge and simulated crowd.
type Use = (name: string) => Promise<any>;

function getUse(): Use | null {
  const c = (globalThis as any).claude;
  return c && typeof c.use === 'function' ? (c.use.bind(c) as Use) : null;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(null), ms);
    p.then(
      (v) => { clearTimeout(id); resolve(v); },
      () => { clearTimeout(id); resolve(null); },
    );
  });
}

const cache = new Map<string, Promise<any>>();
export function useCapability(name: string): Promise<any> {
  if (!cache.has(name)) {
    const use = getUse();
    cache.set(name, use ? withTimeout(use(name), 10000) : Promise.resolve(null));
  }
  return cache.get(name)!;
}

// Start resolving early so the first answer isn't slowed down.
if (typeof window !== 'undefined') {
  setTimeout(() => { void useCapability('sample'); void useCapability('db'); void useCapability('user'); }, 0);
}
