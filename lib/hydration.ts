import {
  VDOMNode,
  isElementNode,
  isResourceNode,
  isSignalNode,
  isListNode,
} from "./h";
import { effect, Signal, untracked } from "./signal";

// --- Hydration Context ---
interface HydrationContext {
  container: HTMLElement;
  domNodes: Map<Node, any>;
  effects: Set<() => void>;
  signals: Set<Signal<any>>;
  resources: Map<string, any>;
  hydrationData: Record<string, any>;
  mountedElements: Set<HTMLElement>;
  keyedElements: Map<string, HTMLElement>;
}

interface HydrationResult {
  cleanup: () => void;
  context: HydrationContext;
}

// --- Utility: Extract hydration data from script tag ---
function extractHydrationData(): Record<string, any> {
  const scriptElement = document.getElementById("sabrewing-resource-data");
  if (!scriptElement) return {};
  try {
    return JSON.parse(scriptElement.textContent || "{}");
  } catch (error) {
    return {};
  }
}

// --- Utility: Find next element node (skipping text/comments) ---
function nextElementNode(node: Node | null): HTMLElement | null {
  while (node) {
    if (node.nodeType === Node.ELEMENT_NODE) return node as HTMLElement;
    node = node.nextSibling;
  }
  return null;
}

// --- Utility: Find element by hydration attributes ---
function findHydrationElement(
  startNode: Node | null,
  type: string,
  id?: string
): HTMLElement | null {
  let el = startNode as HTMLElement | null;
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const hydrateType = el.getAttribute("data-hydrate");
      if (hydrateType === type) {
        if (!id || el.getAttribute("data-hydrate-id") === id) {
          return el;
        }
      }
    }
    el = nextElementNode(el.nextSibling);
  }
  return null;
}

// --- Utility: Find element by tag and position ---
function findElementByTag(
  startNode: Node | null,
  tag: string
): HTMLElement | null {
  let el = startNode as HTMLElement | null;
  while (el) {
    if (
      el.nodeType === Node.ELEMENT_NODE &&
      el.tagName.toLowerCase() === tag.toLowerCase()
    ) {
      return el;
    }
    el = nextElementNode(el.nextSibling);
  }
  return null;
}

// --- Utility: Find all hydration elements recursively ---
function findAllHydrationElements(
  startNode: Node | null,
  type: string
): HTMLElement[] {
  const elements: HTMLElement[] = [];
  let el = startNode as HTMLElement | null;
  while (el) {
    if (el.nodeType === Node.ELEMENT_NODE) {
      const hydrateType = el.getAttribute("data-hydrate");
      if (hydrateType === type) {
        elements.push(el);
      }
      // Also search children recursively
      const childElements = findAllHydrationElements(el.firstChild, type);
      elements.push(...childElements);
    }
    el = nextElementNode(el.nextSibling);
  }
  return elements;
}

// --- Utility: Recursively find all hydration elements in the DOM ---
// (Removed: no longer needed)

