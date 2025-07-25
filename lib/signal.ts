// Types for reactive primitives
type Signal<T> = {
  value: T;
  subscribe: (fn: () => void) => () => void;
};

type Effect = () => void | (() => void);
type Computed<T> = Signal<T> & { notify: () => void };

// Error handling types
type ErrorHandler = (error: Error, context: string) => void;
type ErrorBoundary = {
  onError: ErrorHandler;
  onRecover?: () => void;
};

// Utility types for better ergonomics
type SignalValue<T> = T extends Signal<infer U> ? U : never;
type ComputedValue<T> = T extends Computed<infer U> ? U : never;

// Type guards for runtime checking
function isSignal<T>(value: any): value is Signal<T> {
  return (
    value &&
    typeof value === "object" &&
    "value" in value &&
    "subscribe" in value
  );
}

function isComputed<T>(value: any): value is Computed<T> {
  return isSignal(value) && "notify" in value;
}

// Global error handling
let globalErrorHandler: ErrorHandler | null = null;
let isInErrorState = false;

// Concurrent/reentrant safety
let currentSubscriber: (() => void) | null = null;
let isBatching = false;
let pendingSubscribers = new Set<() => void>();
let isReentrant = false;
let reentrantDepth = 0;

// Async batching with microtask flush
let isAsyncBatching = false;
let asyncBatchingDepth = 0;
let pendingAsyncSubscribers = new Set<() => void>();
let flushScheduled = false;

// Dependency tracking stack for fine-grained reactivity
const subscriberStack: Array<ReactiveSubscriber | null> = [];

// Error recovery state
const errorRecoveryMap = new WeakMap<ReactiveSubscriber, ErrorBoundary>();

// Untracked reads - allows reading signals without creating dependencies
let isUntracked = false;

let dirtyComputeds = new Set<ComputedImpl<any>>();

// Global set to track effects that need to run after a batch
const pendingEffects = new Set<() => void>();

// Flag to prevent effects from being re-subscribed during flush
let isFlushingEffects = false;

// Debug logging to track effect behavior
let debugCounter = 0;

function handleError(
  error: Error,
  context: string,
  subscriber?: ReactiveSubscriber
): void {
  if (globalErrorHandler) {
    try {
      globalErrorHandler(error, context);
    } catch (handlerError) {
      console.error("Error in global error handler:", handlerError);
      console.error("Original error:", error);
    }
  } else {
    console.error(`Reactivity error in ${context}:`, error);
  }

  // Mark error state
  isInErrorState = true;

  // Try to recover if subscriber has error boundary
  if (subscriber && errorRecoveryMap.has(subscriber)) {
    const boundary = errorRecoveryMap.get(subscriber)!;
    try {
      if (boundary.onRecover) {
        boundary.onRecover();
      }
    } catch (recoveryError) {
      console.error("Error in recovery handler:", recoveryError);
    }
  }
}

function safeExecute<T>(
  fn: () => T,
  context: string,
  subscriber?: ReactiveSubscriber
): T {
  try {
    return fn();
  } catch (error) {
    handleError(
      error instanceof Error ? error : new Error(String(error)),
      context,
      subscriber
    );
    // Re-throw the error for test compatibility
    throw error;
  }
}

function scheduleFlush() {
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(() => {
      flushScheduled = false;
      flushAsyncSubscribers();
    });
  }
}

function flushSubscribers() {
  // Recompute all dirty computeds before notifying effects
  for (const c of dirtyComputeds) {
    c.recompute();
  }
  dirtyComputeds.clear();

  if (isReentrant) return; // Prevent reentrant flushing

  isReentrant = true;
  reentrantDepth++;

  try {
    const subscribers = Array.from(pendingSubscribers);
    pendingSubscribers.clear();
    for (const fn of subscribers) {
      try {
        fn();
      } catch (error) {
        handleError(
          error instanceof Error ? error : new Error(String(error)),
          "subscriber flush",
          undefined
        );
      }
    }
    // Also flush any pending effects
    const effects = Array.from(pendingEffects);
    pendingEffects.clear();
    isFlushingEffects = true;
    try {
      for (const eff of effects) {
        try {
          eff();
        } catch (e) {
          /* error handling is inside effect */
        }
      }
    } finally {
      isFlushingEffects = false;
    }
  } finally {
    reentrantDepth--;
    if (reentrantDepth === 0) {
      isReentrant = false;
    }
  }
}

