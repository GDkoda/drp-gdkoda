import { forwardRef, memo, useImperativeHandle, useState } from "react";
import { Heart, Pause, Skull, Sparkles, Target, Timer, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FractalHudSnapshot = {
  hp: number;
  maxHp: number;
  xp: number;
  nextXp: number;
  level: number;
  kills: number;
  elapsed: number;
  moveSpeed: number;
  fps: number;
  visibleEnemies: number;
  phase: string;
  pressure: number;
  event: null | { id: number; remaining: number; progress: number; inside: boolean };
};

export type FractalHudHandle = {
  update: (snapshot: FractalHudSnapshot) => void;
};

export const INITIAL_FRACTAL_HUD: FractalHudSnapshot = {
  hp: 100,
  maxHp: 100,
  xp: 0,
  nextXp: 12,
  level: 1,
  kills: 0,
  elapsed: 0,
  moveSpeed: 205,
  fps: 0,
  visibleEnemies: 0,
  phase: "Exploração",
  pressure: 0,
  event: null,
};

type FractalHudProps = {
  initialSnapshot: FractalHudSnapshot;
  missionName: string;
  missionSubtitle: string;
  speedMultiplier: 1 | 2 | 3;
  canIncreaseSpeed: boolean;
  zoom: number;
  showPause: boolean;
  onSpeedDecrease: () => void;
  onSpeedIncrease: () => void;
  onZoomDecrease: () => void;
  onZoomIncrease: () => void;
  onPause: () => void;
};

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export const FractalHud = memo(
  forwardRef<FractalHudHandle, FractalHudProps>(function FractalHud(props, ref) {
    const [hud, setHud] = useState<FractalHudSnapshot>(props.initialSnapshot);
    useImperativeHandle(ref, () => ({ update: setHud }), []);

    return (
      <section className="fractals-hud-bar absolute inset-x-0 top-0" aria-label="Status da expedição">
        <div className="fractals-hud-zone fractals-hud-zone--left">
          <div className="fractals-hud-meter">
            <span className="fractals-hud-label"><Heart/> VIDA</span>
            <b>{Math.ceil(hud.hp)}<i>/{Math.ceil(hud.maxHp)}</i></b>
            <span className="fractals-hud-track"><i className="is-life" style={{width:`${Math.max(0, Math.min(1, hud.hp / Math.max(1, hud.maxHp))) * 100}%`}}/></span>
          </div>
          <div className="fractals-hud-meter">
            <span className="fractals-hud-label"><Sparkles/> NV.{hud.level} · XP</span>
            <b>{Math.floor(hud.xp)}<i>/{Math.floor(hud.nextXp)}</i></b>
            <span className="fractals-hud-track"><i className="is-xp" style={{width:`${Math.max(0, Math.min(1, Math.floor(hud.xp) / Math.max(1, Math.floor(hud.nextXp)))) * 100}%`}}/></span>
          </div>
          <div className="fractals-hud-kills"><Skull/><b>{hud.kills}</b><small>ABATES</small></div>
        </div>
        <div className="fractals-hud-zone fractals-hud-zone--center">
          <div className="fractals-hud-clock"><Timer/><b>{formatTime(hud.elapsed)}</b><small>/ 11:00</small></div>
          <div className="fractals-hud-density"><span className="fractals-live-dot"/><b>{hud.pressure.toFixed(1)}</b><small>DENSIDADE</small></div>
          <div className="fractals-hud-performance"><b>{hud.fps}</b><small>FPS</small><i>{hud.visibleEnemies}/50</i></div>
          {hud.event && <div className="fractals-hud-event"><Target/> {hud.event.id === 1 ? "RITUAL RÚNICO" : "CAÇADA DO ALGOZ"} · {Math.ceil(hud.event.remaining)}s {hud.event.id === 1 ? "· " + Math.floor(hud.event.progress) + "/25s" : ""}</div>}
        </div>
        <div className="fractals-hud-zone fractals-hud-zone--right">
          <div className="fractals-hud-mission"><b>{props.missionName}</b><small>{props.missionSubtitle}</small></div>
          <div className="fractals-hud-control-group" aria-label="Velocidade da expedição">
            <small>RITMO</small>
            <button type="button" aria-label="Diminuir velocidade" disabled={props.speedMultiplier === 1} onClick={props.onSpeedDecrease}>−</button>
            <b>{props.speedMultiplier}×</b>
            <button type="button" aria-label="Aumentar velocidade" disabled={props.speedMultiplier === 3 || !props.canIncreaseSpeed} onClick={props.onSpeedIncrease}>+</button>
          </div>
          <div className="fractals-hud-control-group" aria-label="Zoom da fase">
            <button type="button" aria-label="Diminuir zoom" disabled={props.zoom <= 0.6} onClick={props.onZoomDecrease}><ZoomOut/></button>
            <b>{Math.round(props.zoom * 100)}%</b>
            <button type="button" aria-label="Aumentar zoom" disabled={props.zoom >= 1.6} onClick={props.onZoomIncrease}><ZoomIn/></button>
          </div>
          {props.showPause && <Button size="sm" variant="outline" className="fractals-hud-pause" onClick={props.onPause}><Pause/></Button>}
        </div>
      </section>
    );
  }),
);
