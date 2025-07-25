import { Signal } from "./signal";

// Function component type
type FC<P = {}> = (props: P, ...children: VDOMChild[]) => VDOMNode;

// Element node with proper prop types
type ElementNode = {
  tag: string;
  children?: VDOMNode[];
  props?: Record<string, any>;
};

type ResourceNode = {
  type: "RESOURCE";
  id: string;
  asyncFn: ResourceFn<any>;
  options: ResourceOptions<any>;
  dependencies?: Signal<any>[];
};

type SignalNode = {
  type: "SIGNAL";
  signalValue: Signal<any>;
  callback: (value: any) => VDOMNode;
};

type ListNode = {
  type: "LIST";
  signalValue: Signal<any[]>;
  keyFn: (item: any, index: number) => string;
  renderFn: (item: any, index: number) => VDOMNode;
};

type VDOMNode =
  | ElementNode
  | ResourceNode
  | SignalNode
  | ListNode
  | string
  | null
  | undefined
  | number
  | boolean
  | symbol
  | bigint;

type ResourceOptions<T> = {
  loading: () => VDOMNode;
  success: (data: T) => VDOMNode;
  failure: (error: Error) => VDOMNode;
};

type ResourceFn<T> = () => Promise<T>;

// Add this type to allow function children

type VDOMChild =
  | VDOMNode
  | string
  | number
  | boolean
  | null
  | undefined
  | (() => VDOMNode | string | number | boolean | null | undefined);

// HFunction with better type inference
type HFunction = {
  // String tag overload
  <T extends string>(
    tag: T,
    props?: Record<string, any>,
    ...children: VDOMChild[]
  ): ElementNode;

  // Function component overload
  <P>(component: FC<P>, props?: P, ...children: VDOMChild[]): VDOMNode;

  // Special methods
  list: <T>(
    signalValue: Signal<T[]>,
    keyFn: (item: T, index: number) => string,
    renderFn: (item: T, index: number) => VDOMNode
  ) => ListNode;

  resource: <T>(
    asyncFn: ResourceFn<T>,
    options: ResourceOptions<T>,
    dependencies?: Signal<any>[]
  ) => ResourceNode;

  signal: <T>(
    signalValue: Signal<T>,
    callback: (value: T) => VDOMNode
  ) => SignalNode;
};

// Type guards for runtime type checking
function isElementNode(node: VDOMNode): node is ElementNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (!("type" in node) ||
      (node.type !== "RESOURCE" &&
        node.type !== "SIGNAL" &&
        node.type !== "LIST"))
  );
}

function isResourceNode(node: VDOMNode): node is ResourceNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "RESOURCE"
  );
}

function isSignalNode(node: VDOMNode): node is SignalNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "SIGNAL"
  );
}

function isListNode(node: VDOMNode): node is ListNode {
  return (
    typeof node === "object" &&
    node !== null &&
    "type" in node &&
    node.type === "LIST"
  );
}

const resource = <T>(
  asyncFn: ResourceFn<T>,
  options: ResourceOptions<T>,
  dependencies?: Signal<any>[]
): ResourceNode => {
  const resourceId = `resource_${Date.now()}_${Math.random()}`;

  return {
    type: "RESOURCE",
    id: resourceId,
    asyncFn,
    options,
    dependencies,
  };
};

// h.signal and h.list must return node objects, not functions.
// The callback can return a function (for lazy evaluation/component pattern),
// but the node itself is always an object (not a function).
const list = <T>(
  signalValue: Signal<T[]>,
  keyFn: (item: T, index: number) => string,
  renderFn: (item: T, index: number) => VDOMNode
): ListNode => {
  return {
    type: "LIST",
    signalValue,
    keyFn,
    renderFn,
  };
};

const h = Object.assign(
  (
    tag: string | FC,
    props?: Record<string, any> | any,
    ...children: any[]
  ): VDOMNode => {
    if (typeof tag === "function") return tag(props, ...children);

    // Fine-grained reactivity: auto-wrap function children as SignalNode
    const wrappedChildren = children.map((child) => {
      // Fine-grained reactivity: auto-wrap function children as SignalNode
      if (typeof child === "function") {
        return h.signal(
          {
            get value() {
              return child();
            },
            subscribe: (fn: () => void) => {
              /* dummy, will be replaced by effect in renderer */ return () => {};
            },
          },
          (v: any) => {
            if (
              isElementNode(v) ||
              isResourceNode(v) ||
              isSignalNode(v) ||
              isListNode(v)
            ) {
              return v;
            }
            return v == null ? "" : v.toString();
          }
        );
      }
      return child;
    });

    return {
      tag,
      props: props || {},
      children: wrappedChildren,
    };
  },
  {
    list,
    resource,
    // h.signal must return a node object, not a function.
    // The callback can return a function, but the node itself is always an object.
    signal: <T>(
      signalValue: Signal<T>,
      callback: (value: T) => VDOMNode
    ): SignalNode => {
      return {
        type: "SIGNAL",
        signalValue,
        callback,
      };
    },
  }
) as HFunction;

export { h, isElementNode, isResourceNode, isSignalNode, isListNode };
export type {
  FC,
  VDOMNode,
  ElementNode,
  ResourceNode,
  ResourceFn,
  SignalNode,
  ListNode,
  ResourceOptions,
  HFunction,
};