function flushAsyncSubscribers() {
  // Recompute all dirty computeds before notifying effects
  for (const c of dirtyComputeds) {
    c.recompute();
  }
  dirtyComputeds.clear();

  if (isReentrant) return; // Prevent reentrant flushing

  isReentrant = true;
  reentrantDepth++;

  try {
    const subscribers = Array.from(pendingAsyncSubscribers);
    pendingAsyncSubscribers.clear();
    for (const fn of subscribers) {
      try {
        fn();
      } catch (error) {
        handleError(
          error instanceof Error ? error : new Error(String(error)),
          "async subscriber flush",
          undefined
        );
      }
    }
    // Also flush any pending effects
    const effects = Array.from(pendingEffects);
    pendingEffects.clear();
    isFlushingEffects = true;
    try {
      for (const eff of effects) {
        try {
          eff();
        } catch (e) {
          /* error handling is inside effect */
        }
      }
    } finally {
      isFlushingEffects = false;
    }
  } finally {
    reentrantDepth--;
    if (reentrantDepth === 0) {
      isReentrant = false;
    }
  }
}

function batch<T>(fn: () => T): T {
  const prevBatching = isBatching;
  isBatching = true;

  try {
    return safeExecute(fn, "batch execution");
  } finally {
    isBatching = prevBatching;
    // Recompute all dirty computeds before returning
    for (const c of dirtyComputeds) {
      c.recompute();
    }
    dirtyComputeds.clear();
    if (!isBatching) {
      flushSubscribers();
    }
  }
}

function asyncBatch<T>(fn: () => T): T {
  const prevAsyncBatching = isAsyncBatching;
  isAsyncBatching = true;
  asyncBatchingDepth++;

  try {
    return safeExecute(fn, "async batch execution");
  } finally {
    asyncBatchingDepth--;
    // Recompute all dirty computeds before returning
    for (const c of dirtyComputeds) {
      c.recompute();
    }
    dirtyComputeds.clear();
    if (asyncBatchingDepth === 0) {
      isAsyncBatching = prevAsyncBatching;
      if (!isAsyncBatching) {
        scheduleFlush();
      }
    }
  }
}

function flush(): void {
  if (isAsyncBatching) {
    scheduleFlush();
  } else {
    flushSubscribers();
    flushAsyncSubscribers();
  }
}

// Error handling utilities
function setGlobalErrorHandler(handler: ErrorHandler) {
  globalErrorHandler = handler;
}

function createErrorBoundary(
  onError: ErrorHandler,
  onRecover?: () => void
): ErrorBoundary {
  return { onError, onRecover };
}

// Type for anything that can subscribe/unsubscribe to signals
interface ReactiveSubscriber {
  onDependencySubscribe(subscriber: ReactiveSubscriber): void;
  onDependencyUnsubscribe(subscriber: ReactiveSubscriber): void;
  run?: () => void; // Optional run method for effects
  unsubscribeFns?: Array<() => void>; // Optional unsubscribe functions for effects/computeds
  notify?: () => void; // Optional notify method for computeds
  subscribe?: (fn: () => void) => () => void; // Optional subscribe method
  errorBoundary?: ErrorBoundary; // Optional error boundary
}

// Helper to distinguish effects from computeds
function isEffect(fn: any): boolean {
  return typeof fn === "function" && !fn.notify;
}

// Helper to identify computed notify functions
function isComputedNotify(fn: any): boolean {
  return typeof fn === "function" && fn.toString().includes("this.notify()");
}

