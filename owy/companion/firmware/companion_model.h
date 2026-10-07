#pragma once

// Allocation-free companion behavior. No audio/network/device commands live here.
// The same code runs in host tests and on the ESP32; milliseconds wrap safely.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include "companion_motion.h"

// Geometry is authored for the 466 px AMOLED. A smaller round panel builds with
// -DOWY_FACE_SCALE=<panel/466> and FaceRenderer/touch mapping scale at the edges.
#ifndef OWY_FACE_SCALE
#define OWY_FACE_SCALE 1.0f
#endif

namespace owy {
constexpr float FACE_SCALE = OWY_FACE_SCALE;
inline int scaled(int v) { return int(std::lround(v * FACE_SCALE)); }
inline float bound(float v, float lo, float hi) { return std::max(lo, std::min(hi, v)); }
inline bool recent(uint32_t now, uint32_t then, uint32_t ms) { return uint32_t(now - then) < ms; }
enum class Gesture { NONE, TAP, PET, HOLD, UP, DOWN, LEFT, RIGHT };
inline const char *gesture_name(Gesture g) {
  switch (g) {
    case Gesture::TAP: return "tap";
    case Gesture::PET: return "pet";
    case Gesture::HOLD: return "hold";
    case Gesture::UP: return "up";
    case Gesture::DOWN: return "down";
    case Gesture::LEFT: return "left";
    case Gesture::RIGHT: return "right";
    default: return "none";
  }
}

class Contact {
 public:
  void begin(int x, int y, uint32_t now) {
    active = true;
    x0 = last_x = x; y0 = last_y = y; started = now;
    travel = path = 0;
  }
  void move(int x, int y) {
    if (!active) return;
    travel = std::max(travel, std::max(std::abs(x - x0), std::abs(y - y0)));
    path += std::abs(x - last_x) + std::abs(y - last_y);
    last_x = x; last_y = y;
  }
  Gesture hold(uint32_t now) {
    if (active && travel < 22 && uint32_t(now - started) >= 800) {
      active = false;
      return Gesture::HOLD;
    }
    return Gesture::NONE;
  }
  Gesture end(int x, int y, uint32_t now) {
    if (!active) return Gesture::NONE;
    move(x, y); active = false;
    const int dx = x - x0, dy = y - y0;
    const auto duration = uint32_t(now - started);
    // Require a deliberate, predominantly one-axis swipe. A slow drag is still
    // movement, never a tap. Out-and-back petting uses max excursion + path.
    if (duration < 1800 && std::abs(dx) >= 85 && std::abs(dx) > std::abs(dy) * 1.4f)
      return dx > 0 ? Gesture::RIGHT : Gesture::LEFT;
    if (duration < 1800 && std::abs(dy) >= 85 && std::abs(dy) > std::abs(dx) * 1.4f)
      return dy > 0 ? Gesture::DOWN : Gesture::UP;
    if (travel >= 22) return path >= 100 ? Gesture::PET : Gesture::NONE;
    if (duration >= 800) return Gesture::HOLD;
    return duration >= 35 ? Gesture::TAP : Gesture::NONE;
  }
  void cancel() { active = false; }
  bool active{false};
  int last_x{233}, last_y{190};
 private:
  int x0{0}, y0{0}, travel{0}, path{0};
  uint32_t started{0};
};

struct Power {
  bool known{false}, usb{false}, battery{false}, charging{false};
  int percent{-1};
  void decode(uint8_t s0, uint8_t s1, int pct) {
    known = true; usb = s0 & 0x20; battery = s0 & 0x08;
    charging = battery && ((s1 >> 5) & 3) == 1;
    percent = battery && pct >= 0 && pct <= 100 ? pct : -1;
  }
  void unavailable() { *this = Power{}; }
};


// FOLLOWUP and SLEEP are appended so existing numeric mood ids stay stable.
enum class Mood { IDLE, LISTENING, THINKING, SPEAKING, HAPPY, ERROR, OFFLINE, PRIVACY, FOLLOWUP, SLEEP };

// Damped spring on the host clock. Semi-implicit Euler in <=8 ms steps, so a
// stalled loop (dt clamps at 150 ms) cannot blow up the stiff lip springs.
struct Spring {
  float x{0}, v{0};
  bool set{false};
  float step(float target, float dt, float k, float z) {
    if (!set) { snap(target); return x; }
    const int n = std::max(1, int(std::ceil(dt / 8.f)));
    const float h = dt / 1000.f / n, c = 2.f * std::sqrt(k) * z;
    for (int i = 0; i < n; ++i) { v += (k * (target - x) - c * v) * h; x += v * h; }
    return x;
  }
  void snap(float target) { x = target; v = 0; set = true; }
};

// One mouth = four LVGL objects (lips, cavity, tongue, cut) plus a top band.
// Every expression and viseme is just a target for these numbers (466-space).
struct MouthShape { float w, h, r, open, tongue, smile, frown, bowl, x; };
namespace mouth {
constexpr MouthShape REST{100, 30, 18, 0, 0, 1, 0, 0, 0};    // the U smile
constexpr MouthShape CLOSED{70, 10, 5, 0, 0, 0, 0, 0, 0};    // m · b · p, pauses
constexpr MouthShape GRIN{136, 66, 32, 1, 1, 0, 0, 1, 0};
constexpr MouthShape HMM{46, 12, 6, 0, 0, 0, 0, 0, 30};      // thinking, to one side
constexpr MouthShape LISTEN{32, 28, 14, 1, 0, 0, 0, 0, 0};   // attentive "o"
constexpr MouthShape FROWN{80, 28, 15, 0, 0, 0, 1, 0, 0};
constexpr MouthShape FLAT{62, 9, 4, 0, 0, 0, 0, 0, 0};
constexpr MouthShape SMALL{30, 8, 4, 0, 0, 0, 0, 0, 0};
// Continuous viseme space: open 0..1 (loudness), shape -1 wide (e/i) .. +1 round (o/u).
// open 1 / shape 0 is "a"; Spanish's five clean vowels sit on this plane.
inline MouthShape speech(float open, float shape) {
  open = bound(open, 0, 1); shape = bound(shape, -1, 1);
  if (open < .06f) return CLOSED;
  float h = 10 + 54 * open, w = 70 + 16 * open;
  if (shape < 0) { w += -shape * (30 - 8 * open); h *= 1 + shape * .4f; }
  else w += (std::max(h * .95f + 2, 34.f) - w) * shape;
  return {w, h, std::min(w, h) / 2, bound((h - 15) / 14, 0, 1),
          bound((open - .45f) / .35f, 0, 1) * (shape > .5f ? .6f : 1.f), 0, 0, 0, 0};
}
}  // namespace mouth

// Speech features stamped with the time they become AUDIBLE. One writer per
// track (the speaker task, or the main loop for a bridge mouth_track); the face
// reads on the main loop. Torn reads only cost one odd mouth frame.
class SpeechTrack {
 public:
  static constexpr int N = 64;
  void push(uint32_t audible_at, float open, float shape) {
    const int i = (head_ + 1) % N;
    const auto o = uint16_t(std::lround(bound(open, 0, 1) * 127)), s = uint16_t(std::lround((bound(shape, -1, 1) + 1) * 63));
    value_[i].store(uint16_t(0x8000 | o << 7 | s), std::memory_order_relaxed);
    at_[i].store(audible_at, std::memory_order_release);
    head_ = i;
  }
  /** Newest feature already audible and at most 120 ms old. */
  bool read(uint32_t now, float &open, float &shape) const {
    uint32_t best = UINT32_MAX; uint16_t v = 0;
    for (int i = 0; i < N; ++i) {
      const uint16_t value = value_[i].load(std::memory_order_relaxed);
      const uint32_t age = now - at_[i].load(std::memory_order_acquire);
      if ((value & 0x8000) && age < 120 && age < best) { best = age; v = value; }
    }
    if (best == UINT32_MAX) return false;
    open = ((v >> 7) & 127) / 127.f; shape = (v & 127) / 63.f - 1;
    return true;
  }
 private:
  std::atomic<uint32_t> at_[N]{};
  std::atomic<uint16_t> value_[N]{};
  int head_{0};
};

// 16-bit PCM → (open, shape) per 10 ms block. Loudness against a decaying peak
// (an AGC: volume and voice don't matter). Shape from two cheap spectral ratios,
// each against its own running mean so any voice works: d2 = Σ(Δ²x)²/Σ(Δx)²
// rises with F2 (front e/i → wide), d1 = Σ(Δx)²/Σx² falls with F1 (u → round).
// Measured on macOS Spanish TTS voices; good enough for a cartoon, not phonetics.
class SpeechAnalyzer {
 public:
  static constexpr size_t BLOCK = 160;  // 10 ms at 16 kHz
  void feed(const uint8_t *pcm, size_t bytes, size_t channels, uint32_t audible_at, SpeechTrack &out) {
    const size_t stride = 2 * std::max<size_t>(1, channels);
    for (size_t p = 0; p + 1 < bytes; p += stride) {
      const float s = int16_t(uint16_t(pcm[p]) | uint16_t(uint16_t(pcm[p + 1]) << 8));
      const float d = s - x1_, d2 = s - 2 * x1_ + x2_;
      energy_ += s * s; diff_ += d * d; diff2_ += d2 * d2; x2_ = x1_; x1_ = s;
      if (++n_ == BLOCK) publish(audible_at, out);
    }
  }
 private:
  void publish(uint32_t at, SpeechTrack &out) {
    const float rms = std::sqrt(energy_ / BLOCK);
    peak_ = std::max(rms, peak_ * .996f);
    const float floor = std::max(180.f, peak_ * .1f), top = std::max(peak_ * .75f, floor + 400.f);
    const float open = bound((rms - floor) / (top - floor), 0, 1);
    float shape = 0;
    if (open > .15f) {
      const float r1 = diff_ / (energy_ + 1.f), r2 = diff2_ / (diff_ + 1.f);
      mean1_ += (r1 - mean1_) * .03f; mean2_ += (r2 - mean2_) * .03f;
      // ponytail: thresholds are ratios to the voice's own mean; retune by eye here.
      const float wide = bound((r2 / mean2_ - 1.12f) / .3f, 0, 1);
      const float round = std::max(bound((.8f - r2 / mean2_) / .3f, 0, 1), bound((.6f - r1 / mean1_) / .25f, 0, 1));
      shape = round - wide;
    }
    out.push(at, open, shape);
    energy_ = diff_ = diff2_ = 0; n_ = 0;
  }
  float energy_{0}, diff_{0}, diff2_{0}, x1_{0}, x2_{0}, peak_{0}, mean1_{.04f}, mean2_{.6f};
  size_t n_{0};
};

// What Owy feels while it talks (or reacts while it thinks): a layer over the
// SPEAKING/THINKING pose that moves eyes, lids, brows and cheeks; the lips keep
// lip-syncing. The bridge picks one per sentence (companion/bridge/src/expression.ts).
enum class Expression { NEUTRAL, HAPPY, EXCITED, CURIOUS, THINKING, EMPATHETIC, PLAYFUL, SURPRISED };
constexpr const char *EXPRESSION_NAMES[] = {"neutral", "happy", "excited", "curious", "thinking", "empathetic", "playful", "surprised"};
inline bool expression_from_name(const char *name, size_t n, Expression &out) {
  for (int i = 0; i < 8; ++i) {
    const char *candidate = EXPRESSION_NAMES[i];
    size_t k = 0;
    while (k < n && candidate[k] && candidate[k] == name[k]) ++k;
    if (k == n && !candidate[k]) { out = Expression(i); return true; }
  }
  return false;
}

// The rim: 24 dots whose colour/opacity tell what Owy is doing. Pure function
// of state and time; FaceRing applies it with per-dot dedupe. Every dot that
// changes is its own small render+flush on the panel (they are too far apart to
// merge), so modes are shaped to touch few dots per frame: levels grow an arc
// from 12 o'clock (only its ends change), comets step a whole dot at a time.
enum class RingMode { NONE, LISTEN, COUNTDOWN, COMET, BREATHE, ALERT, SEARCH, LEVEL };
struct RingFrame {
  static constexpr int N = 24;
  uint32_t color{0x0162C8};
  uint8_t opa[N]{};
};
inline RingFrame ring_frame(RingMode mode, uint32_t now, float level, float progress, uint32_t since) {
  RingFrame f;
  const auto age = uint32_t(now - since);
  for (int i = 0; i < RingFrame::N; ++i) {
    float a = 0;
    switch (mode) {
      case RingMode::LISTEN: case RingMode::BREATHE: {
        // Blue = you, yellow = Owy: a symmetric arc grows from the top with the level.
        const int half = int(std::lround(bound(level, 0, 1) * RingFrame::N / 2));
        a = std::min(i, RingFrame::N - i) < half ? 1.f : .16f;
        if (mode == RingMode::LISTEN && age < 420) a = std::max(a, 1.f - age / 420.f);  // the tap flash
        if (mode == RingMode::BREATHE) f.color = 0xF5BB03;
        break;
      }
      case RingMode::COUNTDOWN:
        a = i < int(std::ceil(bound(1 - progress, 0, 1) * RingFrame::N)) ? .85f : .1f;
        break;
      case RingMode::COMET: case RingMode::SEARCH: {
        const int head = int(now / (mode == RingMode::COMET ? 55 : 160) % RingFrame::N);
        const int d = (head - i + RingFrame::N) % RingFrame::N;
        a = mode == RingMode::COMET ? (d < 6 ? 1 - d / 6.f : .07f) : (d < 4 ? .8f - d / 5.f : .05f);
        f.color = mode == RingMode::COMET ? 0xF5BB03 : 0x777368;
        break;
      }
      case RingMode::ALERT: a = age < 900 ? ((age / 150) % 2 ? .08f : 1.f) : .12f; f.color = 0xF5BB03; break;
      case RingMode::LEVEL: a = i < int(std::lround(bound(level, 0, 1) * RingFrame::N)) ? 1.f : .1f; f.color = 0xF5BB03; break;
      default: break;
    }
    // 8 opacity steps: a held state costs nothing after the first frame.
    f.opa[i] = uint8_t(std::lround(bound(a, 0, 1) * 7) * 255 / 7);
  }
  return f;
}

struct Frame {
  int gaze_x{0}, gaze_y{0}, eye_h{156}, eye_rh{156}, pupil_w{44}, pupil_h{54};
  int lid_l{0}, lid_r{0}, crescent{0};  // px: lids from the top, happy cut from below
  int brow_y{0}, brow_in_l{0}, brow_out_l{0}, brow_in_r{0}, brow_out_r{0};
  int face_y{0}, sway{0}, cheek{0};      // cheek 0..100
  int mouth_w{100}, mouth_h{30}, mouth_r{18}, mouth_x{0};
  int cavity_w{0}, cavity_h{0}, cavity_r{0}, tongue_w{0}, tongue_h{0};
  int cut_y{0}, cut_w{0}, cut_h{0}, bowl_h{0};  // smile (cut above) / frown (cut below)
  int zzz{-1};                           // sleep: 0..2599 cycle, -1 = awake
  bool grey{false}, cheeks{false}, smile{true};
  RingMode ring{RingMode::NONE};
  float level{0};                        // speech/mic level that drives the rim
};

class Companion {
 public:
  explicit Companion(uint32_t seed=0x4F5759) : random_(seed ? seed : 0x4F5759) {}
  Contact contact;
  Power power;
  MotionTracker tracker;
  Cadence animation_cadence;
  SpeechTrack speech_tap, speech_track;  // speaker PCM tap / bridge mouth_track
  float chip_temperature{NAN};
  void motion(float ax, float ay, float az, float gx, float gy, float gz, uint32_t now, bool react = true) {
    if (tracker.update({ax,ay,az}, {gx,gy,gz}, now, react)) {
      delight(now); shake_at_=now; has_shake_=true; shake_event_=true;
    }
  }
  bool take_shake() { const bool event=shake_event_; shake_event_=false; return event; }
  bool motion_ok(uint32_t now) const { return tracker.ok(now); }
  void center() { tracker.center(); }
  void delight(uint32_t now) { reaction_at_ = now; has_reaction_ = true; }
  /** STT end: a quick nod says "te entendí". */
  void nod(uint32_t now) { nod_at_ = now; has_nod_ = true; }
  /** Follow-up window opened: the rim drains over `ms`. */
  void countdown(uint32_t now, uint32_t ms) { countdown_at_ = now; countdown_ms_ = ms; }
  /**
   * Schedule an expression from `at` (when that sentence becomes audible) at
   * `strength` 0..1. The newest due cue wins; cues only apply while Owy talks
   * or thinks and are dropped when the turn ends.
   */
  void express(Expression e, uint32_t at, float strength = 1) {
    cue_head_ = (cue_head_ + 1) % CUES;
    cues_[cue_head_] = {at, e, bound(strength, 0, 1), true};
  }
  /** Boot: eyes stay shut until `until`, then open with a stretch. */
  void wake_at(uint32_t until) { boot_until_ = until; has_boot_ = true; }
  // `gain` scales the envelope for quieter front-ends (a raw PDM mic vs the
  // ES7210's 30 dB analog stage); 1 keeps the original 466 calibration.
  void audio(const uint8_t *data, size_t size, uint32_t now, float gain = 1.f) {
    // Existing stereo16-bit stream, first mic only; <=48 samples, no allocation.
    // Observe data, never start a microphone consumer or touch LVGL here.
    if (size < 4) return;
    const size_t frames = size / 4;
    const size_t stride = std::max(size_t(1), frames / 48);
    uint32_t sum = 0, n = 0;
    for (size_t f = 0; f < frames && n < 48; f += stride, ++n) {
      const size_t p = f * 4;
      const int sample = int16_t(uint16_t(data[p]) | (uint16_t(data[p + 1]) << 8));
      sum += std::abs(sample);
    }
    mic_level_.store(bound(gain * float(sum) / std::max(uint32_t(1), n) / 3000.f - .025f, 0.f, 1.f), std::memory_order_relaxed);
    mic_at_.store(now, std::memory_order_relaxed);
  }
  /** Latest mic envelope (0..1); 0 once the stream is >200 ms stale. Observe-only, like the mouth. */
  float mic_level(uint32_t now) const {
    return recent(now, mic_at_.load(std::memory_order_relaxed), 200) ? mic_level_.load(std::memory_order_relaxed) : 0.f;
  }
  /**
   * Bridge mouth track, for audio this device does not play itself (laptop
   * output): one base64url char per 40 ms frame = open (0..15) << 2 | shape
   * (0 wide .. 3 round), the first one audible `lead_ms` from now.
   */
  void mouth_track(const char *frames, size_t n, uint32_t now, int lead_ms) {
    for (size_t i = 0; i < n; ++i) {
      const char c = frames[i];
      const int v = c >= 'A' && c <= 'Z' ? c - 'A' : c >= 'a' && c <= 'z' ? c - 'a' + 26 :
                    c >= '0' && c <= '9' ? c - '0' + 52 : c == '-' ? 62 : c == '_' ? 63 : -1;
      if (v < 0) continue;
      // A negative lead (frames already playing) wraps correctly in uint32_t.
      speech_track.push(now + uint32_t(int32_t(lead_ms)) + uint32_t(i * 40), (v >> 2) / 15.f, (v & 3) / 1.5f - 1);
    }
  }
  /** Speech features now audible: the speaker tap first, then a bridge mouth track. */
  bool speech(uint32_t now, float &open, float &shape) const {
    return speech_tap.read(now, open, shape) || speech_track.read(now, open, shape);
  }
  // `speaking` (0..100) is a level-only fallback when no speech features arrive
  // (the emulator's fixtures); real devices drive the lips from speech().
  Frame frame(uint32_t now, Mood mood, bool motion_on, bool reduced, bool invert_x,
              bool invert_y, float speaking) {
    const uint32_t elapsed = has_frame_ ? uint32_t(now - frame_at_) : 50;
    frame_at_ = now; has_frame_ = true;
    animation_cadence.tick(now);
    const float dt = bound(float(elapsed), 1.f, 150.f);
    const bool listening = mood == Mood::LISTENING || mood == Mood::FOLLOWUP;
    const bool voice = listening || mood == Mood::THINKING || mood == Mood::SPEAKING;
    const bool alive = mood != Mood::ERROR && mood != Mood::OFFLINE && mood != Mood::PRIVACY && mood != Mood::SLEEP;
    const bool happy = mood == Mood::HAPPY || (alive && !voice && !reduced && has_reaction_ && recent(now, reaction_at_, 1600));
    const Mood shown = happy ? Mood::HAPPY : mood;
    if (has_mood_ && shown != mood_) {
      // A blink masks the geometry jump (classic animation trick).
      if (!reduced && shown != Mood::SLEEP && mood_ != Mood::SLEEP && uint32_t(now - blink_at_) > 400) {
        blink_at_ = now; blink_delay_ = 0;
      }
      if (listening && mood_ != Mood::LISTENING && mood_ != Mood::FOLLOWUP) mood_at_ = now;
      // A new listening window or the end of the turn: the last reply's cues are history.
      if ((listening && mood_ != Mood::LISTENING && mood_ != Mood::FOLLOWUP) || !voice)
        for (auto &cue : cues_) cue.set = false;
      if (shown == Mood::ERROR) mood_at_ = now;
    }
    if (!has_mood_) mood_at_ = now;
    mood_ = shown; has_mood_ = true;
    Target t = target(shown);
    if (shown == Mood::SPEAKING || shown == Mood::THINKING) apply_expression(t, now);

    // ── Gaze: deliberate input leads (tilt, touch); otherwise idle saccades ──
    float tx = 0, ty = 0;
    if (!reduced && alive) {
      if (motion_on && motion_ok(now)) {
        const auto tilt=tracker.offset();
        tx = std::abs(tilt.x)<.008f ? 0 : tilt.x*64.f;
        ty = std::abs(tilt.y)<.008f ? 0 : -tilt.y*54.f;
        if (invert_x) tx = -tx;
        if (invert_y) ty = -ty;
      }
      if (!voice && contact.active) {
        tx = (contact.last_x - scaled(233)) / FACE_SCALE * .17f;
        ty = (contact.last_y - scaled(210)) / FACE_SCALE * .16f;
      } else if (!voice) {
        if (!saccade_scheduled_) { saccade_at_ = now + 1500; saccade_scheduled_ = true; }
        if (int32_t(now - saccade_at_) >= 0) {
          // A third of the glances come back to "you".
          if (next() % 3 == 0) saccade_x_ = saccade_y_ = 0;
          else { saccade_x_ = float(int(next() % 61) - 30); saccade_y_ = float(int(next() % 35) - 17); }
          saccade_at_ = now + 1300 + next() % 2600;
        }
        // Let deliberate movement lead; don't inject a random opposing glance.
        if (std::abs(tx)+std::abs(ty)<3) { tx += saccade_x_; ty += saccade_y_; }
        ty += std::sin(float(now % 62832) * .001f) * 1.5f;
      } else if (t.has_gaze) { tx = t.gaze_x; ty = t.gaze_y; }
    } else if (mood == Mood::OFFLINE && !reduced) {
      tx = std::sin(float(now % 81681) / 1300.f) * 26.f; ty = 6;  // searching
    }
    tx = bound(tx, -32.f, 32.f); ty = bound(ty, -25.f, 25.f);
    float gx = gaze_x_.step(tx, dt, 900, .85f), gy = gaze_y_.step(ty, dt, 900, .85f);
    // Reduced motion is immediately still, not an animated settling transition.
    if (reduced || (!alive && mood != Mood::OFFLINE)) { gaze_x_.snap(0); gaze_y_.snap(0); gx = gy = 0; }

    // ── Levels: mic while listening, speech features while speaking ─────────
    const float mic = listening && recent(now, mic_at_.load(std::memory_order_relaxed), 200) ? mic_level_.load(std::memory_order_relaxed) : 0.f;
    float open = 0, shape = 0;
    const bool live = mood == Mood::SPEAKING && speech(now, open, shape);
    if (mood == Mood::SPEAKING && !live && std::isfinite(speaking)) {
      // Level-only fallback: syllables from the level, shape from a slow wobble.
      open = bound(speaking / 100.f, 0, 1);
      shape = std::sin(float(now % 6284) * .0047f);
    }
    float level = mood == Mood::SPEAKING ? open : mic;
    envelope_ += (level - envelope_) * (dt/(level > envelope_ ? 24.f+dt : 95.f+dt));
    // The rim follows a slower copy: syllables would otherwise repaint it every frame.
    ring_level_ += (level - ring_level_) * (dt/(level > ring_level_ ? 60.f+dt : 250.f+dt));

    Frame out;
    out.ring = t.ring;
    out.level = ring_level_;

    // ── Eyes: springs (a little overshoot), asymmetric blinks, lids ─────────
    auto spring = [&](Spring &s, float target, float k, float z) {
      if (reduced) { s.snap(target); return target; }
      return s.step(target, dt, k, z);
    };
    float eye_h = spring(eye_h_, t.eye_h + mic * 10, 300, .5f);
    if (has_boot_ && int32_t(now - boot_until_) < 0) eye_h = 156;
    if (!blink_scheduled_) { blink_at_ = now; blink_delay_ = 3500; blink_scheduled_ = true; }
    const auto blink_age = uint32_t(now - blink_at_);
    if (blink_age > blink_delay_ + 170) {
      blink_at_ = now;
      // Irregular gaps; ~1 in 6 is a double blink.
      blink_delay_ = next() % 6 == 0 ? 140 : 2400 + next() % 3600;
    }
    float blink = 1;
    if (!reduced && alive && shown != Mood::HAPPY && blink_age >= blink_delay_ && blink_age <= blink_delay_ + 170) {
      const float b = float(blink_age - blink_delay_);
      blink = b < 60 ? 1 - b / 60 : (b - 60) / 110;
    }
    out.eye_h = out.eye_rh = std::lround(12 + (eye_h - 12) * bound(blink, 0, 1));
    float lid_l = spring(lid_l_, t.lid_l, 220, .8f), lid_r = spring(lid_r_, t.lid_r, 220, .8f);
    if (has_boot_ && int32_t(now - boot_until_) < 0) { lid_l_.snap(1); lid_r_.snap(1); lid_l = lid_r = 1; }
    out.lid_l = std::lround(bound(lid_l, 0, 1) * out.eye_h);
    out.lid_r = std::lround(bound(lid_r, 0, 1) * out.eye_h);
    const float cres = bound(spring(crescent_, t.crescent, 300, .7f), 0, 1);
    out.crescent = std::lround((out.eye_h - 36) * cres);
    const float ps = spring(pupil_, t.pupil + mic * .3f, 420, .55f);
    out.pupil_w = std::lround(44 * ps);
    out.pupil_h = std::lround(std::max(0.f, std::min(54 * ps, float(out.eye_h - 20))) * (1 - std::min(1.f, cres * 1.4f)));
    out.gaze_x = std::lround(gx); out.gaze_y = std::lround(gy);
    out.grey = t.grey;

    // ── Brows (tiltable lines), cheeks, whole-face offsets ──────────────────
    out.brow_y = std::lround(spring(brow_y_, t.brow_y, 300, .55f));
    out.brow_in_l = std::lround(spring(brow_in_l_, t.brow_in_l, 300, .6f));
    out.brow_out_l = std::lround(spring(brow_out_l_, t.brow_out_l, 300, .6f));
    out.brow_in_r = std::lround(spring(brow_in_r_, t.brow_in_r, 300, .6f));
    out.brow_out_r = std::lround(spring(brow_out_r_, t.brow_out_r, 300, .6f));
    out.cheek = std::lround(bound(spring(cheek_, t.cheek, 300, .6f), 0, 1) * 100);
    out.cheeks = out.cheek > 2;
    if (!reduced) {
      if (has_nod_ && recent(now, nod_at_, 320)) out.face_y += std::lround(10 * std::sin(3.14159265f * uint32_t(now - nod_at_) / 320.f));
      if (has_reaction_ && happy && recent(now, reaction_at_, 700)) {
        const float age = float(uint32_t(now - reaction_at_));
        out.face_y -= std::lround(14 * std::sin(age / 350.f * 3.14159265f) * (1 - age / 700.f));
      }
    }
    if (alive && !voice && !reduced && motion_on && has_shake_ && recent(now,shake_at_,1600)) {
      const float age=float(uint32_t(now-shake_at_));
      out.sway=std::lround(8.f*std::sin(age*.014f)*(1.f-age/1600.f));
      out.brow_y+=out.sway;
    }

    // ── Mouth: stiff springs for speech, bouncy ones for expressions ────────
    MouthShape m = t.mouth;
    if (mood == Mood::SPEAKING) m = reduced ? mouth::speech(.15f, 0) : mouth::speech(open, shape);
    const float mk = mood == Mood::SPEAKING ? 1600 : 420, mz = mood == Mood::SPEAKING ? .82f : .55f;
    const float values[] = {m.w, m.h, m.r, m.open, m.tongue, m.smile, m.frown, m.bowl, m.x};
    float v[9];
    for (int i = 0; i < 9; ++i) v[i] = spring(mouth_[i], values[i], mk, mz);
    const float w = std::max(8.f, v[0]), h = std::max(2.f, v[1]), lip = 7;
    out.mouth_w = std::lround(w); out.mouth_h = std::lround(h);
    out.mouth_r = std::lround(bound(v[2], 1, std::min(w, h) / 2));
    out.mouth_x = std::lround(gx / 3 + v[8]) - out.sway;
    const float cav_h = (h - 2 * lip) * bound(v[3], 0, 1);
    if (v[3] > .03f && cav_h >= 2) {
      out.cavity_w = std::lround(w - 2 * lip); out.cavity_h = std::lround(cav_h);
      out.cavity_r = std::lround(std::max(2.f, std::min(v[2] - lip, cav_h / 2)));
      const float tongue = bound(v[4], 0, 1);
      if (tongue > .03f) { out.tongue_w = std::lround((w - 2 * lip) * .56f); out.tongue_h = std::lround(cav_h * .62f * tongue); }
    }
    const float smile = bound(v[5], 0, 1), frown = bound(v[6], 0, 1);
    out.smile = smile > .03f;
    if (out.smile || frown > .03f) {
      out.cut_w = std::lround(w - 20); out.cut_h = std::lround(std::max(1.f, h - 4));
      out.cut_y = out.smile ? std::lround(-8 - (1 - smile) * h) : std::lround(8 + (1 - frown) * h);
    }
    out.bowl_h = std::lround(h * .2f * bound(v[7], 0, 1));
    if (shown == Mood::SLEEP && !reduced) out.zzz = int(now % 2600);
    return out;
  }
  /** The rim for this frame; `since` = when the current listening/error started. */
  RingFrame ring(const Frame &f, uint32_t now) const {
    float progress = 0;
    if (f.ring == RingMode::COUNTDOWN && countdown_ms_) progress = float(uint32_t(now - countdown_at_)) / countdown_ms_;
    return ring_frame(f.ring, now, f.level, progress, mood_at_);
  }
 private:
  struct Target {
    float eye_h{156}, pupil{1}, lid_l{0}, lid_r{0}, crescent{0}, cheek{0};
    float brow_y{0}, brow_in_l{0}, brow_out_l{0}, brow_in_r{0}, brow_out_r{0};
    float gaze_x{0}, gaze_y{0};
    bool has_gaze{false};
    MouthShape mouth{mouth::REST};
    RingMode ring{RingMode::NONE};
    bool grey{false};
  };
  // Mood → pose (466-space), mirrored by the redesign mockups.
  static Target target(Mood mood) {
    Target t;
    switch (mood) {
      case Mood::LISTENING: t.eye_h = 168; t.pupil = 1.12f; t.brow_y = -10; t.mouth = mouth::LISTEN; t.ring = RingMode::LISTEN; break;
      case Mood::FOLLOWUP: t.eye_h = 164; t.pupil = 1.08f; t.brow_y = -7; t.mouth = mouth::LISTEN; t.ring = RingMode::COUNTDOWN; break;
      case Mood::THINKING:
        t.eye_h = 146; t.pupil = .95f; t.lid_r = .2f; t.brow_y = -4;
        t.brow_in_l = -10; t.brow_out_l = -4; t.brow_in_r = 6; t.brow_out_r = 2;
        t.gaze_x = 20; t.gaze_y = -18; t.has_gaze = true;
        t.mouth = mouth::HMM; t.ring = RingMode::COMET; break;
      case Mood::SPEAKING: t.ring = RingMode::BREATHE; break;
      case Mood::HAPPY: t.eye_h = 112; t.crescent = 1; t.cheek = 1; t.brow_y = -12; t.mouth = mouth::GRIN; break;
      case Mood::ERROR:
        t.eye_h = 124; t.pupil = .9f; t.lid_l = t.lid_r = .26f;
        t.brow_in_l = t.brow_in_r = -9; t.brow_out_l = t.brow_out_r = 5;
        t.mouth = mouth::FROWN; t.ring = RingMode::ALERT; break;
      case Mood::OFFLINE: t.eye_h = 128; t.pupil = .9f; t.lid_l = t.lid_r = .38f; t.grey = true; t.mouth = mouth::FLAT; t.ring = RingMode::SEARCH; break;
      case Mood::PRIVACY: t.eye_h = 132; t.pupil = .9f; t.lid_l = t.lid_r = .5f; t.mouth = mouth::FLAT; break;
      case Mood::SLEEP: t.pupil = .9f; t.lid_l = t.lid_r = .95f; t.brow_y = 8; t.mouth = mouth::SMALL; break;
      default: break;
    }
    return t;
  }
  // Expression layer: poses relative to the mood's, blended by the cue strength.
  void apply_expression(Target &t, uint32_t now) const {
    const Cue *cue = nullptr;
    for (const auto &c : cues_)
      if (c.set && int32_t(now - c.at) >= 0 && uint32_t(now - c.at) < 20000 && (!cue || int32_t(c.at - cue->at) > 0)) cue = &c;
    if (!cue || cue->expression == Expression::NEUTRAL) return;
    Target m = t;
    switch (cue->expression) {
      case Expression::HAPPY: m.crescent = .35f; m.cheek = 1; m.brow_y -= 8; break;
      case Expression::EXCITED: m.eye_h += 14; m.pupil = 1.12f; m.brow_y -= 14; m.cheek = .6f; break;
      case Expression::CURIOUS:
        m.brow_in_r = -10; m.brow_out_r = -16; m.lid_l = .12f;
        m.gaze_x = 8; m.gaze_y = -6; m.has_gaze = true; break;
      case Expression::THINKING:
        m.lid_r = .2f; m.brow_in_l = -10; m.brow_out_l = -4;
        m.gaze_x = 18; m.gaze_y = -16; m.has_gaze = true; break;
      case Expression::EMPATHETIC:
        m.eye_h -= 8; m.pupil = .95f; m.lid_l = m.lid_r = .22f;
        m.brow_in_l = m.brow_in_r = -10; m.brow_out_l = m.brow_out_r = 5; break;
      case Expression::PLAYFUL:
        // A wink as the line starts, then a sly half-lid.
        m.lid_l = uint32_t(now - cue->at) < 380 ? .9f : .25f;
        m.brow_in_r = -8; m.brow_out_r = -10; m.cheek = .5f; break;
      case Expression::SURPRISED: m.eye_h += 20; m.pupil = .8f; m.brow_y -= 18; break;
      default: break;
    }
    const float k = cue->strength;
    auto mix = [k](float a, float b) { return a + (b - a) * k; };
    t.eye_h = mix(t.eye_h, m.eye_h); t.pupil = mix(t.pupil, m.pupil);
    t.lid_l = mix(t.lid_l, m.lid_l); t.lid_r = mix(t.lid_r, m.lid_r);
    t.crescent = mix(t.crescent, m.crescent); t.cheek = mix(t.cheek, m.cheek);
    t.brow_y = mix(t.brow_y, m.brow_y);
    t.brow_in_l = mix(t.brow_in_l, m.brow_in_l); t.brow_out_l = mix(t.brow_out_l, m.brow_out_l);
    t.brow_in_r = mix(t.brow_in_r, m.brow_in_r); t.brow_out_r = mix(t.brow_out_r, m.brow_out_r);
    if (m.has_gaze) {
      t.gaze_x = mix(t.has_gaze ? t.gaze_x : 0, m.gaze_x); t.gaze_y = mix(t.has_gaze ? t.gaze_y : 0, m.gaze_y);
      t.has_gaze = true;
    }
  }
  struct Cue { uint32_t at{0}; Expression expression{Expression::NEUTRAL}; float strength{0}; bool set{false}; };
  static constexpr int CUES = 8;
  Cue cues_[CUES]{};
  int cue_head_{0};
  uint32_t next() { random_ ^= random_ << 13; random_ ^= random_ >> 17; random_ ^= random_ << 5; return random_; }
  Spring gaze_x_, gaze_y_, eye_h_, lid_l_, lid_r_, crescent_, pupil_, cheek_;
  Spring brow_y_, brow_in_l_, brow_out_l_, brow_in_r_, brow_out_r_, mouth_[9];
  float envelope_{0}, ring_level_{0}, saccade_x_{0}, saccade_y_{0};
  std::atomic<float> mic_level_{0};
  std::atomic<uint32_t> mic_at_{0};
  uint32_t reaction_at_{0}, shake_at_{0}, frame_at_{0}, blink_at_{0}, blink_delay_{3500}, random_{0x4F5759};
  uint32_t nod_at_{0}, mood_at_{0}, countdown_at_{0}, countdown_ms_{0}, saccade_at_{0}, boot_until_{0};
  Mood mood_{Mood::IDLE};
  bool has_shake_{false}, shake_event_{false}, has_reaction_{false}, has_frame_{false}, blink_scheduled_{false};
  bool has_nod_{false}, has_mood_{false}, saccade_scheduled_{false}, has_boot_{false};
};
}  // namespace owy
