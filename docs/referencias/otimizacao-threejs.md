Building performant 3D experiences on the web requires more than knowing the API. It requires understanding how browsers, GPUs, and JavaScript interact—and where the bottlenecks hide.

This guide compiles 100 actionable best practices for Three.js development, with a heavy focus on the new WebGPU renderer. Whether you're optimizing an existing project or starting fresh, these tips will help you ship faster, smoother experiences. Every API and code sample is current as of three.js r186 (September 2026).

Who this is for: Web developers working with Three.js who want to level up their performance and code quality. If you're just starting, we recommend Three.js Journey

Key Takeaways
WebGPU is production-ready since r171—zero-config imports, automatic WebGL 2 fallback, and roughly 87% global browser support
Draw calls are the silent killer—budget around 100 per frame on mobile
Instancing and batching can collapse hundreds of draw calls into one
Dispose everything you no longer need—geometries, materials, textures, render targets
TSL (Three Shader Language) is the future—write once, run on WebGPU or WebGL
Bake what you can—lightmaps, shadows, ambient occlusion
Profile before optimizing—use the built-in Inspector, stats-gl, and renderer.info
WebGPU Renderer
The WebGPU renderer represents a fundamental shift in how Three.js handles graphics. Since Safari 26 shipped support in September 2025, you can now target WebGPU for all major browsers. For context on what changed, see our Three.js 2026 overview.

1. Use the zero-config WebGPU import and let setAnimationLoop initialize it
Since r171, adopting WebGPU takes one import. GPU device creation is asynchronous, and setAnimationLoop() handles it for you—it awaits renderer.init() before the first frame:

import { WebGPURenderer } from 'three/webgpu';

const renderer = new WebGPURenderer();

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
If you render or run compute before the loop starts—a precompute pass, or a single frame for a thumbnail—call await renderer.init() first; rendering with an uninitialized renderer fails with an error telling you to do exactly that. No bundler configuration or polyfills needed. See the official WebGPURenderer manual.

2. Trust the automatic WebGL 2 fallback
When a browser doesn't support WebGPU, the WebGPURenderer automatically falls back to WebGL 2. You don't need separate code paths—ship one renderer and let Three.js handle compatibility.

3. Learn TSL (Three Shader Language)
TSL is Three.js's node-based material system that compiles to either WGSL (WebGPU) or GLSL (WebGL). Instead of writing shader code twice, write it once in TSL:

import { MeshStandardNodeMaterial } from 'three/webgpu';
import { color, sin, time } from 'three/tsl';

const material = new MeshStandardNodeMaterial();
material.colorNode = color(1, 0, 0).mul(sin(time).mul(0.5).add(0.5));
TSL is the recommended approach for custom shaders moving forward. Built-in materials such as MeshStandardMaterial keep working on WebGPURenderer—they're mapped to node equivalents automatically—but ShaderMaterial, RawShaderMaterial, and onBeforeCompile patches are not. Rewrite those in TSL before migrating.

4. Move particle systems to compute shaders
CPU-updated particles typically top out in the tens to low hundreds of thousands, depending on per-particle work, because every frame the positions travel from JavaScript to the GPU. With compute shaders, the data never leaves the GPU—the official compute particles example simulates 200,000 particles this way:

import { Timer } from 'three/webgpu';
import { Fn, instancedArray, instanceIndex, uniform } from 'three/tsl';

const count = 200000;
const positions = instancedArray(count, 'vec3'); // GPU-resident, persists across frames
const velocities = instancedArray(count, 'vec3');
const delta = uniform(0);

const update = Fn(() => {
  const position = positions.element(instanceIndex);
  const velocity = velocities.element(instanceIndex);
  position.addAssign(velocity.mul(delta));
})().compute(count);

const timer = new Timer();
renderer.setAnimationLoop((timestamp) => {
  delta.value = timer.update(timestamp).getDelta();
  renderer.compute(update);
  renderer.render(scene, camera);
});
Read the same buffer in your material (for example material.positionNode = positions.toAttribute()) so rendering uses the simulated data directly.

5. Warm up shaders with compileAsync
Shaders compile the first time an object is rendered, which shows up as a hitch when something new enters the view or a menu opens. Compile everything while your loading screen is still up:

await renderer.compileAsync(scene, camera);
// Now hide the loader and start the loop
Since r184, WebGPURenderer's compileAsync() no longer blocks rendering while it works. You can also pre-compile objects that aren't in the scene yet by passing the scene they'll be added to: renderer.compileAsync(object, camera, scene). WebGLRenderer has its own compileAsync(), which uses parallel shader compilation (KHR_parallel_shader_compile) where available.

6. Migrate to WebGPU when you hit performance walls
If your WebGL project runs smoothly, there's no urgent need to migrate. Migrate when:

Draw-call-heavy scenes drop frames
You need compute shaders for physics or simulations
Complex post-processing chains cause stuttering
7. Know the browser support matrix
Browser	WebGPU enabled by default
Chrome/Edge (desktop)	Since v113 on Windows, macOS, and ChromeOS; Linux since v144 (Intel) and v147 (NVIDIA on Wayland)
Chrome (Android)	Since v121 (Android 12+)
Firefox	Since v141 (Windows) and v145 (macOS 26, Apple Silicon); all macOS versions on Apple Silicon since v147. Linux and Android still behind a flag
Safari	Since v26 (September 2025) on macOS, iOS, iPadOS, and visionOS
Every major browser engine now ships WebGPU, and caniuse puts global support at roughly 87%—the automatic WebGL 2 fallback (tip 2) covers the rest. (Sources: caniuse.com/webgpu, gpuweb implementation status)

8. Use forceWebGL strategically
The forceWebGL: true option forces WebGL mode on the WebGPURenderer. This is useful for:

Testing WebGL fallback behavior on WebGPU-capable machines
Debugging shader compilation differences between backends
Supporting specific WebGL extensions not yet available in WebGPU
If a project will only ever target WebGL, WebGLRenderer is still actively maintained—a valid choice, not a legacy one—and it doesn't pull in the node material system.

9. Expect big gains only in specific scenarios
WebGPU shines in:

Draw-call-heavy scenes (hundreds of objects)
Compute-intensive effects (particles, physics)
Complex shader pipelines
Chrome's team describes a "greatly reduced JavaScript workload" compared with WebGL (Source: Chrome Developers), and Babylon.js reports that snapshot rendering—built on WebGPU render bundles—makes submitting mostly static scenes orders of magnitude cheaper on the JavaScript side (Source: Babylon.js docs). Our own Expo 2025 installation relied on WebGPU compute for its particle simulation. But it's not universally faster—three.js forum users report scenes where WebGPURenderer is slower than WebGLRenderer (example thread). Profile your specific use case before migrating for speed alone.