class SignalImpl<T> implements Signal<T>, ReactiveSubscriber {
  private _value: T;
  private subscribers = new Set<() => void>();
  private explicitSubscribers = new Set<ReactiveSubscriber>();
  public errorBoundary?: ErrorBoundary;

  constructor(initialValue: T, errorBoundary?: ErrorBoundary) {
    this._value = initialValue;
    this.errorBoundary = errorBoundary;
    if (errorBoundary) {
      errorRecoveryMap.set(this, errorBoundary);
    }
  }

  get value(): T {
    // Reentrant safety check
    if (isReentrant && reentrantDepth > 10) {
      throw new Error("Maximum reentrant depth exceeded");
    }

    // Fine-grained: track explicit subscribers for dependency tracking only
    // Skip dependency tracking if in untracked mode, unless the current subscriber is a computed
    const current = subscriberStack[subscriberStack.length - 1];
    if (current && (!isUntracked || (current as any).notify)) {
      this.explicitSubscribers.add(current);
      current.onDependencySubscribe(this);
    }
    return this._value;
  }

  set value(newValue: T) {
    if (this._value !== newValue) {
      this._value = newValue;
      const subscribers = Array.from(this.subscribers);
      for (const fn of subscribers) {
        if ((fn as any).notify) {
          (fn as any).notify(); // downstream computed, propagate immediately
        } else if (isEffect(fn)) {
          if ((isBatching || isAsyncBatching) && !isFlushingEffects) {
            // If it's a computed notify function, run it immediately
            if (isComputedNotify(fn)) {
              try {
                fn();
              } catch (error) {
                handleError(
                  error instanceof Error ? error : new Error(String(error)),
                  "signal setter",
                  this
                );
                throw error;
              }
            } else {
              pendingEffects.add(fn);
            }
          } else if (!isBatching && !isAsyncBatching) {
            try {
              fn();
            } catch (error) {
              handleError(
                error instanceof Error ? error : new Error(String(error)),
                "signal setter",
                this
              );
              throw error;
            }
          }
        }
      }
    }
  }

  subscribe(fn: () => void): () => void {
    // Only add if not already present
    if (!this.subscribers.has(fn)) {
      this.subscribers.add(fn);
    }
    return () => {
      this.subscribers.delete(fn);
    };
  }

  // For fine-grained: allow explicit unsubscribe
  unsubscribe(sub: ReactiveSubscriber) {
    this.explicitSubscribers.delete(sub);
  }

  // ReactiveSubscriber interface implementation
  onDependencySubscribe(subscriber: ReactiveSubscriber) {
    this.explicitSubscribers.add(subscriber);
  }

  onDependencyUnsubscribe(subscriber: ReactiveSubscriber) {
    this.explicitSubscribers.delete(subscriber);
  }
}

class ComputedImpl<T> implements Computed<T>, ReactiveSubscriber {
  private _value: T | undefined;
  private _dirty = true;
  private subscribers = new Set<() => void>();
  private computeFn: () => T;
  private dependencies = new Set<ReactiveSubscriber>();
  public unsubscribeFns: Array<() => void> = [];
  public errorBoundary?: ErrorBoundary;
  private _error: Error | null = null;

  constructor(computeFn: () => T, errorBoundary?: ErrorBoundary) {
    this.computeFn = computeFn;
    this.errorBoundary = errorBoundary;
    if (errorBoundary) {
      errorRecoveryMap.set(this, errorBoundary);
    }
  }

  get value(): T {
    // Reentrant safety check
    if (isReentrant && reentrantDepth > 10) {
      throw new Error("Maximum reentrant depth exceeded");
    }

    // Always recompute if dirty, regardless of batching mode
    if (this._dirty) this.recompute();

    // Always track dependencies for the computed itself
    const current = subscriberStack[subscriberStack.length - 1];
    if (current === this) {
      // This is the computed itself running, so track dependencies
      // (already handled in recompute)
    } else if (current) {
      // Only add the current effect as a subscriber if not in untracked mode
      if (!isUntracked) {
        current.onDependencySubscribe(this);
        if (currentSubscriber && !isBatching && !isAsyncBatching) {
          this.subscribers.add(currentSubscriber);
        }
      }
    }

    // Throw error if computation failed
    if (this._error) {
      throw this._error;
    }

    return this._value!;
  }

