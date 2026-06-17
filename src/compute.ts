import computeWGSL from "./shaders/compute.wgsl?raw";

export class Tracer {
  private device: GPUDevice;

  private computeShader: GPUShaderModule;
  private computePipeline: GPUComputePipeline;
  private computeBindGroup: GPUBindGroup | null = null;

  private resolutionUniform: GPUBuffer;

  constructor(device: GPUDevice) {
    this.device = device;

    this.computeShader = device.createShaderModule({
      label: " Tracer Compute Shader ",
      code: computeWGSL,
    });

    this.computePipeline = device.createComputePipeline({
      label: " Tracer Compute Pipeline ",
      layout: "auto",
      compute: {
        module: this.computeShader,
      },
    });

    this.resolutionUniform = this.device.createBuffer({
      label: " Screen resolution buffer uniform ",
      size: 4 * 2, // 2 * 32 bit integer for height and width
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  private cachedPixelBuffer: GPUBuffer | null = null;
  private rebindPixelBuffer() {
    this.computeBindGroup = this.device.createBindGroup({
      label: " Tracer Compute Bind Group ",
      layout: this.computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: this.cachedPixelBuffer! },
        },
        {
          binding: 1,
          resource: { buffer: this.resolutionUniform },
        },
      ],
    });
  }

  public run(ctx: GPUCanvasContext, pixelBuffer: GPUBuffer) {
    if (pixelBuffer != this.cachedPixelBuffer || !this.computeBindGroup) {
      this.cachedPixelBuffer = pixelBuffer;
      this.rebindPixelBuffer();
    }

    let screenWidth = ctx.canvas.width;
    let screenHeight = ctx.canvas.height;

    let resolutionArray = new Uint32Array([screenWidth, screenHeight]);
    this.device.queue.writeBuffer(this.resolutionUniform, 0, resolutionArray);

    const workgroupSizeX = 16;
    const workgroupSizeY = 16;

    // Calculate how many 16x16 blocks are needed to cover the canvas
    const dispatchX = Math.ceil(screenWidth / workgroupSizeX);
    const dispatchY = Math.ceil(screenHeight / workgroupSizeY);

    const commandEncoder = this.device.createCommandEncoder();
    const computePass = commandEncoder.beginComputePass({
      label: " Tracer Compute Pass ",
    });
    computePass.setPipeline(this.computePipeline);
    computePass.setBindGroup(0, this.computeBindGroup);
    computePass.dispatchWorkgroups(dispatchX, dispatchY);
    computePass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
