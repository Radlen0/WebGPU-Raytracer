export function quitIfWebGPUNotAvailable(
  adapter: GPUAdapter | null,
  device: GPUDevice | null | undefined,
): asserts device {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU is not supported in this browser");
  }
  if (!adapter) throw new Error("unable to find adapter");
  if (!device) throw new Error("Unable to get a device");

  device.lost.then((reason) => {
    throw new Error(`Device lost ("${reason.reason}"):\n${reason.message}`);
  });
  device.addEventListener("uncapturederror", (ev) => {
    throw new Error(`Uncaptured error:\n${ev.error.message}`);
  });
}
