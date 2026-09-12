// Right-handed body-to-world quaternion. Gravity is R^T * world +Z; gyro
// is body angular velocity, degrees/second, matching native ESPHome units.
const mul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
];
const conjugate = (q) => [q[0], -q[1], -q[2], -q[3]];
export function orientation([roll, pitch, yaw]) {
  const [r, p, y] = [roll, pitch, yaw].map((v) => (v * Math.PI) / 360);
  return mul(mul([Math.cos(y), 0, 0, Math.sin(y)], [Math.cos(p), 0, Math.sin(p), 0]), [Math.cos(r), Math.sin(r), 0, 0]);
}
export function poseMotion(from, to, time, duration = 400) {
  const start = orientation(from),
    end = orientation(to);
  let dot = start.reduce((s, v, i) => s + v * end[i], 0);
  if (dot < 0) {
    for (let i = 0; i < 4; i++) end[i] *= -1;
    dot = -dot;
  }
  const angle = Math.acos(Math.min(1, dot));
  let previous = start;
  const events = [];
  for (let t = 10; t <= duration; t += 10) {
    const u = t / duration;
    const eased = u * u * (3 - 2 * u);
    let q = start.map((v, i) =>
      angle < 1e-6
        ? v + (end[i] - v) * eased
        : (v * Math.sin((1 - eased) * angle) + end[i] * Math.sin(eased * angle)) / Math.sin(angle)
    );
    const norm = Math.hypot(...q);
    q = q.map((v) => v / norm);
    const gravity = mul(mul(conjugate(q), [0, 0, 0, 1]), q).slice(1);
    const delta = mul(conjugate(previous), q);
    const s = Math.hypot(...delta.slice(1));
    const scale = s < 1e-9 ? 0 : (2 * Math.atan2(s, delta[0]) * 180) / Math.PI / 0.01 / s;
    events.push({ t: time + t, type: "imu", values: [...gravity, ...delta.slice(1).map((v) => v * scale)] });
    previous = q;
  }
  const g = mul(mul(conjugate(end), [0, 0, 0, 1]), end).slice(1);
  events.push({ t: time + duration + 10, type: "imu", values: [...g, 0, 0, 0] });
  return events;
}
export function shakeMotion(time) {
  return [0, 100, 110, 220, 230, 340, 350].map((t, i) => ({
    t: time + t,
    type: "imu",
    values: [[0, 1, 0, -1, 0, 1, 0][i], 0, 1, 0, 0, 0],
  }));
}
