// Exercise the real, allocation-free firmware interaction model on the host.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const source = `
#include "companion_model.h"
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
  auto f=m.frame(0,Mood::IDLE,false,0);
  assert(f.gaze_x==0 && f.eye_h==156 && !f.cheeks); // no boot fake-happy
  m.delight(8000);
  f=m.frame(8100,Mood::IDLE,false,0); assert(f.cheeks);
  for(uint32_t t=8100;t<=8700;t+=33) f=m.frame(t,Mood::SPEAKING,false,80);
  assert(!f.cheeks); // cheeks spring away once Owy talks
  m.delight(8800);
  f=m.frame(8900,Mood::IDLE,true,0); assert(!f.cheeks); // reduced motion: no reaction
  f=m.frame(10500,Mood::IDLE,false,0); assert(!f.cheeks);
  auto settle=[](Companion &c, Mood mood, uint32_t from, uint32_t to, float level=0, bool reduced=false) {
    Frame out; for(uint32_t t=from;t<=to;t+=16) out=c.frame(t,mood,reduced,level); return out;
  };
  // The Mac's mic level (the bridge's mic_level action) widens the eyes and lights the rim; it never moves the mouth.
  Companion mic;
  Frame quiet=settle(mic,Mood::LISTENING,0,600);
  for(uint32_t t=616;t<760;t+=16){ mic.level(.8f,t); f=mic.frame(t,Mood::LISTENING,false,0); }
  assert(f.mouth_h==quiet.mouth_h && f.mouth_w==quiet.mouth_w); // your voice never moves Owy's mouth
  assert(f.pupil_w>quiet.pupil_w && f.eye_h>quiet.eye_h);        // it widens the eyes instead
  assert(f.ring==RingMode::LISTEN && f.level>.1f);
  f=settle(mic,Mood::LISTENING,1000,2200); assert(f.level<.05f); // a stale level goes quiet
  f=settle(mic,Mood::SPEAKING,2300,2900,100); assert(f.mouth_h>40);        // level fallback opens the lips
  f=settle(mic,Mood::SPEAKING,3000,3300,100,true); assert(f.mouth_h==18);  // reduced: one small fixed shape
  f=settle(mic,Mood::SPEAKING,3400,3700,NAN); assert(f.mouth_h<=12);       // no signal: lips closed

  // Lips follow the bridge's speech features: loud = open, then the shape axis.
  Companion talk;
  settle(talk,Mood::SPEAKING,0,200);
  for(uint32_t t=216;t<=400;t+=16){ talk.speech_track.push(t,1,0); f=talk.frame(t,Mood::SPEAKING,false,0); }
  assert(f.mouth_h>=56 && f.cavity_h>20 && f.tongue_h>4); // "a": open, cavity, tongue
  for(uint32_t t=416;t<=600;t+=16){ talk.speech_track.push(t,.85f,1); f=talk.frame(t,Mood::SPEAKING,false,0); }
  assert(std::abs(f.mouth_w-f.mouth_h)<=4);                // "o": round
  for(uint32_t t=616;t<=800;t+=16){ talk.speech_track.push(t,.6f,-1); f=talk.frame(t,Mood::SPEAKING,false,0); }
  assert(f.mouth_w>f.mouth_h*2);                           // "e": wide
  f=settle(talk,Mood::SPEAKING,816,1100); assert(f.mouth_h<=12); // features went stale: closed
  // A bridge mouth track: base64url, 40 ms frames, first audible after lead_ms.
  talk.mouth_track("____",4,1200,100);
  f=settle(talk,Mood::SPEAKING,1100,1290); assert(f.mouth_h<=14); // not audible yet
  f=settle(talk,Mood::SPEAKING,1300,1420); assert(f.mouth_h>=50);
  SpeechTrack track; float open=1,shape=0;
  track.push(10,0,0); assert(track.read(20,open,shape) && open==0);
  assert(!track.read(200,open,shape)); // older than 120 ms: gone

  // Moods are springs, and a blink masks every change.
  Companion moods;
  f=settle(moods,Mood::IDLE,0,400);
  assert(f.eye_h==156 && f.lid_l==0 && f.crescent==0 && f.smile && f.cut_h>0);
  f=moods.frame(420,Mood::THINKING,false,0);
  f=settle(moods,Mood::THINKING,436,480); assert(f.eye_h<60);   // blinked on the change
  f=settle(moods,Mood::THINKING,496,1400);
  assert(f.lid_r>20 && f.lid_l==0 && f.brow_in_l<-5 && f.mouth_x>20 && f.ring==RingMode::COMET);
  moods.delight(1500);
  f=settle(moods,Mood::IDLE,1500,2100); assert(f.crescent>40 && f.pupil_h==0 && f.cheeks && f.bowl_h>0);
  f=settle(moods,Mood::ERROR,2200,3200); assert(f.lid_l>20 && f.brow_in_l<0 && f.brow_out_l>0 && !f.smile && f.cut_y>0);
  f=settle(moods,Mood::OFFLINE,3300,4300); assert(f.grey && f.ring==RingMode::SEARCH);
  f=settle(moods,Mood::PRIVACY,4400,5400); assert(f.lid_l>=f.eye_h*45/100 && f.mouth_h<=10 && f.ring==RingMode::NONE);
  f=settle(moods,Mood::SLEEP,5500,6500); assert(f.lid_l>=f.eye_h*9/10 && f.zzz>=0);
  f=settle(moods,Mood::IDLE,6600,6700,0,true); assert(f.lid_l==0 && f.eye_h==156 && f.zzz<0); // reduced: snaps
  Companion boot; boot.wake_at(1000);
  f=settle(boot,Mood::IDLE,0,900); assert(f.lid_l>=f.eye_h-2);  // eyes shut behind the wordmark
  f=settle(boot,Mood::IDLE,916,1600); assert(f.lid_l==0);      // then open
  Companion nod; settle(nod,Mood::THINKING,0,300); nod.nod(310);
  f=settle(nod,Mood::THINKING,310,470); assert(f.face_y>5);
  f=settle(nod,Mood::THINKING,486,700); assert(f.face_y==0);

  Companion blink;
  blink.frame(100,Mood::IDLE,false,0);
  assert(blink.frame(3660,Mood::IDLE,false,0).eye_h==12);  // fast close…
  assert(blink.frame(3660,Mood::IDLE,true,0).eye_h==156);  // never with reduced motion
  assert(blink.frame(3850,Mood::IDLE,false,0).eye_h==156); // …and open again

  // The rim: flash on listening, a draining countdown, a comet, the level.
  Companion rim; settle(rim,Mood::IDLE,0,100);
  f=rim.frame(120,Mood::LISTENING,false,0);
  RingFrame r=rim.ring(f,130); assert(r.opa[0]>=200 && r.color==0x0162C8);
  r=rim.ring(f,1000); assert(r.opa[0]<100);
  rim.countdown(2000,8000);
  f=settle(rim,Mood::FOLLOWUP,2000,2100); r=rim.ring(f,6000);
  int lit=0; for(auto o:r.opa) lit+=o>=200; assert(lit==12);
  f=settle(rim,Mood::THINKING,6100,6300); r=rim.ring(f,6300);
  lit=0; for(auto o:r.opa) lit+=o>=100; assert(lit>=2 && lit<=5 && r.color==0xF5BB03);
  r=ring_frame(RingMode::LEVEL,0,.5f,0,0); lit=0; for(auto o:r.opa) lit+=o>=200; assert(lit==12);
  // Levels grow an arc from 12 o'clock, so a level change only repaints its ends.
  RingFrame low=ring_frame(RingMode::BREATHE,5000,.25f,0,0), high=ring_frame(RingMode::BREATHE,5000,.33f,0,0);
  int changed=0; for(int i=0;i<RingFrame::N;++i) changed+=low.opa[i]!=high.opa[i];
  assert(low.opa[0]==255 && low.opa[12]<60 && changed==2);
  RingFrame c0=ring_frame(RingMode::COMET,1100,0,0,0), c1=ring_frame(RingMode::COMET,1140,0,0,0);
  changed=0; for(int i=0;i<RingFrame::N;++i) changed+=c0.opa[i]!=c1.opa[i]; assert(changed==0); // whole-dot steps
  // Expressions layer over talking/thinking; the lips keep following speech.
  Companion feel; settle(feel,Mood::SPEAKING,0,300);
  Frame plain=settle(feel,Mood::SPEAKING,316,600);
  feel.express(Expression::HAPPY,700,1);
  f=settle(feel,Mood::SPEAKING,616,690); assert(f.cheek==plain.cheek);             // not audible yet
  f=settle(feel,Mood::SPEAKING,706,1400); assert(f.cheeks && f.crescent>10 && f.pupil_h>0); // happy squint, pupils visible
  feel.express(Expression::SURPRISED,1450,1);
  f=settle(feel,Mood::SPEAKING,1416,2100); assert(f.eye_h>170 && f.pupil_w<40 && f.brow_y<-10 && !f.cheeks);
  feel.express(Expression::CURIOUS,2150,1);
  f=settle(feel,Mood::SPEAKING,2116,2800); assert(f.brow_out_r<-10 && f.brow_out_l==0 && f.gaze_x>3);
  feel.express(Expression::EMPATHETIC,2850,.5f);
  f=settle(feel,Mood::SPEAKING,2816,3500); assert(f.brow_in_l<-3 && f.brow_in_l>-8 && f.lid_l>5); // half strength
  feel.express(Expression::PLAYFUL,3550,1);
  f=settle(feel,Mood::SPEAKING,3516,3800); assert(f.lid_l>f.lid_r+40);              // the wink
  Companion react; settle(react,Mood::THINKING,0,400); react.express(Expression::EMPATHETIC,410,1);
  f=settle(react,Mood::THINKING,416,1200); assert(f.brow_in_r<-5 && f.lid_l>20 && f.gaze_x>10); // reacting while thinking
  settle(feel,Mood::IDLE,3816,4200);                                                 // turn over: cues forgotten
  f=settle(feel,Mood::SPEAKING,4216,5000); assert(f.lid_l==0 && !f.cheeks);
  Expression parsed; assert(expression_from_name("happy",5,parsed) && parsed==Expression::HAPPY);
  assert(!expression_from_name("happ",4,parsed) && !expression_from_name("happyy",6,parsed));
  std::cout << "PASS face: springs, blink-on-change, lids, happy cut, sleep/boot/nod, mouth ignores your voice, mouth track visemes, rim, expressions\\n";

  // Modo pitch: RECORD listens (the mic widens the eyes, never the mouth) under a REC rim; INVITE breathes "tocá".
  static_assert(int(Mood::RECORD)==10 && int(Mood::INVITE)==11, "appended mood ids are the emulator/workbench contract");
  assert(hears(Mood::RECORD) && hears(Mood::FOLLOWUP) && !hears(Mood::INVITE) && !hears(Mood::THINKING));
  Companion pitch;
  Frame still=settle(pitch,Mood::RECORD,0,600);
  for(uint32_t t=616;t<760;t+=16){ pitch.level(.8f,t); f=pitch.frame(t,Mood::RECORD,false,0); }
  assert(f.ring==RingMode::RECORD && f.level>.1f && f.eye_h>still.eye_h && f.mouth_h==still.mouth_h);
  r=pitch.ring(f,700); assert(r.color==0x0162C8 && r.opa[0]>=200);
  // REC blink: the 6 o'clock dot alternates once a second and is the only dot that changes.
  RingFrame rec0=ring_frame(RingMode::RECORD,1000,0,0,0), rec1=ring_frame(RingMode::RECORD,1040,0,0,0), rec2=ring_frame(RingMode::RECORD,1500,0,0,0);
  changed=0; for(int i=0;i<RingFrame::N;++i) changed+=rec0.opa[i]!=rec1.opa[i]; assert(changed==0);
  assert(rec0.opa[12]==255 && rec2.opa[12]<60);
  changed=0; for(int i=0;i<RingFrame::N;++i) changed+=rec0.opa[i]!=rec2.opa[i]; assert(changed==1);
  f=settle(pitch,Mood::INVITE,800,2000); assert(f.ring==RingMode::PULSE && f.brow_y<-5 && f.smile && !f.grey);
  // PULSE breathes an arc from the top on its own clock: at most the two arc ends move per 40 ms step.
  int smallest=RingFrame::N, largest=0;
  for(uint32_t t=0;t<1400;t+=40) {
    RingFrame p0=ring_frame(RingMode::PULSE,t,0,0,0), p1=ring_frame(RingMode::PULSE,t+40,0,0,0);
    changed=0; lit=0; for(int i=0;i<RingFrame::N;++i){ changed+=p0.opa[i]!=p1.opa[i]; lit+=p0.opa[i]>=200; }
    assert(changed<=2); smallest=std::min(smallest,lit); largest=std::max(largest,lit);
  }
  assert(smallest<=4 && largest>=22);
  std::cout << "PASS pitch: RECORD listens under a REC rim, INVITE breathes, bounded repaints\\n";

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
  assert(!main.includes("- button:"), "Face only: controls belong in settings");
  const labels = [...main.matchAll(/- label:\n\s+id: (\w+)/g)].map((m) => m[1]);
  assert.deepEqual(labels, ["zzz_0", "zzz_1", "zzz_2", "face_hint", "overlay_label"], "Face text is hints/overlay/z's only");
  assert(!/on_(short_click|click|long_press|swipe_)/.test(touch), "Do not add competing gesture actions");
  assert(touch.includes("contact.end") && touch.includes("contact.cancel") && touch.includes("lv_indev_wait_release"));
  assert(!yaml.includes("think_spinner") && !yaml.includes("id: eye_height"), "One small-region renderer owns geometry");
  const controls = readFileSync(new URL("../packages/controls.yaml", import.meta.url), "utf8");
  const face = controls.slice(controls.indexOf("id: face_state"), controls.indexOf("\nswitch:"));
  assert(face.includes("script.execute:\n          id: show_face") || face.includes("id: show_face"), "The bridge's face shows at once");
  assert(!controls.includes("voice_assistant") && !controls.includes("apply_face"), "No voice pipeline on the board");
  assert(controls.includes("id: taps") && controls.includes("script.execute: tap_to_talk"), "A tap reaches the bridge as a count");
  for (const action of ["show_card", "show_qr", "show_text", "express", "mouth_track", "mic_level"])
    assert(controls.includes(`action: ${action}`), `bridge action ${action}`);
  const companion = readFileSync(new URL("../packages/companion.yaml", import.meta.url), "utf8");
  const tap = companion.slice(companion.indexOf("- id: tap_to_talk"), companion.indexOf("- id: wake_display"));
  assert(tap.includes("id(mic_privacy).state") && tap.includes("open_quick_controls"), "In pausa a tap opens the settings, never a turn");
  console.log("PASS YAML integration: one input owner, no full-screen spinner, bridge-driven face, taps counted");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
