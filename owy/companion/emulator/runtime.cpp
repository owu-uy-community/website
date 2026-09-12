// Browser HAL: real Companion/FaceRenderer/PCM and ESPHome-generated LVGL scene.
// Voice transport below is an explicit deterministic fixture HAL, not ESP-IDF,
// acoustic wake-word inference, or Gemini. The real production bridge runs in JS.
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <vector>
#include <emscripten/emscripten.h>
#include "companion_model.h"
#include "companion_lvgl.h"
#include "companion_sound.h"
#include "generated/scene.generated.h"
extern "C" { const lv_font_t *esphome_lv_default_font=nullptr; }
namespace {
using namespace owy;
std::unique_ptr<Companion> companion;
std::unique_ptr<Scene> scene;
FaceRenderer renderer;
Frame last_frame;
lv_display_t *display{}; lv_indev_t *pointer{};
uint16_t pixels[466*466];
alignas(32) uint16_t draw[466*120]; // LVGL's pinned LV_DRAW_BUF_ALIGN, never linker-luck alignment.
uint8_t pcm[CUE_BYTES];
uint32_t now=0, activity=0, phase_at=0, page_until=0, staff_until=0, feedback_at=0, pin_error_until=0;
uint32_t cue_serial=0, event_serial=0, follow_deadline=0;
int cue_kind=0, phase=0, reply_ms=1200, replies=0, mood_override=-1;
int audio_buffered=0,audio_received=0;uint32_t audio_empty_at=0;bool bridge_enabled=false,stream_ended=false;
bool external_voice=false;
int px=233,py=233; bool pressed=false,initialized=false,dimmed=false,powered=true,connected=true,follow_up=false;
bool imu_available=true,stall_driver=false,stuck_drain=false,hung_bridge=false,had_feedback=false;
Vec3 acceleration{0,0,1}, angular_rate{};
float mic_level=0, speaking_level=0;
std::string page="face",last_event="boot",pin;
struct TraceEvent { uint32_t time; std::string name, page; int phase; };
std::vector<TraceEvent> trace_events;
struct Settings { bool privacy=false,motion=true,reduced=false,invert_x=false,invert_y=false,continuous=true,chime=true,sounds=true,wake=true,quiet=false,staff=false,marketplace=false; int volume=80,brightness=80; } settings;
std::array<float,7> saved_cal{0,0,0,0,0,0,1};
bool calibration_saved=false;
void reboot_model() {
  const auto power=companion->power;
  companion=std::make_unique<Companion>();companion->power=power;renderer=FaceRenderer{};
  if(saved_cal[0]==1)companion->tracker.restore_calibration({saved_cal[1],saved_cal[2],saved_cal[3]},{saved_cal[4],saved_cal[5],saved_cal[6]});
  settings.staff=settings.quiet=settings.marketplace=false;staff_until=0;had_feedback=false;
}
void event(const char *value) {last_event=value;++event_serial;if(trace_events.size()<256)trace_events.push_back({now,value,page,phase});}
bool busy() {return phase!=0;}
const char *voice_name() {
  if(!powered) return "off"; if(settings.privacy) return "privacy";
  if(external_voice&&phase==0)return "mic_off";
  if(companion->tracker.calibrating()) return "calibrating";
  if(!connected) return "offline";
  switch(phase) {case 1:return "handoff";case 2:return follow_up?"follow_up":"listening";case 3:return "thinking";case 4:return "speaking";case 5:return "draining";case 6:return "recovering";case 7:return "feedback";default:return settings.wake?"wake_word":"idle";}
}
void hide(lv_obj_t *obj,bool hidden) {if(hidden)lv_obj_add_flag(obj,LV_OBJ_FLAG_HIDDEN);else lv_obj_remove_flag(obj,LV_OBJ_FLAG_HIDDEN);}
void label(lv_obj_t *obj,const char *text) {if(strcmp(lv_label_get_text(obj),text))lv_label_set_text(obj,text);}
void navigate(const char *name) {
  if(page!=name && companion->tracker.calibrating()) {companion->tracker.cancel_calibration();event("calibration.cancelled");}
  auto *target=scene->find((std::string(name==std::string("staff")?"settings":name)+"_page").c_str());
  if(!target)return;
  page=name; page_until=(page=="qr"||page=="card"||page=="text")?now+12000:0;
  companion->contact.cancel(); lv_screen_load(target); activity=now; dimmed=false;
}
void cancel() {phase=0;follow_up=false;replies=0;follow_deadline=0;speaking_level=0;audio_buffered=0;stream_ended=false;event("voice.cancelled");}
void cue(int kind) {if(settings.volume==0||settings.quiet||(kind==0&&!settings.chime))return;cue_kind=kind;++cue_serial;}
void talk(bool follow=false) {
  if(!powered||!connected||settings.privacy||companion->tracker.calibrating()) {event("voice.blocked");return;}
  if(busy()) {cancel();return;}
  if(external_voice) {navigate("face");event("voice.request");return;}
  navigate("face");follow_up=follow;phase=1;phase_at=now;event(follow?"voice.follow_up.request":"voice.request");
}
void feedback() {
  if(!powered||dimmed||busy()||page!="face"||settings.privacy||settings.reduced||settings.quiet||!settings.sounds||settings.volume==0||(had_feedback&&now-feedback_at<4000))return;
  had_feedback=true;feedback_at=now;cue(1);phase=7;phase_at=now;event("interaction.cue");
}
void gesture(Gesture g) {
  if(g==Gesture::NONE)return;event(gesture_name(g));
  switch(g) {case Gesture::TAP:talk();break;case Gesture::PET:companion->delight(now);feedback();break;
    case Gesture::UP:case Gesture::HOLD:navigate("quick");break;case Gesture::LEFT:navigate("help");break;case Gesture::RIGHT:navigate("qr");break;default:break;}
}
void calibrate() {cancel();navigate("calibration");companion->tracker.begin_calibration(now);calibration_saved=false;event("calibration.started");}
void sync() {
  char buf[200];
  label(scene->quick_mic,settings.privacy?"Mic: apagado · activar":"Mic: encendido · apagar");
  label(scene->quick_motion,settings.motion?"Seguir movimiento: sí":"Seguir movimiento: no");
  label(scene->quick_reduce,settings.reduced?"Animaciones: mínimas":"Animaciones: completas");
  label(scene->quick_continue,settings.continuous?"Charla continua: sí":"Charla continua: no");
  label(scene->quick_chime,settings.chime?"Tono al escuchar: sí":"Tono al escuchar: no");
  label(scene->quick_sounds,settings.sounds?"Sonidos al jugar: sí":"Sonidos al jugar: no");
  snprintf(buf,sizeof(buf),"Volumen: %d%%",settings.volume);label(scene->quick_volume,buf);
  snprintf(buf,sizeof(buf),"Brillo: %d%%",settings.brightness);label(scene->quick_brightness,buf);
  label(scene->quick_sensor,companion->motion_ok(now)?"Movimiento conectado":"Movimiento no disponible");
  auto &p=companion->power;
  if(!p.known)label(scene->quick_power,"energía: sin datos");
  else if(!p.battery)label(scene->quick_power,p.usb?"USB · sin batería":"sin batería detectada");
  else {snprintf(buf,sizeof(buf),"%s%d%% %s",p.usb?"USB · ":"",p.percent,p.charging?"cargando":"");label(scene->quick_power,buf);}
  label(scene->settings_staff_status,settings.staff?"Modo staff: ON (10 min)":"Modo staff: OFF");
  if(page=="staff") {
    lv_slider_set_value(scene->volume_slider,settings.volume,LV_ANIM_OFF);
    lv_slider_set_value(scene->brightness_slider,settings.brightness,LV_ANIM_OFF);
    for(auto pair:{std::make_pair(scene->sw_marketplace,settings.marketplace),{scene->sw_quiet,settings.quiet},{scene->sw_wake_word,settings.wake}})
      if(pair.second)lv_obj_add_state(pair.first,LV_STATE_CHECKED);else lv_obj_remove_state(pair.first,LV_STATE_CHECKED);
  }
  auto &t=companion->tracker;
  const char *message=t.calibration_message();
  label(scene->calibration_status,message);lv_bar_set_value(scene->calibration_progress,t.calibration_progress(now),LV_ANIM_OFF);
}
void setting(const char *name,float value) {
  const bool on=value!=0;
  if(!strcmp(name,"privacy")){settings.privacy=on;if(on)cancel();}
  else if(!strcmp(name,"motion"))settings.motion=on;else if(!strcmp(name,"reduced"))settings.reduced=on;
  else if(!strcmp(name,"invert_x"))settings.invert_x=on;else if(!strcmp(name,"invert_y"))settings.invert_y=on;
  else if(!strcmp(name,"continuous")){settings.continuous=on;if(!on&&follow_up&&phase!=4)cancel();}
  else if(!strcmp(name,"chime"))settings.chime=on;else if(!strcmp(name,"sounds"))settings.sounds=on;
  else if(!strcmp(name,"wake"))settings.wake=on;else if(!strcmp(name,"quiet"))settings.quiet=on;
  else if(!strcmp(name,"volume"))settings.volume=std::lround(bound(value,0,80));
  else if(!strcmp(name,"brightness"))settings.brightness=std::lround(bound(value,10,100));
  else if(!strcmp(name,"marketplace")&&settings.staff)settings.marketplace=on;
  sync();event("settings.changed");
}
void pin_key(const char *key) {
  if(!strcmp(key,"C"))pin.clear();
  else if(!strcmp(key,"OK")) {
    const bool valid=pin=="1234";pin.clear();
    if(valid){settings.staff=true;staff_until=now+600000;navigate("staff");event("fixture.staff.unlocked");}
    else {label(scene->pin_entry_label,"PIN incorrecto");pin_error_until=now+1200;event("fixture.pin.rejected");return;}
  } else if(pin.size()<8)pin+=key;
  label(scene->pin_entry_label,pin.empty()?"_ _ _ _":std::string(pin.size(),'*').c_str());
}
void button_event(lv_event_t *e) {
  auto *obj=static_cast<lv_obj_t*>(lv_event_get_target(e));
  auto *key=static_cast<const char*>(lv_event_get_user_data(e));
  if(!strcmp(key,"keypad")){const auto i=lv_buttonmatrix_get_selected_button(obj);const char *s=lv_buttonmatrix_get_button_text(obj,i);if(s)pin_key(s);return;}
  if(!strcmp(key,"volume")){setting(key,lv_slider_get_value(obj));return;}
  if(!strcmp(key,"brightness_slider")){setting("brightness",lv_slider_get_value(obj));return;}
  if(!strcmp(key,"marketplace")||!strcmp(key,"quiet")||!strcmp(key,"wake")){setting(key,lv_obj_has_state(obj,LV_STATE_CHECKED));return;}
  if(!strcmp(key,"home"))navigate("face");else if(!strcmp(key,"quick")){pin.clear();navigate("quick");}
  else if(!strcmp(key,"privacy"))setting(key,!settings.privacy);else if(!strcmp(key,"continuous"))setting(key,!settings.continuous);
  else if(!strcmp(key,"chime"))setting(key,!settings.chime);else if(!strcmp(key,"sounds"))setting(key,!settings.sounds);
  else if(!strcmp(key,"motion"))setting(key,!settings.motion);else if(!strcmp(key,"reduced"))setting(key,!settings.reduced);
  else if(!strcmp(key,"brightness"))setting(key,settings.brightness<45?55:settings.brightness<70?80:30);
  else if(!strcmp(key,"down"))setting("volume",settings.volume-10);else if(!strcmp(key,"up"))setting("volume",settings.volume+10);
  else if(!strcmp(key,"calibration"))navigate("calibration");else if(!strcmp(key,"calibrate"))calibrate();
  else if(!strcmp(key,"center")){companion->center();navigate("face");}
  else if(!strcmp(key,"smile")){companion->delight(now);navigate("face");}
  else if(!strcmp(key,"help")||!strcmp(key,"qr")||!strcmp(key,"pin"))navigate(key);
  else if(!strcmp(key,"test"))cue(2);
  else if(!strcmp(key,"restart")){cancel();reboot_model();navigate("face");event("fixture.reboot");}
}
void bind(lv_obj_t *obj,const char *key,lv_event_code_t code=LV_EVENT_CLICKED){lv_obj_add_event_cb(obj,button_event,code,const_cast<char*>(key));}
void bind_buttons(lv_obj_t *root) {
  static const char *bindings[][2]={
    {"Vol −","down"},{"Vol +","up"},{"volver a Owy","home"},{"¡vamos!","home"},{"volver / cancelar","quick"},{"volver","quick"},
    {"Volver","home"},{"Tono","test"},{"Reiniciar","restart"},{"Calibrar movimiento","calibration"},{"Comenzar / repetir","calibrate"},
    {"Centrar la mirada","center"},{"Haceme sonreír","smile"},{"Cómo jugar / gestos","help"},{"Grilla de OWU Conf","qr"},{"Staff · ingresar PIN","pin"}
  };
  if(lv_obj_check_type(root,&lv_button_class)) {
    for(uint32_t i=0;i<lv_obj_get_child_count(root);++i){auto *child=lv_obj_get_child(root,i);if(!lv_obj_check_type(child,&lv_label_class))continue;
      for(auto &b:bindings)if(!strcmp(lv_label_get_text(child),b[0]))bind(root,b[1]);}
  }
  for(uint32_t i=0;i<lv_obj_get_child_count(root);++i)bind_buttons(lv_obj_get_child(root,i));
}
void paint() {
  if(!powered||dimmed||page!="face")return;
  Mood mood=!connected?Mood::OFFLINE:phase==2?Mood::LISTENING:phase==3?Mood::THINKING:(phase==4||phase==5)?Mood::SPEAKING:phase==6?Mood::ERROR:Mood::IDLE;
  if(mood_override>=0&&!busy())mood=static_cast<Mood>(mood_override);
  if(settings.privacy)mood=Mood::PRIVACY;
  hide(scene->think_dots,mood!=Mood::THINKING);
  const int badge=settings.privacy?2:phase==2?1:0;
  hide(scene->capture_badge,!badge);hide(scene->privacy_slash,badge!=2);
  lv_obj_set_style_bg_color(scene->capture_capsule,lv_color_hex(badge==2?0xF5BB03:0x0162C8),0);
  const auto eye=lv_color_hex(mood==Mood::OFFLINE?0x777368:0xFBF5E7);
  lv_obj_set_style_bg_color(scene->eye_left,eye,0);lv_obj_set_style_bg_color(scene->eye_right,eye,0);
  last_frame=companion->frame(now,mood,settings.motion,settings.reduced||phase==6,settings.invert_x,settings.invert_y,speaking_level);
  renderer.render(last_frame,scene->eye_left,scene->eye_right,scene->pupil_left,scene->pupil_right,scene->mouth,scene->smile_cutout,scene->cheek_left,scene->cheek_right,scene->brow_left,scene->brow_right,scene->think_dot_0,scene->think_dot_1,scene->think_dot_2);
}
void tick() {
  if(!powered)return;
  if(now%10==0&&phase==2&&!settings.privacy) {
    const int16_t value=int16_t(mic_level*3000);
    const uint8_t sample[4]={uint8_t(value&255),uint8_t((value>>8)&255),0,0};
    companion->audio(sample,sizeof(sample),now);
  }
  if(now%10==0&&imu_available) {
    companion->motion(acceleration.x,acceleration.y,acceleration.z,angular_rate.x,angular_rate.y,angular_rate.z,now,settings.motion&&!settings.reduced&&!settings.privacy&&!busy()&&page=="face"&&!dimmed);
    if(companion->take_shake()){event("shake");feedback();}
  }
  companion->tracker.tick_calibration(now);
  if(companion->tracker.calibration==MotionTracker::Calibration::SUCCESS&&!calibration_saved){auto b=companion->tracker.bias(),n=companion->tracker.neutral();saved_cal={1,b.x,b.y,b.z,n.x,n.y,n.z};calibration_saved=true;event("calibration.success");}
  if(!external_voice) {
  if(phase==1&&now-phase_at>=580&&!stall_driver){cue(0);phase=2;phase_at=now;follow_deadline=now+8000;event("microphone.started");}
  else if(phase==1&&now-phase_at>=2000&&stall_driver){phase=6;phase_at=now;event("fault.driver_start_timeout");}
  else if(phase==2&&now-phase_at>=(bridge_enabled?9000u:hung_bridge?9000u:8000u)){cancel();event(bridge_enabled||hung_bridge?"guard.local_silence":"conversation.silent_idle");}
  else if(!bridge_enabled&&phase==3&&replies>0&&now-phase_at>=450){phase=4;phase_at=now;speaking_level=55;--replies;event("tts.started");}
  else if(!bridge_enabled&&phase==4&&now-phase_at>=static_cast<uint32_t>(reply_ms)){phase=5;phase_at=now;speaking_level=0;event("tts.run_end");}
  else if(phase==5&&!stuck_drain&&now-(bridge_enabled?audio_empty_at:phase_at)>=500&&audio_buffered==0){phase=0;event("speaker.stopped");if(settings.continuous)talk(true);}
  else if(phase==6&&now-phase_at>=1000){phase=0;event("audio.recovered");}
  else if(phase==7&&now-phase_at>=580){phase=0;event("interaction.speaker_stopped");}
  if(!bridge_enabled&&phase==2&&follow_up&&replies>0&&now-phase_at>=800){phase=3;phase_at=now;event("fixture.speech");}
  if(bridge_enabled&&(phase==4||phase==5)&&audio_buffered>0){audio_buffered=std::max(0,audio_buffered-32);if(!audio_buffered)audio_empty_at=now;}
  if((phase==3||phase==4||phase==5)&&now-phase_at>=90000){cancel();event("guard.turn_timeout");}
  }
  if(external_voice&&phase==7&&now-phase_at>=580){phase=0;event("interaction.speaker_stopped");}
  if(page_until&&now>=page_until)navigate("face");
  if(settings.staff&&now>=staff_until){settings.staff=false;if(page=="staff")navigate("quick");event("staff.expired");}
  if(pin_error_until&&now>=pin_error_until){pin_error_until=0;label(scene->pin_entry_label,"_ _ _ _");}
  if(!busy()&&now-activity>=120000)dimmed=true;
  if(now%100==0)sync();
  if(now%(busy()?32:16)==0)paint();
  if(now%5==0)lv_timer_handler();
}
}
extern "C" {
EMSCRIPTEN_KEEPALIVE void owy_init(int seed) {
  if(initialized){lv_style_reset(scene->companion_control);lv_deinit();}
  companion=std::make_unique<Companion>(uint32_t(seed));scene=std::make_unique<Scene>();renderer=FaceRenderer{};last_frame=Frame{};
  now=activity=phase_at=page_until=staff_until=feedback_at=pin_error_until=cue_serial=event_serial=follow_deadline=0;
  phase=replies=0;reply_ms=1200;mood_override=-1;pressed=dimmed=follow_up=stall_driver=stuck_drain=hung_bridge=had_feedback=calibration_saved=false;
  audio_buffered=audio_received=0;audio_empty_at=0;bridge_enabled=stream_ended=false;
  external_voice=false;
  trace_events.clear();trace_events.push_back({0,"boot","face",0});
  powered=connected=imu_available=true;settings=Settings{};acceleration={0,0,1};angular_rate={};mic_level=speaking_level=0;pin.clear();page="face";last_event="boot";saved_cal={0,0,0,0,0,0,1};
  memset(pixels,0,sizeof(pixels));esphome_lv_default_font=font_20;lv_init();lv_tick_set_cb([]{return now;});
  display=lv_display_create(466,466);lv_display_set_color_format(display,LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(display,draw,nullptr,sizeof(draw),LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(display,[](lv_display_t *d,const lv_area_t *area,uint8_t *data){
    const auto width=lv_area_get_width(area);for(int y=area->y1;y<=area->y2;++y)memcpy(pixels+y*466+area->x1,data+(y-area->y1)*width*2,width*2);lv_display_flush_ready(d);
  });
  scene->create();lv_screen_load(scene->face_page);
  for(auto *p:{scene->face_page,scene->quick_page,scene->calibration_page,scene->help_page,scene->pin_page,scene->settings_page,scene->qr_page,scene->card_page,scene->text_page})bind_buttons(p);
  for(auto pair:{std::make_pair(scene->quick_mic,"privacy"),{scene->quick_continue,"continuous"},{scene->quick_chime,"chime"},{scene->quick_sounds,"sounds"},{scene->quick_motion,"motion"},{scene->quick_reduce,"reduced"},{scene->quick_brightness,"brightness"}})bind(lv_obj_get_parent(pair.first),pair.second);
  bind(scene->pin_keypad,"keypad",LV_EVENT_VALUE_CHANGED);bind(scene->volume_slider,"volume",LV_EVENT_VALUE_CHANGED);bind(scene->brightness_slider,"brightness_slider",LV_EVENT_VALUE_CHANGED);
  bind(scene->sw_marketplace,"marketplace",LV_EVENT_VALUE_CHANGED);bind(scene->sw_quiet,"quiet",LV_EVENT_VALUE_CHANGED);bind(scene->sw_wake_word,"wake",LV_EVENT_VALUE_CHANGED);
  lv_obj_add_event_cb(scene->tap_area,[](lv_event_t *e){
    lv_point_t p;lv_indev_get_point(lv_indev_active(),&p);auto code=lv_event_get_code(e);
    if(code==LV_EVENT_PRESSED)companion->contact.begin(p.x,p.y,now);
    else if(code==LV_EVENT_PRESSING){companion->contact.move(p.x,p.y);auto g=companion->contact.hold(now);if(g!=Gesture::NONE){gesture(g);lv_indev_wait_release(lv_indev_active());}}
    else if(code==LV_EVENT_RELEASED)gesture(companion->contact.end(p.x,p.y,now));
    else if(code==LV_EVENT_PRESS_LOST)companion->contact.cancel();
  },LV_EVENT_ALL,nullptr);
  pointer=lv_indev_create();lv_indev_set_type(pointer,LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(pointer,[](lv_indev_t*,lv_indev_data_t*d){d->point={px,py};d->state=pressed?LV_INDEV_STATE_PRESSED:LV_INDEV_STATE_RELEASED;});
  lv_indev_set_long_press_time(pointer,400);lv_indev_set_long_press_repeat_time(pointer,100);
  companion->power.decode(0x28,0,100);initialized=true;sync();paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE void owy_advance(int ms){if(ms<0||ms>600000)return;for(int i=0;i<ms;++i){++now;tick();}}
// Typed input codec is validated/bounded in the worker. No JS/eval in C++.
EMSCRIPTEN_KEEPALIVE void owy_input(int kind,float a,float b,float c,float d,float e,float f,const char *text){
  switch(kind){
    case 1:acceleration={a,b,c};angular_rate={d,e,f};break;
    case 2:px=std::clamp(int(a),0,465);py=std::clamp(int(b),0,465);pressed=c!=0;activity=now;dimmed=false;lv_indev_read(pointer);break;
    case 3:setting(text,a);break;
    case 4:if(settings.wake)talk();break;
    case 5:if(a>=800)navigate("quick");else if(a>=35)talk();break;
    case 6:if(phase==2){phase=3;phase_at=now;replies=std::clamp(int(a),1,20);reply_ms=std::clamp(int(b),80,20000);event("fixture.speech");}break;
    case 7:navigate(text);break;
    case 8:calibrate();break;
    case 9:companion->center();event("motion.centered");break;
    case 10:connected=a!=0;if(!connected)cancel();event(connected?"network.connected":"network.disconnected");break;
    case 11:imu_available=a!=0;event(imu_available?"imu.connected":"imu.disconnected");break;
    case 12:stall_driver=a!=0;stuck_drain=b!=0;hung_bridge=c!=0;event("faults.changed");break;
    case 13:mic_level=bound(a,0,1);speaking_level=bound(b,0,100);break;
    case 14:companion->power.decode(uint8_t(a),uint8_t(b),int(c));companion->chip_temperature=d;break;
    case 15:cue(std::clamp(int(a),0,2));break;
    case 16:pin_key(text);break;
    case 17:powered=a!=0;cancel();if(powered){reboot_model();activity=now;dimmed=false;navigate("face");}else{companion->tracker.cancel_calibration();pressed=false;}event(powered?"power.on":"power.off");break;
    case 18:mood_override=std::clamp(int(a),-1,7);break;
    case 19:label(scene->text_body,text);navigate("text");break;
    case 20:label(scene->card_title,text);label(scene->card_speaker,"Comunidad OWU");label(scene->card_where,"Sala Azul  ·  15:00");navigate("card");break;
    case 21:companion->delight(now);feedback();break;
    case 30: // Real VoiceTurn protocol delivered to the modeled firmware HAL.
      switch(int(a)){
        case 4:if(phase==2){phase=3;phase_at=now;event("stt.end");}break;
        case 7:if(phase==3){phase=4;phase_at=now;audio_buffered=audio_received=0;stream_ended=false;event("tts.started");}break;
        case 99:stream_ended=true;event("tts.stream_end");break;
        case 2:if(phase==4&&stream_ended){phase=5;phase_at=now;if(!audio_buffered)audio_empty_at=now;event("tts.run_end");}else if(phase==2||phase==3){phase=0;follow_up=false;event("conversation.silent_idle");}break;
        case 0:cancel();phase=6;phase_at=now;event("bridge.error");break;
        default:break;
      }break;
    case 31:
      if(phase==4){if(audio_buffered+int(a)>32768){phase=6;phase_at=now;event("fault.receive_buffer_full");}
        else{audio_buffered+=int(a);audio_received+=int(a);}}break;
    case 32:bridge_enabled=true;break;
    case 33:if(external_voice&&!settings.privacy&&powered&&!companion->tracker.calibrating()){
      if(a!=0||phase!=7)phase=(a==2||a==3||a==4)?int(a):0;
      mic_level=bound(b,0,1);speaking_level=bound(c,0,100);if(phase){activity=now;dimmed=false;}
    }break;
    case 34:cancel();external_voice=a!=0;navigate("face");break;
    case 35:if(external_voice){
      if(a==0)label(scene->card_title,text);else if(a==1)label(scene->card_speaker,text);
      else if(a==2)label(scene->card_where,text);else if(a==3)navigate("card");
    }break;
    case 36:if(external_voice){
      if(a==0)lv_qrcode_update(scene->grid_qr,text,strlen(text));
      else {label(scene->qr_caption,text);navigate("qr");}
    }break;
    default:break;
  }
  sync();paint();lv_refr_now(display);
}
EMSCRIPTEN_KEEPALIVE const char *owy_snapshot(){
  static char out[4096];auto g=companion->tracker.gravity(),b=companion->tracker.bias(),n=companion->tracker.neutral();
  const char *why=settings.privacy?"Microphone privacy is enabled":!powered?"Device is powered off":companion->tracker.calibrating()?"Calibration owns the stillness window":!connected?"No bridge connection":phase==5?"RUN_END received; waiting for physical speaker STOPPED":phase==2?"Listening window is open":phase==1?"Waiting for exclusive speaker handoff and cue":phase==0?"Idle: waiting for touch or injected wake word":"Voice turn is active";
  snprintf(out,sizeof(out),"{\"time\":%u,\"page\":\"%s\",\"voice\":\"%s\",\"phase\":%d,\"why\":\"%s\",\"event\":\"%s\",\"eventSerial\":%u,\"cueSerial\":%u,\"cueKind\":%d,\"powered\":%s,\"dimmed\":%s,\"imuReady\":%s,\"gravity\":[%.6f,%.6f,%.6f],\"bias\":[%.6f,%.6f,%.6f],\"neutral\":[%.6f,%.6f,%.6f],\"gaze\":[%d,%d],\"calibration\":\"%s\",\"calibrationProgress\":%d,\"settings\":{\"privacy\":%d,\"motion\":%d,\"reduced\":%d,\"invert_x\":%d,\"invert_y\":%d,\"continuous\":%d,\"chime\":%d,\"sounds\":%d,\"wake\":%d,\"quiet\":%d,\"staff\":%d,\"marketplace\":%d,\"volume\":%d,\"brightness\":%d},\"followDeadline\":%u,\"staffDeadline\":%u}",
    now,page.c_str(),voice_name(),phase,why,last_event.c_str(),event_serial,cue_serial,cue_kind,powered?"true":"false",dimmed?"true":"false",companion->motion_ok(now)?"true":"false",g.x,g.y,g.z,b.x,b.y,b.z,n.x,n.y,n.z,last_frame.gaze_x,last_frame.gaze_y,companion->tracker.calibration_name(),companion->tracker.calibration_progress(now),settings.privacy,settings.motion,settings.reduced,settings.invert_x,settings.invert_y,settings.continuous,settings.chime,settings.sounds,settings.wake,settings.quiet,settings.staff,settings.marketplace,settings.volume,settings.brightness,follow_deadline,staff_until);
  // Append the input levels without duplicating the shared envelope calculation.
  static char with_levels[4224];
  out[strlen(out)-1]='\0';
  snprintf(with_levels,sizeof(with_levels),"%s,\"envelope\":[%.3f,%.3f]}",out,mic_level,speaking_level);
  return with_levels;
}
EMSCRIPTEN_KEEPALIVE const uint16_t *owy_pixels(){return pixels;}
EMSCRIPTEN_KEEPALIVE int owy_phase(){return phase;}
EMSCRIPTEN_KEEPALIVE int owy_audio_received(){return audio_received;}
EMSCRIPTEN_KEEPALIVE int owy_audio_buffered(){return audio_buffered;}
EMSCRIPTEN_KEEPALIVE const char *owy_trace(){
  static std::string out;out="[";
  for(const auto &e:trace_events){if(out.size()>1)out+=",";char row[256];snprintf(row,sizeof(row),"{\"t\":%u,\"event\":\"%s\",\"page\":\"%s\",\"voice\":\"phase_%d\"}",e.time,e.name.c_str(),e.page.c_str(),e.phase);out+=row;}
  out+="]";trace_events.clear();return out.c_str();
}
EMSCRIPTEN_KEEPALIVE const uint8_t *owy_cue(int kind){make_cue(pcm,std::clamp(kind,0,2));return pcm;}
EMSCRIPTEN_KEEPALIVE int owy_cue_size(){return CUE_BYTES;}
}
