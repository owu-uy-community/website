#pragma once
#include "companion_model.h"
#include "lvgl.h"

namespace owy {
// Tiny integer geometry updates only; no rotation, alpha layers or frame buffers.
// Voice state owns labels/colors; this is the sole writer of animated geometry.
class FaceRenderer {
 public:
  void render(const Frame &f, lv_obj_t *left, lv_obj_t *right, lv_obj_t *lp, lv_obj_t *rp,
              lv_obj_t *mouth, lv_obj_t *cutout, lv_obj_t *cheek_l, lv_obj_t *cheek_r,
              lv_obj_t *brow_l, lv_obj_t *brow_r, lv_obj_t *d0, lv_obj_t *d1, lv_obj_t *d2) {
    if (!prepared_) {
      // Tiny decorative objects inherit LVGL's container padding/scrollbars.
      // Remove them once: otherwise a 12px eyebrow can show a scroll thumb.
      for (auto *obj : {left,right,lp,rp,mouth,cutout,cheek_l,cheek_r,brow_l,brow_r,d0,d1,d2}) {
        lv_obj_remove_flag(obj,LV_OBJ_FLAG_SCROLLABLE);
        lv_obj_set_style_pad_all(obj,0,LV_PART_MAIN);
      }
      prepared_=true;
    }
    box(0, left, -89+f.sway, -24, 152, f.eye_h);
    box(1, right, 89+f.sway, -24, 152, f.eye_rh);
    box(2, lp, f.gaze_x, f.gaze_y, 44, f.pupil_h);
    box(3, rp, f.gaze_x, f.gaze_y, 44, std::min(f.pupil_h, std::max(0, f.eye_rh - 20)));
    box(4, mouth, f.gaze_x / 3-f.sway, 116, f.mouth_w, f.mouth_h);
    // The black cutout makes a simple friendly U-shaped smile without a canvas.
    box(5, cutout, 0, -8, f.mouth_w - 20, f.mouth_h - 4);
    hidden(cutout, !f.smile);
    hidden(cheek_l, !f.cheeks); hidden(cheek_r, !f.cheeks);
    box(6, brow_l, -94, -150 + f.brow_y, 48, 12);
    box(7, brow_r, 94, -150 - f.brow_y, 48, 12);
    const lv_obj_t *dots[] = {d0, d1, d2};
    if (last_dot_ != f.dot) {
      last_dot_ = f.dot;
      for (int i = 0; i < 3; ++i)
        lv_obj_set_style_bg_color(const_cast<lv_obj_t *>(dots[i]), lv_color_hex(i == f.dot ? 0xF5BB03 : 0x343126), 0);
    }
  }
 private:
  struct Geometry { int x{-999}, y{-999}, w{-999}, h{-999}; } geometry_[8];
  int last_dot_{-1};
  bool prepared_{false};
  static void hidden(lv_obj_t *o, bool hide) {
    if (lv_obj_has_flag(o, LV_OBJ_FLAG_HIDDEN) == hide) return;
    if (hide) lv_obj_add_flag(o, LV_OBJ_FLAG_HIDDEN); else lv_obj_remove_flag(o, LV_OBJ_FLAG_HIDDEN);
  }
  void box(int n, lv_obj_t *o, int x, int y, int w, int h) {
    auto &g = geometry_[n];
    h = std::max(1, h);
    if (g.x != x) { lv_obj_set_x(o, x); g.x = x; }
    if (g.y != y) { lv_obj_set_y(o, y); g.y = y; }
    if (g.w != w) { lv_obj_set_width(o, w); g.w = w; }
    if (g.h != h) { lv_obj_set_height(o, h); g.h = h; }
  }
};
}  // namespace owy
