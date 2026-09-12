// Exercise the real, allocation-free firmware interaction model on the host.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = `
#include "companion_model.h"
#include "companion_sound.h"
#include <cassert>
#include <iostream>
#include <limits>
using namespace owy;
int main() {
  Contact c;
  c.begin(200,200,100); assert(c.end(204,202,180)==Gesture::TAP);
  assert(c.end(204,202,200)==Gesture::NONE); // exactly one action per contact
  c.begin(200,200,100); assert(c.end(200,200,115)==Gesture::NONE); // contact noise
  c.begin(200,200,100); c.move(235,200); assert(c.end(200,200,500)==Gesture::NONE);
  c.begin(200,200,100); c.move(260,200); c.move(160,200);
  assert(c.end(200,200,700)==Gesture::PET); // out-and-back is never a tap
  c.begin(200,200,100); c.move(231,200); assert(c.end(232,200,4000)==Gesture::NONE);
  c.begin(200,200,100); assert(c.end(200,90,1000)==Gesture::UP);
  c.begin(200,200,100); assert(c.end(200,310,1000)==Gesture::DOWN);
  c.begin(200,200,100); assert(c.end(80,200,1000)==Gesture::LEFT);
  c.begin(200,200,100); assert(c.end(320,200,1000)==Gesture::RIGHT);
  c.begin(200,200,100); assert(c.end(310,310,1000)==Gesture::PET); // no diagonal nav
  c.begin(200,200,100); assert(c.hold(899)==Gesture::NONE);
  assert(c.hold(900)==Gesture::HOLD); assert(c.end(200,200,1000)==Gesture::NONE);
  c.begin(200,200,100); c.move(230,200); assert(c.hold(1000)==Gesture::NONE);
  c.cancel(); assert(c.end(200,200,1100)==Gesture::NONE);
  c.begin(200,200,UINT32_MAX-100); assert(c.end(200,200,50)==Gesture::TAP);
  c.begin(200,200,UINT32_MAX-100); assert(c.hold(800)==Gesture::HOLD);
  std::cout << "PASS gestures: tap, jitter, slow drag, out-and-back pet, four swipes, diagonal, hold, cancel, wraparound\\n";

  Companion m;
  assert(!m.motion_ok(0));
  auto f=m.frame(0,Mood::IDLE,true,false,false,false,0);
  assert(f.gaze_x==0 && f.eye_h==156 && !f.cheeks); // no boot fake-happy
  m.motion(NAN,0,1,0,0,0,10); assert(!m.motion_ok(10));
  for(uint32_t t=100;t<=500;t+=10) m.motion(0,0,1,0,0,0,t);
  assert(m.motion_ok(500)); assert(!m.motion_ok(1000));
  m.motion(0,0,1,0,NAN,0,1050); assert(!m.motion_ok(1050));
  for (uint32_t t=1100;t<3000;t+=10) {
    m.motion(.5f,.4f,.7681146f,0,0,0,t,false);
    f=m.frame(t,Mood::IDLE,true,false,false,false,0);
    assert(std::abs(f.gaze_x)<=32 && std::abs(f.gaze_y)<=25);
  }
  assert(f.gaze_x>8 && f.gaze_y<0);
  for (uint32_t t=3000;t<4000;t+=50) {
    m.motion(.5f,.4f,.7681146f,0,0,0,t,false);
    f=m.frame(t,Mood::IDLE,true,false,true,true,0);
  }
  assert(f.gaze_x<0 && f.gaze_y>0);
  f=m.frame(4100,Mood::IDLE,true,true,false,false,0);
  assert(f.gaze_x==0 && f.gaze_y==0 && f.eye_h==156 && !f.cheeks);
  f=m.frame(4100,Mood::PRIVACY,true,false,false,false,100);
  assert(f.eye_h==16 && f.mouth_h==8 && f.gaze_x==0 && !f.cheeks);
  m.center();
  for(uint32_t t=5000;t<6000;t+=50) {
    m.motion(.5f,.4f,.7681146f,0,0,0,t,false);
    f=m.frame(t,Mood::LISTENING,true,false,false,false,0);
  }
  assert(f.gaze_x==0 && f.gaze_y==0); // manual neutral pose
  for(uint32_t t=6100;t<7500;t+=50) f=m.frame(t,Mood::LISTENING,true,false,false,false,0);
  assert(f.gaze_x==0 && f.gaze_y==0); // stale motion settles
  m.delight(8000);
  f=m.frame(8100,Mood::IDLE,true,false,false,false,0); assert(f.cheeks);
  f=m.frame(8100,Mood::SPEAKING,true,false,false,false,80); assert(!f.cheeks);
  f=m.frame(8100,Mood::IDLE,true,true,false,false,0); assert(!f.cheeks);
  f=m.frame(9700,Mood::IDLE,true,false,false,false,0); assert(!f.cheeks);
  m.motion(0,0,1,200,200,200,15000);
  assert(!m.take_shake()); // rotation/pickup alone is NOT a deliberate shake
  Companion disabled;
  disabled.motion(0,0,1,200,200,200,10,false);
  assert(!disabled.frame(50,Mood::IDLE,false,false,false,false,0).cheeks);
  Companion wrap;
  for(uint32_t i=0;i<=900;i+=10) wrap.motion(0,0,1,0,0,0,UINT32_MAX-1000+i);
  assert(wrap.motion_ok(20)); assert(!wrap.motion_ok(500));
  wrap.delight(UINT32_MAX-100); assert(wrap.frame(20,Mood::IDLE,true,false,false,false,0).cheeks);
  std::cout << "PASS motion: startup, finite/stale data, clamps, axis reversal, center, cooldown, disable, voice/reduced priority, clock rollover\\n";

  auto warm=[](MotionTracker &v, Vec3 a=Vec3{0,0,1}) {
    for(uint32_t t=0;t<=500;t+=10) assert(!v.update(a,{},t,true));
    assert(v.ok(500));
  };
  for(Vec3 pose : {Vec3{0,0,1},Vec3{0,0,-1},Vec3{1,0,0},Vec3{-1,0,0},Vec3{0,1,0},Vec3{0,-1,0}}) {
    MotionTracker v; warm(v,pose); assert((v.gravity()-pose).length()<.0001f);
  }
  for(int axis=0;axis<3;++axis) for(float sign : {-1.f,1.f}) for(uint32_t step : {10,16,25}) {
    MotionTracker v; warm(v);
    uint32_t t=500;
    while(t<1500) {
      const uint32_t delta=std::min(step,1500-t); t+=delta;
      const float angle=sign*(t-500)*.001f*1.57079632679f;
      Vec3 a=axis==0 ? Vec3{0,std::sin(angle),std::cos(angle)} :
          axis==1 ? Vec3{-std::sin(angle),0,std::cos(angle)} : Vec3{0,0,1};
      Vec3 w=axis==0 ? Vec3{sign*90,0,0} : axis==1 ? Vec3{0,sign*90,0} : Vec3{0,0,sign*90};
      assert(!v.update(a,w,t,true));
      assert((v.gravity()-a).length()<.002f);
    }
  }
  MotionTracker translated; warm(translated);
  for(uint32_t t=510;t<=2500;t+=10) assert(!translated.update({.4f,0,1},{},t,true));
  assert(std::abs(translated.gravity().x)<.005f); // norm gating alone would fail
  MotionTracker biased;
  for(uint32_t t=0;t<=3500;t+=10) biased.update({0,0,1},{5,0,0},t,false);
  assert(std::abs(biased.bias().x-5)<.01f && std::abs(biased.gravity().y)<.01f);
  MotionTracker slow; warm(slow);
  for(uint32_t t=510;t<=5000;t+=10) {
    const float a=(t-500)*.001f*.1745329252f;
    slow.update({0,std::sin(a),std::cos(a)},{10,0,0},t,false);
  }
  assert(slow.bias().length()<.01f); // don't learn intentional slow tilt as bias
  MotionTracker shaken; warm(shaken);
  unsigned events=0;
  for(uint32_t t=510;t<=1200;t+=10) {
    float x=t==600 || t==840 ? 1.f : t==720 ? -1.f : 0;
    events+=shaken.update({x,0,1},{},t,true);
  }
  assert(events==1);
  for(uint32_t t=1210;t<=2000;t+=10) events+=shaken.update({t%240<120 ? 1.f : -1.f,0,1},{},t,true);
  assert(events==1); // cooldown, no repeats while shaking
  for(uint32_t t=2010;t<=5000;t+=10) events+=shaken.update({0,0,1},{},t,true);
  for(uint32_t t=5010;t<=5500;t+=10) {
    float x=t==5100 || t==5340 ? 1.f : t==5220 ? -1.f : 0;
    events+=shaken.update({x,0,1},{},t,true);
  }
  assert(events==2); // calm and cooldown allow the next deliberate shake
  MotionTracker suppressed; warm(suppressed);
  for(uint32_t t=510;t<=1500;t+=10)
    assert(!suppressed.update({t%240<120 ? 1.f : -1.f,0,1},{},t,false));
  MotionTracker knock; warm(knock);
  for(uint32_t t=510;t<=1200;t+=10)
    assert(!knock.update({t==600 ? 2.f : t==620 ? -.9f : 0,0,1},{},t,true));
  MotionTracker gap; warm(gap);
  gap.update({1,0,1},{},600,true); // first peak
  assert(!gap.update({-1,0,1},{},850,true)); assert(!gap.ok(850));
  assert(!gap.update({0,0,1},{},860,true)); assert(gap.ok(860));
  assert(!gap.update({NAN,0,1},{},870,true));
  assert(!gap.update({0,0,0},{1000,0,0},880,true));
  Cadence cadence; for(uint32_t t=10;t<=1000;t+=10) cadence.tick(t);
  assert(cadence.read(1000)==100 && cadence.take_gap()==10);
  cadence.tick(1200); assert(cadence.take_gap()==200); // preserve gaps across publication windows
  std::cout << "PASS fusion: six poses, ±90deg XYZ, variable dt, translation rejection, bias, slow tilt, deliberate shake, cooldown/calm, disabled, knock, dropout, cadence\\n";

  uint8_t pcm[CUE_BYTES];
  using Cal=MotionTracker::Calibration;
  MotionTracker calibrated; warm(calibrated);
  calibrated.begin_calibration(500);
  for(uint32_t t=510;t<=3510;t+=10) assert(!calibrated.update({.6f,0,.8f},{2,-1,.5f},t,true));
  assert(calibrated.calibration==Cal::SUCCESS);
  assert((calibrated.bias()-Vec3{2,-1,.5f}).length()<.0001f);
  assert(calibrated.offset().length()<.0001f && calibrated.calibration_progress(3510)==100);
  const Vec3 saved_bias=calibrated.bias(), saved_neutral=calibrated.neutral();
  MotionTracker restored;
  assert(restored.restore_calibration(saved_bias,saved_neutral));
  assert(!restored.restore_calibration({NAN,0,0},saved_neutral));
  assert(!restored.restore_calibration({13,0,0},saved_neutral));
  assert(!restored.restore_calibration({},{}));
  calibrated.begin_calibration(4000);
  for(uint32_t t=4010;t<18000;t+=10) calibrated.update({t%200<100 ? .3f : -.3f,0,.953939f},{},t,true);
  calibrated.tick_calibration(19000);
  assert(calibrated.calibration==Cal::TIMEOUT);
  assert((calibrated.bias()-saved_bias).length()<.0001f && (calibrated.neutral()-saved_neutral).length()<.0001f);
  calibrated.begin_calibration(20000); calibrated.cancel_calibration();
  assert(calibrated.calibration==Cal::CANCELLED);
  calibrated.begin_calibration(21000); calibrated.tick_calibration(36000);
  assert(calibrated.calibration==Cal::TIMEOUT); // completely disconnected sensor
  MotionTracker interrupted; warm(interrupted); interrupted.begin_calibration(500);
  for(uint32_t t=510;t<=3000;t+=10) interrupted.update({0,0,1},{},t,true);
  assert(interrupted.calibration_progress(3000)>50);
  interrupted.update({NAN,0,1},{},3010,true);
  assert(interrupted.calibration_progress(3010)==0);
  for(uint32_t t=3020;t<=4000;t+=10) interrupted.update({0,0,1},{},t,true);
  interrupted.tick_calibration(4150); assert(interrupted.calibration_progress(4150)==0);
  MotionTracker calwrap; calwrap.begin_calibration(UINT32_MAX-2000);
  for(uint32_t t=0;t<=4000;t+=10) calwrap.update({0,0,1},{},UINT32_MAX-2000+t,false);
  assert(calwrap.calibration==Cal::SUCCESS);
  std::cout << "PASS calibration: averaged bias/neutral, persistence validation, movement/NaN/gap rejection, timeout, cancel, clock rollover\\n";

  for(int kind=0;kind<3;++kind) {
    make_cue(pcm,kind); int peak=0,previous=0; long energy=0;
    assert(pcm[0]==0 && pcm[1]==0 && pcm[CUE_BYTES-2]==0 && pcm[CUE_BYTES-1]==0);
    for(size_t i=0;i<CUE_SAMPLES;++i) {
      const int sample=int16_t(uint16_t(pcm[i*2]) | uint16_t(pcm[i*2+1])<<8);
      peak=std::max(peak,std::abs(sample)); energy+=std::abs(sample);
      assert(std::abs(sample-previous)<1100); previous=sample;
    }
    assert(peak<2600 && peak>1000 && energy>200000 && CUE_BYTES<3200);
  }
  std::cout << "PASS sounds: three real PCM cues, bounded peak/slope, zero endpoints, complete ring-buffer fit\\n";

  const uint8_t loud[]={0xD0,0x07,0,0,0x30,0xF8,0,0};
  Companion mic;
  mic.audio(loud,sizeof(loud),100);
  f=mic.frame(110,Mood::LISTENING,false,false,false,false,0); assert(f.mouth_h>12);
  for(uint32_t t=400;t<1800;t+=50) f=mic.frame(t,Mood::LISTENING,false,false,false,false,0);
  assert(f.mouth_h==14); // stale audio goes quiet
  f=mic.frame(1800,Mood::SPEAKING,false,false,false,false,100); assert(f.mouth_h>12);
  f=mic.frame(1800,Mood::SPEAKING,false,true,false,false,100); assert(f.mouth_h==16);
  f=mic.frame(2000,Mood::SPEAKING,false,false,false,false,NAN); assert(f.mouth_h<=64);
  mic.audio(loud,1,3000); // undersized data safe
  Companion blink;
  blink.frame(100,Mood::IDLE,false,false,false,false,0);
  assert(blink.frame(3680,Mood::IDLE,false,false,false,false,0).eye_h==12);
  assert(blink.frame(3680,Mood::IDLE,false,true,false,false,0).eye_h==156);
  assert(blink.frame(3850,Mood::IDLE,false,false,false,false,0).eye_h==156);
  std::cout << "PASS face: observed mic envelope, stale audio, speaking level, reduced motion, blink and recovery\\n";

  Power p; assert(!p.known && p.percent==-1);
  p.decode(0x20,0,100); assert(p.usb && !p.battery && p.percent==-1);
  p.decode(0x28,0x20,67); assert(p.battery && p.charging && p.percent==67);
  p.decode(0x08,0x40,15); assert(!p.usb && !p.charging && p.percent==15);
  p.decode(0x08,0x40,255); assert(p.percent==-1);
  p.unavailable(); assert(!p.known && p.percent==-1);
  std::cout << "PASS power: USB-only, charging, battery, invalid percentage, unavailable\\n";
}
`;
const dir = mkdtempSync(join(tmpdir(), "owy-companion-test-"));
try {
  const executable = join(dir, "companion");
  const build = spawnSync("c++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-fsanitize=address,undefined", "-I", fileURLToPath(new URL("../", import.meta.url)), "-x", "c++", "-", "-o", executable], { input: source, encoding: "utf8" });
  assert.equal(build.status, 0, build.stderr || String(build.error));
  const run = spawnSync(executable, [], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  process.stdout.write(run.stdout);
  // Pin integration invariants that are easy to regress outside the pure model.
  const yaml = readFileSync(new URL("../packages/face.yaml", import.meta.url), "utf8");
  const main = yaml.slice(yaml.indexOf("- id: face_page"), yaml.indexOf("- id: card_page"));
  const touch = main.slice(main.indexOf("id: tap_area"));
  assert(!main.includes("- button:") && !main.includes("- label:"), "Face only: controls/text belong in settings");
  assert(!/on_(short_click|click|long_press|swipe_)/.test(touch), "Do not add competing gesture actions");
  assert(touch.includes("contact.end") && touch.includes("contact.cancel") && touch.includes("lv_indev_wait_release"));
  assert(!yaml.includes("think_spinner") && !yaml.includes("id: eye_height"), "One small-region renderer owns geometry");
  const controls = readFileSync(new URL("../packages/controls.yaml", import.meta.url), "utf8");
  const expressions = controls.slice(controls.indexOf("id: face_state"), controls.indexOf("\nswitch:"));
  assert(expressions.includes("id(va).is_running()") && expressions.includes("script.execute: apply_face"), "Decorative expressions must defer to active voice state");
  const voice = readFileSync(new URL("../packages/voice.yaml", import.meta.url), "utf8");
  assert((voice.match(/!id\(mic_privacy\)\.state/g) ?? []).length >= 7, "Privacy must guard every voice entry/re-arm path");
  assert(voice.includes("script.stop: play_companion_feedback") && voice.includes("script.stop: play_soft_cue"));
  assert((voice.match(/!id\(play_companion_feedback\)\.is_running\(\)/g) ?? []).length >= 4, "Voice entry and re-arm respect exclusive feedback ownership");
  console.log("PASS YAML integration: one input owner, no full-screen spinner, privacy guards");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
