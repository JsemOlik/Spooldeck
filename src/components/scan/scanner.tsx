"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { CameraIcon, CameraOffIcon, ImageUpIcon, Loader2Icon, SwitchCameraIcon } from "lucide-react";
import { resolveScanAction } from "@/actions/scan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getQrDetector } from "./detector";

const OPEN_LOG_KEY = "spooldeck:scan-open-log";

const noopSubscribe = () => () => {};

function readOpenLog() {
  try {
    return localStorage.getItem(OPEN_LOG_KEY) !== "0";
  } catch {
    return true;
  }
}

function cameraSupported() {
  return window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
}

export function Scanner({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handledRef = useRef(false);
  const [active, setActive] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceIndex, setDeviceIndex] = useState(-1);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [unknownText, setUnknownText] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const storedOpenLog = useSyncExternalStore(noopSubscribe, readOpenLog, () => true);
  const [openLogOverride, setOpenLog] = useState<boolean | null>(null);
  const openLog = openLogOverride ?? storedOpenLog;
  const [pending, startTransition] = useTransition();
  const canUseCamera = useSyncExternalStore(noopSubscribe, cameraSupported, () => true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  }, []);

  useEffect(() => stop, [stop]);

  const handle = useCallback(
    (text: string) => {
      if (handledRef.current) return;
      handledRef.current = true;
      stop();
      navigator.vibrate?.(60);
      setError(null);
      setUnknownText(null);
      startTransition(async () => {
        const res = await resolveScanAction(text, openLog);
        if ("href" in res) {
          router.push(res.href);
        } else {
          handledRef.current = false;
          setError(res.error);
          setUnknownText(res.text ?? null);
        }
      });
    },
    [openLog, router, stop],
  );

  async function start(index = deviceIndex) {
    setError(null);
    setUnknownText(null);
    handledRef.current = false;
    try {
      stop();
      const deviceId = index >= 0 ? devices[index]?.deviceId : undefined;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setActive(true);
      const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      setDevices(all);
      const detector = await getQrDetector();
      const tick = async () => {
        if (!streamRef.current || handledRef.current) return;
        if (video.readyState >= 2) {
          try {
            const [hit] = await detector.detect(video);
            if (hit?.rawValue) return handle(hit.rawValue);
          } catch {
            // transient decode errors are fine
          }
        }
        setTimeout(tick, 150);
      };
      tick();
    } catch (e) {
      stop();
      const name = e instanceof DOMException ? e.name : "";
      setError(
        name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in your browser settings, or use a photo instead."
          : name === "NotFoundError"
            ? "No camera found. Use a photo or paste the link instead."
            : "Couldn't start the camera. Use a photo or paste the link instead.",
      );
    }
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUnknownText(null);
    handledRef.current = false;
    try {
      const bitmap = await createImageBitmap(file);
      const detector = await getQrDetector();
      const [hit] = await detector.detect(bitmap);
      bitmap.close();
      if (hit?.rawValue) handle(hit.rawValue);
      else setError("No QR code found in that photo. Try again closer and in focus.");
    } catch {
      setError("Couldn't read that image.");
    }
  }

  return (
    <div className="grid gap-4">
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-2xl border bg-black">
        <video ref={videoRef} playsInline muted className={active ? "size-full object-cover" : "hidden"} />
        {active && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="size-3/5 rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
          </div>
        )}
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white/80">
            {pending ? (
              <Loader2Icon className="size-10 animate-spin" />
            ) : canUseCamera ? (
              <>
                <CameraIcon className="size-10" />
                <Button size="lg" onClick={() => start()}>
                  Start camera
                </Button>
              </>
            ) : (
              <>
                <CameraOffIcon className="size-10" />
                <p className="text-sm">
                  Live scanning needs HTTPS (or localhost). Take a photo of the code instead, or scan a Spooldeck label with your phone&apos;s
                  camera app.
                </p>
              </>
            )}
          </div>
        )}
        {active && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-3">
            {devices.length > 1 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const next = (deviceIndex + 1) % devices.length;
                  setDeviceIndex(next);
                  start(next);
                }}
              >
                <SwitchCameraIcon />
                Switch
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={stop}>
              Stop
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-destructive/10 text-destructive mx-auto w-full max-w-md rounded-lg px-3 py-2 text-sm">
          {error}
          {unknownText && <div className="text-muted-foreground mt-1 font-mono text-xs break-all">{unknownText}</div>}
        </div>
      )}

      <div className="mx-auto grid w-full max-w-md gap-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="open-log" className="font-normal">
            Open “Log usage” after scanning
          </Label>
          <Switch
            id="open-log"
            checked={openLog}
            onCheckedChange={(v) => {
              setOpenLog(v);
              try {
                localStorage.setItem(OPEN_LOG_KEY, v ? "1" : "0");
              } catch {
                // ignore
              }
            }}
          />
        </div>
        <Button variant="outline" size="lg" asChild>
          <label className="cursor-pointer">
            <ImageUpIcon />
            Scan from a photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                onPhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </Button>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) {
              handledRef.current = false;
              handle(manual.trim());
            }
          }}
        >
          <Input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Paste a Prusament link or type a spool code"
            aria-label="Prusament link or spool code"
          />
          <Button type="submit" disabled={pending || !manual.trim()}>
            Go
          </Button>
        </form>
      </div>
    </div>
  );
}