10. Use node materials for dynamic customization
Node materials accept properties like positionNode, colorNode, and normalNode for programmatic control, and they compose like regular code:

import { MeshStandardNodeMaterial } from 'three/webgpu';
import { positionLocal, normalLocal, mx_noise_float, vertexColor } from 'three/tsl';

const material = new MeshStandardNodeMaterial();
const noise = mx_noise_float(positionLocal);
material.positionNode = positionLocal.add(normalLocal.mul(noise));
material.colorNode = vertexColor();
This enables effects that would require custom shaders in WebGL.

11. Drop the *Async render and compute methods
Older examples used await renderer.renderAsync() and computeAsync() to synchronize GPU work. Since r181 they're deprecated (renderAsync() logs a warning): render() and compute() handle ordering for you, so call them directly inside setAnimationLoop:

renderer.setAnimationLoop(() => {
  renderer.compute(simulation); // submitted before the render pass that reads its output
  renderer.render(scene, camera);
});
The async APIs that remain are the ones that genuinely need to wait: init(), compileAsync(), and—new in r186—compileComputeAsync() for pre-compiling compute shaders.

12. Skip hidden objects with occlusion queries
Frustum culling (tip 36) only removes what's outside the camera. In interiors and city scenes, most objects inside the frustum are hidden behind walls. WebGPURenderer supports hardware occlusion queries on both of its backends (WebGL 2 uses ANY_SAMPLES_PASSED)—flag an object, then ask whether it was visible:

building.occlusionTest = true;

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);

  // Result comes from an earlier frame
  buildingInterior.visible = !renderer.isOccluded(building);
});
See the official occlusion example. Results arrive a frame or two late, so use them to skip expensive details behind cheap occluders, not to pop main geometry in and out.

13. Use storage textures for read-write compute
Unlike regular textures, storage textures can be written from compute shaders—and since r183, read and written in the same pass:

import { StorageTexture } from 'three/webgpu';
import { Fn, instanceIndex, textureStore, uvec2, vec4 } from 'three/tsl';

const size = 512;
const outputTexture = new StorageTexture(size, size);

const fill = Fn(() => {
  const x = instanceIndex.mod(size);
  const y = instanceIndex.div(size);
  const uv = uvec2(x, y);
  textureStore(outputTexture, uv, vec4(x.toFloat().div(size), y.toFloat().div(size), 0, 1)).toWriteOnly();
})().compute(size * size);

renderer.compute(fill);
Use the result like any other texture, e.g. material.colorNode = texture(outputTexture). Essential for effects like fluid simulation, image processing, and GPU-driven rendering.

14. Handle WebGPU feature detection gracefully
Not all WebGPU features are universally available. Check before using:

const adapter = await navigator.gpu?.requestAdapter();
if (!adapter) {
  // Fall back to WebGL or show error
  return;
}

// Check specific features
const hasFloat32Filtering = adapter.features.has('float32-filterable');
const hasTimestamps = adapter.features.has('timestamp-query');
15. Debug with the built-in Inspector and WebGPU DevTools
Since r181, three.js ships its own Inspector for WebGPURenderer (it also works on the WebGL 2 fallback). One line adds performance, memory, timeline, and console panels:

import { Inspector } from 'three/addons/inspector/Inspector.js';

renderer.inspector = new Inspector();
Validation errors appear in the console with stack traces pointing to the problematic call. For frame captures, buffer inspection, and shader debugging at the WebGPU API level, add Brendan Duncan's WebGPU Inspector browser extension. chrome://gpu shows whether WebGPU is hardware-accelerated on a given machine.

16. Keep per-frame data on the GPU
Uploading buffers to the GPU is expensive. The worst pattern is rebuilding arrays in JavaScript every frame and re-uploading them:

// Bad: CPU simulation, full upload every frame
particles.forEach((p, i) => positionArray.set(p.position, i * 3));
geometry.attributes.position.needsUpdate = true;

// Good: simulate on the GPU, nothing to upload
renderer.compute(update); // see tip 4
When CPU updates are unavoidable, upload only the range that changed with attribute.addUpdateRange(start, count) instead of the whole buffer.

17. Use compute shaders for physics
Beyond particles, compute shaders excel at physics simulations:

import { Fn, If, instancedArray, instanceIndex, uniform, vec3 } from 'three/tsl';

const positions = instancedArray(count, 'vec3');
const velocities = instancedArray(count, 'vec3');
const delta = uniform(0); // set from a Timer each frame (tip 100)
const gravity = uniform(-9.8);

const physics = Fn(() => {
  const position = positions.element(instanceIndex);
  const velocity = velocities.element(instanceIndex);

  velocity.addAssign(vec3(0, gravity.mul(delta), 0));
  position.addAssign(velocity.mul(delta));

  // Collide with the floor
  If(position.y.lessThan(0), () => {
    position.y = 0;
    velocity.y = velocity.y.negate().mul(0.8);
  });
})().compute(count);

renderer.compute(physics);
18. Generate terrain with compute shaders
Procedural terrain generation on the GPU enables real-time editing and massive scale:

import { StorageTexture } from 'three/webgpu';
import { Fn, instanceIndex, mx_noise_float, textureStore, uvec2, vec2, vec4 } from 'three/tsl';

const resolution = 1024;
const heightmap = new StorageTexture(resolution, resolution);

const generateTerrain = Fn(() => {
  const x = instanceIndex.mod(resolution);
  const y = instanceIndex.div(resolution);
  const uv = vec2(x, y).div(resolution);
  const height = mx_noise_float(uv.mul(8)).mul(0.5).add(0.5);
  textureStore(heightmap, uvec2(x, y), vec4(height, 0, 0, 1)).toWriteOnly();
})().compute(resolution * resolution);

renderer.compute(generateTerrain);
Displace a plane with the heightmap in positionNode, and re-run the compute pass whenever parameters change for real-time editing.

19. Leverage workgroup shared memory
For compute shaders that need data sharing between threads, use workgroup variables:

import { Fn, instancedArray, instanceIndex, invocationLocalIndex, workgroupArray, workgroupBarrier } from 'three/tsl';

const input = instancedArray(count, 'float');
const sharedData = workgroupArray('float', 64); // one slot per thread in the workgroup

