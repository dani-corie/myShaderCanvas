import * as THREE from './three.module.js';

class Loader {
  constructor(baseuri = null) {
    if (baseuri)
      this.baseuri = new URL(baseuri, window.location.origin);
    else
      this.baseuri = window.location.origin;
  }

  async load(url, type) {
    const response = await fetch(this.transform_url(url));
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

  cd(relative_path) {
    return new Loader(new URL(relative_path, this.baseuri));
  }

  transform_url(url) {
    return new URL(url, this.baseuri);
  }
}

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

const load_image = function (url, loader) {
  return new Promise((resolve, reject) => {
      const full_url = loader.transform_url(url);
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${full_url}`));
      image.src = full_url;
  });
};

const load_image_texture = async function(url, loader) {
  try{
    const image = await load_image(url, loader);
    const w_corr = (image.naturalWidth > image.naturalHeight) ? 1.0 : image.naturalHeight / image.naturalWidth;
    const h_corr = (image.naturalWidth > image.naturalHeight) ? image.naturalWidth / image.naturalHeight : 1.0;
    const texture = new THREE.Texture(image);
    texture.colorSpace = "srgb";
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    return { image, texture, corr: new THREE.Vector2(w_corr, h_corr) };
  } catch (e) {
    console.error("Encountered error while processing image:", e);
  }
};

const load_2d_texture_array = async function (urls, dims, loader) {
  const streams = urls.map(async (url) => {
    const blob = await loader.load(url, 'blob');
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

const load_2d_texture_array_from_index = async function (index_url, dims, loader) {
  try {
    console.log(loader);
    const index = await loader.load(index_url, 'json');
    const subloader = loader.cd(index_url);
    return load_2d_texture_array(index, dims, subloader);
  } catch (e) {
    console.error("Encountered an error while retrieving image index:", e);
  }
}

// const vertex_shader = `
//   void main() {
//       gl_Position = vec4( position, 1.0 );
//   }
// `;

const vertex_shader = `
  varying vec2 vUv;
  
  void main() {
      vUv = uv;
      gl_Position = vec4( position, 1.0 );    
  }
`;

const renderer_init = function (config, uniforms, control_logic) {
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
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2, 1, 1), material);
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
    const time = clock.elapsedTime;
    shader_uniforms.u_delta.value = delta;
    shader_uniforms.u_time.value = time;
    control_logic(shader_uniforms, time, delta)
    renderer.render(scene, camera);
    //                fps_field.textContent = 1./delta;
    window.requestAnimationFrame(tick)
  }
  clock.start();
  window.requestAnimationFrame(tick);
};

const init = async function (config, descriptor_uri, control_uniforms={}, control_logic=(uniforms, time, delta) => (null)) {
  try {
    let loader = new Loader();
    console.log(`...retrieving descriptor file ${descriptor_uri}...`);
    const descriptor = await loader.load(descriptor_uri, 'json');
    loader = loader.cd(descriptor_uri);

    console.log("...retrieving shader code...");
    const shader_code = await loader.load(descriptor.shader_uri, 'text');

    try {
      console.log("...resolving shader includes via lygia.xyz...")
      const resolveLygia = (await import("https://lygia.xyz/resolve.esm.js")).default;
      config.renderer.shader_code = await resolveLygia(shader_code);
    } catch (e) {
      console.error("Error while resolving lygia.xyz includes:", e)
      config.renderer.shader_code = shader_code;
    }

    let textures_map = {};
    if (descriptor.textures_index) {
      console.log("...retrieving texture files...");
      const textures = (await Promise.all(descriptor.textures_index.map(async (e) => {
        switch (e.type) {
          case 'array':
            const array_texture_details = await load_2d_texture_array_from_index(e.uri, config.dimensions, loader);
            return [ [ e.uniform, { value: array_texture_details.texture } ], [ e.uniform + "_depth", { type: "i", value: array_texture_details.depth } ] ];
          case 'image':
            const image_texture_details = await load_image_texture(e.uri, loader);
            return [ [ e.uniform, { value: image_texture_details.texture } ], [ e.uniform + "_corr", { type: "vec2", value: image_texture_details.corr } ] ];
          case 'placeholder':
            return [ [ e.uniform, { value: null } ] ]
          default:
            throw new Error(`Invalid texture type ${e.type}`);
        }
      }))).flat();

      textures_map = Object.fromEntries(textures);
    }

    let builtins = {};
    try {
      if (descriptor.webcam) {
        console.log("...activating webcam...");
        const cam = await cam_init(config);
        builtins["u_cam"] = { value: cam.texture };
      }
    } catch (e) {
      console.log("Error while initializing webcam:", e);
      builtins["u_cam"] = { value: null };
    }

    const uniforms = {
      ...builtins,
      ...control_uniforms,
      ...textures_map
    };

    console.log("...starting renderer...");
    renderer_init(config, uniforms, control_logic);
  } catch (e) {
    console.log("Encountered an error while initializing shader:", e);
  }
};

export { cam_init, load_2d_texture_array, load_2d_texture_array_from_index, renderer_init, init };
