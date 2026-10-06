#pragma once
// Rim halo for the Knob: N small dots on a circle whose colour/opacity encode
// the voice state. Dots instead of an lv_arc on purpose — restyling an arc
// invalidates its whole 348×348 box (≈120k px) per update and starves the audio
// loop; recolouring 24 dots touches ≈3k px. Created at boot on a page object.
#include <cmath>
#include <cstdint>
#include "lvgl.h"

namespace owy {
class Ring {
 public:
  static constexpr int N = 24;
  void create(lv_obj_t *page, int radius, int size) {
    for (int i = 0; i < N; ++i) {
      const float a = 6.2831853f * i / N - 1.5707963f;  // start at 12 o'clock
      lv_obj_t *dot = lv_obj_create(page);
      lv_obj_remove_flag(dot, LV_OBJ_FLAG_SCROLLABLE);
      lv_obj_remove_flag(dot, LV_OBJ_FLAG_CLICKABLE);
      lv_obj_set_size(dot, size, size);
      lv_obj_set_style_radius(dot, LV_RADIUS_CIRCLE, 0);
      lv_obj_set_style_border_width(dot, 0, 0);
      lv_obj_set_style_pad_all(dot, 0, 0);
      lv_obj_set_style_bg_color(dot, lv_color_hex(0x0162C8), 0);
      lv_obj_align(dot, LV_ALIGN_CENTER, int(std::lround(std::cos(a) * radius)), int(std::lround(std::sin(a) * radius)));
      lv_obj_add_flag(dot, LV_OBJ_FLAG_HIDDEN);
      dots_[i] = dot;
    }
    ready_ = true;
  }
  // `lit` = how many dots (from the top, both ways) carry `color`/`opa`; the rest stay at `rest_opa`.
  void set(lv_color_t color, uint8_t opa, uint8_t rest_opa = 60) {
    if (!ready_) return;
    const uint32_t key = (uint32_t(lv_color_to_u16(color)) << 16) | (uint32_t(opa) << 8) | rest_opa;
    if (visible_ && key == key_) return;
    key_ = key;
    for (int i = 0; i < N; ++i) {
      lv_obj_set_style_bg_color(dots_[i], color, 0);
      lv_obj_set_style_bg_opa(dots_[i], opa, 0);
      if (!visible_) lv_obj_remove_flag(dots_[i], LV_OBJ_FLAG_HIDDEN);
    }
    visible_ = true;
  }
  void hide() {
    if (!ready_ || !visible_) return;
    for (int i = 0; i < N; ++i) lv_obj_add_flag(dots_[i], LV_OBJ_FLAG_HIDDEN);
    visible_ = false;
    key_ = 0;
  }
  bool visible() const { return visible_; }
 private:
  lv_obj_t *dots_[N]{};
  bool ready_{false}, visible_{false};
  uint32_t key_{0};
};
}  // namespace owy