const kernel = Fn(() => {
  // Each thread loads one value into shared memory
  sharedData.element(invocationLocalIndex).assign(input.element(instanceIndex));
  workgroupBarrier(); // Wait until every thread has written
  // Now any thread can read its neighbors' values from sharedData
})().compute(count, [64]);
Workgroup memory lives on-chip: NVIDIA cites roughly 100x lower latency than uncached global memory (Source: NVIDIA), though caches narrow the gap in practice. It pays off when threads reuse each other's data—blurs, reductions, and tiled algorithms.

20. Use indirect draws for GPU-driven rendering
Let the GPU decide what to render: a compute pass performs frustum culling or LOD selection and writes the draw arguments itself, so the CPU never reads visibility back:

import { IndirectStorageBufferAttribute } from 'three/webgpu';

// Draw arguments written by a compute shader each frame:
// 5 uints for indexed geometry (4 for non-indexed)
const drawBuffer = new IndirectStorageBufferAttribute(new Uint32Array(5), 5);
geometry.setIndirect(drawBuffer);
geometry.setIndirect() is WebGPU-backend only. The official indirect draw example shows the full compute side, including an atomic instance counter. Essential for rendering millions of instances with per-frame GPU culling.

Asset Optimization
Your 3D assets are often the biggest performance bottleneck. A 50MB GLTF file will destroy load times regardless of how optimized your rendering code is.

21. Compress geometry with Draco when geometry dominates
Draco can shrink geometry by ~95% in many cases (Source: gltf-transform docs); geometry buffers shrank 87–89% on Cesium's sample models. It only compresses geometry—textures are untouched—and on small models the WASM decoder can cost more than it saves:

gltf-transform draco model.glb compressed.glb
Edgebreaker is already the default method. DRACOLoader decodes in a Web Worker, so it doesn't block the main thread.

22. Use KTX2 for texture compression
PNG and JPEG are only compressed on disk—the GPU receives them fully decoded. A 200KB PNG at 2048×2048 becomes ~21 MiB of VRAM once mipmaps are generated. KTX2 with Basis Universal transcodes to a GPU-native format and stays compressed in memory, typically using 4–8x less GPU memory (Source: Don McCurdy):

# UASTC (higher quality) for normal and ORM maps, ETC1S (smaller) for the rest
gltf-transform uastc model.glb step1.glb \
  --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}"
gltf-transform etc1s step1.glb optimized.glb
UASTC: higher quality, larger files. Best for normal maps and hero textures.
ETC1S: much smaller files, some artifacts. Best for base color and secondary textures.
Both commands need KTX-Software 4.4+ installed—the CLI calls the ktx binary.

23. Shrink geometry memory, not just file size
Draco and Meshopt shrink the download, but decoded geometry still sits in RAM and VRAM at full float32 precision. For large models—CAD, 3D scans, AI-generated meshes—reduce the in-memory footprint too:

# Store positions, normals, and UVs as 16-bit integers (KHR_mesh_quantization)
gltf-transform quantize model.glb quantized.glb

# Merge duplicate vertices and remove unused data
gltf-transform weld quantized.glb welded.glb
gltf-transform prune welded.glb optimized.glb
A mesh with float32 position, normal, and UV uses 32 bytes per vertex; quantized with the default settings, it drops to about 20 (add --quantize-normal 8 for 8-bit normals and about 16)—a 35–50% saving on a million-vertex model. GLTFLoader supports quantized meshes natively. At runtime, also delete attributes your material never reads (geometry.deleteAttribute('tangent'), 'color', 'uv1'), and keep index buffers 16-bit when a mesh has fewer than 65,536 vertices.

24. Master gltf-transform CLI
gltf-transform is the Swiss Army knife for glTF optimization. optimize runs deduplication, instancing, welding, simplification, texture resizing (2048px by default), and compression in one command:

# Meshopt geometry compression is the default
gltf-transform optimize model.glb output.glb --texture-compress ktx2

# Or choose Draco and WebP explicitly
gltf-transform optimize model.glb output.glb --compress draco --texture-compress webp
WebP and AVIF need no external tools; KTX2 requires KTX-Software (tip 22).

25. Compare compression visually before you ship
File sizes don't tell you when a texture starts to look bad. Check with a visual tool:

glTF Report: inspect a model's size breakdown and run gltf-transform scripts in the browser
gltf-compressor by Shopify: compress textures interactively—hold "C" to compare against the original
Khronos glTF Compressor: side-by-side comparison of KTX2, WebP, Draco, and Meshopt settings
This answers: "How much can I compress before it looks bad?"

26. Implement LOD (Level of Detail)
Swap high-poly models for low-poly versions at distance. In React Three Fiber, Drei's <Detailed /> handles this:

<Detailed distances={[0, 50, 100]}>
  <HighPolyModel />
  <MediumPolyModel />
  <LowPolyModel />
</Detailed>
In vanilla three.js, the built-in LOD object does the same job. LOD cuts vertex and fragment work for distant objects; how much it helps depends on your scene, so measure frame time before and after.

27. Atlas textures and right-size them
Multiple textures = multiple texture binds = slower rendering. Combine textures into atlases and update UV coordinates accordingly. This reduces overhead significantly on mobile GPUs.

Size matters as much as count: keep textures at 2048px or below unless they're hero assets, leave mipmaps on for anything seen at a distance, and raise texture.anisotropy on floors and angled surfaces instead of increasing resolution.

28. Configure decoder paths correctly
Draco and KTX2 require decoders. Set them up once:

import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('/draco/'); // copied from three/examples/jsm/libs/draco/

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath('/basis/'); // copied from three/examples/jsm/libs/basis/
ktx2Loader.detectSupport(renderer); // required: picks the GPU texture format
Copy the decoder files from node_modules/three/examples/jsm/libs/ into your public folder or CDN so they're cached with your app. Forgetting detectSupport() is the most common KTX2 error—the loader can't choose a transcode target without it. It works with both WebGLRenderer and WebGPURenderer; with WebGPU, call it after await renderer.init().

29. Consider Meshopt as a Draco alternative
Meshopt decodes considerably faster than Draco, also compresses animations and morph targets, and is now the default in gltf-transform optimize (Source: gltf-transform docs). It reaches its best ratio only when the server also applies gzip or Brotli (tip 89):

import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

gltfLoader.setMeshoptDecoder(MeshoptDecoder);
Test both against your own models.

Draw Call Optimization
Every mesh in your scene typically generates one draw call. Each draw call has CPU overhead. The key insight: triangle count matters less than draw call count.

30. Target ~100 draw calls per frame on mobile
A widely quoted budget from three.js maintainer Don McCurdy is "something like <100 draw calls and <100,000 vertices if you can" (Source: three.js forum). Treat it as a mobile target: desktop machines comfortably handle several hundred to low thousands, because the real cost is CPU-side submission, not GPU work. WebGPU lowers the per-call overhead but doesn't remove it. Check with renderer.info.render.calls (renderer.info.render.drawCalls on WebGPURenderer).

