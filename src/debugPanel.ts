import { Pane } from "tweakpane";

export class DebugPannel {
  private pane: Pane;
  private PARAMS = {
    computeFps: 0,
    jsTime: 0,
  };
  constructor() {
    this.pane = new Pane({
      title: "Debug Pannel",
    });
    this.pane.addBinding(this.PARAMS, "computeFps", { readonly: true });
    this.pane.addBinding(this.PARAMS, "jsTime", { readonly: true });
  }

  private performanceStats: {
    lastComputeTime: number;
    frameTimes: number[];
    maxSamples: number;
  } = {
    lastComputeTime: 0,
    frameTimes: [],
    maxSamples: 30,
  };
  public updateComputefps() {
    const now = performance.now();
    const deltaMs = now - this.performanceStats.lastComputeTime;
    this.performanceStats.lastComputeTime = now;

    if (deltaMs > 0) {
      const currentFps = 1000 / deltaMs;

      this.performanceStats.frameTimes.push(currentFps);
      if (
        this.performanceStats.frameTimes.length >
        this.performanceStats.maxSamples
      ) {
        this.performanceStats.frameTimes.shift(); // Remove the oldest sample
      }

      const sum = this.performanceStats.frameTimes.reduce((a, b) => a + b, 0);
      this.PARAMS.computeFps = sum / this.performanceStats.frameTimes.length;
    }
    this.pane.refresh();
  }

  public updateJSTime(startTime: number) {
    this.PARAMS.jsTime = performance.now() - startTime;
  }
}
