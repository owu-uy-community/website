// Owy's face for the web: the firmware's own Companion model and FaceRenderer over the
// ESPHome-generated LVGL scene, compiled to WASM. Two modes (owy_init's last argument):
//   face-only (the wall, the talk deck): the face alone, at any size;
//   device (the knob's twin): the knob's whole 360 px screen, for everything the bridge can tell
//   it — the hint and the pausa badge (companion.yaml), the face_state lifecycle and its pages
//   (face.yaml, controls.yaml) and the answer view (boards/knob18.yaml). No gestures, sleep, boot
//   logo or settings: the page handles clicks.
// The bridge (through face.mjs) says what Owy is doing and this draws it exactly like the knob does.
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
FaceRenderer renderer, mini;  // the face; the answer view's 96 px Owy (device mode)
FaceRing ring, ring_convo;     // their rims
Frame last_frame;
lv_display_t *display{};
// The panel: 360 for the knob; the web faces render the same scene at any size.
int size=360; float face_scale=.7725f;
bool face_only=true;
std::vector<uint16_t> pixels;  // RGB565, what the panel shows
std::vector<uint8_t> rgba;     // the same pixels for a canvas, alpha 255
int32_t dirty[4]{};            // x1, y1, x2, y2 flushed since the last owy_dirty(); empty when x2 < x1
uint8_t expand5[32], expand6[64];
alignas(32) uint16_t draw[1080*120]; // LVGL's pinned LV_DRAW_BUF_ALIGN, never linker-luck alignment.
uint32_t now=0;
// What the bridge says: the turn's phase (0 idle · 2 listening · 3 thinking · 4 speaking), a mood
// for the quiet moments (owy::Mood, -1 = idle), the Mac mic's level and a level-only speaking fallback;
// pausa (mic_privacy) and reduced motion, the knob's switches.
int phase=0, mood_override=-1, painted_mood=0;
float mic_level=0, speaking_level=0;
bool privacy=false, reduced=false, initialized=false;
// The knob's screen (device mode): current_face, page_hold and return_to_face_later (face.yaml),
// and the conversation the answer view belongs to (knob18.yaml).
Mood current_face=Mood::IDLE;
bool page_hold=false, in_conversation=false, returning=false;
uint32_t return_at=0;
// Every string from the page is bounded here (bytes): what one message may be read of at all.
constexpr size_t TEXT_MAX=1<<16;
// The bridge's face: the turn's phase, else the mood for the quiet moments.
Mood mood_now() {
  if(phase==2) return Mood::LISTENING;
  if(phase==3) return Mood::THINKING;
  if(phase==4) return Mood::SPEAKING;
  return mood_override>=0 ? static_cast<Mood>(mood_override) : Mood::IDLE;
}
bool on(lv_obj_t *page) {return lv_screen_active()==page;}
void hide(lv_obj_t *obj) {if(obj)lv_obj_add_flag(obj,LV_OBJ_FLAG_HIDDEN);}
void visible(lv_obj_t *obj,bool shown) {
  if(lv_obj_has_flag(obj,LV_OBJ_FLAG_HIDDEN)!=shown)return;
  if(shown)lv_obj_remove_flag(obj,LV_OBJ_FLAG_HIDDEN);else lv_obj_add_flag(obj,LV_OBJ_FLAG_HIDDEN);
}
// animate_companion (companion.yaml): one frame for every page, pausa's face over everything; the
// rim and the face only on the face page.
void paint() {
  const Mood mood=privacy?Mood::PRIVACY:mood_now();
  painted_mood=int(mood);
  last_frame=companion->frame(now,mood,reduced,speaking_level);
  const bool on_face=on(scene->face_page);
  ring.apply(companion->ring(last_frame,now),on_face&&last_frame.ring!=RingMode::NONE);
  if(!on_face)return;
  if(!face_only)visible(scene->capture_badge,privacy);
  static FaceObjects objects;
  objects={scene->eye_left,scene->eye_right,scene->pupil_left,scene->pupil_right,scene->glint_left,scene->glint_right,
    scene->happy_left,scene->happy_right,scene->lid_left,scene->lid_right,scene->brow_left,scene->brow_right,
    scene->cheek_left,scene->cheek_right,scene->mouth,scene->mouth_cavity,scene->mouth_tongue,scene->smile_cutout,
    scene->mouth_bowl,{scene->zzz_0,scene->zzz_1,scene->zzz_2}};
  renderer.render(last_frame,objects);
}
// The answer view (knob18.yaml, every 33 ms): the same frame on its 96 px Owy, and its rim.
void convo() {
  const bool on_convo=on(scene->convo_page);
  ring_convo.apply(companion->ring(last_frame,now),on_convo&&last_frame.ring!=RingMode::NONE);
  if(!on_convo)return;
  static FaceObjects objects;
  objects={scene->mini_eye_l,scene->mini_eye_r,scene->mini_pupil_l,scene->mini_pupil_r,scene->mini_glint_l,scene->mini_glint_r,
    scene->mini_happy_l,scene->mini_happy_r,scene->mini_lid_l,scene->mini_lid_r,scene->mini_brow_l,scene->mini_brow_r,
    scene->mini_cheek_l,scene->mini_cheek_r,scene->mini_mouth,scene->mini_cavity,scene->mini_tongue,scene->mini_cut,
    scene->mini_bowl,{}};
  mini.render(last_frame,objects);
}
// sync_face_hint (companion.yaml, every 250 ms): what to do (idle hints rotate) or what went wrong;
// hidden during a turn, when the rim carries it.
void hint() {
  const char *text=nullptr;
  if(privacy)text="en pausa · mantené: ajustes";
  else if(current_face==Mood::OFFLINE)text="buscando a owy...";
  else if(current_face==Mood::ERROR)text="ups, me trabé · tocá para probar de nuevo";
  else if(current_face==Mood::IDLE){
    static const char *const hints[]={"tocame y hablame","¿buscás una charla?","proponé tu tema"};
    text=hints[(now/4200)%3];
  }
  if(text&&strcmp(lv_label_get_text(scene->face_hint),text))lv_label_set_text(scene->face_hint,text);
  visible(scene->face_hint,on(scene->face_page)&&text);
}
void show(lv_obj_t *page) {lv_screen_load(page);}            // lvgl.page.show, no animation
void return_later() {returning=true;return_at=now+12000;}   // return_to_face_later (mode: restart)
// A face_state the bridge set (it writes the select only when the state changes): show_face
// (face.yaml) — a turn brings the face back unless a page is held — then the answer view's
// conversation (knob18.yaml).
void face_state(Mood x) {
  current_face=x;
  const bool turn=x==Mood::LISTENING||x==Mood::THINKING||x==Mood::SPEAKING;
  if((turn||x==Mood::FOLLOWUP||x==Mood::RECORD)&&!page_hold)show(scene->face_page);
  // A fresh conversation clears the last exchange; its first mic says so until the transcript comes.
  if(turn&&!in_conversation){in_conversation=true;lv_label_set_text(scene->caption_body,"");lv_label_set_text(scene->caption_heard,"");}
  if(x==Mood::LISTENING&&!*lv_label_get_text(scene->caption_heard))lv_label_set_text(scene->caption_heard,"escuchando…");
  // Its end lets go of the answer view: the face returns 12 s later, so the last reply can still be read.
  if(!turn&&in_conversation&&(x==Mood::IDLE||x==Mood::ERROR||x==Mood::OFFLINE)){
    in_conversation=false;page_hold=false;
    if(on(scene->convo_page))return_later();
  }
}
// At most `max` bytes of `s` (n bytes), never splitting a UTF-8 character: the head, or the tail.
std::string clip(const char *s,size_t n,size_t max,bool tail=false) {
  size_t from=0;
  if(n>max){
    if(tail){from=n-max;while(from<n&&(uint8_t(s[from])&0xC0)==0x80)++from;}
    else{n=max;while(n&&(uint8_t(s[n])&0xC0)==0x80)--n;}
  }
  return std::string(s+from,n-from);
}
// A whole string from the page (face.mjs ends it with a NUL), clipped.
std::string text_of(const char *s,size_t max,bool tail=false) {return clip(s,strnlen(s,TEXT_MAX),max,tail);}
// A multi-field message: `count` fields split on the unit separator (face.mjs), each clipped to `max`.
std::vector<std::string> fields(const char *text,size_t count,size_t max) {
  std::vector<std::string> out;
  const size_t n=strnlen(text,TEXT_MAX);
  for(size_t start=0,i=0;i<=n&&out.size()<count;++i)
    if(i==n||text[i]=='\x1f'){out.push_back(clip(text+start,i-start,max));start=i+1;}
  out.resize(count);
  return out;
}
void tick() {
  // The Mac mic's level, like the knob's `mic_level` action: fresh while listening, stale otherwise.
  if(now%50==0&&phase==2)companion->level(mic_level,now);
  if(face_only){if(now%(phase?32:16)==0)paint();}
  else {
    // The knob's intervals: the face every 16 ms, the answer view 33 ms, the hint 250 ms.
    if(returning&&int32_t(now-return_at)>=0){returning=false;show(scene->face_page);}
    if(now%16==0)paint();
    if(now%33==0)convo();
    if(now%250==0)hint();
  }
  if(now%5==0)lv_timer_handler();
}
}
extern "C" {
// `panel` px square (64–1080); `scale` maps the 466-space face onto it; the rim at `ring_r` with `ring_dot` dots.
// `face` 1 = face-only; 0 = the knob's whole screen (device mode, at the knob's geometry: session.mjs boot).
EMSCRIPTEN_KEEPALIVE void owy_init(int seed,int panel,float scale,int ring_r,int ring_dot,int face) {
  if(initialized){lv_style_reset(scene->companion_control);lv_style_reset(scene->companion_tile);lv_deinit();}
  size=std::clamp(panel,64,1080);face_scale=std::isfinite(scale)?bound(scale,.05f,3):1;face_only=face!=0;
  companion=std::make_unique<Companion>(uint32_t(seed));scene=std::make_unique<Scene>();renderer=FaceRenderer{};renderer.scale=face_scale;ring=FaceRing{};last_frame=Frame{};
  mini=FaceRenderer{};mini.scale=96.f/466.f;ring_convo=FaceRing{};
  now=0;phase=0;mood_override=-1;painted_mood=0;mic_level=speaking_level=0;privacy=reduced=false;
  current_face=Mood::IDLE;page_hold=in_conversation=returning=false;return_at=0;
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
  // Never the boot logo, the knob's brightness overlay or its tap catcher: the page handles clicks.
  for(auto *o:{scene->boot_logo,scene->overlay_label,scene->tap_area})hide(o);
  if(face_only){
    // Only the face: no hint or badge either, and nothing that would make a small page scroll.
    for(auto *o:{scene->face_hint,scene->capture_badge})hide(o);
    lv_obj_remove_flag(scene->face_page,LV_OBJ_FLAG_SCROLLABLE);
  } else ring_convo.create(scene->convo_page,ring_r,ring_dot);
  initialized=true;paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE void owy_advance(int ms){if(ms<0||ms>600000)return;for(int i=0;i<ms;++i){++now;tick();}}
// Typed inputs from face.mjs (bounded here; no JS/eval in C++).
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
    // Pausa (mic_privacy) and reduced motion (reduced_motion): 1 on, 0 off.
    case 40:privacy=a!=0;break;
    case 41:reduced=a!=0;break;
    // What the bridge shows on the knob's screen (knob18.yaml, controls.yaml): device mode only.
    // show_caption: the reply so far, bottom-anchored (its newest lines show), holding the answer view.
    case 42:
      if(face_only)break;
      lv_label_set_text(scene->caption_body,text_of(text,8192,true).c_str());
      page_hold=true;returning=false;
      // A pitch's announcement keeps the card it just made on screen.
      if(!on(scene->convo_page)&&!on(scene->card_page))show(scene->convo_page);
      break;
    // show_heard: what Owy understood, « in the pill »; empty clears it.
    case 43:{
      if(face_only)break;
      const auto heard=text_of(text,1024);
      lv_label_set_text(scene->caption_heard,heard.empty()?"":("« "+heard+" »").c_str());
      break;
    }
    // show_card: title · speaker · room · time slot.
    case 44:{
      if(face_only)break;
      const auto v=fields(text,4,1024);
      lv_label_set_text(scene->card_title,v[0].c_str());
      lv_label_set_text(scene->card_speaker,v[1].c_str());
      lv_label_set_text(scene->card_where,(v[2]+"  ·  "+v[3]).c_str());
      show(scene->card_page);return_later();
      break;
    }
    // show_text.
    case 45:
      if(face_only)break;
      lv_label_set_text(scene->text_body,text_of(text,2048).c_str());
      show(scene->text_page);return_later();
      break;
    // show_qr: url · caption (empty: the grid's).
    case 46:{
      if(face_only)break;
      const auto v=fields(text,2,2048);
      lv_qrcode_update(scene->grid_qr,v[0].data(),v[0].size());
      lv_label_set_text(scene->qr_caption,v[1].empty()?"La grilla, en tu celu":v[1].c_str());
      show(scene->qr_page);return_later();
      break;
    }
    default:break;
  }
  if(!face_only&&mood_now()!=current_face)face_state(mood_now());
  paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE const char *owy_snapshot(){
  static char out[256];
  const char *page=on(scene->convo_page)?"convo":on(scene->card_page)?"card":on(scene->qr_page)?"qr":on(scene->text_page)?"text":"face";
  snprintf(out,sizeof(out),"{\"time\":%u,\"phase\":%d,\"mood\":%d,\"gaze\":[%d,%d],\"envelope\":[%.3f,%.3f],\"page\":\"%s\"}",
    now,phase,painted_mood,last_frame.gaze_x,last_frame.gaze_y,mic_level,speaking_level,page);
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
