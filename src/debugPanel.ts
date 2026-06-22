import { FolderApi, Pane } from "tweakpane";
import type { Sphere } from "./types";

export class DebugPannel {
  private pane: Pane;
  private sphereFolder: FolderApi;

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
    this.sphereFolder = this.pane.addFolder({ title: "Geometry" });
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

  private sphereID = 0;
  public bindSphereGeometry(spheres: Sphere[]) {
    for (let sphere of spheres) {
      let f = this.sphereFolder.addFolder({ title: `Sphere ${this.sphereID}` });
      const posProxy = {
        x: sphere.center[0],
        y: sphere.center[1],
        z: sphere.center[2],
      };
      const colorProxy = {
        r: sphere.material.color[0],
        g: sphere.material.color[1],
        b: sphere.material.color[2],
        a: sphere.material.color[3],
      };

      f.addBinding({ posProxy }, "posProxy", {
        label: "Center",
      }).on("change", (ev) => {
        sphere.center[0] = ev.value.x;
        sphere.center[1] = ev.value.y;
        sphere.center[2] = ev.value.z;
      });
      f.addBinding(sphere, "radius", { label: "Radius" });
      f.addBinding({ colorProxy }, "colorProxy", {
        label: "Color",
        color: { type: "float" },
      }).on("change", (ev) => {
        sphere.material.color[0] = ev.value.r;
        sphere.material.color[1] = ev.value.g;
        sphere.material.color[2] = ev.value.b;
        sphere.material.color[3] = ev.value.a;
      });
      this.sphereID++;
    }
  }
}
