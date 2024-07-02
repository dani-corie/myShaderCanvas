import * as THREE from '/scripts/three.module.js';

const cam_init = async function (config) {
  const video = document.getElementById(config.webcam.video_element_id);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        ...config.dimensions,
        ...config.webcam.video_constraints
      },
      audio: false,
    });
    const webcam_settings = stream.getVideoTracks()[0].getSettings();
    video.srcObject = stream;
    const webcam_texture = new THREE.VideoTexture(video);
    webcam_texture.minFilter = THREE.LinearFilter;
    webcam_texture.magFilter = THREE.LinearFilter;
    webcam_texture.format = THREE.RGBAFormat;
    return { element: video, texture: webcam_texture, dims: { width: webcam_settings.width, height: webcam_settings.height } };
  } catch (e) {
    console.error("Encountered an error while initializing webcam: ", e);
    return null;
  }
};

const fetch_url = async function (url, type) {
  const response = await fetch(url);
  if (response.ok) {
    switch (type) {
      case 'text': return response.text();
      case 'json': return response.json();
      case 'blob': return response.blob();
      default: throw new Error(`Error while fetching ${url}: unhandled type '${type}'`);
    }
  }
  throw new Error(`Received HTTP ${response.status} while fetching ${url}`);
}

const load_2d_texture_array = async function (urls, dims) {
  const streams = urls.map(async (url) => {
    const blob = await fetch_url(url, 'blob');
    return createImageBitmap(blob, { imageOrientation: "flipY" });
  });
  try {
    const images = await Promise.all(streams);
    const lightbox = new OffscreenCanvas(dims.width, dims.height);
    const ctx = lightbox.getContext('2d', { willReadFrequently: true });

    const n = images.length;
    const stride = dims.width * dims.height * 4;
    const data = new Uint8Array(n * stride);
    for (let i = 0; i < n; i++) {
      ctx.drawImage(images[i], 0, 0, dims.width, dims.height);
      data.set(ctx.getImageData(0, 0, dims.width, dims.height).data, i * stride);
    }

    const texture = new THREE.DataArrayTexture(data, dims.width, dims.height, n);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.colorSpace = "srgb";
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { data: data, texture: texture, depth: n };
  } catch (e) {
    console.error("Encountered error(s) while processing images:", e);
    return null;
  }
}

const load_2d_texture_array_from_index = async function (index_url, dims) {
  try {
    const index = await fetch_url(index_url, 'json');
    return load_2d_texture_array(index, dims);
  } catch (e) {
    console.error("Encountered an error while retrieving image index:", e);
  }
}

const vertex_shader = `
  void main() {
      gl_Position = vec4( position, 1.0 );
  }
`;

const renderer_init = function (config, uniforms) {
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  camera.position.z = 1;
  // start of paydirt
  const shader_uniforms = {
    u_time: { type: "f", value: 1.0 },
    u_delta: { type: "f", value: 1.0 },
    u_resolution: { type: "v2", value: new THREE.Vector2() },
    ...uniforms
  };
  const material = new THREE.ShaderMaterial({
    uniforms: shader_uniforms,
    vertexShader: vertex_shader,
    fragmentShader: config.renderer.shader_code,
  });
  // end of paydirt
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  const renderer = new THREE.WebGLRenderer();

  const container = document.getElementById(config.renderer.container_element_id);
  container.append(renderer.domElement);

  // set size data
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  shader_uniforms.u_resolution.value.x = container.clientWidth;
  shader_uniforms.u_resolution.value.y = container.clientHeight;

  //            const fps_field = document.getElementById('fps');
  const clock = new THREE.Clock();
  const tick = function () {
    const delta = clock.getDelta();
    shader_uniforms.u_delta.value = delta;
    shader_uniforms.u_time.value = clock.elapsedTime;
    renderer.render(scene, camera);
    //                fps_field.textContent = 1./delta;
    window.requestAnimationFrame(tick)
  }
  clock.start();
  window.requestAnimationFrame(tick);
};

const init = async function (config, descriptor_url) {
  try {
    const descriptor = await fetch_url(descriptor_url, 'json');
    console.log("...retrieving shader code...");
    config.renderer.shader_code = await fetch_url(descriptor.shader_uri, 'text');
    console.log("...retrieving texture files...");
    
    const textures = (await Promise.all(descriptor.textures_index.map(async (e) => {
      switch (e.type) {
        case 'array':
          const texture_data = await load_2d_texture_array_from_index(e.index_uri, config.dimensions);
          return [ [ e.uniform, { value: texture_data.texture } ], [ e.uniform + "_depth", { type: "i", value: texture_data.depth } ] ];
        case 'image':
          //fixme when i get around to it lololol, i know its basic but i don't need it atm
        default:
          throw new Error(`Invalid texture type ${e.type}`);
      }
    }))).flat();

    const textures_map = Object.fromEntries(textures);
    console.log("...activating webcam...");
    const cam = await cam_init(config);
    console.log("...starting renderer...");
    renderer_init(config, {
      u_cam: { value: cam.texture },
      ...textures_map
    });
  } catch (e) {
    console.log("Encountered an error while initializing shader:", e);
  }
};

export { cam_init, load_2d_texture_array, load_2d_texture_array_from_index, renderer_init, init };
