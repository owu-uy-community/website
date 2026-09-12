#pragma once
#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>

namespace owy {
struct Vec3 {
  float x{0}, y{0}, z{0};
  Vec3 operator+(Vec3 b) const { return {x+b.x, y+b.y, z+b.z}; }
  Vec3 operator-(Vec3 b) const { return {x-b.x, y-b.y, z-b.z}; }
  Vec3 operator*(float s) const { return {x*s, y*s, z*s}; }
  float length() const { return std::sqrt(x*x + y*y + z*z); }
  Vec3 unit() const { const float n=length(); return n>.0001f ? *this*(1.f/n) : Vec3{0,0,1}; }
  bool finite() const { return std::isfinite(x) && std::isfinite(y) && std::isfinite(z); }
  static Vec3 cross(Vec3 a, Vec3 b) { return {a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x}; }
};

// Measures callbacks, not panel FPS or unique sensor samples. Wrap-safe clock.
struct Cadence {
  void tick(uint32_t now) { if (seen) max_gap=std::max(max_gap,uint32_t(now-last)); last=now; seen=true; ++count; }
  float read(uint32_t now) {
    const uint32_t elapsed=now-since;
    const float hz=elapsed ? count*1000.f/elapsed : 0;
    since=now; count=0; return hz;
  }
  uint32_t take_gap() { const auto v=max_gap; max_gap=0; return v; }
  uint32_t count{0}, last{0}, since{0}, max_gap{0};
  bool seen{false};
};

// 6-axis tilt, NOT absolute heading. ESPHome supplies g and degrees/second.
// Native polling has no FIFO/timestamps/sample lock: integrate measured host dt,
// reject implausible samples, never claim measurement-grade inertial navigation.
class MotionTracker {
 public:
  enum class Calibration { IDLE, SETTLING, COLLECTING, SUCCESS, TIMEOUT, CANCELLED };
  Calibration calibration{Calibration::IDLE};
  const char *calibration_name() const {
    switch (calibration) {
      case Calibration::SETTLING: return "settling";
      case Calibration::COLLECTING: return "collecting";
      case Calibration::SUCCESS: return "success";
      case Calibration::TIMEOUT: return "timeout";
      case Calibration::CANCELLED: return "cancelled";
      default: return "idle";
    }
  }
  const char *calibration_message() const {
    switch (calibration) {
      case Calibration::SETTLING: return "Dejame quietito.\nSi me movés, vuelvo\na empezar la medición.";
      case Calibration::COLLECTING: return "Midiendo el movimiento...\nManteneme quietito\nun poquito más.";
      case Calibration::SUCCESS: return "¡Listo! Mirada centrada\ny movimiento calibrado.\nLo recordaré al encender.";
      case Calibration::TIMEOUT: return "No pude medir sin movimiento.\nApoyame y probá de nuevo.\nConservé el ajuste anterior.";
      default: return "Apoyame en una superficie\nestable, mirando al frente.\nLuego tocá Comenzar.";
    }
  }
  bool calibrating() const { return calibration==Calibration::SETTLING || calibration==Calibration::COLLECTING; }
  void begin_calibration(uint32_t now) {
    calibration=Calibration::SETTLING; calibration_at_=now; reset_collection(); reset_shake();
  }
  void cancel_calibration() { if (calibrating()) calibration=Calibration::CANCELLED; reset_collection(); }
  void tick_calibration(uint32_t now) {
    if (!calibrating()) return;
    if (uint32_t(now-calibration_at_)>=15000) { calibration=Calibration::TIMEOUT; reset_collection(); }
    else if (collect_count_ && uint32_t(now-collect_last_)>100) reset_collection();
  }
  int calibration_progress(uint32_t now) const {
    return calibrating() && collect_count_ ? std::min(99, int(uint32_t(now-collect_at_)*100/2000)) :
        calibration==Calibration::SUCCESS ? 100 : 0;
  }
  // Persist only explicit successful calibration, never partially collected data.
  Vec3 neutral() const { return neutral_; }
  bool restore_calibration(Vec3 bias, Vec3 neutral) {
    if (!bias.finite() || !neutral.finite() || bias.length()>=12 || std::abs(neutral.length()-1)>.02f) return false;
    bias_=bias; neutral_=neutral.unit(); centered_=bias_calibrated_=true; return true;
  }
  Cadence cadence;
  bool update(Vec3 a, Vec3 w, uint32_t now, bool reactions) {
    tick_calibration(now);
    if (!a.finite() || !w.finite() || a.length()>14.f || w.length()>850.f) { reset_shake(); reset_collection(); return false; }
    cadence.tick(now);
    const float norm=a.length();
    if (!started_) { started_=true; started_at_=now; }
    // QST gyro start-up: 150 ms + 3 sample periods; allow 300 ms settling.
    if (uint32_t(now-started_at_)<300) return false;
    const uint32_t elapsed=now-at_;
    if (!ready_ || elapsed>100) {
      reset_shake(); still_=false;
      if (norm<.85f || norm>1.15f) { ready_=false; return false; }
      gravity_=a.unit(); at_=now; ready_=true;
      if (!centered_) { neutral_=gravity_; centered_=true; }
      return false;
    }
    if (!elapsed) return false;
    at_=now;
    const float dt=elapsed*.001f;
    const bool measuring=calibrating();
    if (measuring) collect_calibration(a,w,now);
    // Learn offset only after sustained stable acceleration AND stable gyro.
    // Anchor prevents a slow deliberate tilt being mistaken for stationary noise.
    if (!measuring && std::abs(norm-1.f)<.06f && w.length()<12.f &&
        (!still_ || ((a-still_a_).length()<.012f && (w-still_w_).length()<.5f))) {
      if (!still_) { still_=true; still_at_=now; still_a_=a; still_w_=w; }
      if (uint32_t(now-still_at_)>1500) {
        if (!bias_calibrated_) { bias_=still_w_; gravity_=a.unit(); bias_calibrated_=true; }
        else bias_=bias_+(w-bias_)*(dt/(30.f+dt));
      }
    } else { still_=false; }
    rate_=w-bias_;
    // Rodrigues transport of world gravity into the rotating right-handed body
    // frame: g x omega. Screen-axis reversal is applied AFTER fusion.
    const Vec3 omega=rate_*.01745329252f;
    const float speed=omega.length(), angle=speed*dt;
    if (speed>.00001f) {
      const Vec3 axis=omega*(1.f/speed), old=gravity_;
      const float dot=old.x*axis.x+old.y*axis.y+old.z*axis.z;
      gravity_=(old*std::cos(angle)+Vec3::cross(old,axis)*std::sin(angle)+axis*(dot*(1-std::cos(angle)))).unit();
    }
    const Vec3 linear=a-gravity_;
    // Norm alone cannot reject horizontal acceleration. Also gate innovation;
    // sustained linear acceleration is fundamentally ambiguous without more sensors.
    const float confidence=std::max(0.f,1.f-std::abs(norm-1.f)/.20f)*
        std::max(0.f,1.f-linear.length()/.35f);
    if (norm>.5f && confidence>0) gravity_=(gravity_+(a.unit()-gravity_)*(dt/(.65f+dt)*confidence)).unit();
    if (!reactions || measuring) { reset_shake(); return false; }
    return shake(linear, now);
  }
  bool ok(uint32_t now) const { return ready_ && uint32_t(now-at_)<500; }
  Vec3 gravity() const { return gravity_; }
  Vec3 offset() const { return gravity_-neutral_; }
  Vec3 rate() const { return rate_; }
  Vec3 bias() const { return bias_; }
  void center() { if (ready_) { neutral_=gravity_; still_=false; } reset_shake(); }
 private:
  void reset_collection() {
    collect_count_=0; collect_a_={}; collect_w_={};
    if (calibrating()) calibration=Calibration::SETTLING;
  }
  void collect_calibration(Vec3 a, Vec3 w, uint32_t now) {
    // One second to release the screen, then TWO uninterrupted seconds on a
    // stable surface. Anchored acceleration rejects slowly accumulating tilt.
    if (uint32_t(now-calibration_at_)<1000) return;
    if (std::abs(a.length()-1)>.06f || w.length()>=12 ||
        (collect_count_ && ((a-collect_anchor_a_).length()>.02f || (w-collect_anchor_w_).length()>.6f))) {
      reset_collection(); return;
    }
    if (!collect_count_) { collect_at_=now; collect_anchor_a_=a; collect_anchor_w_=w; }
    collect_last_=now; ++collect_count_; collect_a_=collect_a_+a; collect_w_=collect_w_+w;
    calibration=Calibration::COLLECTING;
    if (uint32_t(now-collect_at_)>=2000 && collect_count_>=100) {
      bias_=collect_w_*(1.f/collect_count_); gravity_=neutral_=collect_a_.unit();
      rate_={}; centered_=bias_calibrated_=true; still_=false;
      calibration=Calibration::SUCCESS;
    }
  }
  void reset_shake() { peaks_=0; direction_={}; }
  bool shake(Vec3 linear, uint32_t now) {
    if (linear.length()<.18f) {
      if (!calm_) { calm_=true; calm_at_=now; }
      if (uint32_t(now-calm_at_)>=300) settled_=true;
    } else calm_=false;
    if (had_shake_ && (uint32_t(now-shake_at_)<4000 || !settled_)) { reset_shake(); return false; }
    if (peaks_ && (uint32_t(now-first_peak_)>1000 || uint32_t(now-last_peak_)>450)) reset_shake();
    if (!peaks_) {
      if (linear.length()<.75f) return false;
      // Lock projection direction for the whole gesture, not a new axis per sample.
      direction_=linear.unit(); sign_=1; peaks_=1; first_peak_=last_peak_=now;
      return false;
    }
    const float projected=linear.x*direction_.x+linear.y*direction_.y+linear.z*direction_.z;
    if (projected*sign_>-.75f || uint32_t(now-last_peak_)<80) return false;
    sign_=-sign_; last_peak_=now;
    if (++peaks_<3) return false;
    reset_shake(); shake_at_=now; had_shake_=true; settled_=calm_=false;
    return true;
  }
  Vec3 gravity_{0,0,1}, neutral_{0,0,1}, bias_{}, rate_{}, still_a_{}, still_w_{}, direction_{};
  Vec3 collect_a_{}, collect_w_{}, collect_anchor_a_{}, collect_anchor_w_{};
  uint32_t calibration_at_{0}, collect_at_{0}, collect_last_{0}, collect_count_{0};
  uint32_t started_at_{0}, at_{0}, still_at_{0}, first_peak_{0}, last_peak_{0}, shake_at_{0}, calm_at_{0};
  int peaks_{0}, sign_{1};
  bool started_{false}, ready_{false}, centered_{false}, still_{false}, bias_calibrated_{false}, had_shake_{false}, settled_{true}, calm_{false};
};
}  // namespace owy