31. Use InstancedMesh for repeated objects
Rendering 1,000 trees as individual meshes = 1,000 draw calls. Using InstancedMesh = 1 draw call:

const mesh = new InstancedMesh(geometry, material, 1000);
for (let i = 0; i < 1000; i++) {
  matrix.setPosition(positions[i]);
  mesh.setMatrixAt(i, matrix);
}
Call mesh.instanceMatrix.needsUpdate = true after changing matrices. Codrops' SINGULARITY breakdown shows the same idea at scale: the plastic of every CD case in the scene renders in a single draw call.

32. Use BatchedMesh for varied geometries
BatchedMesh (since r156) combines multiple geometries sharing a material into a single draw call. Unlike InstancedMesh, each instance can use a different geometry:

const batched = new BatchedMesh(maxInstances, maxVertices, maxIndices, material);
const chairId = batched.addGeometry(chairGeometry);
const tableId = batched.addGeometry(tableGeometry);

const chair = batched.addInstance(chairId);
batched.setMatrixAt(chair, matrix);
It supports per-object frustum culling (perObjectFrustumCulled), sorting, and—since r183—per-instance opacity, and it works with both WebGLRenderer and WebGPURenderer. Ideal for CAD and architectural scenes made of many unique parts.

33. Share materials between meshes
Three.js batches meshes with identical materials. Creating a new material for every object defeats this optimization:

// Bad: new material per mesh
meshes.forEach(m => m.material = new MeshStandardMaterial({ color: 'red' }));

// Good: shared material
const sharedMaterial = new MeshStandardMaterial({ color: 'red' });
meshes.forEach(m => m.material = sharedMaterial);
34. Merge static geometry with BufferGeometryUtils
For static scenes, merge meshes at load time:

import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const merged = mergeGeometries([geo1, geo2, geo3]);
const mesh = new Mesh(merged, sharedMaterial);
One draw call instead of many.

For static objects you keep separate, set object.matrixAutoUpdate = false and call object.updateMatrix() once—three.js then stops recomputing their matrices every frame. The official manual's Optimize Lots of Objects walks through merging in detail.

35. Use array textures for modern browsers
Array textures combine multiple textures into layers, accessed by index in shaders. Combined with BatchedMesh, this enables diverse appearances with minimal draw calls.

36. Understand frustum culling
Three.js automatically culls objects outside the camera's view—they don't generate draw calls. You can control this behavior:

// Default: objects outside view are culled
mesh.frustumCulled = true;

// Disable for objects that should always render (skyboxes, particle systems)
skybox.frustumCulled = false;

// For manual culling with complex logic:
const frustum = new Frustum();
const matrix = new Matrix4().multiplyMatrices(
  camera.projectionMatrix,
  camera.matrixWorldInverse
);
frustum.setFromProjectionMatrix(matrix);

if (frustum.intersectsObject(mesh)) {
  // Object is visible
}
Frustum culling is free optimization—ensure your bounding boxes are accurate for it to work correctly.

Memory Management
Three.js doesn't garbage collect GPU resources automatically. You must explicitly dispose of geometries, materials, and textures when done with them.

37. Dispose all GPU resources when done
Removing an object from the scene doesn't free its GPU memory. Dispose geometries, materials, and textures explicitly (see the official How to dispose of objects guide):

function cleanupMesh(mesh) {
  mesh.geometry.dispose();

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach(mat => {
      Object.values(mat).forEach(prop => {
        if (prop?.isTexture) prop.dispose();
      });
      mat.dispose();
    });
  } else {
    Object.values(mesh.material).forEach(prop => {
      if (prop?.isTexture) prop.dispose();
    });
    mesh.material.dispose();
  }

  scene.remove(mesh);
}
A single 4096×4096 RGBA texture uses 64 MiB of VRAM—about 85 MiB with mipmaps. Geometries and shader programs also persist. Monitor renderer.info.memory—if counts keep growing, you have leaks.

38. Handle ImageBitmap textures from GLTF specially
GLTF textures load as ImageBitmap, which requires explicit closing:

texture.source.data.close?.();
texture.dispose();
Without close(), ImageBitmap objects leak.

39. Use object pooling for spawned entities
For frequently created/destroyed objects (bullets, particles, enemies), pool instead of creating new. This avoids allocation overhead and GC pauses:

class ObjectPool {
  constructor(factory, reset, initialSize = 20) {
    this.factory = factory;
    this.reset = reset;
    this.pool = [];

    // Pre-warm the pool
    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      obj.visible = false;
      this.pool.push(obj);
    }
  }

  acquire() {
    const obj = this.pool.pop() || this.factory();
    obj.visible = true;
    return obj;
  }

  release(obj) {
    this.reset(obj);
    obj.visible = false;
    this.pool.push(obj);
  }
}

// Usage
const bulletPool = new ObjectPool(
  () => new Mesh(bulletGeometry, bulletMaterial),
  (bullet) => bullet.position.set(0, 0, 0),
  50
);

// Spawn
const bullet = bulletPool.acquire();
scene.add(bullet);

// Despawn
bulletPool.release(bullet);
Pre-warm pools during loading to avoid runtime allocation spikes.

40. Cache and reuse textures
Load each texture once, reference it everywhere:

const textureCache = new Map();

function getTexture(url) {
  if (!textureCache.has(url)) {
    textureCache.set(url, textureLoader.load(url));
  }
  return textureCache.get(url);
}
41. Dispose render targets
Post-processing render targets need disposal too:

renderTarget.dispose();
Each render target allocates framebuffer memory.

42. Clean up on component unmount (React)
In React Three Fiber, use cleanup functions:

useEffect(() => {
  return () => {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };
}, []);
Shaders & Materials
Shader optimization is where experts separate from beginners. Small changes can yield 2x performance improvements, especially on mobile.

43. Use mediump precision on mobile
On many mobile GPUs, half precision is significantly cheaper. Qualcomm says mediump fragment shaders can be up to twice as fast and twice as power-efficient on Adreno (Source: Qualcomm), and Arm recommends 16-bit precision on Mali for the same reason (Source: Arm GPU Best Practices). Apple also recommends 16-bit types where precision allows, mainly to reduce register pressure (Source: Apple). Desktop GPUs ignore mediump entirely:

precision mediump float;
Only use highp when you need it (depth calculations, positions, large UV ranges). In WGSL, half precision (f16) requires the shader-f16 feature.

