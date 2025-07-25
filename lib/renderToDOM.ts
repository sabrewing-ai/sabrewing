import {
  VDOMNode,
  isElementNode,
  isResourceNode,
  isSignalNode,
  isListNode,
} from "./h";
import { effect, Signal, untracked } from "./signal";

// Types for DOM rendering
interface DOMNode {
  element: HTMLElement | Text;
  type: "element" | "text" | "fragment";
  children?: DOMNode[];
  effects: Array<() => void>;
  signals: Set<Signal<any>>;
  resources?: Map<string, any>;
}

interface RenderContext {
  container: HTMLElement;
  domNodes: Map<HTMLElement | Text, DOMNode>;
  effects: Set<() => void>;
  signals: Set<Signal<any>>;
  resources: Map<string, any>;
  hydrationData?: Record<string, any>;
  keyedElements: Map<string, HTMLElement>; // Track keyed elements for efficient matching
}

// Generate unique IDs for hydration
let hydrationIdCounter = (globalThis as any).hydrationIdCounter || 0;
const generateHydrationId = (type: string) => {
  hydrationIdCounter = (globalThis as any).hydrationIdCounter =
    hydrationIdCounter + 1;
  return `${type}_${hydrationIdCounter}`;
};

// Key extraction utility
function extractKey(vnode: VDOMNode): string | null {
  if (isElementNode(vnode) && vnode.props && vnode.props.key !== undefined) {
    return String(vnode.props.key);
  }
  return null;
}

// Efficient keyed list diffing and updating
function updateKeyedListDOM(
  container: HTMLElement,
  items: any[],
  keyFn: (item: any, index: number) => string,
  renderFn: (item: any, index: number) => VDOMNode,
  context: RenderContext
): DOMNode[] {
  const existingElements = Array.from(container.children) as HTMLElement[];
  const existingKeys = new Map<string, HTMLElement>();

  // Build map of existing keyed elements
  for (const element of existingElements) {
    const key = element.getAttribute("data-key");
    if (key) {
      existingKeys.set(key, element);
    }
  }

  const newChildren: DOMNode[] = [];
  const usedKeys = new Set<string>();

  // Process each item in the new list
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = keyFn(item, i);
    const childVNode = renderFn(item, i);

    if (key && existingKeys.has(key)) {
      // Reuse existing element
      const existingElement = existingKeys.get(key)!;
      usedKeys.add(key);

      // Update element content if needed
      const childNode = createDOMElement(childVNode, context);
      existingElement.innerHTML = "";
      existingElement.appendChild(childNode.element);
      newChildren.push(childNode);
    } else {
      // Create new element
      const childNode = createDOMElement(childVNode, context);
      if (key) {
        (childNode.element as HTMLElement).setAttribute("data-key", key);
        context.keyedElements.set(key, childNode.element as HTMLElement);
      }
      newChildren.push(childNode);
    }
  }

  // Remove unused elements
  for (const [key, element] of existingKeys) {
    if (!usedKeys.has(key)) {
      element.remove();
      context.keyedElements.delete(key);
    }
  }

  return newChildren;
}

// Cleanup function to dispose of effects and signals
function cleanupDOMNode(domNode: DOMNode) {
  // Cleanup all effects
  for (const cleanup of domNode.effects) {
    try {
      cleanup();
    } catch (error) {
      console.error("Error during effect cleanup:", error);
    }
  }
  domNode.effects.length = 0;

  // Clear signal subscriptions
  domNode.signals.clear();

  // Cleanup children recursively
  if (domNode.children) {
    for (const child of domNode.children) {
      cleanupDOMNode(child);
    }
  }
}

// Create DOM element from VDOM node
function createDOMElement(vnode: VDOMNode, context: RenderContext): DOMNode {
  if (typeof vnode === "string") {
    const textNode = document.createTextNode(vnode);
    const domNode: DOMNode = {
      element: textNode,
      type: "text",
      effects: [],
      signals: new Set(),
    };
    context.domNodes.set(textNode, domNode);
    return domNode;
  }

  if (vnode == null || vnode === undefined) {
    const textNode = document.createTextNode("");
    const domNode: DOMNode = {
      element: textNode,
      type: "text",
      effects: [],
      signals: new Set(),
    };
    context.domNodes.set(textNode, domNode);
    return domNode;
  }

  // Handle resource nodes
  if (isResourceNode(vnode)) {
    return createResourceDOMNode(vnode, context);
  }

  // Handle signal nodes
  if (isSignalNode(vnode)) {
    return createSignalDOMNode(vnode, context);
  }

  // Handle list nodes
  if (isListNode(vnode)) {
    return createListDOMNode(vnode, context);
  }

  // Handle element nodes
  if (isElementNode(vnode)) {
    return createElementDOMNode(vnode, context);
  }

  // Fallback for unknown nodes
  const textNode = document.createTextNode(String(vnode));
  const domNode: DOMNode = {
    element: textNode,
    type: "text",
    effects: [],
    signals: new Set(),
  };
  context.domNodes.set(textNode, domNode);
  return domNode;
}

