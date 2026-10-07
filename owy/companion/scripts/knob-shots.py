#!/usr/bin/env python3
"""Receive screenshots from the Owy Knob and save them as PNG.

The firmware's `Captura de pantalla` button POSTs the active LVGL screen as raw
little-endian RGB565 (header `X-Size: WxH`) to ${screenshot_url}. Run this on
the laptop named there, then press the button (web UI, API, or
`curl -X POST -H 'Content-Length: 0' http://owy-knob.local/button/Captura%20de%20pantalla/press`).

    python3 owy/companion/scripts/knob-shots.py [--port 8787] [--out /tmp/knob-shots] [--name face-idle]

Stdlib only on purpose: run it with Apple's /usr/bin/python3, which the macOS
firewall lets receive LAN connections (Homebrew/venv pythons get their packets
silently dropped unless allowed in System Settings → Firewall).
"""
import argparse
import datetime as dt
import os
import struct
import sys
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def rgb565_to_png(data: bytes, width: int, height: int) -> bytes:
    """Little-endian RGB565 → 8-bit RGB PNG (no dependencies)."""
    rows = bytearray()
    for y in range(height):
        rows.append(0)  # filter: none
        row = memoryview(data)[y * width * 2:(y + 1) * width * 2]
        for px in struct.unpack(f"<{width}H", row):
            rows += bytes(((px >> 8) & 0xF8, (px >> 3) & 0xFC, (px << 3) & 0xF8))

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(rows), 6)) + chunk(b"IEND", b"")


class Handler(BaseHTTPRequestHandler):
    out = "/tmp/knob-shots"
    name = None

    def read_body(self) -> bytes:
        if self.headers.get("Transfer-Encoding", "").lower() == "chunked":
            chunks = []
            while True:
                size = int(self.rfile.readline().strip().split(b";")[0] or b"0", 16)
                if size == 0:
                    self.rfile.readline()
                    return b"".join(chunks)
                chunks.append(self.rfile.read(size))
                self.rfile.readline()
        return self.rfile.read(int(self.headers.get("Content-Length", "0")))

    def do_POST(self):  # noqa: N802 (http.server API)
        print(f"{self.client_address[0]} POST {self.path} {dict(self.headers)}", flush=True)
        body = self.read_body()
        print(f"  body {len(body)} B", flush=True)
        size = self.headers.get("X-Size", "360x360")
        width, height = (int(v) for v in size.lower().split("x"))
        if len(body) != width * height * 2:
            self.send_response(400)
            self.send_header("Content-Length", "0")
            self.end_headers()
            print(f"bad body: {len(body)} B for {size}", file=sys.stderr)
            return
        os.makedirs(self.out, exist_ok=True)
        stamp = dt.datetime.now().strftime("%H%M%S")
        base = f"{stamp}-{self.name}" if self.name else stamp
        path = os.path.join(self.out, f"{base}.png")
        with open(path, "wb") as f:
            f.write(rgb565_to_png(body, width, height))
        print(path, flush=True)
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *_):  # quiet
        return


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8787)
    parser.add_argument("--out", default="/tmp/knob-shots")
    parser.add_argument("--name", default=None, help="suffix for the next files")
    args = parser.parse_args()
    Handler.out = args.out
    Handler.name = args.name
    print(f"listening on :{args.port} → {args.out}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", args.port), Handler).serve_forever()


if __name__ == "__main__":
    main()
