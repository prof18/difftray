/// <reference types="vite/client" />

type DifftrayApi = {
  readonly appVersion: () => Promise<string>;
};

declare global {
  interface Window {
    readonly difftray: DifftrayApi;
  }
}
