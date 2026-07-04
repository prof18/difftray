declare global {
  interface Window {
    __difftrayReceive?: (message: unknown) => void;
    ReactNativeWebView?: {
      readonly postMessage: (message: string) => void;
    };
  }
}

export {};
