import { poseMotion, shakeMotion } from "./pose.mjs";
const e = (t, type, values = [], text) => ({ t, type, values, ...(text ? { text } : {}) });
export const scenarios = [
  {
    id: "hello",
    name: "A little hello",
    detail: "Tilt, blink, pet, and a deliberate shake.",
    duration: 7000,
    events: [
      e(0, "setting", [0], "continuous"),
      ...poseMotion([0, 0, 0], [14, -20, 0], 700),
      e(2100, "pet"),
      ...poseMotion([14, -20, 0], [0, 0, 0], 3700),
      ...shakeMotion(5000),
    ],
  },
  {
    id: "conversation",
    name: "Keep the conversation going",
    detail: "Three replies, speaker drain, then eight seconds of silence.",
    duration: 20500,
    events: [e(500, "wake"), e(1500, "speech", [3, 1200])],
  },
  {
    id: "calibration",
    name: "Find my center",
    detail: "An off-center pose with 2°/s gyro bias. Measure and retain neutral.",
    duration: 7500,
    events: [e(600, "imu", [0.3, 0, Math.sqrt(0.91), 2, -1, 0.5]), e(900, "calibrate")],
  },
  {
    id: "calibration-motion",
    name: "Too wiggly to calibrate",
    detail: "Moving samples must not replace the previous calibration.",
    duration: 18000,
    events: [
      e(500, "calibrate"),
      ...Array.from({ length: 165 }, (_, i) =>
        e(1500 + i * 100, "imu", [i % 2 ? 0.3 : -0.3, 0, Math.sqrt(0.91), 0, 0, 0])
      ),
    ],
  },
  {
    id: "privacy",
    name: "Privacy, mid-reply",
    detail: "Cancel playback and block subsequent wake attempts.",
    duration: 6000,
    events: [e(500, "wake"), e(1500, "speech", [1, 5000]), e(3000, "setting", [1], "privacy"), e(4000, "wake")],
  },
  {
    id: "driver",
    name: "The speaker is late",
    detail: "Injected driver-start failure exercises the modeled recovery path.",
    duration: 5000,
    events: [e(0, "fault", [1, 0, 0]), e(500, "wake")],
  },
  {
    id: "drain",
    name: "RUN_END is not STOPPED",
    detail: "A stuck speaker drain must not reopen the microphone.",
    duration: 8000,
    events: [e(0, "fault", [0, 1, 0]), e(500, "wake"), e(1500, "speech", [1, 1200])],
  },
  {
    id: "transport",
    name: "A burst on the wire",
    detail: "The real pacer, a 700 ms transport pause, then a 32 KiB receiver.",
    duration: 23500,
    events: [
      e(0, "setting", [0], "continuous"),
      e(0, "transport", [700, 0]),
      e(500, "wake"),
      e(1500, "speech", [1, 20000]),
    ],
  },
  {
    id: "ready-timeout",
    name: "Waiting for the audio bus",
    detail: "The real VoiceTurn readiness gate times out without opening TTS.",
    duration: 8000,
    events: [e(0, "transport", [0, 1]), e(500, "wake"), e(1500, "speech", [1, 1200])],
  },
  {
    id: "imu-gap",
    name: "Sensor unplugged",
    detail: "Stop IMU samples, let gaze settle, then reacquire gravity.",
    duration: 7000,
    events: [...poseMotion([0, 0, 0], [0, -25, 0], 600), e(2100, "imuAvailable", [0]), e(5000, "imuAvailable", [1])],
  },
  {
    id: "offline",
    name: "Lost the connection",
    detail: "Disconnect while listening and reconnect safely.",
    duration: 6000,
    events: [e(500, "wake"), e(2000, "connection", [0]), e(4200, "connection", [1])],
  },
  {
    id: "staff",
    name: "The staff door",
    detail: "Wrong PIN, fixture PIN 1234, then the settings screen.",
    duration: 5000,
    events: [
      e(500, "page", [], "pin"),
      e(700, "pin", [], "9"),
      e(900, "pin", [], "OK"),
      ...[1, 2, 3, 4].map((k, i) => e(2500 + i * 180, "pin", [], String(k))),
      e(3500, "pin", [], "OK"),
    ],
  },
  {
    id: "power",
    name: "Battery & rest",
    detail: "Charging, low battery, and the two-minute idle dimmer.",
    duration: 123000,
    events: [
      e(500, "powerTelemetry", [0x28, 0x20, 72, 31]),
      e(700, "page", [], "quick"),
      e(4000, "powerTelemetry", [0x08, 0x40, 12, 31]),
    ],
  },
  {
    id: "long-reply",
    name: "A long story",
    detail: "Twenty seconds of modeled playback, with motion still active.",
    duration: 24000,
    events: [
      e(0, "setting", [0], "continuous"),
      e(500, "wake"),
      e(1500, "speech", [1, 20000]),
      ...poseMotion([0, 0, 0], [20, 25, 0], 7000),
      ...poseMotion([20, 25, 0], [0, 0, 0], 15000),
    ],
  },
];
