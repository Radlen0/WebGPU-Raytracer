// --- STRUCTS & UNIFORMS ---

@group(0) @binding(0)
var<storage, read> s_pixel_data : array<vec4f>;

struct ScreenResolution {
    width: u32,
    height: u32,
}

@group(0) @binding(1)
var<uniform> u_screen_res : ScreenResolution;

struct VertexOutput {
    @builtin(position) position : vec4f,
    @location(0) uv : vec2f,
}

// --- VERTEX SHADER ---

@vertex
fn vertmain(@builtin(vertex_index) vertex_index : u32) -> VertexOutput {
    // Two triangles forming a full-screen quad in Normalized Device Coordinates (NDC)
    let screen_quad_positions = array<vec2f, 6>(
        vec2f(-1.0, -1.0), // Bottom-Left
        vec2f( 1.0,  1.0), // Top-Right
        vec2f(-1.0,  1.0), // Top-Left

        vec2f(-1.0, -1.0), // Bottom-Left
        vec2f( 1.0, -1.0), // Bottom-Right
        vec2f( 1.0,  1.0)  // Top-Right
    );

    var out : VertexOutput;

    let current_pos = screen_quad_positions[vertex_index];
    out.position = vec4f(current_pos, 0.0, 1.0);

    // Map clip space (-1 to 1) to UV space (0 to 1).
    out.uv = current_pos * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);

    return out;
}

// --- FRAGMENT SHADER ---

@fragment
fn fragmain(in : VertexOutput) -> @location(0) vec4f {
    // Convert normalized UV coordinates to discrete pixel coordinates
    let pixel_x = u32(floor(in.uv.x * f32(u_screen_res.width)));
    let pixel_y = u32(floor(in.uv.y * f32(u_screen_res.height)));

    let pixel_index = (pixel_y * u_screen_res.width) + pixel_x;

    return s_pixel_data[pixel_index];
}
