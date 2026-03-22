import React, { useRef, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import { Button, Card, CardHeader, CardTitle, CardBody, Input, Badge, Alert, Spinner } from './ui';
import { api } from '../utils/api';
import { Camera, Upload, FlipHorizontal2, Eye, EyeOff, UserCheck, AlertTriangle, Check, Info } from 'lucide-react';

const MAX   = 10;
const HINTS = ['Front', 'Left', 'Right', 'Tilt up', 'With mask', 'With glasses'];

export function Register() {
  const wRef  = useRef(null);
  const fRef  = useRef(null);

  const [name,    setName]    = useState('');
  const [sid,     setSid]     = useState('');
  const [dept,    setDept]    = useState('');
  const [photos,  setPhotos]  = useState([]);
  const [load,    setLoad]    = useState(false);
  const [msg,     setMsg]     = useState(null);   // { type, text, dupInfo? }
  const [facing,  setFacing]  = useState('user');
  const [showCam, setShowCam] = useState(true);

  const capture = useCallback(() => {
    if (photos.length >= MAX) return;
    const src = wRef.current?.getScreenshot({ width: 640, height: 480 });
    if (!src) return;
    fetch(src).then(r => r.blob()).then(b => setPhotos(p => [...p, { blob: b, url: src }]));
  }, [photos.length]);

  const onFiles = e => {
    const fs = Array.from(e.target.files || []).slice(0, MAX - photos.length);
    setPhotos(p => [...p, ...fs.map(f => ({ blob: f, url: URL.createObjectURL(f) }))].slice(0, MAX));
    e.target.value = '';
  };

  const submit = async () => {
    if (!name.trim())   return setMsg({ type: 'error', text: 'Name is required.' });
    if (!photos.length) return setMsg({ type: 'error', text: 'Add at least 1 photo.' });
    setLoad(true);
    setMsg(null);
    const form = new FormData();
    form.append('name',       name.trim());
    form.append('student_id', sid.trim());
    form.append('department', dept.trim());
    photos.forEach((p, i) => form.append(`image_${i}`, p.blob, `p${i}.jpg`));
    try {
      const r = await api.register(form);
      setMsg({ type: 'success', text: r.message });
      setName(''); setSid(''); setDept(''); setPhotos([]);
    } catch (e) {
      // Parse error body — api.js throws with JSON or plain string
      let text    = e.message || 'Registration failed.';
      let type    = 'error';
      let dupInfo = null;
      try {
        const body = typeof e.message === 'string' && e.message.startsWith('{')
          ? JSON.parse(e.message)
          : e.data || {};
        if (body.error)     text    = body.error;
        if (body.duplicate) { dupInfo = body.duplicate; type = 'duplicate'; }
      } catch {}
      // 409 duplicate — show warning but DO NOT crash or lock the form
      setMsg({ type, text, dupInfo });
    } finally {
      setLoad(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Register Student</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Capture multiple angles for best recognition accuracy</p>
      </div>

      {/* Details card */}
      <Card>
        <CardHeader><CardTitle>Student Details</CardTitle></CardHeader>
        <CardBody className="space-y-3">
          <Input label="Full Name *" placeholder="e.g. Yash Tomar" value={name} onChange={e => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Student ID" placeholder="CS2201" value={sid} onChange={e => setSid(e.target.value)} />
            <Input label="Department" placeholder="CSE" value={dept} onChange={e => setDept(e.target.value)} />
          </div>
        </CardBody>
      </Card>

      {/* Photo capture */}
      <Card>
        <CardHeader>
          <CardTitle>Face Photos ({photos.length}/{MAX})</CardTitle>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowCam(v => !v)}>
              {showCam ? <><EyeOff size={13} /> Hide cam</> : <><Eye size={13} /> Show cam</>}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setFacing(f => f==='user'?'environment':'user')}>
              <FlipHorizontal2 size={13} />
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-3">
          {showCam && (
            <>
              <div className="camera-wrapper" style={{ aspectRatio: '4/3' }}>
                <Webcam ref={wRef} screenshotFormat="image/jpeg"
                  videoConstraints={{ width: 640, height: 480, facingMode: facing }}
                  mirrored={facing === 'user'} className="cam-contain" />
              </div>
              <Button className="w-full" size="sm" onClick={capture} disabled={photos.length >= MAX}>
                <Camera size={14} /> Capture Photo
              </Button>
            </>
          )}
          <div className="flex flex-wrap gap-1.5">
            {HINTS.map(h => (
              <span key={h} className="text-[10px] border border-border rounded-full px-2 py-0.5 text-muted-foreground">{h}</span>
            ))}
          </div>
          <input ref={fRef} type="file" accept="image/*" multiple className="hidden" onChange={onFiles} />
          <Button variant="outline" size="sm" className="w-full" onClick={() => fRef.current?.click()}>
            <Upload size={13} /> Upload from Gallery
          </Button>
        </CardBody>
      </Card>

      {/* Thumbnails */}
      {photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Captured Photos</CardTitle>
            <Badge variant={photos.length >= 5 ? 'green' : 'yellow'}>
              {photos.length >= 5 ? <><Check size={10} className="mr-1" />Good quality</> : `${5-photos.length} more recommended`}
            </Badge>
          </CardHeader>
          <CardBody>
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={i} className="photo-thumb">
                  <img src={p.url} alt="" />
                  <button className="remove" onClick={() => setPhotos(prev => prev.filter((_,j)=>j!==i))}>&times;</button>
                </div>
              ))}
              {photos.length < MAX && (
                <button className="photo-add" onClick={() => fRef.current?.click()}>+</button>
              )}
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── Messages — non-blocking, form stays fully usable ── */}
      {msg && (
        <div className={`flex gap-3 p-3 rounded-xl border text-sm ${
          msg.type === 'success'   ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200' :
          msg.type === 'duplicate' ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200' :
                                     'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
        }`}>
          <div className="flex-shrink-0 mt-0.5">
            {msg.type === 'success'   && <UserCheck size={15} />}
            {msg.type === 'duplicate' && <Info size={15} />}
            {msg.type === 'error'     && <AlertTriangle size={15} />}
          </div>
          <div className="flex-1 min-w-0">
            {msg.type === 'duplicate' ? (
              <>
                <p className="font-medium text-sm">Face already registered</p>
                <p className="text-xs mt-0.5 opacity-90 leading-relaxed">{msg.text}</p>
                {msg.dupInfo && (
                  <div className="mt-2 text-xs space-y-0.5 opacity-80">
                    <p>Existing: <span className="font-semibold">{msg.dupInfo.name}</span>
                      {msg.dupInfo.student_id ? ` (${msg.dupInfo.student_id})` : ''} — {msg.dupInfo.confidence}% match</p>
                    <p className="opacity-70">If this is a different person, use a clearer front-facing photo.</p>
                  </div>
                )}
                {/* Allow dismissing — form is still active */}
                <button className="mt-2 text-xs underline opacity-60 hover:opacity-100" onClick={() => setMsg(null)}>
                  Dismiss and continue editing
                </button>
              </>
            ) : (
              <p>{msg.text}</p>
            )}
          </div>
        </div>
      )}

      <Button className="w-full" disabled={load || !name.trim() || !photos.length} onClick={submit}>
        {load
          ? <><Spinner size={14} /> Registering…</>
          : <><UserCheck size={14} /> Register · {photos.length} photo{photos.length!==1?'s':''}</>
        }
      </Button>
    </div>
  );
}

export default Register;
