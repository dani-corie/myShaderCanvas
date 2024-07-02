        precision highp sampler2DArray;
        precision mediump float;
        
        uniform sampler2D u_cam;
        uniform sampler2DArray u_imgs;
        uniform int u_imgs_depth;
        
        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_delta;
        
        vec4 mirror(sampler2D img, vec2 uv) {
            return texture(img, vec2(1. - uv.x, uv.y));
        }
        
        void main() {
            vec2 st = gl_FragCoord.xy / u_resolution.xy;
            vec4 color = (mirror(u_cam, st) + texture(u_imgs, vec3(st, int(u_time) % u_imgs_depth))) / 2.;
            color.r += clamp(sin(u_time), 0., 1.);
            gl_FragColor = color;
        }