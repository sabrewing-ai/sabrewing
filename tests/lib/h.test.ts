import { describe, test, expect } from "vitest";
import { h, type ResourceOptions } from "../../lib/h";
import { signal } from "../../lib/signal";
import { batch } from "../../lib/signal";
import { computed, effect } from "../../lib/signal";

describe("h function", () => {
  test("creates element nodes with tag, props, and children", () => {
    const result = h(
      "div",
      { id: "test", class: "container" },
      "Hello",
      "World"
    );

    expect(result).toEqual({
      tag: "div",
      props: { id: "test", class: "container" },
      children: ["Hello", "World"],
    });
  });

  test("creates element nodes with only tag", () => {
    const result = h("span");

    expect(result).toEqual({
      tag: "span",
      props: {},
      children: [],
    });
  });

  test("creates element nodes with tag and props only", () => {
    const result = h("div", { id: "test" });

    expect(result).toEqual({
      tag: "div",
      props: { id: "test" },
      children: [],
    });
  });

  test("creates element nodes with tag and children only", () => {
    const result = h("div", undefined, "Hello");

    expect(result).toEqual({
      tag: "div",
      props: {},
      children: ["Hello"],
    });
  });

  test("creates element nodes with style object", () => {
    const result = h(
      "div",
      {
        style: {
          color: "red",
          fontSize: "16px",
          backgroundColor: "#f0f0f0",
        },
      },
      "Styled content"
    );

    expect(result).toEqual({
      tag: "div",
      props: {
        style: {
          color: "red",
          fontSize: "16px",
          backgroundColor: "#f0f0f0",
        },
      },
      children: ["Styled content"],
    });
  });

  test("creates element nodes with mixed props including style", () => {
    const result = h(
      "div",
      {
        id: "container",
        class: "main-content",
        style: {
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        },
      },
      "Centered content"
    );

    expect(result).toEqual({
      tag: "div",
      props: {
        id: "container",
        class: "main-content",
        style: {
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
        },
      },
      children: ["Centered content"],
    });
  });

  test("calls function components with props and children", () => {
    const TestComponent = (props?: any, ...children: any[]) => {
      return h("div", { ...props }, ...children);
    };

    const result = h(TestComponent, { id: "test" }, "Hello");

    expect(result).toEqual({
      tag: "div",
      props: { id: "test" },
      children: ["Hello"],
    });
  });

  test("calls function components with no props", () => {
    const TestComponent = () => h("span", {}, "Test");

    const result = h(TestComponent);

    expect(result).toEqual({
      tag: "span",
      props: {},
      children: ["Test"],
    });
  });
});

describe("h.resource", () => {
  test("creates resource nodes with async function and options", () => {
    const asyncFn = async () => ({ title: "Test Post" });
    const options: ResourceOptions<{ title: string }> = {
      loading: () => h("div", {}, "Loading..."),
      success: (data) => h("div", {}, data.title),
      failure: (error) => h("div", {}, `Error: ${error.message}`),
    };

    const result = h.resource(asyncFn, options);

    expect(result.type).toBe("RESOURCE");
    expect(result.id).toMatch(/^resource_\d+_\d+\.\d+$/);
    expect(result.asyncFn).toBe(asyncFn);
    expect(result.options).toBe(options);
  });
});

describe("h.signal", () => {
  test("creates signal nodes with signal value and callback", () => {
    const count = signal(42);
    const callback = (value: number) => h("span", {}, `Count: ${value}`);

    const result = h.signal(count, callback);

    expect(result).toEqual({
      type: "SIGNAL",
      signalValue: count,
      callback,
    });
  });
});

describe("h.list", () => {
  test("creates list nodes with signal array, key function, and render function", () => {
    const items = signal(["a", "b", "c"]);
    const keyFn = (item: string, index: number) => index.toString();
    const renderFn = (item: string, index: number) => h("li", {}, String(item));

    const result = h.list(items, keyFn, renderFn);

    expect(result).toEqual({
      type: "LIST",
      signalValue: items,
      keyFn,
      renderFn,
    });
  });
});

describe("h batching", () => {
  test("batched signal updates only affect final h.signal value", () => {
    const count = signal(0);
    const callback = (value: number) => h("span", {}, `Count: ${value}`);
    batch(() => {
      count.value = 1;
      count.value = 2;
      count.value = 3;
    });
    const result = h.signal(count, callback);
    // The callback is not called here, but the signal value should be 3
    expect(result.signalValue.value).toBe(3);
    // Optionally, check the callback output
    const vnode = result.callback(result.signalValue.value);
    expect(vnode).toEqual({ tag: "span", props: {}, children: ["Count: 3"] });
  });

  test("batched updates with h.list only affect final array", () => {
    const items = signal(["a"]);
    const keyFn = (item: string, index: number) => index.toString();
    const renderFn = (item: string, index: number) => h("li", {}, String(item));
    batch(() => {
      items.value = ["b", "c"];
      items.value = ["x", "y", "z"];
    });
    const result = h.list(items, keyFn, renderFn);
    expect(result.signalValue.value).toEqual(["x", "y", "z"]);
    // Optionally, check the callback output for each item
    const vnodes = result.signalValue.value.map((item, i) =>
      result.renderFn(item, i)
    );
    expect(vnodes).toEqual([
      { tag: "li", props: {}, children: ["x"] },
      { tag: "li", props: {}, children: ["y"] },
      { tag: "li", props: {}, children: ["z"] },
    ]);
  });

  test("nested batch calls with h.signal", () => {
    const x = signal(1);
    batch(() => {
      x.value = 2;
      batch(() => {
        x.value = 3;
      });
      x.value = 4;
    });
    const callback = (value: number) => h("span", {}, `Value: ${value}`);
    const result = h.signal(x, callback);
    expect(result.signalValue.value).toBe(4);
    const vnode = result.callback(result.signalValue.value);
    expect(vnode).toEqual({ tag: "span", props: {}, children: ["Value: 4"] });
  });
});