// Create resource DOM node with async loading
function createResourceDOMNode(vnode: any, context: RenderContext): DOMNode {
  const container = document.createElement("div");
  const hydrationId = generateHydrationId("resource");
  container.setAttribute("data-hydrate", "resource");
  container.setAttribute("data-hydrate-id", hydrationId);

  const domNode: DOMNode = {
    element: container,
    type: "element",
    effects: [],
    signals: new Set(),
    resources: new Map(),
  };

  context.domNodes.set(container, domNode);

  // Track current resource state
  let currentPromise: Promise<any> | null = null;
  let currentStatus: "loading" | "success" | "failure" = "loading";
  let currentData: any = null;
  let currentError: Error | null = null;

  // Function to render current resource state
  const renderResourceState = () => {
    container.innerHTML = "";

    if (currentStatus === "loading") {
      const loadingNode = createDOMElement(vnode.options.loading(), context);
      container.appendChild(loadingNode.element);
      domNode.children = [loadingNode];
    } else if (currentStatus === "success") {
      const successNode = createDOMElement(
        vnode.options.success(currentData),
        context
      );
      container.appendChild(successNode.element);
      domNode.children = [successNode];
    } else if (currentStatus === "failure") {
      const failureNode = createDOMElement(
        vnode.options.failure(currentError!),
        context
      );
      container.appendChild(failureNode.element);
      domNode.children = [failureNode];
    }
  };

  // Function to handle promise resolution
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
      currentError = error instanceof Error ? error : new Error(String(error));
      currentData = null;
      renderResourceState();
    }
  };

  // Check for hydration data first
  if (context.hydrationData && context.hydrationData[hydrationId]) {
    const hydratedData = context.hydrationData[hydrationId];
    if (hydratedData.status === "success") {
      currentStatus = "success";
      currentData = hydratedData.data;
      currentError = null;
    } else {
      currentStatus = "failure";
      currentError = new Error(hydratedData.error);
      currentData = null;
    }
    renderResourceState();
  } else {
    // Start with loading state
    renderResourceState();
  }

  // Always set up reactive effect to track resource function changes (even after hydration)
  const cleanup = effect(() => {
    // Access dependencies to establish signal tracking
    if (vnode.dependencies) {
      for (const dep of vnode.dependencies) {
        dep.value; // Access the signal value to establish dependency
      }
    }

    // Call the resource function to get the current promise (untracked to avoid unwanted dependencies)
    const newPromise = untracked(() => vnode.asyncFn());

    // Only update if the promise reference has changed
    if (newPromise !== currentPromise) {
      currentPromise = newPromise;
      handlePromise(newPromise);
    }
  });

  domNode.effects.push(cleanup);
  context.effects.add(cleanup);

  return domNode;
}

// Create signal DOM node with reactive updates
function createSignalDOMNode(vnode: any, context: RenderContext): DOMNode {
  const container = document.createElement("div");
  const hydrationId = generateHydrationId("signal");
  container.setAttribute("data-hydrate", "signal");
  container.setAttribute("data-hydrate-id", hydrationId);

  const domNode: DOMNode = {
    element: container,
    type: "element",
    effects: [],
    signals: new Set(),
  };

  context.domNodes.set(container, domNode);
  context.signals.add(vnode.signalValue);

  // Create initial content
  const initialValue = vnode.signalValue.value;
  const initialVNode = vnode.callback(initialValue);
  const initialNode = createDOMElement(initialVNode, context);
  container.appendChild(initialNode.element);
  domNode.children = [initialNode];

  // Create reactive effect for updates
  const cleanup = effect(() => {
    const currentValue = vnode.signalValue.value;
    const newVNode = vnode.callback(currentValue);

    // Cleanup old children
    if (domNode.children) {
      for (const child of domNode.children) {
        cleanupDOMNode(child);
      }
    }

    // Create new content
    const newChild = createDOMElement(newVNode, context);
    container.innerHTML = "";
    container.appendChild(newChild.element);
    domNode.children = [newChild];
  });

  domNode.effects.push(cleanup);
  context.effects.add(cleanup);

  return domNode;
}

// Create list DOM node with reactive list updates and keyed support
function createListDOMNode(vnode: any, context: RenderContext): DOMNode {
  const container = document.createElement("div");
  const hydrationId = generateHydrationId("list");
  container.setAttribute("data-hydrate", "list");
  container.setAttribute("data-hydrate-id", hydrationId);

  const domNode: DOMNode = {
    element: container,
    type: "element",
    effects: [],
    signals: new Set(),
  };

  context.domNodes.set(container, domNode);
  context.signals.add(vnode.signalValue);

  // Create reactive effect for list updates with keyed support
  const cleanup = effect(() => {
    const currentItems = vnode.signalValue.value;

    // Cleanup old children
    if (domNode.children) {
      for (const child of domNode.children) {
        cleanupDOMNode(child);
      }
    }

    // Use efficient keyed update
    const newChildren = updateKeyedListDOM(
      container,
      currentItems,
      vnode.keyFn,
      vnode.renderFn,
      context
    );

    // Clear and re-append
    container.innerHTML = "";
    for (const child of newChildren) {
      container.appendChild(child.element);
    }
    domNode.children = newChildren;
  });

  domNode.effects.push(cleanup);
  context.effects.add(cleanup);

  return domNode;
}

