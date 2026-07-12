import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { VillageScene } from "./GameScene";
import type { RegionId } from "./gameData";
import type { GameState, SceneCommand, SceneEvent } from "./types";

type Props = {
  regionId: RegionId;
  command?: SceneCommand;
  initialState?: GameState;
  onEvent: (event: SceneEvent) => void;
};

export default function PhaserGame({ regionId, command, initialState, onEvent }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<VillageScene | null>(null);
  const pendingCommandsRef = useRef<SceneCommand[]>([]);

  useEffect(() => {
    if (!hostRef.current || gameRef.current) return;
    const scene = new VillageScene(regionId, onEvent, initialState);
    sceneRef.current = scene;
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: hostRef.current,
      width: hostRef.current.clientWidth,
      height: hostRef.current.clientHeight,
      backgroundColor: "#87b66a",
      pixelArt: true,
      roundPixels: true,
      scene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: "100%",
        height: "100%",
      },
    });
    const commandTimer = window.setInterval(() => {
      if (pendingCommandsRef.current.length > 0 && sceneRef.current?.scene.isActive()) {
        const commands = pendingCommandsRef.current;
        pendingCommandsRef.current = [];
        commands.forEach((pendingCommand) => sceneRef.current?.applyCommand(pendingCommand));
      }
    }, 50);
    return () => {
      window.clearInterval(commandTimer);
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, [onEvent]);

  useEffect(() => {
    if (!command) return;
    if (sceneRef.current?.scene.isActive()) {
      sceneRef.current.applyCommand(command);
    } else {
      pendingCommandsRef.current.push(command);
    }
  }, [command]);

  return <div ref={hostRef} className="phaser-host" />;
}
