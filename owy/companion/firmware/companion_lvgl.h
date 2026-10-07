#pragma once
#include "companion_model.h"
#include "lvgl.h"

namespace owy {
// The face's LVGL objects. Any may be null: the knob's mini face on the answer
// view renders only eyes and mouth with the same Frame.
struct FaceObjects {
  lv_obj_t *eye_l{}, *eye_r{}, *pupil_l{}, *pupil_r{}, *glint_l{}, *glint_r{};
  lv_obj_t *happy_l{}, *happy_r{}, *lid_l{}, *lid_r{}, *brow_l{}, *brow_r{};
  lv_obj_t *cheek_l{}, *cheek_r{}, *mouth{}, *cavity{}, *tongue{}, *cut{}, *bowl{};
  lv_obj_t *zzz[3]{};
};

// Tiny integer geometry updates only; no rotation, alpha layers or frame buffers.
// Voice state owns labels/colors; this is the sole writer of animated geometry.
// Inputs are 466-space; `scale` maps them onto the panel (FACE_SCALE by default,
// a few % for the mini face). Every write is deduplicated against the last one.
class FaceRenderer {
 public:
  float scale{FACE_SCALE};
  void render(const Frame &f, const FaceObjects &o) {
    if (!prepared_) prepare(o);
    const int y = f.face_y;
    eye(0, o.eye_l, o.pupil_l, o.glint_l, o.happy_l, o.lid_l, -89 + f.sway, y, f.eye_h, f.lid_l, f);
    eye(1, o.eye_r, o.pupil_r, o.glint_r, o.happy_r, o.lid_r, 89 + f.sway, y, f.eye_rh, f.lid_r, f);
    color(0, o.eye_l, f.grey ? 0x777368 : 0xFBF5E7);
    color(1, o.eye_r, f.grey ? 0x777368 : 0xFBF5E7);
    color(2, o.glint_l, f.grey ? 0x9C978B : 0xFBF5E7);
    color(3, o.glint_r, f.grey ? 0x9C978B : 0xFBF5E7);
    color(4, o.brow_l, f.grey ? 0x343126 : 0xF5BB03, true);
    color(5, o.brow_r, f.grey ? 0x343126 : 0x0162C8, true);
    color(6, o.mouth, f.grey ? 0xA8A396 : 0xFBF5E7);
    brow(0, o.brow_l, -94, -150 + y + f.brow_y, f.brow_in_l, f.brow_out_l, 1);
    brow(1, o.brow_r, 94, -150 + y + f.brow_y, f.brow_in_r, f.brow_out_r, -1);
    const int cheek_w = 34 * f.cheek / 100, cheek_h = 15 * f.cheek / 100;
    box(20, o.cheek_l, -153, 85 + y, cheek_w, cheek_h);
    box(21, o.cheek_r, 153, 85 + y, cheek_w, cheek_h);
    hidden(o.cheek_l, !f.cheeks); hidden(o.cheek_r, !f.cheeks);
    box(22, o.mouth, f.mouth_x, 116 + y, f.mouth_w, f.mouth_h);
    radius(0, o.mouth, f.mouth_r);
    box(23, o.cavity, 0, 0, f.cavity_w, f.cavity_h);
    radius(1, o.cavity, f.cavity_r);
    hidden(o.cavity, f.cavity_h < 2);
    box(24, o.tongue, 0, f.cavity_h / 2, f.tongue_w, f.tongue_h);  // centred on the cavity floor
    hidden(o.tongue, f.tongue_h < 2);
    box(25, o.cut, 0, f.cut_y, f.cut_w, f.cut_h);
    hidden(o.cut, f.cut_h < 2);
    box(26, o.bowl, 0, f.bowl_h / 2 - f.mouth_h / 2 - 1, f.mouth_w + 4, f.bowl_h + 2);
    hidden(o.bowl, f.bowl_h < 2);
    for (int i = 0; i < 3; ++i) {
      if (!o.zzz[i]) continue;
      hidden(o.zzz[i], f.zzz < 0);
      if (f.zzz < 0) continue;
      // Three z's drift up and fade, a third of the cycle apart.
      const float ph = float((f.zzz + i * 867) % 2600) / 2600.f;
      box(27 + i, o.zzz[i], -19 + i * 20 + int(ph * 8), -93 - int(ph * 70), -1, -1);
      opacity(i, o.zzz[i], uint8_t(std::sin(ph * 3.14159265f) * 230));
    }
  }
 private:
  struct Geometry { int x{-999}, y{-999}, w{-999}, h{-999}; } geometry_[32];
  int radius_[2]{-1, -1}, opa_[3]{-1, -1, -1};
  uint32_t color_[8]{1, 1, 1, 1, 1, 1, 1, 1};
  lv_point_precise_t brow_points_[2][2]{};
  int brow_key_[2]{-999, -999};
  bool prepared_{false};
  int s(int v) const { return int(std::lround(v * scale)); }
  void prepare(const FaceObjects &o) {
    // Tiny decorative objects inherit LVGL's container padding/scrollbars.
    // Remove them once: otherwise a 12px eyebrow can show a scroll thumb.
    for (auto *obj : {o.eye_l, o.eye_r, o.pupil_l, o.pupil_r, o.glint_l, o.glint_r, o.happy_l, o.happy_r,
                      o.lid_l, o.lid_r, o.brow_l, o.brow_r, o.cheek_l, o.cheek_r, o.mouth, o.cavity,
                      o.tongue, o.cut, o.bowl}) {
      if (!obj) continue;
      lv_obj_remove_flag(obj, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_remove_flag(obj, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_set_style_pad_all(obj, 0, LV_PART_MAIN);
    }
    for (auto *line : {o.brow_l, o.brow_r}) {
      if (!line) continue;
      lv_obj_set_size(line, s(64), s(48));
      lv_obj_set_style_line_width(line, std::max(2, s(12)), LV_PART_MAIN);
      lv_obj_set_style_line_rounded(line, true, LV_PART_MAIN);
    }
    prepared_ = true;
  }
  void eye(int n, lv_obj_t *eye, lv_obj_t *pupil, lv_obj_t *glint, lv_obj_t *happy, lv_obj_t *lid,
           int x, int y, int h, int lid_h, const Frame &f) {
    box(n * 5, eye, x, -24 + y, 152, h);
    // Pupils, glints and the happy cut are children: they clip to the eye's box.
    box(n * 5 + 1, pupil, f.gaze_x, f.gaze_y, f.pupil_w, f.pupil_h);
    hidden(pupil, f.pupil_h < 2);
    box(n * 5 + 2, glint, f.pupil_w * 20 / 100, -f.pupil_h * 22 / 100, 13, 13);
    hidden(glint, f.pupil_h < 28);
    box(n * 5 + 3, happy, 0, h / 2 + 62 - f.crescent, 124, 124);
    hidden(happy, f.crescent < 2);
    // Lids are siblings drawn above the eye: no clip fringe, never over the brows.
    box(n * 5 + 4, lid, x, -24 + y - h / 2 - 1 + (lid_h + 2) / 2, 156, lid_h + 2);
    hidden(lid, lid_h < 2);
    if (lid) radius(-1, lid, std::min(44, (lid_h + 2) / 2));
  }
  void brow(int n, lv_obj_t *line, int x, int y, int inner, int outer, int side) {
    if (!line) return;
    box(10 + n, line, x, y, -1, -1);
    const int key = inner * 1000 + outer;
    if (brow_key_[n] == key) return;
    brow_key_[n] = key;
    // Points live in a 64×48 box centred on the brow; the inner end faces the nose.
    const float cx = 32, cy = 24, k = scale;
    brow_points_[n][0] = {lv_value_precise_t(std::lround((cx - 22 * side) * k)), lv_value_precise_t(std::lround((cy + outer) * k))};
    brow_points_[n][1] = {lv_value_precise_t(std::lround((cx + 22 * side) * k)), lv_value_precise_t(std::lround((cy + inner) * k))};
    lv_line_set_points(line, brow_points_[n], 2);
  }
  void color(int n, lv_obj_t *o, uint32_t rgb, bool line = false) {
    if (!o || color_[n] == rgb) return;
    color_[n] = rgb;
    if (line) lv_obj_set_style_line_color(o, lv_color_hex(rgb), LV_PART_MAIN);
    else lv_obj_set_style_bg_color(o, lv_color_hex(rgb), LV_PART_MAIN);
  }
  void radius(int n, lv_obj_t *o, int r) {
    if (!o) return;
    r = std::max(0, s(r));
    if (n >= 0) { if (radius_[n] == r) return; radius_[n] = r; }
    else if (lv_obj_get_style_radius(o, LV_PART_MAIN) == r) return;
    lv_obj_set_style_radius(o, r, LV_PART_MAIN);
  }
  void opacity(int n, lv_obj_t *o, uint8_t opa) {
    const int q = opa / 16 * 16;
    if (opa_[n] == q) return;
    opa_[n] = q;
    lv_obj_set_style_opa(o, q, LV_PART_MAIN);
  }
  static void hidden(lv_obj_t *o, bool hide) {
    if (!o || lv_obj_has_flag(o, LV_OBJ_FLAG_HIDDEN) == hide) return;
    if (hide) lv_obj_add_flag(o, LV_OBJ_FLAG_HIDDEN); else lv_obj_remove_flag(o, LV_OBJ_FLAG_HIDDEN);
  }
  // w/h < 0 = leave the size alone (labels, lines with a fixed box).
  void box(int n, lv_obj_t *o, int x, int y, int w, int h) {
    if (!o) return;
    auto &g = geometry_[n];
    x = s(x); y = s(y);
    if (g.x != x) { lv_obj_set_x(o, x); g.x = x; }
    if (g.y != y) { lv_obj_set_y(o, y); g.y = y; }
    if (w < 0 || h < 0) return;
    w = std::max(1, s(w)); h = std::max(1, s(h));
    if (g.w != w) { lv_obj_set_width(o, w); g.w = w; }
    if (g.h != h) { lv_obj_set_height(o, h); g.h = h; }
  }
};

// The rim: N dots on a circle, created at boot on a page. Recolouring 24 small
// dots costs ≈3k px; an lv_arc restyle invalidates its whole box (≈120k px) and
// starves the audio loop. Each dot is deduplicated, so a held state is free.
class FaceRing {
 public:
  static constexpr int N = RingFrame::N;
  void create(lv_obj_t *page, int radius, int size) {
    for (int i = 0; i < N; ++i) {
      const float a = 6.2831853f * i / N - 1.5707963f;  // start at 12 o'clock, clockwise
      lv_obj_t *dot = lv_obj_create(page);
      lv_obj_remove_flag(dot, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_remove_flag(dot, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_set_size(dot, size, size);
      lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
      lv_obj_set_style_border_width(dot, 0, 0);
      lv_obj_set_style_pad_all(dot, 0, 0);
      lv_obj_set_style_bg_opa(dot, LV_OPA_COVER, 0);
      lv_obj_align(dot, LV_ALIGN_CENTER, int(std::lround(std::cos(a) * radius)), int(std::lround(std::sin(a) * radius)));
      lv_obj_add_flag(dot, LV_OBJ_FLAG_HIDDEN);
      dots_[i] = dot;
    }
    ready_ = true;
  }
  void apply(const RingFrame &f, bool visible) {
    if (!ready_) return;
    for (int i = 0; i < N; ++i) {
      const uint8_t opa = visible ? f.opa[i] : 0;
      if (opa_[i] == opa && (opa == 0 || color_[i] == f.color)) continue;
      if (opa == 0) lv_obj_add_flag(dots_[i], LV_OBJ_FLAG_HIDDEN);
      else {
        if (color_[i] != f.color) lv_obj_set_style_bg_color(dots_[i], lv_color_hex(f.color), 0);
        lv_obj_set_style_bg_opa(dots_[i], opa, 0);
        if (opa_[i] == 0) lv_obj_remove_flag(dots_[i], LV_OBJ_FLAG_HIDDEN);
        color_[i] = f.color;
      }
      opa_[i] = opa;
    }
  }
 private:
  lv_obj_t *dots_[N]{};
  uint8_t opa_[N]{};
  uint32_t color_[N]{};
  bool ready_{false};
};
}  // namespace owy