// Create element DOM node
function createElementDOMNode(vnode: any, context: RenderContext): DOMNode {
  const element = document.createElement(vnode.tag);

  // Prepare domNode before props loop so we can push effects for style signals
  const domNode: DOMNode = {
    element,
    type: "element",
    effects: [],
    signals: new Set(),
  };

  context.domNodes.set(element, domNode);

  // Set attributes and properties
  if (vnode.props) {
    for (const [key, value] of Object.entries(vnode.props)) {
      if (key.startsWith("on") && typeof value === "function") {
        // Handle event listeners
        const eventName = key.slice(2).toLowerCase();

        // Remove any existing event listeners for this event type
        const existingListeners =
          (element as any)._eventListeners?.[eventName] || [];
        for (const listener of existingListeners) {
          element.removeEventListener(eventName, listener);
        }

        // Add the new event listener
        element.addEventListener(eventName, value as EventListener);

        // Store the listener for future cleanup
        if (!(element as any)._eventListeners) {
          (element as any)._eventListeners = {};
        }
        if (!(element as any)._eventListeners[eventName]) {
          (element as any)._eventListeners[eventName] = [];
        }
        (element as any)._eventListeners[eventName].push(
          value as EventListener
        );
      } else if (key === "class") {
        // Handle className as a property
        (element as any).className = String(value);
      } else if (
        key === "style" &&
        typeof value === "object" &&
        value !== null
      ) {
        // Fine-grained reactivity: support signals in style objects
        for (const [prop, val] of Object.entries(value)) {
          if (
            val &&
            typeof val === "object" &&
            "value" in val &&
            typeof val.subscribe === "function"
          ) {
            // Assume it's a signal
            // Set initial value
            element.style.setProperty(
              prop.replace(/([A-Z])/g, "-$1").toLowerCase(),
              val.value
            );
            // Set up effect for reactivity
            const cleanup = effect(() => {
              element.style.setProperty(
                prop.replace(/([A-Z])/g, "-$1").toLowerCase(),
                val.value
              );
            });
            domNode.effects.push(cleanup);
          } else {
            // Regular style value
            element.style.setProperty(
              prop.replace(/([A-Z])/g, "-$1").toLowerCase(),
              val
            );
          }
        }
      } else if (key === "disabled") {
        // Handle disabled as a property
        (element as any).disabled = Boolean(value);
      } else if (key === "checked") {
        // Handle checked as a property
        (element as any).checked = Boolean(value);
      } else if (
        ["readonly", "required", "multiple", "autofocus"].includes(key)
      ) {
        // Handle form boolean properties
        (element as any)[key === "readonly" ? "readOnly" : key] =
          Boolean(value);
      } else if (key === "value") {
        // Handle value as a property
        (element as any).value = String(value);
      } else if (key === "key") {
        // Handle key prop by setting data-key attribute
        element.setAttribute("data-key", String(value));
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
        element.setAttribute(kebabKey, String(value));
      } else {
        // Handle regular attributes
        element.setAttribute(key, String(value));
      }
    }
  }

  // Create children
  if (vnode.children && vnode.children.length > 0) {
    const validChildren = vnode.children.filter(
      (child: any) => child !== null && child !== undefined
    );

    const childNodes = validChildren.map((child: any) =>
      createDOMElement(child, context)
    );

    for (const childNode of childNodes) {
      element.appendChild(childNode.element);
    }
    domNode.children = childNodes;
  }

  return domNode;
}

// Main renderToDOM function
function renderToDOM(
  vnode: VDOMNode,
  container: HTMLElement,
  hydrationData?: Record<string, any>
): () => void {
  // Clear container
  container.innerHTML = "";

  // Create render context
  const context: RenderContext = {
    container,
    domNodes: new Map(),
    effects: new Set(),
    signals: new Set(),
    resources: new Map(),
    hydrationData,
    keyedElements: new Map(),
  };

  // Create root DOM node
  const rootNode = createDOMElement(vnode, context);

  // Append to container
  container.appendChild(rootNode.element);

  // Return cleanup function
  return () => {
    // Cleanup all effects
    for (const cleanup of context.effects) {
      try {
        cleanup();
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
    context.effects.clear();

    // Cleanup root node
    cleanupDOMNode(rootNode);

    // Clear container
    container.innerHTML = "";

    // Clear context
    context.domNodes.clear();
    context.signals.clear();
    context.resources.clear();
    context.keyedElements.clear();
  };
}

// Utility function to get serialized data for hydration
function getSerializedData(context: RenderContext): Record<string, any> {
  const serialized: Record<string, any> = {};

  for (const [id, data] of context.resources) {
    serialized[id] = data;
  }

  return serialized;
}

export { renderToDOM, getSerializedData };