44. Minimize varying variables
Varyings transfer data between vertex and fragment shaders. Each one costs bandwidth and interpolation work, so keep them few, pack them tightly, and use mediump where precision allows (Arm GPU Best Practices):

// Bad: many varyings
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vWorldPosition;
varying vec4 vColor;

// Better: pack data
varying vec4 vData1; // xy = uv, zw = packed normal
varying vec4 vData2; // xyz = position, w = unused
45. Replace divergent branches with mix() and step()
GPUs shade pixels in groups. When pixels in the same group take different sides of an if, the group runs both sides. Branches on uniforms—the same value for every pixel—are cheap, and branchless code isn't automatically faster when one side is expensive. But for short, data-dependent choices, mix() and step() avoid divergence entirely (Source: Unity shader branching guide):

// Bad: branching
if (value > 0.5) {
  color = colorA;
} else {
  color = colorB;
}

// Good: branchless
color = mix(colorB, colorA, step(0.5, value));
46. Pack data into RGBA channels
Store 4 values per texel instead of 1:

vec4 data = texture2D(dataTex, uv);
float value1 = data.r;
float value2 = data.g;
float value3 = data.b;
float value4 = data.a;
This reduces texture fetches by 75%.

47. Avoid dynamic loops
Loops with dynamic bounds prevent optimization:

// Bad: dynamic
for (int i = 0; i < count; i++) { ... }

// Better: fixed
for (int i = 0; i < 16; i++) { ... }
Or unroll short loops entirely.

48. Keep precision under control in large-coordinate scenes
City models, CAD assemblies, and geospatial data often use coordinates in the hundreds of thousands. float32 carries about 7 significant digits, so far from the origin vertices jitter and surfaces z-fight. Fix it at the source:

Floating origin: re-center geometry near (0, 0, 0) at load time and store the real-world offset separately, or periodically shift the world so the camera stays near the origin
Tight depth range: push camera.near out as far as the scene allows—depth precision depends far more on the near plane than the far plane
Better depth buffers: reversedDepthBuffer (WebGLRenderer since r178 with the EXT_clip_control extension—earlier releases called it reverseDepthBuffer—and WebGPURenderer since r183) or logarithmicDepthBuffer on either renderer
const renderer = new WebGPURenderer({ reversedDepthBuffer: true });
Prefer reversed depth where it's supported: a logarithmic depth buffer writes depth from the fragment shader, which disables early depth testing and costs fill rate.

49. Minimize transparent overdraw
Transparent objects can't rely on the depth buffer to skip hidden pixels, so every layer is shaded, blended, and sorted back to front each frame. Stacked particles, foliage cards, and glass panels multiply fill-rate cost fast—especially on high-DPI mobile screens:

// Cutout foliage: alpha test instead of blending
leafMaterial.transparent = false;
leafMaterial.alphaTest = 0.5;

// Soft edges without sorting: alpha to coverage (needs MSAA)
leafMaterial.alphaToCoverage = true;

// Or dithered transparency without sorting
glassMaterial.alphaHash = true;
Keep genuinely transparent surfaces few and large, and turn transparent off on any material whose opacity is 1.

50. Write reusable TSL functions with Fn
Create reusable shader logic with the Fn pattern:

import { Fn, color, float, normalView, positionViewDirection } from 'three/tsl';

const fresnel = Fn(([normal, viewDir, power]) => {
  const dotNV = normal.dot(viewDir).saturate();
  return float(1).sub(dotNV).pow(power);
});

// Use it
material.emissiveNode = fresnel(normalView, positionViewDirection, 3.0).mul(color(0x66ccff));
Functions compile once and can be reused across materials.

51. Use TSL's built-in noise functions
TSL includes MaterialX noise functions—no need for external libraries:

import { mx_noise_float, mx_noise_vec3, mx_fractal_noise_float } from 'three/tsl';

// Simple noise
const n = mx_noise_float(positionLocal.mul(scale));

// Fractal noise with octaves
const fbm = mx_fractal_noise_float(positionLocal, octaves, lacunarity, gain);

// 3D noise for color variation
const colorNoise = mx_noise_vec3(uv.mul(10));
52. Reuse shader programs
Three.js reuses programs for identical shaders. If you define uniforms the same way, programs are shared. Unnecessary variations create program proliferation.

Lighting & Shadows
Lighting is expensive. Shadows are more expensive. Real-time lighting with shadows can consume more GPU time than everything else combined.

53. Keep active lights to a minimum
There's no hard limit, but every light adds per-pixel work to every lit material, and every shadow-casting light adds an entire extra render pass. A practical starting budget is 3 or fewer dynamic lights; beyond that, bake lighting or rely on environment maps.

54. Understand PointLight shadow cost
PointLight shadows require 6 shadow map renders (one per cube face):

Draw calls = objects × 6 × point_lights
Two PointLights with shadows on 10 objects = 120 extra draw calls.

55. Bake lightmaps for static scenes
If lighting doesn't change, bake it into textures:

Bake lightmaps and ambient occlusion in Blender (Cycles) onto a second UV set
Assign them as material.lightMap and material.aoMap, and set texture.channel = 1 so they read the second UV set
Compress the baked textures with KTX2 (tip 22)
Baked lighting is essentially free at render time. The once-popular @react-three/lightmap runtime baker hasn't had a release since 2022, so don't start new projects on it.

56. Use Cascaded Shadow Maps for large scenes
CSM provides high-quality shadows near the camera and lower quality at distance:

import { CSM } from 'three/addons/csm/CSM.js';

const csm = new CSM({
  camera,
  parent: scene,
  maxFar: camera.far,
  cascades: 4, // desktop: 4, mobile: 2
  shadowMapSize: 2048
});

// Call csm.setupMaterial(material) for each shadow-receiving material,
// and csm.update() every frame
On WebGPURenderer, use the node-based version and attach it to the light's shadow:

import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';

const csm = new CSMShadowNode(directionalLight, { cascades: 4, maxFar: camera.far });
directionalLight.shadow.shadowNode = csm;
New in r186, SunLight (three/addons/lights/SunLight.js) packages a sun with built-in cascaded shadows (two fixed cascades) for both renderers. With WebGPU, register it once with renderer.library.addLight(SunLightNode, SunLight), importing SunLightNode from three/addons/lights/SunLightNode.js.

57. Size shadow maps appropriately
Mobile: 512-1024
Desktop: 1024-2048
Quality-critical: 4096
Larger shadow maps consume quadratically more memory.

58. Be selective with castShadow and receiveShadow
Every shadow-casting light renders the scene again from its own point of view, and every object flagged castShadow is drawn into that pass. Enable shadows only where the viewer will notice them:

