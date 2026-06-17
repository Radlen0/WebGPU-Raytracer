@group(0) @binding(0)
var<storage, read_write> s_pixel_data : array<vec4f>;

struct ScreenResolution {
    width: u32,
    height: u32,
}

@group(0) @binding(1)
var<uniform> u_screen_res : ScreenResolution;

// --- COMPUTE ENTRYPOINT ---
@compute @workgroup_size(16, 16)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
    let u = id.x;
    let v = id.y;

    // Safety Guard: Clip threads outside the physical canvas boundaries
    if (u >= u_screen_res.width || v >= u_screen_res.height) {
        return;
    }

    let pixel_index = (v * u_screen_res.width) + u;

    let uv = vec2f(
        f32(u) / f32(u_screen_res.width),
        f32(v) / f32(u_screen_res.height)
    );

    let debug_color = vec4f(uv.x, uv.y, 0.5, 1.0);

    s_pixel_data[pixel_index] = debug_color;
}
