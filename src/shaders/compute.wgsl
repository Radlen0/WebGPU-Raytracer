// --- CONSTANTS ---
const INF : f32 = 1e30;

// --- BUFFERS ---
@group(0) @binding(0)
var<storage, read_write> s_pixel_data : array<vec4f>;

@group(1) @binding(0)
var<uniform> u_camera : Camera;

struct SphereStorage {
  count: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
  data: array<Sphere>,
}
@group(1) @binding(1)
var<storage, read> s_spheres : SphereStorage;

// --- STRUCTURES  ---
struct Ray {
    origin: vec3f,
    direction: vec3f,
}

struct HitInfo {
  did_hit : bool,
  distance : f32,
  hit_point : vec3f,
  normal : vec3f,
  is_front : bool,
}

struct Camera {
    camera_origin: vec3f,     // Camera position in world space
    pad0: u32,
    pixel00_loc: vec3f,       // Top-left pixel location in world space
    pad1: u32,
    pixel_delta_u: vec3f,     // Offset vector to move one pixel right
    pad2: u32,
    pixel_delta_v: vec3f,     // Offset vector to move one pixel down
    pad3: u32,

    screen_width: u32,
    screen_height: u32,
}

struct Sphere {
  center: vec3f,
  radius: f32,
  material: Material,
}

struct Material {
  color: vec4f,
}
// --- Ray Intersection Functions ---
fn hit_sphere(ray: Ray, sphere: Sphere) -> HitInfo {
  var hit : HitInfo;
  hit.did_hit = false;

  let oc = ray.origin - sphere.center;

  // Optimized Quadratic Coefficients (b = 2h)
  let a = dot(ray.direction ,ray.direction);
  let h = dot(ray.direction, oc);
  let c = dot(oc, oc) - sphere.radius * sphere.radius;

  // Quadratic Discriminant
  let discriminant = h*h - a * c;

  if (discriminant < 0.0) {
    return hit;
  }

  let sqrt_d = sqrt(discriminant);
  // Find the nearest root that lies in front of the camera (t > 0)
  var root = (-h - sqrt_d) / a;
  if (root <= 0) {
    // If the first root is behind us, check the second one (inside the sphere)
    root = (-h + sqrt_d) / a;
    if (root <= 0) {
      return hit; // Both intersection points are behind the viewport
    }
  }

  hit.did_hit   = true;
  hit.distance  = root;
  hit.hit_point = ray.origin + (ray.direction * root);

  let outward_normal = (hit.hit_point - sphere.center) / sphere.radius;

  // Face orientation handling:
  // If dot product is negative, ray is hitting the outside (front face)
  hit.is_front = dot(ray.direction, outward_normal) < 0.0;
  hit.normal   = select(-outward_normal, outward_normal, hit.is_front);

  return hit;
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

    // Default background color (e.g., black)
    var pixel_color = vec4f(0.0, 0.0, 0.0, 1.0);

    // Track the closest intersection distance
    var closest_so_far = INF;
    var hit_anything = false;

    // Loop through all spheres in the buffer
    for (var i = 0u; i < s_spheres.count; i++) {
      let current_sphere = s_spheres.data[i];
      let hit = hit_sphere(r, current_sphere);

      // Check if we hit the sphere AND if it's closer than previous hits
      if (hit.did_hit && hit.distance < closest_so_far) {
        closest_so_far = hit.distance;
        pixel_color = current_sphere.material.color;
        hit_anything = true;
      }
    }

    let pixel_index = (v * u_camera.screen_width) + u;
    s_pixel_data[pixel_index] = pixel_color;
}

// --- HELPERS ---
fn get_pixel_world_position(uv: vec2f) -> vec3f {
  return u_camera.pixel00_loc + (uv.x * u_camera.pixel_delta_u) + (uv.y * u_camera.pixel_delta_v);
}
