import type { Store } from './store.ts';
import { reconcileFixture, type WorkspaceState } from '../domain/workflow.ts';

/** This worker only advances labelled fixtures. Native receipts use their own adapter. */
export async function reconcileDemonstrations(store: Store, after = '') {
  const records = await store.scan<WorkspaceState>('workspace:', after, 100);
  let reconciled = 0;
  for (const record of records) {
    if (
      record.value.mode !== 'demo' ||
      !record.value.operations.some((op) => op.state === 'submitted')
    )
      continue;
    let changed = false;
    await store.update<WorkspaceState>(record.key, (state) => {
      if (state.mode !== 'demo') return state;
      const operation = state.operations.find((op) => op.state === 'submitted');
      if (!operation) return state;
      changed = true;
      return reconcileFixture(state, operation.id, Date.now());
    });
    if (changed) reconciled++;
  }
  return {
    scanned: records.length,
    reconciled,
    next: records.length === 100 ? records.at(-1)!.key : null,
  };
}
