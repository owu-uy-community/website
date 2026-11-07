// Owy's face for the web (the wall, the talk deck): the firmware's own Companion
// model and FaceRenderer over the ESPHome-generated LVGL scene, compiled to WASM.
// Face only: no gestures, pages, sleep or hints — the bridge (through face.mjs)
// says what Owy is doing and this draws it exactly like the knob does.
#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
#include <emscripten/emscripten.h>
#include "companion_model.h"
#include "companion_lvgl.h"
#include "generated/scene.generated.h"
extern "C" { const lv_font_t *esphome_lv_default_font=nullptr; }
namespace {
using namespace owy;
std::unique_ptr<Companion> companion;
std::unique_ptr<Scene> scene;
FaceRenderer renderer;
FaceRing ring;
Frame last_frame;
lv_display_t *display{};
// The panel: 360 for the knob; the web faces render the same scene at any size.
int size=360; float face_scale=.7725f;
std::vector<uint16_t> pixels;  // RGB565, what the panel shows
std::vector<uint8_t> rgba;     // the same pixels for a canvas, alpha 255
int32_t dirty[4]{};            // x1, y1, x2, y2 flushed since the last owy_dirty(); empty when x2 < x1
uint8_t expand5[32], expand6[64];
alignas(32) uint16_t draw[1080*120]; // LVGL's pinned LV_DRAW_BUF_ALIGN, never linker-luck alignment.
uint32_t now=0;
// What the bridge says: the turn's phase (0 idle · 2 listening · 3 thinking · 4 speaking), a mood
// for the quiet moments (owy::Mood, -1 = idle), the Mac mic's level and a level-only speaking fallback.
int phase=0, mood_override=-1, painted_mood=0;
float mic_level=0, speaking_level=0;
bool initialized=false;
Mood mood_now() {
  if(phase==2) return Mood::LISTENING;
  if(phase==3) return Mood::THINKING;
  if(phase==4) return Mood::SPEAKING;
  return mood_override>=0 ? static_cast<Mood>(mood_override) : Mood::IDLE;
}
void paint() {
  const Mood mood=mood_now();
  painted_mood=int(mood);
  last_frame=companion->frame(now,mood,false,speaking_level);
  ring.apply(companion->ring(last_frame,now),last_frame.ring!=RingMode::NONE);
  static FaceObjects objects;
  objects={scene->eye_left,scene->eye_right,scene->pupil_left,scene->pupil_right,scene->glint_left,scene->glint_right,
    scene->happy_left,scene->happy_right,scene->lid_left,scene->lid_right,scene->brow_left,scene->brow_right,
    scene->cheek_left,scene->cheek_right,scene->mouth,scene->mouth_cavity,scene->mouth_tongue,scene->smile_cutout,
    scene->mouth_bowl,{scene->zzz_0,scene->zzz_1,scene->zzz_2}};
  renderer.render(last_frame,objects);
}
void tick() {
  // The Mac mic's level, like the knob's `mic_level` action: fresh while listening, stale otherwise.
  if(now%50==0&&phase==2)companion->level(mic_level,now);
  if(now%(phase?32:16)==0)paint();
  if(now%5==0)lv_timer_handler();
}
void hide(lv_obj_t *obj) {if(obj)lv_obj_add_flag(obj,LV_OBJ_FLAG_HIDDEN);}
}
extern "C" {
// `panel` px square (64–1080); `scale` maps the 466-space face onto it; the rim at `ring_r` with `ring_dot` dots.
// `face` is kept for the old six-argument call: this runtime is always face-only.
EMSCRIPTEN_KEEPALIVE void owy_init(int seed,int panel,float scale,int ring_r,int ring_dot,int face) {
  (void) face;
  if(initialized){lv_style_reset(scene->companion_control);lv_style_reset(scene->companion_tile);lv_deinit();}
  size=std::clamp(panel,64,1080);face_scale=std::isfinite(scale)?bound(scale,.05f,3):1;
  companion=std::make_unique<Companion>(uint32_t(seed));scene=std::make_unique<Scene>();renderer=FaceRenderer{};renderer.scale=face_scale;ring=FaceRing{};last_frame=Frame{};
  now=0;phase=0;mood_override=-1;painted_mood=0;mic_level=speaking_level=0;
  pixels.assign(size*size,0);rgba.assign(size_t(size)*size*4,0);for(size_t i=3;i<rgba.size();i+=4)rgba[i]=255;
  dirty[0]=dirty[1]=size;dirty[2]=dirty[3]=-1;
  // RGB565 → RGB888 exactly as the old main-thread conversion: round(v * 255 / 31|63).
  for(int i=0;i<64;++i){if(i<32)expand5[i]=uint8_t(std::lround(i*255./31));expand6[i]=uint8_t(std::lround(i*255./63));}
  esphome_lv_default_font=font_20;lv_init();lv_tick_set_cb([]{return now;});
  display=lv_display_create(size,size);lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
  // 120 rows per band at any width: at 360 the bands are the knob's, so parity holds.
  lv_display_set_buffers(display,draw,nullptr,size*120*2,LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display,[](lv_display_t *d,const lv_area_t *area,uint8_t *data){
    const auto width=lv_area_get_width(area);
    for(int y=area->y1;y<=area->y2;++y){
      const auto *row=reinterpret_cast<const uint16_t*>(data+(y-area->y1)*width*2);
      memcpy(pixels.data()+y*size+area->x1,row,width*2);
      uint8_t *out=rgba.data()+(size_t(y)*size+area->x1)*4;
      for(int x=0;x<width;++x,out+=4){const uint16_t v=row[x];out[0]=expand5[v>>11];out[1]=expand6[(v>>5)&63];out[2]=expand5[v&31];}
    }
    dirty[0]=std::min<int32_t>(dirty[0],area->x1);dirty[1]=std::min<int32_t>(dirty[1],area->y1);
    dirty[2]=std::max<int32_t>(dirty[2],area->x2);dirty[3]=std::max<int32_t>(dirty[3],area->y2);
    lv_display_flush_ready(d);
  });
  scene->create();lv_screen_load(scene->face_page);ring.create(scene->face_page,ring_r,ring_dot);companion->wake_at(1600);
  // Only the face: no logo, hint, overlay, badge or tap catcher (which would make a small page scroll).
  for(auto *o:{scene->boot_logo,scene->face_hint,scene->overlay_label,scene->tap_area,scene->capture_badge})hide(o);
  lv_obj_remove_flag(scene->face_page,LV_OBJ_FLAG_SCROLLABLE);
  initialized=true;paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE void owy_advance(int ms){if(ms<0||ms>600000)return;for(int i=0;i<ms;++i){++now;tick();}}
// Typed inputs, the same numbers face.mjs always sent (bounded here; no JS/eval in C++).
EMSCRIPTEN_KEEPALIVE void owy_input(int kind,float a,float b,float c,float d,float e,float f,const char *text){
  (void) d; (void) e; (void) f;
  switch(kind){
    // A mood for the quiet moments (owy::Mood 0..11; -1 = idle): shows once the phase is idle.
    case 18:mood_override=std::clamp(int(a),-1,11);break;
    // A pet: Owy smiles for a moment.
    case 21:companion->delight(now);break;
    // The turn's phase (0 · 2 · 3 · 4), the mic level 0..1 and a speaking level 0..100 (lips without a mouth track).
    case 33:{
      const int before=phase;
      phase=(a==2||a==3||a==4)?int(a):0;
      if(before==2&&phase==3)companion->nod(now);  // "te entendí", like the knob at listening → thinking
      mic_level=bound(b,0,1);speaking_level=bound(c,0,100);
      break;
    }
    // Bridge expression cue: owy::Expression, ms until heard, strength 0..100.
    case 37:companion->express(static_cast<Expression>(std::clamp(int(a),0,7)),now+uint32_t(int32_t(std::lround(b))),bound(c,0,100)/100.f);break;
    // Bridge mouth track (controls.yaml mouth_track): base64url frames, 40 ms each, the first `a` ms from now.
    case 39:companion->mouth_track(text,strnlen(text,256),now,int(std::lround(bound(a,-2000,5000))));break;
    default:break;
  }
  paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE const char *owy_snapshot(){
  static char out[256];
  snprintf(out,sizeof(out),"{\"time\":%u,\"phase\":%d,\"mood\":%d,\"gaze\":[%d,%d],\"envelope\":[%.3f,%.3f]}",
    now,phase,painted_mood,last_frame.gaze_x,last_frame.gaze_y,mic_level,speaking_level);
  return out;
}
EMSCRIPTEN_KEEPALIVE const uint16_t *owy_pixels(){return pixels.data();}
EMSCRIPTEN_KEEPALIVE const uint8_t *owy_rgba(){return rgba.data();}
// The flushed rectangle since the last call as x, y, w, h (w = 0: nothing new); clears it.
EMSCRIPTEN_KEEPALIVE const int32_t *owy_dirty(){
  static int32_t out[4];
  out[0]=dirty[0];out[1]=dirty[1];out[2]=std::max(0,dirty[2]-dirty[0]+1);out[3]=std::max(0,dirty[3]-dirty[1]+1);
  dirty[0]=dirty[1]=size;dirty[2]=dirty[3]=-1;
  return out;
}
}
