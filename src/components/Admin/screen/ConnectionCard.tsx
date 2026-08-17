"use client";

import { Button } from "components/shared/ui/button";
import { Input } from "components/shared/ui/input";
import { Label } from "components/shared/ui/label";
import { motion, AnimatePresence } from "motion/react";

interface ConnectionCardProps {
  showConnectionSettings: boolean;
  obsAddress: string;
  obsPort: string;
  obsPassword: string;
  screenshotDelay: string;
  streamFps: string;
  streamQuality: string;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  setObsAddress: (value: string) => void;
  setObsPort: (value: string) => void;
  setObsPassword: (value: string) => void;
  setScreenshotDelay: (value: string) => void;
  setStreamFps: (value: string) => void;
  setStreamQuality: (value: string) => void;
  disconnect: () => void;
  handleConnect: () => void;
}

export function ConnectionCard({
  showConnectionSettings,
  obsAddress,
  obsPort,
  obsPassword,
  screenshotDelay,
  streamFps,
  streamQuality,
  isConnected,
  isConnecting,
  error,
  setObsAddress,
  setObsPort,
  setObsPassword,
  setScreenshotDelay,
  setStreamFps,
  setStreamQuality,
  disconnect,
  handleConnect,
}: ConnectionCardProps) {
  return (
    <AnimatePresence>
      {showConnectionSettings && (
        <motion.div className="rounded-xl border border-border bg-card p-4 backdrop-blur-xs">
          <h3 className="mb-3 text-sm font-medium text-white">OBS Connection Settings</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <Label htmlFor="obs-address" className="text-xs text-white/70">
                Address
              </Label>
              <Input
                id="obs-address"
                value={obsAddress}
                onChange={(e) => setObsAddress(e.target.value)}
                placeholder="localhost"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
            </div>
            <div>
              <Label htmlFor="obs-port" className="text-xs text-white/70">
                Port
              </Label>
              <Input
                id="obs-port"
                value={obsPort}
                onChange={(e) => setObsPort(e.target.value)}
                placeholder="4455"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
            </div>
            <div>
              <Label htmlFor="obs-password" className="text-xs text-white/70">
                Password (optional)
              </Label>
              <Input
                id="obs-password"
                type="password"
                value={obsPassword}
                onChange={(e) => setObsPassword(e.target.value)}
                placeholder="Enter password"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
            </div>
            <div>
              <Label htmlFor="screenshot-delay" className="text-xs text-white/70">
                Screenshot Delay (ms)
              </Label>
              <Input
                id="screenshot-delay"
                type="number"
                value={screenshotDelay}
                onChange={(e) => setScreenshotDelay(e.target.value)}
                placeholder="1000"
                min="0"
                max="5000"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end">
              {isConnected ? (
                <Button
                  onClick={disconnect}
                  className="h-8 flex-1 bg-red-500/20 text-xs text-red-400 hover:bg-red-500/30"
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="h-8 flex-1 bg-green-500/20 text-xs text-green-400 hover:bg-green-500/30"
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              )}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label htmlFor="stream-fps" className="text-xs text-white/70">
                Player FPS
              </Label>
              <Input
                id="stream-fps"
                type="number"
                value={streamFps}
                onChange={(e) => setStreamFps(e.target.value)}
                placeholder="15"
                min="1"
                max="15"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
              <p className="mt-1 text-xs text-white/50">Frames per second (1-15 max)</p>
            </div>
            <div>
              <Label htmlFor="stream-quality" className="text-xs text-white/70">
                JPEG Quality
              </Label>
              <Input
                id="stream-quality"
                type="number"
                value={streamQuality}
                onChange={(e) => setStreamQuality(e.target.value)}
                placeholder="85"
                min="1"
                max="100"
                className="h-8 border-border bg-white/10 text-sm text-white"
              />
              <p className="mt-1 text-xs text-white/50">Image quality (1-100)</p>
            </div>
          </div>
          <div className="mt-2 rounded-lg bg-blue-500/10 p-2">
            <p className="text-xs text-blue-400">
              💡 Player Mode uses OBS WebSocket screenshots - no additional server needed!
            </p>
          </div>
          {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
