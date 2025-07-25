import { describe, it, expect } from "vitest";
import { asyncBatch, computed, effect, flush, signal } from "../../lib/signal";
import { batch } from "../../lib/signal";

describe("signal system", () => {
  it("reacts to signal changes", () => {
    const x = signal(5);
    let observed = 0;
    effect(() => {
      observed = x.value;
    });
    expect(observed).toBe(5);
    x.value = 10;
    expect(observed).toBe(10);
  });

  it("reacts to computed changes", () => {
    const x = signal(2);
    const y = signal(3);
    const sum = computed(() => x.value + y.value);
    let observed = 0;
    effect(() => {
      observed = sum.value;
    });
    expect(observed).toBe(5);
    x.value = 5;
    expect(observed).toBe(8);
    y.value = 10;
    expect(observed).toBe(15);
  });

  it("runs effect cleanup", () => {
    const x = signal(1);
    let cleanupCalled = false;
    let observed = 0;
    effect(() => {
      observed = x.value;
      return () => {
        cleanupCalled = true;
      };
    });
    x.value = 2;
    expect(cleanupCalled).toBe(true);
    expect(observed).toBe(2);
  });

  it("matches the product example", () => {
    const x = signal(5);
    const multiplier = signal(10);
    const product = computed(() => x.value * multiplier.value);
    let observed = 0;
    effect(() => {
      observed = product.value;
    });
    expect(observed).toBe(50);
    x.value = 10;
    expect(observed).toBe(100);
    multiplier.value = 20;
    expect(observed).toBe(200);
  });

  // Additional comprehensive tests
  it("handles nested computed dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    const c = signal(3);

    const sumAB = computed(() => a.value + b.value);
    const finalSum = computed(() => sumAB.value + c.value);

    let observed = 0;
    effect(() => {
      observed = finalSum.value;
    });

    expect(observed).toBe(6); // 1 + 2 + 3
    a.value = 5;
    expect(observed).toBe(10); // 5 + 2 + 3
  });

  it("handles multiple effects on same signal", () => {
    const x = signal(1);
    let effect1Called = 0;
    let effect2Called = 0;

    effect(() => {
      effect1Called++;
      x.value; // access the signal
    });

    effect(() => {
      effect2Called++;
      x.value; // access the signal
    });

    expect(effect1Called).toBe(1);
    expect(effect2Called).toBe(1);

    x.value = 2;
    expect(effect1Called).toBe(2);
    expect(effect2Called).toBe(2);
  });

  it("handles effect disposal", () => {
    const x = signal(1);
    let effectCalled = 0;
    let cleanupCalled = 0;

    const dispose = effect(() => {
      effectCalled++;
      x.value;
      return () => {
        cleanupCalled++;
      };
    });

    expect(effectCalled).toBe(1);
    expect(cleanupCalled).toBe(0);

    x.value = 2;
    expect(effectCalled).toBe(2);
    expect(cleanupCalled).toBe(1);

    dispose();
    x.value = 3;
    expect(effectCalled).toBe(2); // Should not run after disposal
    expect(cleanupCalled).toBe(2); // Should have called cleanup on disposal
  });

  it("prevents setting computed values", () => {
    const x = signal(1);
    const doubled = computed(() => x.value * 2);

    expect(() => {
      doubled.value = 10;
    }).toThrow("Cannot set value on computed");
  });

  it("handles computed with no dependencies", () => {
    const constant = computed(() => 42);
    let observed = 0;

    effect(() => {
      observed = constant.value;
    });

    expect(observed).toBe(42);
  });

  it("handles dynamic dependencies", () => {
    const condition = signal(true);
    const a = signal(1);
    const b = signal(2);

    const dynamic = computed(() => {
      if (condition.value) {
        return a.value;
      } else {
        return b.value;
      }
    });

    let observed = 0;
    effect(() => {
      observed = dynamic.value;
    });

    expect(observed).toBe(1); // condition is true, so a.value

    condition.value = false;
    expect(observed).toBe(2); // condition is false, so b.value

    a.value = 10; // Should not affect observed since condition is false
    expect(observed).toBe(2);

    b.value = 20; // Should affect observed since condition is false
    expect(observed).toBe(20);
  });

  it("handles signal with same value assignment", () => {
    const x = signal(5);
    let effectCalled = 0;

    effect(() => {
      effectCalled++;
      x.value;
    });

    expect(effectCalled).toBe(1);

    x.value = 5; // Same value
    expect(effectCalled).toBe(1); // Should not trigger effect

    x.value = 6; // Different value
    expect(effectCalled).toBe(2); // Should trigger effect
  });

  it("handles complex nested effects", () => {
    const x = signal(1);
    const y = signal(2);
    let outerEffectCalled = 0;
    let innerEffectCalled = 0;

    effect(() => {
      outerEffectCalled++;
      const sum = x.value + y.value;

      // Create inner effect that depends on the sum
      effect(() => {
        innerEffectCalled++;
        sum; // access the sum from outer scope
      });
    });

    expect(outerEffectCalled).toBe(1);
    expect(innerEffectCalled).toBe(1);

    x.value = 3;
    expect(outerEffectCalled).toBe(2);
    expect(innerEffectCalled).toBe(2);
  });

  it("handles signal subscription and unsubscription", () => {
    const x = signal(1);
    let callbackCalled = 0;

    const unsubscribe = x.subscribe(() => {
      callbackCalled++;
    });

    expect(callbackCalled).toBe(0); // Not called on subscription

    x.value = 2;
    expect(callbackCalled).toBe(1);

    unsubscribe();
    x.value = 3;
    expect(callbackCalled).toBe(1); // Should not be called after unsubscription
  });

  it("handles computed subscription and unsubscription", () => {
    const x = signal(1);
    const doubled = computed(() => x.value * 2);
    let callbackCalled = 0;

    // Access the computed to ensure it's initialized
    doubled.value;

    const unsubscribe = doubled.subscribe(() => {
      callbackCalled++;
    });

    expect(callbackCalled).toBe(0); // Not called on subscription

    x.value = 2; // This should trigger the computed
    expect(callbackCalled).toBe(1);

    unsubscribe();
    x.value = 3;
    expect(callbackCalled).toBe(1); // Should not be called after unsubscription
  });

  it("batches multiple signal updates", () => {
    const a = signal(1);
    const b = signal(2);
    let effectCalled = 0;
    let lastSum = 0;
    effect(() => {
      effectCalled++;
      lastSum = a.value + b.value;
    });
    expect(effectCalled).toBe(1);
    a.value = 10;
    b.value = 20;
    expect(effectCalled).toBe(3); // two updates, two triggers
    // Now batch
    effectCalled = 0;
    a.value = 1;
    b.value = 2;
    effectCalled = 0;
    batch(() => {
      a.value = 100;
      b.value = 200;
    });
    expect(effectCalled).toBe(1); // Only one effect run for both updates
    expect(lastSum).toBe(300);
  });

  it("supports nested batch calls", () => {
    const x = signal(1);
    let effectCalled = 0;
    effect(() => {
      effectCalled++;
      x.value;
    });
    effectCalled = 0;
    batch(() => {
      x.value = 2;
      batch(() => {
        x.value = 3;
      });
      x.value = 4;
    });
    expect(effectCalled).toBe(1);
    expect(x.value).toBe(4);
  });

  it("returns the value from the batch callback", () => {
    const result = batch(() => {
      return 42;
    });
    expect(result).toBe(42);
  });

  it("does nothing if no updates in batch", () => {
    const x = signal(1);
    let effectCalled = 0;
    effect(() => {
      effectCalled++;
      x.value;
    });
    effectCalled = 0;
    batch(() => {
      // no updates
    });
    expect(effectCalled).toBe(0);
  });

  it("batches computed and effect updates", () => {
    const x = signal(1);
    const y = signal(2);
    const sum = computed(() => x.value + y.value);
    let effectRuns = 0;
    effect(() => {
      sum.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    batch(() => {
      x.value = 10;
      y.value = 20;
    });

    expect(effectRuns).toBe(2);
    expect(sum.value).toBe(30);
  });

  it("asyncBatch defers updates to next microtask", async () => {
    const x = signal(1);
    const y = signal(2);
    let effectRuns = 0;
    effect(() => {
      x.value;
      y.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    // Use asyncBatch to defer updates
    asyncBatch(() => {
      x.value = 10;
      y.value = 20;
    });

    // Effect should not have run yet (deferred to microtask)
    expect(effectRuns).toBe(1);
    expect(x.value).toBe(10);
    expect(y.value).toBe(20);

    // Wait for microtask to flush
    await new Promise((resolve) => queueMicrotask(resolve));

    // Now effect should have run
    expect(effectRuns).toBe(2);
  });

  it("asyncBatch supports nested calls", async () => {
    const x = signal(1);
    const y = signal(2);
    let effectRuns = 0;
    effect(() => {
      x.value;
      y.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    asyncBatch(() => {
      x.value = 10;
      asyncBatch(() => {
        y.value = 20;
      });
    });

    // Effect should not have run yet
    expect(effectRuns).toBe(1);

    // Wait for microtask to flush
    await new Promise((resolve) => queueMicrotask(resolve));

    // Now effect should have run
    expect(effectRuns).toBe(2);
  });

  it("flush forces immediate execution", async () => {
    const x = signal(1);
    const y = signal(2);
    let effectRuns = 0;
    effect(() => {
      x.value;
      y.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);

    asyncBatch(() => {
      x.value = 10;
      y.value = 20;
    });

    // Effect should not have run yet
    expect(effectRuns).toBe(1);

    // Force flush
    flush();

    // Effect should have run immediately
    expect(effectRuns).toBe(2);
  });

  it("asyncBatch with computed updates", async () => {
    const x = signal(1);
    const y = signal(2);
    const sum = computed(() => x.value + y.value);
    let effectRuns = 0;
    effect(() => {
      sum.value;
      effectRuns++;
    });

    expect(effectRuns).toBe(1);
    expect(sum.value).toBe(3);

    asyncBatch(() => {
      x.value = 10;
      y.value = 20;
    });

    // Computed should be updated immediately
    expect(sum.value).toBe(30);
    // But effect should be deferred
    expect(effectRuns).toBe(1);

    // Wait for microtask
    await new Promise((resolve) => queueMicrotask(resolve));

    // Effect should have run
    expect(effectRuns).toBe(2);
  });
});

describe("error handling and recovery", () => {
  it("handles errors in computed functions", () => {
    const x = signal(1);
    let errorThrown = false;

    const errorComputed = computed(() => {
      if (x.value === 2) {
        throw new Error("Computed error");
      }
      return x.value * 2;
    });

    // Should work normally
    expect(errorComputed.value).toBe(2);

    // Should throw when condition is met
    expect(() => {
      x.value = 2;
      errorComputed.value;
    }).toThrow("Computed error");

    // Should recover when condition is no longer met
    x.value = 3;
    expect(errorComputed.value).toBe(6);
  });

  it("handles errors in effects", () => {
    const x = signal(1);
    let effectRuns = 0;
    let errorThrown = false;

    effect(() => {
      effectRuns++;
      if (x.value === 2) {
        throw new Error("Effect error");
      }
    });

    expect(effectRuns).toBe(1);

    // Should throw but not crash the system
    expect(() => {
      x.value = 2;
    }).toThrow("Effect error");

    // Effect should still be active and run again
    x.value = 3;
    expect(effectRuns).toBe(3); // Initial + error + recovery
  });

  it("handles errors in signal setters", () => {
    const x = signal(1);
    let effectRuns = 0;

    effect(() => {
      effectRuns++;
      x.value;
    });

    expect(effectRuns).toBe(1);

    // Setting a signal should not throw errors
    expect(() => {
      x.value = 2;
    }).not.toThrow();

    expect(effectRuns).toBe(2);
  });

  it("handles circular dependencies gracefully", () => {
    const x = signal(1);

    // Create a computed that depends on itself (circular)
    const circular = computed(() => {
      return circular.value + 1; // This would cause infinite recursion
    });

    // Should throw when accessed
    expect(() => {
      circular.value;
    }).toThrow();
  });

  it("handles errors in cleanup functions", () => {
    const x = signal(1);
    let cleanupRuns = 0;

    effect(() => {
      x.value;
      return () => {
        cleanupRuns++;
        if (cleanupRuns === 1) {
          throw new Error("Cleanup error");
        }
      };
    });

    expect(cleanupRuns).toBe(0);

    // Should handle cleanup error gracefully
    expect(() => {
      x.value = 2;
    }).toThrow("Cleanup error");

    // Should continue working
    x.value = 3;
    expect(cleanupRuns).toBe(2);
  });

  it("handles null and undefined values", () => {
    const x = signal<number | null>(null);
    const y = signal<number | undefined>(undefined);

    const sum = computed(() => {
      return (x.value ?? 0) + (y.value ?? 0);
    });

    expect(sum.value).toBe(0);

    x.value = 5;
    expect(sum.value).toBe(5);

    y.value = 3;
    expect(sum.value).toBe(8);
  });

  it("handles errors in subscription callbacks", () => {
    const x = signal(1);
    let callbackRuns = 0;

    const unsubscribe = x.subscribe(() => {
      callbackRuns++;
      if (callbackRuns === 1) {
        throw new Error("Subscription error");
      }
    });

    // Should handle subscription error gracefully
    expect(() => {
      x.value = 2;
    }).toThrow("Subscription error");

    // Should continue working
    x.value = 3;
    expect(callbackRuns).toBe(2);

    unsubscribe();
  });

  it("handles computed with conditional errors", () => {
    const condition = signal(true);
    const x = signal(1);

    const conditionalComputed = computed(() => {
      if (condition.value) {
        return x.value * 2;
      } else {
        throw new Error("Conditional error");
      }
    });

    // Should work when condition is true
    expect(conditionalComputed.value).toBe(2);

    // Should throw when condition is false
    condition.value = false;
    expect(() => {
      conditionalComputed.value;
    }).toThrow("Conditional error");

    // Should recover when condition is true again
    condition.value = true;
    expect(conditionalComputed.value).toBe(2);
  });

  it("handles effect disposal during error", () => {
    const x = signal(1);
    let effectRuns = 0;
    let cleanupRuns = 0;

    const dispose = effect(() => {
      effectRuns++;
      if (x.value === 2) {
        throw new Error("Effect error");
      }
      return () => {
        cleanupRuns++;
      };
    });

    expect(effectRuns).toBe(1);

    // Trigger error
    expect(() => {
      x.value = 2;
    }).toThrow("Effect error");

    // Dispose effect
    dispose();

    // Should not run anymore
    x.value = 3;
    expect(effectRuns).toBe(2); // Initial + error
    expect(cleanupRuns).toBe(2); // Cleanup on error + cleanup on disposal
  });
});

describe("fine-grained reactivity", () => {
  it("effect only subscribes to active dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    const cond = signal(true);
    let observed = 0;
    let effectRuns = 0;
    effect(() => {
      effectRuns++;
      observed = cond.value ? a.value : b.value;
    });
    expect(observed).toBe(1);
    expect(effectRuns).toBe(1);
    // Change a (should trigger effect)
    a.value = 10;
    expect(observed).toBe(10);
    expect(effectRuns).toBe(2);
    // Change b (should NOT trigger effect)
    b.value = 20;
    expect(observed).toBe(10);
    expect(effectRuns).toBe(2);
    // Switch to b
    cond.value = false;
    expect(observed).toBe(20);
    expect(effectRuns).toBe(3);
    // Now a should NOT trigger effect
    a.value = 100;
    expect(observed).toBe(20);
    expect(effectRuns).toBe(3);
    // b should trigger effect
    b.value = 200;
    expect(observed).toBe(200);
    expect(effectRuns).toBe(4);
  });

  it("computed only subscribes to active dependencies", () => {
    const a = signal(1);
    const b = signal(2);
    const cond = signal(true);
    const dynamic = computed(() => (cond.value ? a.value : b.value));
    let observed = 0;
    let effectRuns = 0;
    effect(() => {
      effectRuns++;
      observed = dynamic.value;
    });
    expect(observed).toBe(1);
    expect(effectRuns).toBe(1);
    // Change a (should trigger effect)
    a.value = 10;
    expect(observed).toBe(10);
    expect(effectRuns).toBe(2);
    // Change b (should NOT trigger effect)
    b.value = 20;
    expect(observed).toBe(10);
    expect(effectRuns).toBe(2);
    // Switch to b
    cond.value = false;
    expect(observed).toBe(20);
    expect(effectRuns).toBe(3);
    // Now a should NOT trigger effect
    a.value = 100;
    expect(observed).toBe(20);
    expect(effectRuns).toBe(3);
    // b should trigger effect
    b.value = 200;
    expect(observed).toBe(200);
    expect(effectRuns).toBe(4);
  });

  it("cleans up old dependencies and prevents memory leaks", () => {
    const a = signal(1);
    const b = signal(2);
    const cond = signal(true);
    let observed = 0;
    let effectRuns = 0;
    let aSubscriptions = 0;
    let bSubscriptions = 0;
    // Patch subscribe to count subscriptions
    const origASubscribe = a.subscribe;
    a.subscribe = (fn) => {
      aSubscriptions++;
      return origASubscribe.call(a, fn);
    };
    const origBSubscribe = b.subscribe;
    b.subscribe = (fn) => {
      bSubscriptions++;
      return origBSubscribe.call(b, fn);
    };
    effect(() => {
      effectRuns++;
      observed = cond.value ? a.value : b.value;
    });
    expect(aSubscriptions).toBeGreaterThan(0);
    expect(bSubscriptions).toBe(0);
    cond.value = false;
    expect(bSubscriptions).toBeGreaterThan(0);
    // Now a should not have new subscriptions
    a.value = 42;
    expect(aSubscriptions).toBeLessThanOrEqual(2); // Only initial + possible cleanup
  });
});
