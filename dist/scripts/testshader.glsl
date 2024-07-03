precision highp sampler2DArray;
precision mediump float;

uniform sampler2D u_cam;
uniform sampler2DArray u_array;
uniform int u_array_depth;
uniform sampler2D u_img;
uniform vec2 u_img_corr;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_delta;

vec4 mirror(sampler2D img, vec2 uv) {
    return texture(img, vec2(1. - uv.x, uv.y));
}

void main() {
  vec2 st = gl_FragCoord.xy / u_resolution.xy;
  vec4 color = (mirror(u_cam, st) + texture(u_array, vec3(st, int(u_time) % u_array_depth))) / 2.;
  color.r += clamp(sin(u_time), 0., 1.) * texture(u_img, fract(u_time + st * u_img_corr * 3.)).r;
  gl_FragColor = color;
}