// Uses fake-indexeddb to provide a real (in-memory) IndexedDB implementation
// in the test environment — ActionQueue.ts talks to `indexedDB` as a global,
// not an injected dependency, so this is the only way to exercise it without
// a real browser.
import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import {
  enqueueAction,
  getPendingActions,
  clearQueue,
  type ColdWatchAction,
} from './ActionQueue';

beforeEach(async () => {
  await clearQueue();
});

describe('ActionQueue collapse/dedup', () => {
  it('DEVICE_COMMAND: repeated ON/OFF toggles for the same device collapse to one entry', async () => {
    // The doc's exact scenario: farmer spams ON/OFF 10x offline. Queue used
    // to drain all 10 as separate relay clicks — compressor wear for no
    // benefit, since only the final commanded state matters.
    await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'ON' } });
    await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'OFF' } });
    await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'ON' } });

    const pending = await getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toEqual({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'ON' } });
  });

  it('DEVICE_COMMAND: different devices do not collapse into each other', async () => {
    await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'ON' } });
    await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-2', command: 'OFF' } });

    const pending = await getPendingActions();
    expect(pending).toHaveLength(2);
  });

  it('UPDATE_SETTINGS: multiple offline patches merge into one entry, later fields win', async () => {
    await enqueueAction({ type: 'UPDATE_SETTINGS', payload: { warningTemperature: 10 } });
    await enqueueAction({ type: 'UPDATE_SETTINGS', payload: { warningTemperature: 12, criticalTemperature: 18 } });

    const pending = await getPendingActions();
    expect(pending).toHaveLength(1);
    expect(pending[0].action).toEqual({
      type: 'UPDATE_SETTINGS',
      payload: { warningTemperature: 12, criticalTemperature: 18 },
    });
  });

  it('UPDATE_DEVICE: patches for the same device merge; different devices stay separate', async () => {
    await enqueueAction({ type: 'UPDATE_DEVICE', payload: { id: 'device-1', patch: { name: 'Cold Room A' } } });
    await enqueueAction({ type: 'UPDATE_DEVICE', payload: { id: 'device-1', patch: { location: 'Warehouse 2' } } });
    await enqueueAction({ type: 'UPDATE_DEVICE', payload: { id: 'device-2', patch: { name: 'Cold Room B' } } });

    const pending = await getPendingActions();
    expect(pending).toHaveLength(2);
    const merged = pending.find(p => (p.action as any).payload.id === 'device-1')!;
    expect(merged.action).toEqual({
      type: 'UPDATE_DEVICE',
      payload: { id: 'device-1', patch: { name: 'Cold Room A', location: 'Warehouse 2' } },
    });
  });

  it('collapsed entries keep their original position in drain order (do not jump to the back)', async () => {
    // ActionQueue.ts sorts drain order by createdAt (millisecond resolution).
    // On a fast test run, back-to-back enqueueAction calls can land in the
    // same millisecond by the real clock, making tie-break order
    // implementation-defined rather than testing the actual invariant —
    // this happened during development of this test (vi.useFakeTimers()
    // was tried first but hangs: fake-indexeddb's own async completion
    // callbacks rely on real timers internally). Spying on Date.now
    // directly avoids that — ActionQueue only calls it synchronously to
    // stamp createdAt, never inside a setTimeout.
    let now = 1_700_000_000_000;
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    try {
      await enqueueAction({ type: 'ACKNOWLEDGE_ALERT', payload: { id: 'alert-1' } });
      now += 1;
      await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'ON' } });
      now += 1;
      await enqueueAction({ type: 'ACKNOWLEDGE_ALERT', payload: { id: 'alert-2' } });
      now += 1;
      // Re-issuing the DEVICE_COMMAND should collapse in place, not move to
      // the end of the queue behind alert-2.
      await enqueueAction({ type: 'DEVICE_COMMAND', payload: { id: 'device-1', command: 'OFF' } });

      const pending = await getPendingActions();
      expect(pending).toHaveLength(3);
      expect(pending.map(p => p.action.type)).toEqual([
        'ACKNOWLEDGE_ALERT', 'DEVICE_COMMAND', 'ACKNOWLEDGE_ALERT',
      ]);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('one-shot action types (ACKNOWLEDGE_ALERT, ADD_DEVICE, DELETE_DEVICE) never collapse', async () => {
    const oneShotActions: ColdWatchAction[] = [
      { type: 'ACKNOWLEDGE_ALERT', payload: { id: 'alert-1' } },
      { type: 'ACKNOWLEDGE_ALERT', payload: { id: 'alert-1' } }, // same payload, still not collapsed
      { type: 'DELETE_DEVICE', payload: { id: 'device-1' } },
      { type: 'DELETE_DEVICE', payload: { id: 'device-1' } },
    ];
    for (const action of oneShotActions) await enqueueAction(action);

    const pending = await getPendingActions();
    expect(pending).toHaveLength(4);
  });
});