  set value(_: T) {
    throw new Error("Cannot set value on computed");
  }

  subscribe(fn: () => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  notify() {
    if (!this._dirty) {
      this._dirty = true;
      this._error = null; // Clear error on recomputation
      dirtyComputeds.add(this);
      const subscribers = Array.from(this.subscribers);
      for (const fn of subscribers) {
        if ((fn as any).notify) {
          (fn as any).notify(); // downstream computed, propagate immediately
        } else if (isEffect(fn)) {
          if ((isBatching || isAsyncBatching) && !isFlushingEffects) {
            // If it's a computed notify function, run it immediately
            if (isComputedNotify(fn)) {
              try {
                fn();
              } catch (error) {
                handleError(
                  error instanceof Error ? error : new Error(String(error)),
                  "computed notification",
                  this
                );
                throw error;
              }
            } else {
              pendingEffects.add(fn);
            }
          } else if (!isBatching && !isAsyncBatching) {
            try {
              fn();
            } catch (error) {
              handleError(
                error instanceof Error ? error : new Error(String(error)),
                "computed notification",
                this
              );
              throw error;
            }
          }
        }
      }
    }
  }

  public recompute() {
    // Check for circular dependencies
    if (subscriberStack.includes(this)) {
      const error = new Error("Circular dependency detected");
      this._error = error;
      this._dirty = false;
      return;
    }

    // Fine-grained: clean up old dependencies and subscriptions
    this.dependencies.forEach((dep) => {
      if (dep.onDependencyUnsubscribe) {
        dep.onDependencyUnsubscribe(this);
      }
    });
    this.dependencies.clear();
    // Call all unsubscribe functions and clear before new subscriptions
    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns = [];

    subscriberStack.push(this);
    const prev = currentSubscriber;
    currentSubscriber = () => this.notify();

    try {
      this._value = safeExecute(this.computeFn, "computed computation", this);
      this._dirty = false;
      this._error = null;
    } catch (error) {
      this._error = error instanceof Error ? error : new Error(String(error));
      this._dirty = false;
      // Don't re-throw here, let the getter handle it
    } finally {
      currentSubscriber = prev;
      subscriberStack.pop();
    }
  }

  // Fine-grained: track dependencies
  onDependencySubscribe(signal: ReactiveSubscriber) {
    this.dependencies.add(signal);
    // Subscribe to the signal for notifications
    if (signal.subscribe) {
      const unsubscribe = signal.subscribe(() => this.notify());
      this.unsubscribeFns.push(unsubscribe);
    }
  }
  onDependencyUnsubscribe(subscriber: ReactiveSubscriber) {
    this.dependencies.delete(subscriber);
  }
}

function signal<T>(initialValue: T, errorBoundary?: ErrorBoundary): Signal<T> {
  return new SignalImpl(initialValue, errorBoundary);
}

function computed<T>(fn: () => T, errorBoundary?: ErrorBoundary): Computed<T> {
  return new ComputedImpl(fn, errorBoundary);
}

function effect(fn: Effect, errorBoundary?: ErrorBoundary): () => void {
  return createEffect(fn, errorBoundary, true);
}

function createEffect(
  fn: Effect,
  errorBoundary?: ErrorBoundary,
  runImmediately: boolean = true
): () => void {
  let cleanup: (() => void) | undefined;
  let isDisposed = false;
  let errorCount = 0;
  const maxErrorRetries = 3;

  // Fine-grained: track dependencies and unsubscribe functions
  let dependencies = new Set<ReactiveSubscriber>();
  let unsubscribeFns: Array<() => void> = [];

  function run() {
    if (isDisposed) return;

    // Don't run effects during batching - they will be run when batch flushes
    if (isBatching || isAsyncBatching) {
      return;
    }

    // Reentrant safety check
    if (isReentrant && reentrantDepth > 10) {
      throw new Error("Maximum reentrant depth exceeded");
    }

    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        handleError(
          error instanceof Error ? error : new Error(String(error)),
          "effect cleanup",
          subscriber
        );
        // Re-throw for test compatibility
        throw error;
      }
    }

