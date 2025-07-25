import "../setup";
import { describe, it, expect } from "vitest";
import { signal, computed, effect, untracked } from "../../lib/signal";
import { h } from "../../lib/h";
import { renderToDOM } from "../../lib/renderToDOM";

describe("untracked", () => {
  it("should read signal values without creating dependencies", () => {
    const count = signal(0);
    const name = signal("John");
    let effectRuns = 0;
    let untrackedValue = "";

    const eff = effect(() => {
      effectRuns++;
      // This should create a dependency on count
      console.log(`Count: ${count.value}`);
      // This should NOT create a dependency on name
      untracked(() => {
        untrackedValue = name.value;
      });
    });

    expect(effectRuns).toBe(1);
    expect(untrackedValue).toBe("John");

    // Changing name should not trigger the effect
    name.value = "Jane";
    expect(effectRuns).toBe(1);
    expect(untrackedValue).toBe("John"); // Still old value

    // Changing count should trigger the effect
    count.value = 5;
    expect(effectRuns).toBe(2);
    expect(untrackedValue).toBe("Jane"); // Updated in the new run

    eff();
  });

  it("should work with computed values", () => {
    const a = signal(1);
    const b = signal(2);
    const sum = computed(() => a.value + b.value);
    let effectRuns = 0;
    let untrackedSum = 0;

    const eff = effect(() => {
      effectRuns++;
      // This should create a dependency on a
      console.log(`A: ${a.value}`);
      // This should NOT create a dependency on sum
      untracked(() => {
        untrackedSum = sum.value;
        console.log(`Untracked sum: ${untrackedSum}`);
      });
    });

    expect(effectRuns).toBe(1);
    expect(untrackedSum).toBe(3);

    // Changing b should not trigger the effect
    b.value = 5;
    expect(effectRuns).toBe(1);
    expect(untrackedSum).toBe(3); // Still old value

    // Changing a should trigger the effect
    a.value = 10;
    expect(effectRuns).toBe(2);
    // The computed should be reactive and update to the new value (10 + 5 = 15)
    // even when accessed in untracked mode, because it tracks its own dependencies
    expect(untrackedSum).toBe(15);

    // If we read sum.value outside the effect (tracked), it should also be up to date
    expect(sum.value).toBe(15);

    eff();
  });

  it("should work with nested untracked calls", () => {
    const count = signal(0);
    let effectRuns = 0;
    let nestedValue = 0;

    const eff = effect(() => {
      effectRuns++;
      untracked(() => {
        nestedValue = count.value;
        untracked(() => {
          // This should also be untracked
          console.log(`Nested: ${count.value}`);
        });
      });
    });

    expect(effectRuns).toBe(1);
    expect(nestedValue).toBe(0);

    // Changing count should not trigger the effect
    count.value = 5;
    expect(effectRuns).toBe(1);
    expect(nestedValue).toBe(0);

    eff();
  });

  it("should restore tracking after untracked call", () => {
    const count = signal(0);
    const name = signal("John");
    let effectRuns = 0;

    const eff = effect(() => {
      effectRuns++;
      // This should create a dependency
      console.log(`Count: ${count.value}`);

      untracked(() => {
        // This should not create a dependency
        console.log(`Name: ${name.value}`);
      });

      // This should create a dependency again
      console.log(`Count again: ${count.value}`);
    });

    expect(effectRuns).toBe(1);

    // Changing name should not trigger the effect
    name.value = "Jane";
    expect(effectRuns).toBe(1);

    // Changing count should trigger the effect
    count.value = 5;
    expect(effectRuns).toBe(2);

    eff();
  });

  it("should handle errors in untracked functions", () => {
    const count = signal(0);
    let effectRuns = 0;

    const eff = effect(() => {
      effectRuns++;
      try {
        untracked(() => {
          throw new Error("Test error");
        });
      } catch (error) {
        // Error should be caught
        console.log("Caught error in untracked");
      }
      // This should still create a dependency
      console.log(`Count: ${count.value}`);
    });

    expect(effectRuns).toBe(1);

    // Changing count should still trigger the effect
    count.value = 5;
    expect(effectRuns).toBe(2);

    eff();
  });

  it("should work with return values", () => {
    const x = signal(1);
    const y = signal(2);

    const result = untracked(() => {
      return x.value + y.value;
    });

    expect(result).toBe(3);
  });

  it("should work with resource async functions", async () => {
    const dep = signal("A");
    let fetchCount = 0;
    let dependencyEstablished = false;

    // Create a resource that accesses a signal inside the async function
    const resource = h.resource(
      async () => {
        fetchCount++;
        // This should NOT establish a dependency because it's called in untracked context
        const value = dep.value;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `Data: ${value}`;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep] // Explicit dependency array
    );

    const container = document.createElement("div");
    const cleanup = renderToDOM(resource, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");
    expect(fetchCount).toBe(1);

    // Wait for initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: A");

    // Change dependency - should trigger refetch because of dependency array
    dep.value = "B";

    // Wait a bit for the effect to run and show loading
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(fetchCount).toBe(2);

    // Wait for refetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: B");

    cleanup();
  });

  it("should not establish dependencies when async function accesses signals without dependency array", async () => {
    const dep = signal("A");
    let fetchCount = 0;

    // Create a resource that accesses a signal inside the async function
    // but WITHOUT a dependency array - this should NOT trigger refetches
    const resource = h.resource(
      async () => {
        fetchCount++;
        // This should NOT establish a dependency because it's called in untracked context
        const value = dep.value;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `Data: ${value}`;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      }
      // No dependency array
    );

    const container = document.createElement("div");
    const cleanup = renderToDOM(resource, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");
    expect(fetchCount).toBe(1);

    // Wait for initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: A");

    // Change dependency - should NOT trigger refetch because no dependency array
    dep.value = "B";

    // Wait a bit - should not trigger refetch
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchCount).toBe(1); // Should still be 1, not 2
    expect(container.innerHTML).toContain("Data: A"); // Should still show old data

    cleanup();
  });

  it("should work with multiple dependencies in dependency array", async () => {
    const dep1 = signal("A");
    const dep2 = signal(1);
    let fetchCount = 0;

    const resource = h.resource(
      async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `Data: ${dep1.value}-${dep2.value}`;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [dep1, dep2] // Multiple dependencies
    );

    const container = document.createElement("div");
    const cleanup = renderToDOM(resource, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");
    expect(fetchCount).toBe(1);

    // Wait for initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: A-1");

    // Change first dependency
    dep1.value = "B";
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchCount).toBe(2);
    expect(container.innerHTML).toContain("Data: B-1");

    // Change second dependency
    dep2.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchCount).toBe(3);
    expect(container.innerHTML).toContain("Data: B-2");

    cleanup();
  });

  it("should work with computed dependencies in dependency array", async () => {
    const base = signal(1);
    const computedValue = computed(() => base.value * 2);
    let fetchCount = 0;

    const resource = h.resource(
      async () => {
        fetchCount++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `Data: ${computedValue.value}`;
      },
      {
        loading: () => h("div", {}, "Loading..."),
        success: (data) => h("div", {}, data),
        failure: (error) => h("div", {}, `Error: ${error.message}`),
      },
      [computedValue] // Computed dependency
    );

    const container = document.createElement("div");
    const cleanup = renderToDOM(resource, container);

    // Initially should show loading
    expect(container.innerHTML).toContain("Loading...");
    expect(fetchCount).toBe(1);

    // Wait for initial fetch to complete
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(container.innerHTML).toContain("Data: 2");

    // Change base signal - should trigger refetch because computed depends on it
    base.value = 3;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetchCount).toBe(2);
    expect(container.innerHTML).toContain("Data: 6");

    cleanup();
  });
});