renderer.shadowMap.enabled = true;
sun.castShadow = true;

hero.castShadow = true;      // the object people look at
ground.receiveShadow = true; // the surface the shadow lands on

smallProps.forEach((prop) => {
  prop.castShadow = false;   // tiny or distant objects: skip both
  prop.receiveShadow = false;
});
Leave receiveShadow off on objects that never have anything above them—every receiver pays for shadow sampling in its fragment shader.

59. Use environment maps for ambient light
Environment maps (HDRIs) provide realistic lighting without per-light calculation:

const envMap = pmremGenerator.fromScene(scene).texture;
scene.environment = envMap;
60. Tune shadow camera frustum
A tight frustum improves shadow quality:

directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
Don't use defaults—fit to your scene.

61. Disable shadow auto-update for static scenes
If your lights and shadow-casting objects don't move, stop re-rendering shadow maps every frame. Per-light control works on both WebGLRenderer and WebGPURenderer:

light.shadow.autoUpdate = false;

// When lights or objects do move, request a single update:
light.shadow.needsUpdate = true;
This saves a full shadow pass every frame. On WebGLRenderer you can also freeze all shadows at once with renderer.shadowMap.autoUpdate = false. If you're upgrading three.js, note the recent shadow changes: PCFSoftShadowMap was deprecated in r182 and removed from both renderers in r186 (the constant now warns and falls back to PCFShadowMap, which is soft by default)—retune shadow.bias after updating.

62. Use fake shadows for simple cases
A semi-transparent plane with a radial gradient can fake contact shadows cheaply. Good enough for many use cases without the cost of real shadows.

React Three Fiber
React Three Fiber (R3F) adds React's mental model to Three.js. It also adds performance pitfalls specific to React's rendering paradigm.

R3F 9 supports WebGPU through an async gl factory (the v10 alpha adds a dedicated @react-three/fiber/webgpu entry point):

import * as THREE from 'three/webgpu';

<Canvas
  gl={async (props) => {
    const renderer = new THREE.WebGPURenderer(props);
    await renderer.init();
    return renderer;
  }}
>
  <Scene />
</Canvas>
63. Mutate in useFrame, don't setState
The core rule: Three.js mutations happen in useFrame, not React state:

// Bad: triggers React re-render
const [rotation, setRotation] = useState(0);
useFrame(() => setRotation(r => r + 0.01));

// Good: direct mutation
const meshRef = useRef();
useFrame(() => {
  meshRef.current.rotation.x += 0.01;
});
64. Use frameloop="demand" for static scenes
If nothing animates, don't render every frame:

<Canvas frameloop="demand">
  <Scene />
</Canvas>
This saves battery on mobile devices.

65. Call invalidate() for manual updates
With on-demand rendering, trigger re-render when needed:

const invalidate = useThree(state => state.invalidate);

// After a change
invalidate();
66. Never create objects inside useFrame
Object creation triggers garbage collection:

// Bad: creates new Vector3 every frame
useFrame(() => {
  mesh.position.copy(new Vector3(1, 2, 3));
});

// Good: reuse
const targetPos = useMemo(() => new Vector3(1, 2, 3), []);
useFrame(() => {
  mesh.position.copy(targetPos);
});
67. Use delta for frame-rate independence
Different devices have different refresh rates:

useFrame((state, delta) => {
  // Bad: speed varies with frame rate
  mesh.rotation.x += 0.1;

  // Good: consistent speed
  mesh.rotation.x += delta * speed;
});
68. Adapt quality to the device with PerformanceMonitor
Drei's <PerformanceMonitor> watches the frame rate and tells you when a device is struggling or has headroom. Tie it to the Canvas pixel ratio:

import { PerformanceMonitor } from '@react-three/drei';

function App() {
  const [dpr, setDpr] = useState(1.5);
  return (
    <Canvas dpr={dpr}>
      <PerformanceMonitor
        onIncline={() => setDpr(2)}
        onDecline={() => setDpr(1)}
        flipflops={3}
        onFallback={() => setDpr(1)}
      />
      <Scene />
    </Canvas>
  );
}
flipflops stops it from oscillating: after three switches, onFallback settles on the safe setting. The same pattern works for shadow map size, post-processing, or LOD distances (tip 26 covers <Detailed />).

69. Preload models with useGLTF.preload
Load models before they're needed:

useGLTF.preload('/model.glb');

// Later, in component
const { scene } = useGLTF('/model.glb');
70. Wrap expensive components in React.memo
Prevent unnecessary re-renders:

const ExpensiveModel = React.memo(({ url }) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
});
71. Toggle visibility instead of remounting
Remounting recreates buffers and recompiles shaders:

// Bad: unmount/mount
{showModel && <Model />}

// Good: visibility toggle
<Model visible={showModel} />
72. Use r3f-perf for monitoring (WebGL)
Drop-in performance monitoring for R3F:

import { Perf } from 'r3f-perf';

<Canvas>
  <Perf position="top-left" />
  <Scene />
</Canvas>
r3f-perf supports WebGLRenderer only, and its last release was in November 2024. For WebGPU scenes, use r3f-webgpu-perf or three.js's built-in Inspector (tip 15).

Post-Processing & Effects
Post-processing runs additional GPU passes over your rendered scene. Each effect adds cost, but smart configuration minimizes impact.

73. Use pmndrs/postprocessing for WebGL projects
The pmndrs postprocessing library automatically merges effects into fewer passes:

import { EffectComposer, RenderPass, EffectPass, BloomEffect, VignetteEffect } from 'postprocessing';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new EffectPass(camera, new BloomEffect(), new VignetteEffect()));
The library works with WebGLRenderer only. For WebGPU, use three.js's built-in pipeline (tip 82).

74. Configure renderer for post-processing
Optimal settings when using EffectComposer:

// WebGL
const renderer = new WebGLRenderer({
  powerPreference: 'high-performance',
  antialias: false,      // AA handled by post-processing
  stencil: false,
  depth: false
});

// WebGPU
const renderer = new WebGPURenderer({
  antialias: false,
  powerPreference: 'high-performance'
});
await renderer.init();
WebGPU handles depth/stencil buffers automatically. Both renderers benefit from disabling native AA when post-processing adds SMAA/FXAA.

75. Disable multisampling for performance
When you don't need it:

<EffectComposer multisampling={0}>
  <Bloom />
</EffectComposer>
76. Apply tone mapping at pipeline end
With post-processing, disable renderer tone mapping:

renderer.toneMapping = NoToneMapping;
Add ToneMappingEffect as the last effect instead.

77. Implement selective bloom
Not everything should bloom. Use layers or threshold:

