export type SaveStatus = { state: "saved" | "saving" | "error"; error?: string };

// Coalesce edits behind one in-flight save; acknowledgements only confirm their own snapshot.
export function createNoteSaver<T>(save: (value: T) => Promise<void>, report: (status: SaveStatus) => void) {
  let latest: T;
  let revision = 0;
  let saved = 0;
  let running: Promise<void> | null = null;

  function flush(): Promise<void> {
    if (running) return running;
    if (saved === revision) return Promise.resolve();
    report({ state: "saving" });
    running = (async () => {
      while (saved < revision) {
        const snapshot = latest;
        const target = revision;
        await save(snapshot);
        saved = target;
      }
      report({ state: "saved" });
    })().catch((error: unknown) => {
      report({ state: "error", error: String(error) });
      throw error;
    }).finally(() => { running = null; });
    return running;
  }

  return {
    set(value: T) {
      latest = value;
      revision++;
      void flush().catch(() => { /* The draft remains pending and the reported error stays visible. */ });
    },
    flush,
  };
}