describe("h computed and effect", () => {
  test("h.signal works with computed", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    const callback = (value: number) => h("span", {}, `Sum: ${value}`);
    const result = h.signal(sum, callback);
    expect(result.signalValue.value).toBe(5);
    a.value = 10;
    expect(result.signalValue.value).toBe(13);
    const vnode = result.callback(result.signalValue.value);
    expect(vnode).toEqual({ tag: "span", props: {}, children: ["Sum: 13"] });
  });

  test("h.list works with computed array", () => {
    const a = signal(1);
    const b = signal(2);
    const arr = computed(() => [a.value, b.value, a.value + b.value]);
    const keyFn = (item: number, index: number) => index.toString();
    const renderFn = (item: number, index: number) => h("li", {}, item);
    const result = h.list(arr, keyFn, renderFn);
    expect(result.signalValue.value).toEqual([1, 2, 3]);
    a.value = 5;
    expect(result.signalValue.value).toEqual([5, 2, 7]);
    const vnodes = result.signalValue.value.map((item, i) =>
      result.renderFn(item, i)
    );
    expect(vnodes).toEqual([
      { tag: "li", props: {}, children: [5] },
      { tag: "li", props: {}, children: [2] },
      { tag: "li", props: {}, children: [7] },
    ]);
  });

  test("effect triggers on h.signal value change", () => {
    const count = signal(0);
    let observed = 0;
    effect(() => {
      observed = count.value;
    });
    count.value = 42;
    expect(observed).toBe(42);
    const callback = (value: number) => h("span", {}, `Count: ${value}`);
    const result = h.signal(count, callback);
    expect(result.signalValue.value).toBe(42);
  });

  test("effect triggers on h.list value change", () => {
    const items = signal(["a"]);
    let observed: string[] = [];
    effect(() => {
      observed = items.value;
    });
    items.value = ["x", "y"];
    expect(observed).toEqual(["x", "y"]);
    const keyFn = (item: string, index: number) => index.toString();
    const renderFn = (item: string, index: number) => h("li", {}, item);
    const result = h.list(items, keyFn, renderFn);
    expect(result.signalValue.value).toEqual(["x", "y"]);
  });
});

describe("h fine-grained reactivity (auto signal wrapping)", () => {
  test("auto-wraps function child as SignalNode and renders value as string", () => {
    const count = signal(123);
    const vnode = h("div", {}, (() => count.value) as any);
    // Should be an element node with a SignalNode child
    expect(vnode.children && vnode.children.length).toBe(1);
    const child = vnode.children![0];
    expect(
      child &&
        typeof child === "object" &&
        "type" in child &&
        child.type === "SIGNAL"
    ).toBe(true);
    // The callback should render the value as a string
    const rendered = (child as any).callback((child as any).signalValue.value);
    expect(rendered).toBe("123");
  });

  test("auto-wraps function child with computed and renders value as string", () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    const vnode = h("div", {}, (() => sum.value) as any);
    const child = vnode.children![0];
    expect(
      child &&
        typeof child === "object" &&
        "type" in child &&
        child.type === "SIGNAL"
    ).toBe(true);
    const rendered = (child as any).callback((child as any).signalValue.value);
    expect(rendered).toBe("5");
    a.value = 10;
    expect((child as any).signalValue.value).toBe(13);
    expect((child as any).callback((child as any).signalValue.value)).toBe(
      "13"
    );
  });

  test("auto-wraps function child and renders VDOM node if value is VDOM", () => {
    const vdomSignal = signal(h("span", {}, "hi"));
    const vnode = h("div", {}, (() => vdomSignal.value) as any);
    const child = vnode.children![0];
    expect(
      child &&
        typeof child === "object" &&
        "type" in child &&
        child.type === "SIGNAL"
    ).toBe(true);
    const rendered = (child as any).callback((child as any).signalValue.value);
    expect(rendered).toEqual({ tag: "span", props: {}, children: ["hi"] });
  });
});

describe("Type exports", () => {
  test("exports all necessary types", () => {
    // This test ensures all types are properly exported
    expect(typeof h).toBe("function");
    expect(h.list).toBeDefined();
    expect(h.resource).toBeDefined();
    expect(h.signal).toBeDefined();
  });
});
