#pragma once
// ESPHome 2026.8.2 font metrics/4bpp unpacking adapter. See
// ../firmware/components/LICENSE.esphome (C++ runtime: GPLv3, not MIT).
// No hardware font dependencies. Preserve this notice when distributing.
#include <cstdint>
#include <cstring>
#include "lvgl.h"
namespace font {
struct Glyph { uint32_t code_point; const uint8_t *data; int advance,offset_x,offset_y,width,height; };
class Font {
 public:
  Font(const Glyph *glyphs,int count,int baseline,int height,int,int,int,uint8_t bpp):glyphs_(glyphs),count_(count),height_(height) {
    (void)bpp;
    font_.dsc=this; font_.line_height=height; font_.base_line=height-baseline;
    font_.get_glyph_dsc=describe; font_.get_glyph_bitmap=bitmap;
    font_.underline_position=-1; font_.underline_thickness=1;
  }
  const lv_font_t *get_lv_font() const { return &font_; }
 private:
  const Glyph *find(uint32_t code) const {
    int lo=0,hi=count_-1;
    while(lo<hi) { int mid=(lo+hi+1)/2; if(glyphs_[mid].code_point<=code) lo=mid; else hi=mid-1; }
    return glyphs_[lo].code_point==code ? &glyphs_[lo] : nullptr;
  }
  static bool describe(const lv_font_t *font,lv_font_glyph_dsc_t *d,uint32_t code,uint32_t) {
    auto *f=static_cast<const Font*>(font->dsc); auto *g=f->find(code); if(!g) return false;
    d->adv_w=g->advance; d->ofs_x=g->offset_x; d->ofs_y=f->height_-g->height-g->offset_y-font->base_line;
    d->box_w=g->width; d->box_h=g->height; d->is_placeholder=0;
    d->format=LV_FONT_GLYPH_FORMAT_A4; d->gid.index=code; return true;
  }
  static const void *bitmap(lv_font_glyph_dsc_t *d,lv_draw_buf_t *out) {
    auto *f=static_cast<const Font*>(d->resolved_font->dsc); auto *g=f->find(d->gid.index); if(!g) return nullptr;
    const auto stride=lv_draw_buf_width_to_stride(g->width,LV_COLOR_FORMAT_A8);
    for(int y=0,i=0;y<g->height;++y) for(int x=0;x<g->width;++x,++i)
      out->data[y*stride+x]=((i&1) ? g->data[i/2]&15 : g->data[i/2]>>4)*17;
    return out;
  }
  lv_font_t font_{}; const Glyph *glyphs_; int count_,height_;
};
}
