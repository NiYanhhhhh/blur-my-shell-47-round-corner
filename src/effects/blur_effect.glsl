uniform sampler2D tex;
uniform float sigma;
uniform float brightness;
uniform float width;
uniform float height;
uniform float corner_radius;
uniform int dir;

float circleBounds(vec2 p, vec2 center, float clip_radius) {
    vec2 delta = p - center;
    float dist_squared = dot(delta, delta);

    float outer_radius = clip_radius + 0.5;
    if (dist_squared >= (outer_radius * outer_radius))
        return 0.0;

    float inner_radius = clip_radius - 0.5;
    if (dist_squared <= (inner_radius * inner_radius))
        return 1.0;

    return outer_radius - sqrt(dist_squared);
}

float circleBounds0(vec2 p, vec2 center, float clip_radius) {
    vec2 delta = p - center;
    float dist_squared = dot(delta, delta);

    if (dist_squared >= (clip_radius * clip_radius))
        return 0.0;
    else
        return 1.0;
}

vec4 shapeCorner(vec4 pixel, vec2 p, vec2 center, float clip_radius) {
    float alpha = circleBounds(p, center, clip_radius);
    return vec4(pixel.rgb * alpha, min(alpha, pixel.a));
}

void main() {
    vec2 uv = cogl_tex_coord_in[0].xy;
    vec2 direction = vec2(dir, (1.0 - dir));

    float pixel_step;
    if (dir == 0)
        pixel_step = 1.0 / height;
    else
        pixel_step = 1.0 / width;

    vec3 gauss_coefficient;
    gauss_coefficient.x = 1.0 / (sqrt(2.0 * 3.14159265) * sigma);
    gauss_coefficient.y = exp(-0.5 / (sigma * sigma));
    gauss_coefficient.z = gauss_coefficient.y * gauss_coefficient.y;

    float gauss_coefficient_total = gauss_coefficient.x;

    vec4 ret = texture2D(tex, uv) * gauss_coefficient.x;
    gauss_coefficient.xy *= gauss_coefficient.yz;

    int n_steps = int(ceil(1.5 * sigma)) * 2;

    for (int i = 1; i <= n_steps; i += 2) {
        float coefficient_subtotal = gauss_coefficient.x;
        gauss_coefficient.xy *= gauss_coefficient.yz;
        coefficient_subtotal += gauss_coefficient.x;

        float gauss_ratio = gauss_coefficient.x / coefficient_subtotal;

        float foffset = float(i) + gauss_ratio;
        vec2 offset = direction * foffset * pixel_step;

        ret += texture2D(tex, uv + offset) * coefficient_subtotal;
        ret += texture2D(tex, uv - offset) * coefficient_subtotal;

        gauss_coefficient_total += 2.0 * coefficient_subtotal;
        gauss_coefficient.xy *= gauss_coefficient.yz;
    }
    vec4 outColor = ret / gauss_coefficient_total;

    // apply brightness and rounding on the second pass (dir==0 comes last)
    if (dir == 0) {
        vec2 pos = uv * vec2(width, height);
        float radius_fix = corner_radius + 2;

        // left side
        if (pos.x < radius_fix) {
            // top left corner
            if (pos.y < radius_fix) {
                outColor = shapeCorner(outColor, pos, vec2(radius_fix, radius_fix), corner_radius);
            // bottom left corner
            } else if (pos.y > height - radius_fix) {
                outColor = shapeCorner(outColor, pos, vec2(radius_fix, height - radius_fix + 1.), corner_radius);
            }
        // right side
        } else if (pos.x > width - radius_fix) {
            // top right corner
            if (pos.y < radius_fix) {
                outColor = shapeCorner(outColor, pos, vec2(width - radius_fix + 0.9, radius_fix), corner_radius);
            // bottom right corner
            } else if (pos.y > height - radius_fix) {
                outColor = shapeCorner(outColor, pos, vec2(width - radius_fix + 0.9, height - radius_fix + 1.), corner_radius);
            }
        }

    //if (dir == 0) {
        outColor.rgb *= brightness;
    }

    cogl_color_out = outColor;
}
