import React, { useRef, useState, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Badge, Toggle, Card, Alert, cn } from './ui';
import { api } from '../utils/api';
import { Play, Pause, FlipHorizontal2, Trash2, AlertTriangle, LogIn, LogOut, Hash } from 'lucide-react';

// ── THE KEY FIX ───────────────────────────────────────────────────────────────
// Old code: setInterval fires every 400ms unconditionally.
// If HF takes 1500ms, you accumulate 3-4 queued requests per device.
// With 2 devices that's 6-8 blocked Django threads = thread pool full = 499.
//
// Fix: scanInProgress ref acts as a mutex. If a scan is already awaiting
// the HF response, skip this interval tick entirely. This means the
// effective scan rate adapts to HF latency: if HF takes 1500ms, you
// naturally get one scan per ~1500ms instead of a queue of 4.
//
// The interval itself stays at 400ms — that's the POLLING rate, not the
// REQUEST rate. It just checks "can I fire?" not "fire now regardless".
const SCAN_MS = 400;

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function Scanner() {
  const webcamRef      = useRef(null);
  const canvasRef      = useRef(null);
  const fpsRef         = useRef({ n: 0, t: Date.now() });
  const stableDets     = useRef([]);
  const animFrameRef   = useRef(null);
  // THE GUARD — prevents concurrent in-flight requests
  const scanInProgress = useRef(false);

  const [mode,       setMode]       = useState('entry');
  const [paused,     setPaused]     = useState(false);
  const [facing,     setFacing]     = useState('user');
  const [detections, setDetections] = useState([]);
  const [log,        setLog]        = useState([]);
  const [fps,        setFps]        = useState(0);
  const [active,     setActive]     = useState(false);
  const [latency,    setLatency]    = useState(null);  // shows actual HF round-trip ms

  // ── Canvas bbox drawing ───────────────────────────────────────────────────
  const drawBoxes = useCallback((dets, cW, cH) => {
    const c = canvasRef.current;
    if (!c) return;
    c.width  = cW;
    c.height = cH;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, cW, cH);

    const scale = Math.min(cW / 320, cH / 240);
    const offX  = (cW - 320 * scale) / 2;
    const offY  = (cH - 240 * scale) / 2;

    dets.forEach(d => {
      if (!d.bbox) return;
      const [x1, y1, x2, y2] = d.bbox;
      const rx1 = offX + x1 * scale;
      const ry1 = offY + y1 * scale;
      const rw  = (x2 - x1) * scale;
      const rh  = (y2 - y1) * scale;

      const isKnown = d.name !== 'Unknown';
      const color   = isKnown ? '#22c55e' : '#ef4444';

      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.strokeRect(rx1, ry1, rw, rh);

      const cLen = Math.min(rw, rh) * 0.18;
      ctx.strokeStyle = color;
      ctx.lineWidth   = 3;
      ctx.beginPath(); ctx.moveTo(rx1, ry1 + cLen); ctx.lineTo(rx1, ry1); ctx.lineTo(rx1 + cLen, ry1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx1 + rw - cLen, ry1); ctx.lineTo(rx1 + rw, ry1); ctx.lineTo(rx1 + rw, ry1 + cLen); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx1, ry1 + rh - cLen); ctx.lineTo(rx1, ry1 + rh); ctx.lineTo(rx1 + cLen, ry1 + rh); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx1 + rw - cLen, ry1 + rh); ctx.lineTo(rx1 + rw, ry1 + rh); ctx.lineTo(rx1 + rw, ry1 + rh - cLen); ctx.stroke();

      ctx.font = 'bold 11px Inter, sans-serif';
      const label = isKnown
        ? `${d.name}  ${d.confidence}%${d.entry_count > 1 ? `  #${d.entry_count}` : ''}`
        : `Unknown  ${d.confidence}%`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color + 'ee';
      ctx.beginPath();
      ctx.roundRect(rx1, ry1 - 22, tw + 10, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(label, rx1 + 5, ry1 - 7);

      if (d.event_type && d.logged) {
        const tag = d.event_type.toUpperCase();
        const tw2 = ctx.measureText(tag).width;
        ctx.fillStyle = color + 'cc';
        ctx.beginPath();
        ctx.roundRect(rx1, ry1 + rh + 2, tw2 + 10, 18, 4);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillText(tag, rx1 + 5, ry1 + rh + 14);
      }
    });
  }, []);

  // ── Continuous animation loop ─────────────────────────────────────────────
  const drawLoop = useCallback(() => {
    const cont = canvasRef.current?.parentElement;
    if (cont) drawBoxes(stableDets.current, cont.clientWidth, cont.clientHeight);
    animFrameRef.current = requestAnimationFrame(drawLoop);
  }, [drawBoxes]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(drawLoop);
    return () => { if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current); };
  }, [drawLoop]);

  // ── Scan loop — with in-flight guard ─────────────────────────────────────
  const scan = useCallback(async () => {
    // Skip this tick if previous request is still waiting for HF response.
    // This is the ENTIRE fix for 499s and "stops with 2 devices".
    if (paused || !webcamRef.current || scanInProgress.current) return;

    const src = webcamRef.current.getScreenshot({ width: 320, height: 240 });
    if (!src) return;

    scanInProgress.current = true;
    const t0 = Date.now();

    try {
      const blob = await (await fetch(src)).blob();
      const form = new FormData();
      form.append('image', blob, 'f.jpg');
      form.append('event_type', mode);

      const res  = await api.scan(form);
      const dets = res.detections || [];

      // Show actual round-trip latency in the UI
      setLatency(Date.now() - t0);

      stableDets.current = dets;
      setDetections(dets);
      setActive(true);

      const marked = dets.filter(d => d.logged);
      if (marked.length) {
        const ts = new Date().toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        setLog(p => [...marked.map(d => ({ ...d, ts })), ...p].slice(0, 40));
      }

      fpsRef.current.n++;
      const now = Date.now();
      if (now - fpsRef.current.t >= 3000) {
        setFps(Math.round(fpsRef.current.n / ((now - fpsRef.current.t) / 1000)));
        fpsRef.current = { n: 0, t: now };
      }
    } catch {
      // On error, stableDets stays as-is (sticky) — boxes don't blink
    } finally {
      // Always release the lock, even on error
      scanInProgress.current = false;
    }
  }, [paused, mode]);

  useEffect(() => {
    const t = setInterval(scan, SCAN_MS);
    return () => clearInterval(t);
  }, [scan]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Live Scanner</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Continuous detection
          {fps > 0 && ` · ${fps} fps`}
          {latency != null && (
            <span className={cn(
              'ml-2 font-mono',
              latency < 800 ? 'text-green-500' : latency < 1500 ? 'text-yellow-500' : 'text-red-500'
            )}>
              {latency}ms
            </span>
          )}
        </p>
      </div>

      {/* Mode + status */}
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-muted-foreground flex-shrink-0">Mode</span>
        <Toggle
          value={mode}
          onChange={v => {
            setMode(v);
            stableDets.current = [];
            setDetections([]);
          }}
          options={[
            { value: 'entry', label: 'Entry' },
            { value: 'exit',  label: 'Exit'  },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span className={cn('dot dot-green', active && !paused ? 'dot-pulse' : '')} />
          <span>{active && !paused ? 'Live' : 'Paused'}</span>
        </div>
      </div>

      {/* Camera */}
      <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
        <Webcam
          ref={webcamRef}
          screenshotFormat="image/jpeg"
          videoConstraints={{ width: 320, height: 240, facingMode: facing }}
          mirrored={facing === 'user'}
          className="cam-contain"
        />
        <canvas ref={canvasRef} className="bbox-layer" />
        {active && !paused && <div className="scan-line" />}
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <Button
          variant={paused ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPaused(p => !p)}
        >
          {paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setFacing(f => f === 'user' ? 'environment' : 'user'); stableDets.current = []; }}
        >
          <FlipHorizontal2 size={13} /> Flip
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setLog([]); setDetections([]); stableDets.current = []; setLatency(null); }}
        >
          <Trash2 size={13} /> Clear
        </Button>
      </div>

      {/* Live face chips */}
      {detections.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {detections.map((d, i) => {
            const isKnown = d.name !== 'Unknown';
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 border rounded-full text-xs font-medium',
                  isKnown
                    ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                    : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300'
                )}
              >
                {isKnown ? <LogIn size={11} /> : <AlertTriangle size={11} />}
                {d.name} · {d.confidence}%
              </div>
            );
          })}
        </div>
      )}

      {/* Attendance event log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Attendance Events</h2>
          <Badge variant={mode === 'entry' ? 'green' : 'yellow'}>
            {mode === 'entry'
              ? <><LogIn size={10} className="mr-1" />Entry</>
              : <><LogOut size={10} className="mr-1" />Exit</>
            }
          </Badge>
        </div>

        {log.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No events yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Recognised faces will appear here</p>
          </div>
        ) : (
          <Card>
            {log.slice(0, 15).map((d, i) => (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors',
                  i < log.length - 1 ? 'border-b border-border' : ''
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                  d.name !== 'Unknown'
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
                    : 'bg-muted text-muted-foreground'
                )}>
                  {d.name !== 'Unknown' ? d.name[0].toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{d.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {[d.student_id, d.department].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {d.event_type === 'entry' && d.entry_count > 0 && (
                  <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                    <Hash size={9} />
                    <span className="font-mono">{ordinal(d.entry_count)}</span>
                  </div>
                )}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <Badge variant={d.event_type === 'entry' ? 'green' : 'yellow'}>
                    {d.event_type}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">{d.ts}</span>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
