#!/usr/bin/python3
"""Transparent TCP relay for macOS "Local Network" privacy workarounds.

macOS 26 blocks LAN connections from third-party binaries (node, Homebrew
python) whose responsible app was not granted "Local Network" access — CLI
tools in some embedded terminals inherit no app at all, so they can never be
approved. Apple-signed binaries are exempt, and /usr/bin/python3 is one of
them: this script listens on localhost and forwards every connection to the
device, so the bridge can use `owy-1@127.0.0.1:6053#...`.

    /usr/bin/python3 companion/bridge/scripts/lan-relay.py --target 192.168.1.211
    /usr/bin/python3 companion/bridge/scripts/lan-relay.py --target owy-companion.local --listen 127.0.0.1:6053

Run it with Apple's python (not Homebrew's). Only needed on macOS; at the venue
prefer running the bridge from Terminal.app/Ghostty with the permission granted.
"""

import argparse
import asyncio
import sys


async def pump(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break
            writer.write(data)
            await writer.drain()
    except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
        except Exception:
            pass


async def handle(client_reader, client_writer, target_host: str, target_port: int) -> None:
    peer = client_writer.get_extra_info("peername")
    try:
        target_reader, target_writer = await asyncio.open_connection(target_host, target_port)
    except OSError as error:
        print(f"relay: {peer} -> {target_host}:{target_port} failed: {error}", file=sys.stderr)
        client_writer.close()
        return
    print(f"relay: {peer} <-> {target_host}:{target_port}", file=sys.stderr)
    await asyncio.gather(
        pump(client_reader, target_writer),
        pump(target_reader, client_writer),
    )
    print(f"relay: {peer} closed", file=sys.stderr)


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--target", required=True, help="device host or IP (port defaults to 6053)")
    parser.add_argument("--listen", default="127.0.0.1:6053", help="local host:port to listen on")
    args = parser.parse_args()

    target_host, _, target_port = args.target.partition(":")
    listen_host, _, listen_port = args.listen.partition(":")
    tport = int(target_port or 6053)
    lport = int(listen_port or 6053)

    server = await asyncio.start_server(
        lambda r, w: handle(r, w, target_host, tport), listen_host or "127.0.0.1", lport
    )
    print(f"relay: listening on {listen_host or '127.0.0.1'}:{lport} -> {target_host}:{tport}", file=sys.stderr)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
