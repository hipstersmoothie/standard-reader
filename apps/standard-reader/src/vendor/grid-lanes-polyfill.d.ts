declare module "#/vendor/grid-lanes-polyfill.js" {
  export interface GridLanesPolyfillInstance {
    refresh(): void;
    destroy(): void;
  }

  export interface GridLanesPolyfillOptions {
    force?: boolean;
  }

  export function supportsGridLanes(): boolean;
  export function init(
    options?: GridLanesPolyfillOptions,
  ): GridLanesPolyfillInstance;
  export function apply(
    element: Element,
    options?: GridLanesPolyfillOptions,
  ): GridLanesPolyfillInstance | null;
}
