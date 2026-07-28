// partysocket detects React Native (`navigator.product === "ReactNative"`) and
// clones WebSocket events with `cloneEventNode`, which calls the DOM event
// constructors and then dispatches them on the global EventTarget:
//
//   this.dispatchEvent(new MessageEvent(e.type, e))
//   this.dispatchEvent(new CloseEvent(code, reason, e))
//   this.dispatchEvent(new ErrorEvent(error, e))
//
// (see partysocket/dist/ws.js). RN 0.86 exposes a global `Event` (via its DOM
// webapis) but not these subclasses, so the calls throw. RN's EventTarget also
// rejects anything that isn't a real `Event`, so the shims must extend it.
const globalScope = globalThis as unknown as Record<string, unknown>;
const EventBase = globalScope.Event as (new (type: string) => object) | undefined;

if (typeof EventBase === "function") {
  if (typeof globalScope.MessageEvent === "undefined") {
    globalScope.MessageEvent = class MessageEvent extends EventBase {
      data: unknown;
      constructor(type: string, init: { data?: unknown } = {}) {
        super(type);
        this.data = init?.data;
      }
    };
  }

  if (typeof globalScope.CloseEvent === "undefined") {
    globalScope.CloseEvent = class CloseEvent extends EventBase {
      code: number;
      reason: string;
      constructor(code = 1000, reason = "") {
        super("close");
        this.code = code;
        this.reason = reason;
      }
    };
  }

  if (typeof globalScope.ErrorEvent === "undefined") {
    globalScope.ErrorEvent = class ErrorEvent extends EventBase {
      error: unknown;
      message: string;
      constructor(error: unknown) {
        super("error");
        this.error = error;
        this.message = error instanceof Error ? error.message : String(error ?? "");
      }
    };
  }
}