// --- Main Hydration Function ---
function hydrate(vnode: VDOMNode, container: HTMLElement): HydrationResult {
  // Set global hydration state
  setHydratingState(true);
  const hydrationData = extractHydrationData();
  const context: HydrationContext = {
    container,
    domNodes: new Map(),
    effects: new Set(),
    signals: new Set(),
    resources: new Map(),
    hydrationData,
    mountedElements: new Set(),
    keyedElements: new Map(),
  };

  // --- Recursive Hydration Walker ---
  function hydrateNode(
    vnode: VDOMNode,
    domNode: Node | null,
    parent: HTMLElement
  ): Node | null {
    // 1. Handle null/undefined/boolean
    if (vnode == null || typeof vnode === "boolean") return null;

    // 2. Handle text nodes
    if (typeof vnode === "string") {
      if (domNode && domNode.nodeType === Node.TEXT_NODE) {
        if (domNode.textContent !== vnode) domNode.textContent = vnode;
        return domNode;
      } else {
        // No matching text node, create one (should not happen in hydration)
        const text = document.createTextNode(vnode);
        parent.insertBefore(text, domNode);
        return text;
      }
    }

    // 3. Handle signals
    if (isSignalNode(vnode)) {
      // Find <div data-hydrate="signal" ...> with correct id
      let expectedId = undefined;
      if (domNode && (domNode as HTMLElement).getAttribute) {
        const id = (domNode as HTMLElement).getAttribute("data-hydrate-id");
        expectedId = id || undefined;
      }
      let el = findHydrationElement(domNode, "signal", expectedId);
      let created = false;
      if (!el) {
        // No matching element, create one (should not happen in hydration)
        el = document.createElement("div");
        el.setAttribute("data-hydrate", "signal");
        parent.insertBefore(el, domNode);
        created = true;
      }
      // Only add to mountedElements if the VDOM node is a signal node being hydrated
      if (isSignalNode(vnode) && el.hasAttribute("data-hydrate")) {
        context.mountedElements.add(el);
      }
      context.signals.add(vnode.signalValue);
      // Hydrate initial content
      const initialVNode = vnode.callback(vnode.signalValue.value);
      // Remove all children
      while (el.firstChild) el.removeChild(el.firstChild);
      hydrateNode(initialVNode, el.firstChild, el);

      // Set up effect that tracks all signals used within the callback
      const cleanup = effect(() => {
        // Call the callback to get the new VDOM
        const newVNode = vnode.callback(vnode.signalValue.value);
        // Remove all children
        while (el.firstChild) el.removeChild(el.firstChild);
        hydrateNode(newVNode, el.firstChild, el);
      });
      context.effects.add(cleanup);
      return el;
    }

    // 4. Handle lists (with keyed support)
    if (isListNode(vnode)) {
      // Try to get the expected id from the DOM node
      let expectedId = undefined;
      if (domNode && (domNode as HTMLElement).getAttribute) {
        const id = (domNode as HTMLElement).getAttribute("data-hydrate-id");
        expectedId = id || undefined;
      }

      // Find the list hydration element
      let el: HTMLElement | null = null;

      // Search for list element with data-hydrate="list"
      if (expectedId) {
        el = container.querySelector(
          `[data-hydrate="list"][data-hydrate-id="${expectedId}"]`
        ) as HTMLElement;
      }

      // If not found by ID, search for any list element
      if (!el) {
        const listElements = container.querySelectorAll(
          '[data-hydrate="list"]'
        );
        if (listElements.length > 0) {
          el = listElements[0] as HTMLElement;
        }
      }

      // If still not found, create a new container
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("data-hydrate", "list");
        parent.insertBefore(el, domNode);
      }

      // Add to mountedElements
      context.mountedElements.add(el);
      context.signals.add(vnode.signalValue);

      let firstRun = true;
      const cleanup = effect(() => {
        const currentItems = vnode.signalValue.value;
        hydrateListItems(
          el,
          currentItems,
          vnode.keyFn,
          vnode.renderFn,
          firstRun
        );
        firstRun = false;
      });
      context.effects.add(cleanup);
      return el;
    }

    // 5. Handle resources
    if (isResourceNode(vnode)) {
      let expectedId = undefined;
      if (domNode && (domNode as HTMLElement).getAttribute) {
        const id = (domNode as HTMLElement).getAttribute("data-hydrate-id");
        expectedId = id || undefined;
      }
      let el = findHydrationElement(domNode, "resource", expectedId);
      if (!el) {
        el = document.createElement("div");
        el.setAttribute("data-hydrate", "resource");
        parent.insertBefore(el, domNode);
      }
      // Only add to mountedElements if the VDOM node is a resource node being hydrated
      if (isResourceNode(vnode) && el.hasAttribute("data-hydrate")) {
        context.mountedElements.add(el);
      }
      hydrateResource(el, vnode, context);
      return el;
    }

    // 6. Handle elements
    if (isElementNode(vnode)) {
      let el: HTMLElement | null = null;

      // Try to reuse existing DOM node
      if (
        domNode &&
        (domNode as HTMLElement).tagName &&
        (domNode as HTMLElement).tagName.toLowerCase() ===
          vnode.tag.toLowerCase()
      ) {
        el = domNode as HTMLElement;
      } else {
        // Try to find a matching sibling
        el = findElementByTag(domNode, vnode.tag);
      }

      if (!el) {
        el = document.createElement(vnode.tag);
        parent.insertBefore(el, domNode);
      }

      // Apply props (including event handlers)
      if (vnode.props) {
        for (const [key, value] of Object.entries(vnode.props)) {
          if (key.startsWith("on") && typeof value === "function") {
            // Event handler - use addEventListener for proper event handling
            const eventName = key.slice(2).toLowerCase();
            el.addEventListener(eventName, value as EventListener);
          } else if (key === "key") {
            // Set data-key attribute for keyed elements
            el.setAttribute("data-key", String(value));
          } else if (key === "class") {
            // Handle className specially - use setAttribute for SVG compatibility
            el.setAttribute("class", String(value));
          } else if (key === "disabled") {
            // Handle disabled specially
            if (value) {
              el.setAttribute(key, "");
            } else {
              el.removeAttribute(key);
            }
          } else if (key === "checked") {
            // Handle checked as a property for checkboxes/radio buttons
            (el as any).checked = Boolean(value);
          } else if (
            ["readonly", "required", "multiple", "autofocus"].includes(key)
          ) {
            // Handle form boolean properties
            (el as any)[key === "readonly" ? "readOnly" : key] = Boolean(value);
          } else if (key === "value") {
            // Handle value as a property for input elements
            (el as any).value = String(value);
          } else if (
            key === "style" &&
            typeof value === "object" &&
            value !== null
          ) {
            // Handle style object with fine-grained reactivity: unwrap signals
            const styleString =
              Object.entries(value)
                .map(([prop, val]) => {
                  // Unwrap signal values for hydration
                  const unwrappedVal =
                    val &&
                    typeof val === "object" &&
                    "value" in val &&
                    typeof (val as any).subscribe === "function"
                      ? (val as any).value
                      : val;
                  return `${prop
                    .replace(/([A-Z])/g, "-$1")
                    .toLowerCase()}: ${unwrappedVal}`;
                })
                .join("; ") + ";";
            el.setAttribute("style", styleString);

            // Set up reactive effects for style signals during hydration
            for (const [prop, val] of Object.entries(value)) {
              if (
                val &&
                typeof val === "object" &&
                "value" in val &&
                typeof (val as any).subscribe === "function"
              ) {
                // Set up effect to update this style property when signal changes
                const cleanup = effect(() => {
                  el.style.setProperty(
                    prop.replace(/([A-Z])/g, "-$1").toLowerCase(),
                    (val as any).value
                  );
                });
                context.effects.add(cleanup);
              }
            }
          } else if (
            [
              "strokeWidth",
              "strokeLinecap",
              "strokeLinejoin",
              "strokeOpacity",
              "strokeDasharray",
              "strokeDashoffset",
              "fillOpacity",
              "fillRule",
              "clipRule",
              "clipPath",
              "textAnchor",
              "dominantBaseline",
              "fontFamily",
              "fontSize",
              "fontWeight",
              "fontStyle",
              "textDecoration",
              "letterSpacing",
              "wordSpacing",
              "textRendering",
              "writingMode",
              "textOrientation",
              "whiteSpace",
              "markerEnd",
              "markerStart",
              "markerMid",
              "stopColor",
              "stopOpacity",
              "floodColor",
              "floodOpacity",
              "lightingColor",
              "colorInterpolation",
              "colorRendering",
              "shapeRendering",
              "imageRendering",
              "pointerEvents",
              "colorProfile",
              "colorInterpolationFilters",
            ].includes(key)
          ) {
            // Handle specific SVG camelCase attributes - convert to kebab-case
            const kebabKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
            el.setAttribute(kebabKey, String(value));
          } else {
            // Regular attribute
            el.setAttribute(key, String(value));
          }
        }
      }

      // Do NOT add regular elements to mountedElements, even if they have data-hydrate attributes
      // Only signal, list, and resource nodes should be added when they are actually being hydrated

      // Hydrate children
      let vChildren = vnode.children;
      if (Array.isArray(vChildren)) {
        let domChild = el.firstChild;
        for (const child of vChildren.flat()) {
          domChild = hydrateNode(child, domChild, el)?.nextSibling || null;
        }
      } else if (vChildren != null) {
        hydrateNode(vChildren, el.firstChild, el);
      }

      return el;
    }
    // Fallback: skip
    return null;
  }

  // --- List Hydration Helper (purely attribute-based) ---
  function hydrateListItems(
    el: HTMLElement,
    items: any[],
    keyFn: (item: any, index: number) => string,
    renderFn: (item: any, i: number) => VDOMNode,
    firstRun: boolean = false
  ) {
    // Build a map of existing DOM children by their data-key attribute
    const domKeyMap = new Map<string, HTMLElement>();
    const elementsWithoutKeys: HTMLElement[] = [];

    for (const child of Array.from(el.children)) {
      const key = child.getAttribute("data-key");
      if (key) {
        domKeyMap.set(key, child as HTMLElement);
      } else {
        elementsWithoutKeys.push(child as HTMLElement);
      }
    }

    // Track which DOM nodes were used
    const usedDomNodes = new Set<HTMLElement>();
    const orderedNodes: HTMLElement[] = [];
    let withoutKeyIndex = 0;

    // Process each item in the new list
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const key = keyFn(item, i);
      const vnode = renderFn(item, i);

      // Check if we have an existing DOM element with this key
      const existingDomNode = domKeyMap.get(key);

      if (existingDomNode) {
        // Reuse existing DOM element
        usedDomNodes.add(existingDomNode);
        orderedNodes.push(existingDomNode);

        // Update the element's content by hydrating the VDOM node
        hydrateNode(vnode, existingDomNode, el);
      } else {
        // Check if we can reuse an element without key
        if (withoutKeyIndex < elementsWithoutKeys.length) {
          const elementWithoutKey = elementsWithoutKeys[withoutKeyIndex++];
          usedDomNodes.add(elementWithoutKey);
          orderedNodes.push(elementWithoutKey);

          // Add the key to the element
          elementWithoutKey.setAttribute("data-key", key);

          // Update the element's content by hydrating the VDOM node
          hydrateNode(vnode, elementWithoutKey, el);
        } else {
          // Create new DOM element
          const newDomNode = hydrateNode(vnode, null, el);
          if (newDomNode && isElementNode(vnode)) {
            (newDomNode as HTMLElement).setAttribute("data-key", key);
            orderedNodes.push(newDomNode as HTMLElement);
          }
        }
      }
    }

    // Remove any DOM nodes that weren't used (items that were removed)
    for (const [key, domNode] of domKeyMap) {
      if (!usedDomNodes.has(domNode)) {
        el.removeChild(domNode);
      }
    }

    // Remove any unused elements without keys
    for (const element of elementsWithoutKeys) {
      if (!usedDomNodes.has(element)) {
        el.removeChild(element);
      }
    }

    // Reorder DOM nodes to match the new order
    for (let i = 0; i < orderedNodes.length; i++) {
      const node = orderedNodes[i];
      const currentIndex = Array.from(el.children).indexOf(node);

      if (currentIndex !== i) {
        // Move the node to the correct position
        if (i === el.children.length - 1) {
          el.appendChild(node);
        } else {
          el.insertBefore(node, el.children[i]);
        }
      }
    }
  }

  // --- Resource Hydration Helper ---
  function hydrateResource(
    el: HTMLElement,
    vnode: any,
    context: HydrationContext
  ) {
    let currentPromise: Promise<any> | null = null;
    let currentStatus: "loading" | "success" | "failure" = "loading";
    let currentData: any = null;
    let currentError: Error | null = null;

    // Check for hydration data
    const resourceId = el.getAttribute("data-hydrate-id");
    const hasHydrationData = resourceId && context.hydrationData[resourceId];

    if (hasHydrationData) {
      const data = context.hydrationData[resourceId];
      currentStatus = data.status;
      currentData = data.data;
      currentError = data.error ? new Error(data.error) : null;
      // Always hydrate the children for the initial state
      let vdomToHydrate;
      if (currentStatus === "loading") {
        vdomToHydrate = vnode.options.loading();
      } else if (currentStatus === "success") {
        vdomToHydrate = vnode.options.success(currentData);
      } else if (currentStatus === "failure") {
        vdomToHydrate = vnode.options.failure(currentError!);
      }
      if (vdomToHydrate) {
        hydrateNode(vdomToHydrate, el.firstChild, el);
      }
    }

    // Hydrate initial state from DOM (do not clear on first run)
    let firstRun = true;
    const renderResourceState = () => {
      if (!firstRun) {
        while (el.firstChild) el.removeChild(el.firstChild);
      }
      let vdomToHydrate;
      if (currentStatus === "loading") {
        vdomToHydrate = vnode.options.loading();
      } else if (currentStatus === "success") {
        vdomToHydrate = vnode.options.success(currentData);
      } else if (currentStatus === "failure") {
        vdomToHydrate = vnode.options.failure(currentError!);
      }
      // Hydrate the VDOM for the current resource state
      if (vdomToHydrate) {
        hydrateNode(vdomToHydrate, el.firstChild, el);
      }
      firstRun = false;
    };

    const handlePromise = async (promise: Promise<any>) => {
      try {
        currentStatus = "loading";
        renderResourceState();
        const data = await promise;
        currentStatus = "success";
        currentData = data;
        currentError = null;
        renderResourceState();
      } catch (error) {
        currentStatus = "failure";
        currentError =
          error instanceof Error ? error : new Error(String(error));
        currentData = null;
        renderResourceState();
      }
    };

    // Set up the effect to track signal changes for reactive resources
    let cleanup: (() => void) | null = null;

    if (hasHydrationData) {
      // For hydration with data, we need to set up dependency tracking without triggering a fetch
      let isHydrationComplete = false;

      cleanup = effect(() => {
        // During hydration, if hydration data is present, establish dependencies from the dependency array
        if (!isHydrationComplete && hasHydrationData) {
          // Access dependencies to establish signal tracking without making network requests
          if (vnode.dependencies) {
            for (const dep of vnode.dependencies) {
              dep.value; // Access the signal value to establish dependency
            }
          }
          return;
        }

        // After hydration is complete, only call the async function if dependencies have changed
        // Access dependencies first to establish tracking, then call async function untracked
        if (vnode.dependencies) {
          for (const dep of vnode.dependencies) {
            dep.value; // Access the signal value to establish dependency
          }
        }
        const promise = untracked(() => vnode.asyncFn());
        if (promise !== currentPromise) {
          currentPromise = promise;
          handlePromise(promise);
        }
      });

      // Mark hydration as complete after a microtask and create a new effect for normal operation
      queueMicrotask(() => {
        isHydrationComplete = true;
        // Create a new effect for normal operation after hydration
        // This effect will only run when dependencies change, not immediately
        let isFirstRun = true;
        const normalCleanup = effect(() => {
          // Skip the first run to avoid calling the async function immediately after hydration
          if (isFirstRun) {
            isFirstRun = false;
            // Access dependencies to establish tracking without calling async function
            if (vnode.dependencies) {
              for (const dep of vnode.dependencies) {
                dep.value; // Access the signal value to establish dependency
              }
            }
            return;
          }

          // Access dependencies first to establish tracking, then call async function untracked
          if (vnode.dependencies) {
            for (const dep of vnode.dependencies) {
              dep.value; // Access the signal value to establish dependency
            }
          }
          const promise = untracked(() => vnode.asyncFn());
          if (promise !== currentPromise) {
            currentPromise = promise;
            handlePromise(promise);
          }
        });
        // Replace the cleanup function and add to context
        if (cleanup) {
          cleanup();
        }
        cleanup = normalCleanup;
        context.effects.add(normalCleanup);
      });
    } else {
      // No hydration data, create normal effect that runs immediately
      cleanup = effect(() => {
        // Access dependencies first to establish tracking, then call async function untracked
        if (vnode.dependencies) {
          for (const dep of vnode.dependencies) {
            dep.value; // Access the signal value to establish dependency
          }
        }
        const newPromise = untracked(() => vnode.asyncFn());
        if (newPromise !== currentPromise) {
          currentPromise = newPromise;
          handlePromise(newPromise);
        }
      });
    }

    if (cleanup) {
      context.effects.add(cleanup);
    }

    // Only render resource state if we don't have hydration data
    // If we have hydration data, the DOM already contains the correct content from SSR
    if (!hasHydrationData) {
      renderResourceState();
    }
  }

  // --- Start hydration at root ---
  hydrateNode(vnode, container.firstChild, container);

  // --- Cleanup function ---
  function cleanupHydrationContext(context: HydrationContext): void {
    for (const cleanup of context.effects) {
      try {
        cleanup();
      } catch (error) {}
    }
    context.domNodes.clear();
    context.effects.clear();
    context.signals.clear();
    context.resources.clear();
    context.mountedElements.clear();
    context.keyedElements.clear();
    for (const key in context.hydrationData) delete context.hydrationData[key];
  }

  // Clear hydration state after a microtask
  queueMicrotask(() => {
    setHydratingState(false);
  });

  return {
    cleanup: () => cleanupHydrationContext(context),
    context,
  };
}

// Global hydration state
let isHydrating = false;

function setHydratingState(hydrating: boolean) {
  isHydrating = hydrating;
}

function getHydratingState(): boolean {
  return isHydrating;
}

// --- Utility: Check if an element is hydrated ---
function isHydrated(element: HTMLElement): boolean {
  return element.hasAttribute("data-hydrate");
}

function getHydrationId(element: HTMLElement): string | null {
  return element.getAttribute("data-hydrate-id");
}

function getHydrationType(element: HTMLElement): string | null {
  return element.getAttribute("data-hydrate");
}

function getElementKey(element: HTMLElement): string | null {
  return element.getAttribute("data-key");
}

export {
  hydrate,
  getHydratingState,
  isHydrated,
  getHydrationId,
  getHydrationType,
  getElementKey,
  setHydratingState,
};
