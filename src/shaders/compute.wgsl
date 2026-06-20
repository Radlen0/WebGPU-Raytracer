@group(0) @binding(0)
var<storage, read_write> s_pixel_data : array<vec4f>;

struct CameraUniform {
    camera_origin: vec3f,     // Camera position in world space
    pad0: u32,
    pixel00_loc: vec3f,   // Top-left pixel location in world space
    pad1: u32,
    pixel_delta_u: vec3f,     // Offset vector to move one pixel right
    pad2: u32,
    pixel_delta_v: vec3f,     // Offset vector to move one pixel down
    pad3: u32,

    screen_width: u32,
    screen_height: u32,
}

@group(0) @binding(1)
var<uniform> u_camera : CameraUniform;

// --- RAY STRUCTURES & FUNCTIONS ---
struct Ray {
    origin: vec3f,
    direction: vec3f,
}

fn get_ray_position(ray: Ray, t: f32) -> vec3f {
    return ray.origin + (ray.direction * t);
}

fn hitSphere(r: Ray, center: vec3f, radius: f32) -> bool {
  let oc = r.origin - center;
  let a = dot(r.direction ,r.direction);
  let b = 2 * dot(r.direction, oc);
  let c = dot(oc, oc) - radius * radius;
  let discriminant = b*b - 4 * a * c;
  return discriminant >= 0;
}

// --- COMPUTE ENTRYPOINT ---
@compute @workgroup_size(16, 16)
fn computeMain(@builtin(global_invocation_id) id: vec3u) {
    let u = id.x;
    let v = id.y;

    // Safety Guard: Clip threads outside the physical canvas boundaries
    if (u >= u_camera.screen_width || v >= u_camera.screen_height) {
        return;
    }
    let uv = vec2f(f32(u), f32(v));

    let ray_direction = get_pixel_world_position(uv) - u_camera.camera_origin;
    var r : Ray;
    r.origin = u_camera.camera_origin;
    r.direction = normalize(ray_direction);

    var pixel_color : vec4f;
    if (hitSphere(r, vec3f(0, 0, 0), 1)) {
      pixel_color = vec4f(1.0, 0.0, 0.0, 1.0);
    } else {
      pixel_color = vec4f(0.0, 0.0, 0.0, 1.0);
    }

    let pixel_index = (v * u_camera.screen_width) + u;
    s_pixel_data[pixel_index] = pixel_color;
}

fn get_pixel_world_position(uv: vec2f) -> vec3f {
  return u_camera.pixel00_loc + (uv.x * u_camera.pixel_delta_u) + (uv.y * u_camera.pixel_delta_v);
}