    // Clear old dependencies before running
    dependencies.forEach((dep) => {
      if (dep.onDependencyUnsubscribe) {
        dep.onDependencyUnsubscribe(subscriber);
      }
    });
    dependencies.clear();
    // Call all unsubscribe functions and clear before new subscriptions
    unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    unsubscribeFns = [];

    subscriberStack.push(subscriber);
    const prev = currentSubscriber;
    currentSubscriber = runner;

    try {
      const res = safeExecute(fn, "effect execution", subscriber);
      if (typeof res === "function") cleanup = res;
      errorCount = 0; // Reset error count on successful execution
    } catch (error) {
      errorCount++;
      if (errorCount > maxErrorRetries) {
        console.error(
          `Effect failed ${maxErrorRetries} times, stopping retries`
        );
        isDisposed = true;
      }
      // Re-throw to let error handling system deal with it
      throw error;
    } finally {
      currentSubscriber = prev;
      subscriberStack.pop();
    }
  }

  const runner = () => run();
  const subscriber: ReactiveSubscriber = {
    onDependencySubscribe(signal: ReactiveSubscriber) {
      dependencies.add(signal);
      // Subscribe to the signal for notifications
      if (signal.subscribe) {
        const unsubscribe = signal.subscribe(runner);
        unsubscribeFns.push(unsubscribe);
      }
    },
    onDependencyUnsubscribe(subscriber: ReactiveSubscriber) {
      dependencies.delete(subscriber);
    },
    run,
    unsubscribeFns,
    errorBoundary,
  };

  if (errorBoundary) {
    errorRecoveryMap.set(subscriber, errorBoundary);
  }

  if (runImmediately) {
    run();
  }

  return () => {
    isDisposed = true;
    if (cleanup) {
      try {
        cleanup();
      } catch (error) {
        handleError(
          error instanceof Error ? error : new Error(String(error)),
          "effect disposal",
          subscriber
        );
        // Re-throw for test compatibility
        throw error;
      }
    }
    dependencies.forEach((dep) => {
      if (dep.onDependencyUnsubscribe) {
        dep.onDependencyUnsubscribe(subscriber);
      }
    });
    dependencies.clear();
    unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    unsubscribeFns = [];
  };
}

/**
 * Executes a function without tracking dependencies on any signals or computed values.
 * This is useful when you want to read signal values without creating reactive dependencies.
 *
 * @param fn - The function to execute without dependency tracking
 * @returns The result of the function execution
 *
 * @example
 * ```typescript
 * const count = signal(0);
 * const name = signal("John");
 *
 * // This effect will only re-run when count changes, not when name changes
 * effect(() => {
 *   console.log(`Count: ${count.value}`);
 *   // Read name without creating a dependency
 *   untracked(() => {
 *     console.log(`Name: ${name.value}`);
 *   });
 * });
 * ```
 */
function untracked<T>(fn: () => T): T {
  const prev = isUntracked;
  isUntracked = true;
  try {
    return fn();
  } finally {
    isUntracked = prev;
  }
}

export {
  signal,
  computed,
  effect,
  batch,
  asyncBatch,
  flush,
  untracked,
  createErrorBoundary,
  createEffect,
  setGlobalErrorHandler,
  isSignal,
  isComputed,
};

export type {
  Signal,
  Computed,
  Effect,
  SignalValue,
  ComputedValue,
  ErrorHandler,
  ErrorBoundary,
};