const bloom = new SelectiveBloomEffect(scene, camera, {
  luminanceThreshold: 0.9,
  luminanceSmoothing: 0.3
});
78. Add antialiasing at the end
Post-processing bypasses WebGL's built-in AA. Add SMAA or FXAA as the final pass:

composer.addPass(new EffectPass(camera, new SMAAEffect()));
79. Tune bloom parameters carefully
intensity: Overall strength (0.5-2.0 typical)
luminanceThreshold: Minimum brightness to bloom (0.8-1.0)
radius: Spread size (0.5-1.0)
Lower resolution bloom is cheaper and often looks good.

80. Cap pixel ratio and trade resolution for frame rate
High-DPI phones report a devicePixelRatio of 3 or more—9x the pixels of a 1x screen. Cap it; few people can see the difference above 2:

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
For heavy effect chains, go further. Rendering post-processing at half resolution, then upscaling, can roughly double frame rate in fill-rate-bound scenes:

composer.setSize(window.innerWidth / 2, window.innerHeight / 2);
81. Merge compatible effects
Some effects can combine their shader passes:

// Single pass for multiple effects
const effects = new EffectPass(camera, bloom, vignette, chromaticAberration);
82. Use Three.js native post-processing for WebGPU
For WebGPU projects, use three.js's built-in RenderPipeline with TSL nodes instead of pmndrs/postprocessing. The class was called PostProcessing until r183; the old name still works but logs a deprecation warning:

import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

const renderPipeline = new THREE.RenderPipeline(renderer);
const scenePass = pass(scene, camera);
const scenePassColor = scenePass.getTextureNode('output');

renderPipeline.outputNode = scenePassColor.add(bloom(scenePassColor));

renderer.setAnimationLoop(() => {
  renderPipeline.render();
});
FXAA and SMAA nodes live in the same folder (FXAANode.js, SMAANode.js). The pmndrs library remains excellent for WebGL projects, but TSL-based post-processing is the native solution for WebGPU with full compute shader support.

Loading & Core Web Vitals
Heavy 3D experiences can destroy Core Web Vitals if you're not careful. Here's how to maintain good LCP, INP, and CLS while delivering rich experiences (INP replaced FID as a Core Web Vital in March 2024).

83. Lazy load 3D content below the fold
If 3D isn't immediately visible, defer its loading:

const observer = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    loadThreeJsScene();
    observer.disconnect();
  }
});

observer.observe(canvasContainer);
84. Code-split Three.js modules
Don't bundle everything upfront:

const Three = await import('three');
const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
85. Preload critical assets
For above-the-fold 3D, preload aggressively:

<link rel="preload" href="/model.glb" as="fetch" crossorigin>
<link rel="preload" href="/texture.ktx2" as="fetch" crossorigin>
<link rel="modulepreload" href="/assets/scene.js">
Keep crossorigin on fetch preloads even for same-origin files—it has to match the request's CORS mode (Source: MDN), or the browser can't reuse the preloaded response and downloads the file twice (Source: web.dev). Use modulepreload for the JavaScript that builds your scene.

86. Implement progressive loading
Show low-resolution first, load high-res in background:

// Load low-res immediately
const lowRes = await loadModel('low.glb');
scene.add(lowRes);

// Load high-res async
loadModel('high.glb').then(highRes => {
  scene.remove(lowRes);
  scene.add(highRes);
});
87. Offload heavy work to Web Workers
Physics, procedural generation, and asset processing can run off the main thread:

const worker = new Worker('/physics-worker.js');
worker.postMessage({ positions, velocities });
You can also move rendering itself off the main thread: transfer the canvas with canvas.transferControlToOffscreen() and run three.js inside the worker, so heavy frames never block scrolling or input.

88. Stream large scenes
For massive environments, load sections dynamically:

function updateVisibleChunks(cameraPosition) {
  const visibleChunks = getChunksNear(cameraPosition);
  visibleChunks.forEach(chunk => {
    if (!chunk.loaded) loadChunk(chunk);
  });
}
89. Serve 3D assets compressed and cached
.glb and .bin files compress well over the wire, and Meshopt-encoded geometry is designed to be gzip- or Brotli-compressed on top (tip 29). Make sure your server or CDN actually does it, and cache assets aggressively behind content-hashed filenames:

# Response headers for /models/scene.3f9a2c.glb
Content-Encoding: br
Cache-Control: public, max-age=31536000, immutable
Many CDNs only compress known MIME types—check that model/gltf-binary is on the list, or your models ship uncompressed. KTX2 files using Zstandard supercompression are already compressed and gain little.

90. Use Suspense with R3F
R3F integrates with React Suspense:

<Suspense fallback={<Loader />}>
  <Model />
</Suspense>
Development & Debugging
The best optimization is the one you don't need because you caught the problem early. These tools and techniques help identify issues before they become production problems.

91. Use stats-gl for WebGL/WebGPU monitoring
stats-gl provides real-time FPS, CPU, and GPU metrics. It works with both WebGLRenderer and WebGPURenderer:

import Stats from 'stats-gl';

const stats = new Stats({ trackGPU: true });
document.body.appendChild(stats.dom);
stats.init(renderer);

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  stats.update();
});
Add trackCPT: true to also time WebGPU compute passes.

92. Set up lil-gui for live tweaking
lil-gui creates debug panels for any JavaScript object:

import GUI from 'lil-gui';

const gui = new GUI();
gui.add(camera.position, 'x', -10, 10);
gui.add(camera.position, 'y', -10, 10);
gui.add(light, 'intensity', 0, 2);
Essential for finding the right values during development. On WebGPURenderer, the built-in Inspector (tip 15) includes a parameters panel with the same API:

const gui = renderer.inspector.createParameters('Settings');
gui.add(light, 'intensity', 0, 2);
93. Profile with Spector.js
Spector.js is a browser extension that captures WebGL frames. See every draw call, texture bind, and shader program. Invaluable for understanding what's actually happening.

Spector.js works with WebGL only. For WebGPU, use Brendan Duncan's WebGPU Inspector extension (Chrome and Firefox) to capture frames, inspect buffers and textures, and debug shaders.

94. Check renderer.info regularly
setInterval(() => {
  console.log('Calls:', renderer.info.render.calls);
  console.log('Triangles:', renderer.info.render.triangles);
  console.log('Geometries:', renderer.info.memory.geometries);
  console.log('Textures:', renderer.info.memory.textures);
}, 1000);
Watch these numbers. They should stay stable, not climb. On WebGPURenderer, renderer.info.render.drawCalls counts draw calls (render.calls counts render() calls), renderer.info.compute.calls counts compute dispatches, and renderer.info.memory breaks usage down by resource type.

