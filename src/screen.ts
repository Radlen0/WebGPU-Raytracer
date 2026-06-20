import screenWGSL from "./shaders/screen.wgsl?raw";

export class Screen {
  private device: GPUDevice;

  private screenRenderPipeline: GPURenderPipeline;
  private resolutionUniform: GPUBuffer;
  private screenBindGroup: GPUBindGroup | null = null;
  private cachedPixelBuffer: GPUBuffer | null = null;

  constructor(device: GPUDevice) {
    this.device = device;

    const screenRenderShader = device.createShaderModule({
      label: " Screen shader module ",
      code: screenWGSL,
    });

    this.screenRenderPipeline = this.device.createRenderPipeline({
      label: " Screen Render Pipeline",
      layout: "auto",
      vertex: {
        module: screenRenderShader,
      },
      fragment: {
        module: screenRenderShader,
        targets: [
          {
            format: navigator.gpu.getPreferredCanvasFormat(),
          },
        ],
      },
    });

    this.resolutionUniform = this.device.createBuffer({
      label: " Screen resolution buffer uniform ",
      size: 4 * 2, // 2 * 32 bit integer for height and width
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  /**
   * Refreshes the bind group bindings if the target output canvas buffer changes.
   */
  private updateBindGroup(pixelBuffer: GPUBuffer) {
    this.cachedPixelBuffer = pixelBuffer;
    this.screenBindGroup = this.device.createBindGroup({
      label: " Screen Bind Group ",
      layout: this.screenRenderPipeline.getBindGroupLayout(0),
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

  /**
   * Displays the computed pixels to the screen
   */
  public display(ctx: GPUCanvasContext, pixelBuffer: GPUBuffer) {
    if (pixelBuffer != this.cachedPixelBuffer || !this.screenBindGroup) {
      this.updateBindGroup(pixelBuffer);
    }

    // Pack & upload uniform to GPU
    let resolutionArray = new Uint32Array([
      ctx.canvas.width,
      ctx.canvas.height,
    ]);
    this.device.queue.writeBuffer(this.resolutionUniform, 0, resolutionArray);

    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      label: " Screen Render Pass ",
      colorAttachments: [
        {
          view: ctx.getCurrentTexture().createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    renderPass.setPipeline(this.screenRenderPipeline);
    renderPass.setBindGroup(0, this.screenBindGroup);
    renderPass.draw(6);
    renderPass.end();

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
