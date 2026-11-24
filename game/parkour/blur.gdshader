shader_type canvas_item;
render_mode unshaded;

uniform float blur_amount = 0.0;
uniform float mask_amount = 0.0;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;

void fragment() {
	vec2 uv = SCREEN_UV;
	vec4 center = texture(screen_tex, uv);
	vec4 blurred = center;
	if (blur_amount > 0.001) {
		float d = blur_amount * 0.010;
		blurred = center * 0.20;
		blurred += texture(screen_tex, uv + vec2(d, 0.0)) * 0.10;
		blurred += texture(screen_tex, uv - vec2(d, 0.0)) * 0.10;
		blurred += texture(screen_tex, uv + vec2(0.0, d)) * 0.10;
		blurred += texture(screen_tex, uv - vec2(0.0, d)) * 0.10;
		blurred += texture(screen_tex, uv + vec2(d, d)) * 0.10;
		blurred += texture(screen_tex, uv + vec2(-d, d)) * 0.10;
		blurred += texture(screen_tex, uv + vec2(d, -d)) * 0.10;
		blurred += texture(screen_tex, uv + vec2(-d, -d)) * 0.10;
	}
	float hash = fract(sin(dot(floor(uv * vec2(64.0, 36.0)), vec2(12.9898, 78.233))) * 43758.5453);
	float sharp_mask = step(hash, mask_amount);
	vec4 result = mix(blurred, center, sharp_mask);
	COLOR = vec4(result.rgb, 1.0);
}
