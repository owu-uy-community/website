#pragma once

// Allocation-free companion behavior. No audio/network/device commands live here.
// The same code runs in host tests and on the ESP32; milliseconds wrap safely.
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include "companion_motion.h"

namespace owy {
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

enum class Mood { IDLE, LISTENING, THINKING, SPEAKING, HAPPY, ERROR, OFFLINE, PRIVACY };
struct Frame {
  int gaze_x{0}, gaze_y{0}, eye_h{156}, eye_rh{156}, mouth_w{100}, mouth_h{28};
  int pupil_h{54}, brow_y{0}, dot{0}, sway{0};
  bool smile{true}, cheeks{false};
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

class Companion {
 public:
  explicit Companion(uint32_t seed=0x4F5759) : random_(seed ? seed : 0x4F5759) {}
  Contact contact;
  Power power;
  MotionTracker tracker;
  Cadence animation_cadence;
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
  void audio(const uint8_t *data, size_t size, uint32_t now) {
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
    mic_level_.store(bound(float(sum) / std::max(uint32_t(1), n) / 3000.f - .025f, 0.f, 1.f), std::memory_order_relaxed);
    mic_at_.store(now, std::memory_order_relaxed);
  }
  Frame frame(uint32_t now, Mood mood, bool motion_on, bool reduced, bool invert_x,
              bool invert_y, float speaking) {
    const uint32_t elapsed = has_frame_ ? uint32_t(now - frame_at_) : 50;
    frame_at_ = now; has_frame_ = true;
    animation_cadence.tick(now);
    const float dt = bound(float(elapsed), 1.f, 150.f);
    const float ease = dt / (32.f + dt);
    const bool voice = mood == Mood::LISTENING || mood == Mood::THINKING || mood == Mood::SPEAKING;
    const bool alive = mood != Mood::ERROR && mood != Mood::OFFLINE && mood != Mood::PRIVACY;
    const bool happy = mood == Mood::HAPPY || (alive && !voice && !reduced && has_reaction_ && recent(now, reaction_at_, 1600));
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
        tx = (contact.last_x - 233) * .17f;
        ty = (contact.last_y - 210) * .16f;
      } else if (!voice) {
        // Slow bounded glances; blinking is independently irregular.
        const unsigned slot = (now / 4200) % 5;
        static constexpr float glances[] = {0, 8, 0, -7, 0};
        // Let deliberate movement lead; don't inject a random opposing glance.
        if (std::abs(tx)+std::abs(ty)<3) tx += glances[slot];
        ty += std::sin(float(now % 62832) * .001f) * 1.5f;
      }
    }
    tx = bound(tx, -32.f, 32.f); ty = bound(ty, -25.f, 25.f);
    gaze_x_ += (tx - gaze_x_) * ease; gaze_y_ += (ty - gaze_y_) * ease;
    // Reduced motion is immediately still, not an animated settling transition.
    if (reduced || !alive) gaze_x_ = gaze_y_ = 0;
    if (!blink_scheduled_) { blink_at_ = now; blink_delay_ = 3500; blink_scheduled_ = true; }
    const auto blink_age = uint32_t(now - blink_at_);
    if (blink_age > blink_delay_ + 180) {
      random_ ^= random_ << 13; random_ ^= random_ >> 17; random_ ^= random_ << 5;
      blink_at_ = now; blink_delay_ = 3200 + random_ % 3000;
    }
    Frame out;
    out.gaze_x = std::lround(gaze_x_); out.gaze_y = std::lround(gaze_y_);
    out.eye_h = mood == Mood::LISTENING ? 176 : mood == Mood::THINKING ? 142 : 156;
    if (happy) out.eye_h = 56;
    if (mood == Mood::ERROR) out.eye_h = 88;
    if (mood == Mood::OFFLINE) out.eye_h = 94;
    if (mood == Mood::PRIVACY) out.eye_h = 16;
    out.eye_rh = out.eye_h;
    if (!reduced && alive && !happy && blink_age >= blink_delay_ && blink_age <= blink_delay_ + 160) {
      const float t = float(blink_age - blink_delay_) / 160.f;
      out.eye_h = out.eye_rh = std::lround(12 + (out.eye_h - 12) * std::abs(2 * t - 1));
    }
    if (mood == Mood::THINKING) { out.eye_rh = std::max(12, out.eye_rh - 18); out.brow_y = -8; }
    out.pupil_h = std::min(54, std::max(0, out.eye_h - 20));
    float level = 0;
    if (mood == Mood::SPEAKING && std::isfinite(speaking)) level = bound(speaking / 100.f, 0, 1);
    if (mood == Mood::LISTENING && recent(now, mic_at_.load(std::memory_order_relaxed), 200))
      level = mic_level_.load(std::memory_order_relaxed);
    envelope_ += (level - envelope_) * (dt/(level > envelope_ ? 24.f+dt : 95.f+dt));
    out.smile = mood == Mood::IDLE || happy;
    out.mouth_w = happy ? 126 : voice ? 76 : 100;
    out.mouth_h = happy ? 42 : voice ? 14 + std::lround(envelope_ * 50) : 28;
    if (mood == Mood::ERROR || mood == Mood::OFFLINE || mood == Mood::PRIVACY) out.mouth_h = 8;
    if (reduced && voice) out.mouth_h = 16;
    out.cheeks = happy;
    if (alive && !voice && !reduced && motion_on && has_shake_ && recent(now,shake_at_,1600)) {
      const float age=float(uint32_t(now-shake_at_));
      out.sway=std::lround(8.f*std::sin(age*.014f)*(1.f-age/1600.f));
      out.brow_y=out.sway;
    }
    out.dot = !reduced && mood == Mood::THINKING ? (now / 350) % 3 : 1;
    return out;
  }
 private:
  float gaze_x_{0}, gaze_y_{0}, envelope_{0};
  std::atomic<float> mic_level_{0};
  std::atomic<uint32_t> mic_at_{0};
  uint32_t reaction_at_{0}, shake_at_{0}, frame_at_{0}, blink_at_{0}, blink_delay_{3500}, random_{0x4F5759};
  bool has_shake_{false}, shake_event_{false}, has_reaction_{false}, has_frame_{false}, blink_scheduled_{false};
};
}  // namespace owy
