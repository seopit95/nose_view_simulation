export {};
declare global {
  interface Window {
    noseview?: { savePng: (dataUrl: string) => Promise<{ saved: boolean; error?: string }> };
  }
}