95. Use three-mesh-bvh for fast raycasting
three-mesh-bvh builds a bounding volume hierarchy for your geometry—its README demo casts 500 rays against an 80,000-polygon model at 60fps:

import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

mesh.geometry.computeBoundsTree();
Essential for interactive scenes with complex geometry.

96. Use browser DevTools Performance tab
Chrome/Edge DevTools shows where time is spent:

Long frames
Garbage collection pauses
Blocking JavaScript
Profile real sessions, not just synthetic tests.

97. Measure GPU time with timestamp queries
CPU timers can't see GPU work; WebGPU timestamp queries can, on adapters that support the timestamp-query feature. With three.js you don't need the raw API—enable tracking on the renderer and resolve results every frame:

const renderer = new WebGPURenderer({ trackTimestamp: true });

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
  renderer.resolveTimestampsAsync('render'); // resolve every frame, or queries pile up
});

setInterval(() => console.log('GPU ms:', renderer.info.render.timestamp), 1000);
trackTimestamp isn't in the public docs yet, so treat it as experimental. For most profiling needs, the Inspector (tip 15) and stats-gl (tip 91) wrap this for you.

98. Handle context and device loss gracefully
GPUs can drop your context—on mobile when the app is backgrounded, or after a driver reset. With WebGPURenderer, set a device-lost handler (it also fires when running on the WebGL 2 fallback):

renderer.onDeviceLost = (info) => {
  console.warn('GPU device lost:', info.reason, info.message);
  // Stop the loop, show a fallback, or recreate the renderer
};
With WebGLRenderer, listen on the canvas:

renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  // Stop animation loop
});

renderer.domElement.addEventListener('webglcontextrestored', () => {
  // Reinitialize
});
To test your recovery path in Chrome, open chrome://gpucrash in another tab.

99. Profile the animation loop
Measure what happens each frame:

function animate() {
  const t0 = performance.now();

  physics.update();
  const t1 = performance.now();

  controls.update();
  const t2 = performance.now();

  renderer.render(scene, camera);
  const t3 = performance.now();

  console.log(`Physics: ${t1-t0}ms, Controls: ${t2-t1}ms, Render: ${t3-t2}ms`);

  requestAnimationFrame(animate);
}
100. Use setAnimationLoop for cleaner render loops
Instead of manual requestAnimationFrame, use Three.js's built-in animation loop:

// Instead of:
function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

// Use:
renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});

// Stop when needed
renderer.setAnimationLoop(null);
This handles XR sessions automatically and provides cleaner start/stop control. Essential for WebXR applications. With WebGPURenderer, it also awaits renderer.init() before the first frame (tip 1).

For frame timing, use Timer (in core since r179) instead of Clock, which is deprecated since r183:

import { Timer } from 'three';

const timer = new Timer();
timer.connect(document); // pauses on hidden tabs, so there's no huge delta on return

renderer.setAnimationLoop((timestamp) => {
  timer.update(timestamp);
  const delta = timer.getDelta();
  // ...animate with delta
  renderer.render(scene, camera);
});
About Utsubo
Utsubo is an interactive creative studio specializing in Three.js development, from brand websites to physical installations.

We shipped one of the first production WebGPU Three.js experiences at 2024.utsubo.com in early 2024. We actively contribute to the Three.js ecosystem, including tools like stats-gl for WebGPU performance monitoring.

Our work includes:

utsubo.com: Award-winning 3D heavy experience
Hokusai installation: 1M particle fluid simulation at Expo 2025 Osaka
Segments.ai: 100x performance improvement via WebGPU migration
We work with brands, museums, and tech companies building the next generation of web experiences.

Let's Build Something Together
Looking for a team to create your next 3D web experience? Book a project discussion.

Book a project discussion

Related Reading
Three.js 2026: What Changed — Overview of WebGPU adoption, vibe coding, and the expanded Three.js ecosystem
WebGPU Three.js Migration Guide — Step-by-step migration checklist for existing WebGL projects
Summary
The 100 tips above cover the essential practices for production Three.js development in 2026: WebGPU renderer adoption, asset optimization with Draco and KTX2, draw call reduction through instancing and batching, proper memory management, and effective debugging workflows. Below, we answer the most common questions developers ask when optimizing their projects.

FAQs
How do I optimize Three.js performance?
Start by measuring: use stats-gl and renderer.info to identify bottlenecks. The most common issues are too many draw calls (solved by instancing and batching), unoptimized assets (use Draco and KTX2 compression), and memory leaks (always dispose unused resources). Budget around 100 draw calls per frame on mobile; desktop can handle several hundred.

What are the best practices for WebGPU in Three.js?
Since r171, use import { WebGPURenderer } from 'three/webgpu' for zero-config setup with automatic WebGL 2 fallback, and start rendering with setAnimationLoop(), which initializes the renderer for you. Learn TSL (Three Shader Language) for cross-platform shaders. Use compute shaders for particle systems and physics. WebGPU shines in draw-call-heavy scenes and compute-intensive effects, but it isn't universally faster—profile before migrating for speed alone.

How do I reduce draw calls in Three.js?
Use InstancedMesh for repeated objects (trees, particles, props). Use BatchedMesh for objects sharing materials but with different geometries. Share materials between meshes. Merge static geometry with BufferGeometryUtils. Use texture atlases to reduce material variations. Check your progress with renderer.info.render.calls (render.drawCalls on WebGPURenderer).

What tools help debug Three.js applications?
Essential tools include: the built-in three.js Inspector for WebGPU, stats-gl for FPS/CPU/GPU monitoring, lil-gui for live parameter tweaking, Spector.js (WebGL) or WebGPU Inspector for frame capture, three-mesh-bvh for fast raycasting, renderer.info for memory and draw call stats, and browser DevTools Performance tab for frame timing analysis.

Should I migrate from WebGL to WebGPU?
Migrate if you're hitting performance walls—especially with draw-call-heavy scenes, complex particle systems, or compute-intensive effects. For new projects, start with WebGPU. If your current WebGL project runs smoothly and you're not limited by performance, there's no urgent need to migrate. Three.js provides automatic fallback, so you can adopt WebGPU without breaking compatibility.

How do I handle memory leaks in Three.js?
Always dispose resources when done: call geometry.dispose(), material.dispose(), and texture.dispose(). For GLTF textures loaded as ImageBitmap, also call texture.source.data.close?.(). Monitor renderer.info.memory—if geometries and textures keep growing, you have a leak. Implement resource pooling for frequently created/destroyed objects.