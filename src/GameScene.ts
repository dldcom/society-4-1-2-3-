import Phaser from "phaser";
import { buildingAssetPath, regions, type BuildingSpec, type RegionId } from "./gameData";
import type { BuildZoneRect, GameState, RouteTuning, SceneCommand, SceneEvent } from "./types";

const WORLD_W = 2400;
const WORLD_H = 1500;
const MIN_BUILDING_DISTANCE = 118;
const WORKER_SCALE = 0.96;
const PLAY_ZOOM = 1.28;
const MERCHANT_SPEED = 230;
const WORKER_SPEED = 260;
const MAIN_BUILDING: [number, number] = [WORLD_W / 2, WORLD_H / 2];
const MAIN_FRONT: [number, number] = [WORLD_W / 2, WORLD_H / 2 + 118];
const RESOURCE_SPOTS: Record<RegionId, Array<[number, number]>> = {
  rural: [
    [1060, 380],
    [720, 790],
    [1260, 455],
    [900, 670],
  ],
  mountain: [
    [870, 650],
    [1110, 520],
    [1350, 720],
    [990, 860],
  ],
  mine: [
    [1040, 660],
    [1270, 590],
    [1420, 790],
    [900, 820],
  ],
  coast: [
    [930, 690],
    [1180, 610],
    [1400, 780],
    [1040, 900],
  ],
};

type EmitEvent = (event: SceneEvent) => void;

export class VillageScene extends Phaser.Scene {
  private emitToReact: EmitEvent;
  private state?: GameState;
  private bg?: Phaser.GameObjects.Image;
  private mainBuilding?: Phaser.GameObjects.Image;
  private mainBuildingLabel?: Phaser.GameObjects.Text;
  private buildings = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Text>();
  private workers: Phaser.GameObjects.Sprite[] = [];
  private merchants = new Map<string, Phaser.GameObjects.Sprite>();
  private animals: Phaser.GameObjects.Sprite[] = [];
  private placement?: BuildingSpec;
  private preview?: Phaser.GameObjects.Image;
  private initialRegion: RegionId;
  private tuning: RouteTuning = { workerSpots: {}, merchantRoutes: {}, buildZones: {} };
  private editMode?: { mode: "worker" | "merchant" | "buildZone"; target?: RegionId };
  private mapView: "play" | "overview" = "play";
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private buildZoneHandles: Phaser.GameObjects.GameObject[] = [];
  private liveBuildZoneRects = new Map<number, BuildZoneRect>();
  private dragStart?: Phaser.Math.Vector2;
  private lastPointer?: Phaser.Math.Vector2;
  private pointerMoved = false;

  constructor(initialRegion: RegionId, emitToReact: EmitEvent) {
    super("VillageScene");
    this.initialRegion = initialRegion;
    this.emitToReact = emitToReact;
  }

  preload() {
    Object.values(regions).forEach((region) => this.load.image(`bg-${region.id}`, region.bg));
    ["basic", "storage", "worker", "craft", "advanced", "final"].forEach((asset) => {
      this.load.image(`building-${asset}`, buildingAssetPath(asset as BuildingSpec["asset"]));
    });
    this.load.spritesheet("worker-walk", "/assets/workers/rural-worker-walk-4x4.webp", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("worker-harvest", "/assets/workers/rural-worker-harvest-4x4.webp", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("merchant-walk", "/assets/merchants/merchant-walk-4x4.webp", {
      frameWidth: 64,
      frameHeight: 64,
    });
    this.load.spritesheet("merchant-cart", "/assets/merchants/merchant-cart-walk-4x4.webp", {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.spritesheet("product-wagon", "/assets/merchants/product-wagon-merchant-walk-4x4.webp", {
      frameWidth: 96,
      frameHeight: 96,
    });
    this.load.spritesheet("farm-dog", "/assets/animals/farm-dog-walk-4x4.webp", {
      frameWidth: 64,
      frameHeight: 64,
    });
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setZoom(PLAY_ZOOM);
    this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.createAnimations();
    this.bg = this.add
      .image(WORLD_W / 2, WORLD_H / 2, `bg-${this.initialRegion}`)
      .setDisplaySize(WORLD_W, WORLD_H)
      .setDepth(-10);
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      this.dragStart = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.lastPointer = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.pointerMoved = false;
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => this.handlePointerMove(pointer));
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => this.handlePointerUp(pointer));
    this.scale.on("resize", (size: Phaser.Structs.Size) => {
      this.cameras.main.setSize(size.width, size.height);
      this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
      this.applyMapView();
    });
  }

  applyCommand(command: SceneCommand) {
    if (command.type === "sync") {
      this.tuning = command.tuning;
      this.state = command.state;
      this.renderState();
      this.drawRouteGuide();
      return;
    }
    if (command.type === "setState") {
      this.state = command.state;
      this.renderState();
      return;
    }
    if (command.type === "setTuning") {
      this.tuning = command.tuning;
      this.repositionWorkers();
      this.drawRouteGuide();
      return;
    }
    if (command.type === "setEditMode") {
      this.editMode = command.mode ? { mode: command.mode, target: command.target } : undefined;
      this.drawRouteGuide();
      return;
    }
    if (command.type === "setMapView") {
      this.mapView = command.mode;
      this.applyMapView();
      return;
    }
    if (command.type === "startPlacement") {
      this.startPlacement(command.building);
      return;
    }
    if (command.type === "cancelPlacement") {
      this.cancelPlacement();
      return;
    }
    if (command.type === "merchantEnter") {
      this.animateMerchantEnter(command.merchantId, command.x, command.y);
      return;
    }
    if (command.type === "merchantTravel") {
      this.animateMerchant(command.merchantId, command.target);
      return;
    }
    if (command.type === "productWagonTravel") {
      this.animateProductWagon(command.target);
      return;
    }
    if (command.type === "floatText") {
      this.floatText(command.text, command.x ?? WORLD_W / 2, command.y ?? WORLD_H / 2);
    }
  }

  private renderState() {
    if (!this.state?.selectedRegion) return;
    const region = regions[this.state.selectedRegion];
    if (!this.bg || this.bg.texture.key !== `bg-${region.id}`) {
      this.bg?.destroy();
      this.bg = this.add.image(WORLD_W / 2, WORLD_H / 2, `bg-${region.id}`).setDisplaySize(WORLD_W, WORLD_H).setDepth(-10);
      this.bg.setPipeline("TextureTintPipeline");
    }

    const activeIds = new Set(this.state.buildings.map((building) => building.id));
    this.renderMainBuilding();
    this.buildings.forEach((sprite, id) => {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.labels.get(id)?.destroy();
        this.labels.delete(id);
        this.buildings.delete(id);
      }
    });

    this.state.buildings.forEach((building) => {
      let sprite = this.buildings.get(building.id);
      if (!sprite) {
        sprite = this.add
          .image(building.x, building.y, `building-${building.spec.asset}`)
          .setDisplaySize(160, 160)
          .setInteractive({ useHandCursor: true })
          .setDepth(20 + building.y / 10);
        sprite.on("pointerup", (_pointer: Phaser.Input.Pointer) => {
          if (this.pointerMoved) return;
          if (this.state?.isVisit) {
            this.emitToReact({ type: "notice", message: "구경 중에는 건물을 조작할 수 없어요." });
            return;
          }
          this.emitToReact({ type: "selectBuilding", buildingId: building.id });
        });
        this.buildings.set(building.id, sprite);
        const label = this.add
          .text(building.x, building.y + 88, building.spec.name, {
            fontFamily: "Arial",
            fontSize: "18px",
            color: "#442510",
            backgroundColor: "#fff1c8",
            padding: { x: 8, y: 3 },
          })
          .setOrigin(0.5)
          .setDepth(70);
        this.labels.set(building.id, label);
      }
      sprite.setPosition(building.x, building.y).setDepth(20 + building.y / 10);
      this.labels.get(building.id)?.setPosition(building.x, building.y + 88);
    });

    this.renderWorkers();
    this.renderMerchants();
    this.renderAnimals();
  }

  private renderWorkers() {
    if (!this.state?.selectedRegion) return;
    while (this.workers.length < this.state.workers) {
      const index = this.workers.length;
      const target = this.getWorkerSpot(index);
      const sprite = this.add.sprite(MAIN_FRONT[0], MAIN_FRONT[1], "worker-walk", 0).setScale(WORKER_SCALE).setDepth(80);
      this.workers.push(sprite);
      this.moveSpriteOrthogonally(
        sprite,
        [target],
        WORKER_SPEED,
        (from, to) => {
          const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
          this.safelyPlay(sprite, `worker-${direction}`);
        },
        () => {
          sprite.setTexture("worker-harvest");
          this.safelyPlay(sprite, "worker-harvest-loop");
          this.floatText("작업 시작", target[0], target[1] - 48);
        },
      );
    }
    while (this.workers.length > this.state.workers) {
      const worker = this.workers.pop();
      if (worker) this.destroySprite(worker);
    }
  }

  private renderMainBuilding() {
    if (!this.mainBuilding) {
      this.mainBuilding = this.add
        .image(MAIN_BUILDING[0], MAIN_BUILDING[1], "building-final")
        .setDisplaySize(190, 190)
        .setInteractive({ useHandCursor: true })
        .setDepth(20 + MAIN_BUILDING[1] / 10);
      this.mainBuilding.on("pointerup", () => {
        if (!this.pointerMoved) this.emitToReact({ type: "selectMainBuilding" });
      });
      this.mainBuildingLabel = this.add
        .text(MAIN_BUILDING[0], MAIN_BUILDING[1] + 105, "마을 본부", {
          fontFamily: "Arial",
          fontSize: "18px",
          color: "#442510",
          backgroundColor: "#fff1c8",
          padding: { x: 8, y: 3 },
        })
        .setOrigin(0.5)
        .setDepth(70);
    }
  }

  private createAnimations() {
    if (!this.anims.exists("worker-harvest-loop")) {
      this.anims.create({
        key: "worker-harvest-loop",
        frames: this.anims.generateFrameNumbers("worker-harvest", { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!this.anims.exists("worker-down")) {
      this.createDirectionalAnimation("worker-walk", "worker");
    }
    if (!this.anims.exists("merchant-cart-loop")) {
      this.createDirectionalAnimation("merchant-cart", "merchant-cart");
    }
    if (!this.anims.exists("merchant-idle-loop")) {
      this.createDirectionalAnimation("merchant-walk", "merchant");
    }
    if (!this.anims.exists("product-wagon-down")) {
      this.createDirectionalAnimation("product-wagon", "product-wagon");
    }
    if (!this.anims.exists("farm-dog-down")) {
      this.createDirectionalAnimation("farm-dog", "farm-dog");
    }
  }

  private createDirectionalAnimation(texture: string, prefix: string) {
    (["down", "left", "right", "up"] as const).forEach((direction, row) => {
      const key = `${prefix}-${direction}`;
      if (this.anims.exists(key)) return;
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(texture, { start: row * 4, end: row * 4 + 3 }),
        frameRate: 7,
        repeat: -1,
      });
    });
  }

  private directionFromDelta(dx: number, dy: number) {
    if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  private expandOrthogonalPath(start: [number, number], targets: Array<[number, number]>): Array<[number, number]> {
    const points: Array<[number, number]> = [];
    let current: [number, number] = start;
    targets.forEach((target) => {
      if (current[0] !== target[0]) points.push([target[0], current[1]]);
      if (current[1] !== target[1]) points.push([target[0], target[1]]);
      current = target;
    });
    return points;
  }

  private isSpriteAlive(sprite: Phaser.GameObjects.Sprite) {
    return sprite.active && Boolean(sprite.scene);
  }

  private safelyPlay(sprite: Phaser.GameObjects.Sprite, key: string, ignoreIfPlaying = true) {
    if (!this.isSpriteAlive(sprite) || !this.anims.exists(key)) return;
    sprite.play(key, ignoreIfPlaying);
  }

  private destroySprite(sprite: Phaser.GameObjects.Sprite) {
    this.tweens.killTweensOf(sprite);
    if (this.isSpriteAlive(sprite)) sprite.destroy();
  }

  private moveSpriteOrthogonally(
    sprite: Phaser.GameObjects.Sprite,
    targets: Array<[number, number]>,
    speed: number,
    onSegment?: (from: [number, number], to: [number, number]) => void,
    onComplete?: () => void,
  ) {
    if (!this.isSpriteAlive(sprite)) return;
    let previousPoint: [number, number] = [sprite.x, sprite.y];
    const points = this.expandOrthogonalPath(previousPoint, targets);
    const moveToPoint = (index: number) => {
      if (!this.isSpriteAlive(sprite)) return;
      const point = points[index];
      if (!point) {
        onComplete?.();
        return;
      }
      onSegment?.(previousPoint, point);
      if (!this.isSpriteAlive(sprite)) return;
      this.tweens.add({
        targets: sprite,
        x: point[0],
        y: point[1],
        duration: (Phaser.Math.Distance.Between(previousPoint[0], previousPoint[1], point[0], point[1]) / speed) * 1000,
        ease: "Linear",
        onComplete: () => {
          if (!this.isSpriteAlive(sprite)) return;
          previousPoint = point;
          moveToPoint(index + 1);
        },
      });
    };
    moveToPoint(0);
  }

  private getWorkerSpot(index: number): [number, number] {
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    const spots = this.tuning.workerSpots[regionId]?.length ? this.tuning.workerSpots[regionId]! : RESOURCE_SPOTS[regionId];
    return spots[index % spots.length];
  }

  private repositionWorkers() {
    this.workers.forEach((worker, index) => {
      const [x, y] = this.getWorkerSpot(index);
      this.tweens.killTweensOf(worker);
      worker.setPosition(x, y).setTexture("worker-harvest");
      this.safelyPlay(worker, "worker-harvest-loop");
    });
  }

  private renderMerchants() {
    if (!this.state) return;
    const ids = new Set(this.state.merchants.map((merchant) => merchant.id));
    this.merchants.forEach((sprite, id) => {
      if (!ids.has(id)) {
        this.destroySprite(sprite);
        this.merchants.delete(id);
      }
    });
    this.state.merchants.forEach((merchant, index) => {
      if (!this.merchants.has(merchant.id)) {
        const sprite = this.add.sprite(MAIN_FRONT[0] + index * 12, MAIN_FRONT[1], "merchant-walk", 0).setScale(1.12).setAlpha(0).setDepth(90);
        this.merchants.set(merchant.id, sprite);
      }
      const sprite = this.merchants.get(merchant.id)!;
      if (merchant.status === "traveling" && this.state?.isVisit && !this.tweens.isTweening(sprite) && !sprite.getData("ambient")) {
        this.animateAmbientMerchant(sprite, merchant.target ?? this.state.selectedRegion ?? "rural");
      } else if (merchant.status === "idle" && !this.tweens.isTweening(sprite)) {
        this.safelyPlay(sprite.setTexture("merchant-walk").setScale(1.12).setAlpha(this.state?.isVisit ? 1 : 0), "merchant-down");
      }
    });
  }

  private renderAnimals() {
    if (!this.state) return;
    this.animals.forEach((animal) => this.destroySprite(animal));
    this.animals = [];
    if (this.state.hasDog) this.addDog(1000, 900);
  }

  private addDog(x: number, y: number) {
    const dog = this.add.sprite(x, y, "farm-dog", 0).setScale(1.05).setDepth(95);
    this.safelyPlay(dog, "farm-dog-right");
    this.animals.push(dog);
    this.tweens.add({
      targets: dog,
      x: x + 70,
      yoyo: true,
      repeat: -1,
      duration: 2200,
      ease: "Sine.easeInOut",
      onYoyo: () => this.safelyPlay(dog, "farm-dog-left"),
      onRepeat: () => this.safelyPlay(dog, "farm-dog-right"),
    });
  }

  private startPlacement(building: BuildingSpec) {
    this.placement = building;
    this.preview?.destroy();
    this.preview = this.add.image(WORLD_W / 2, WORLD_H / 2, `building-${building.asset}`).setDisplaySize(168, 168).setAlpha(0.65).setDepth(200);
  }

  private cancelPlacement() {
    this.placement = undefined;
    this.preview?.destroy();
    this.preview = undefined;
  }

  private handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (!this.dragStart) return;
    const dist = Phaser.Math.Distance.Between(this.dragStart.x, this.dragStart.y, pointer.x, pointer.y);
    if (dist > 8) this.pointerMoved = true;
    if (this.placement && this.preview) {
      const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.preview.setPosition(world.x, world.y);
      this.preview.setTint(this.canPlaceAt(world.x, world.y) ? 0x88ff88 : 0xff7777);
      return;
    }
    if (this.mapView === "play" && pointer.isDown && this.pointerMoved && this.lastPointer) {
      const zoom = this.cameras.main.zoom;
      this.cameras.main.scrollX -= (pointer.x - this.lastPointer.x) / zoom;
      this.cameras.main.scrollY -= (pointer.y - this.lastPointer.y) / zoom;
    }
    this.lastPointer = new Phaser.Math.Vector2(pointer.x, pointer.y);
  }

  private handlePointerUp(pointer: Phaser.Input.Pointer) {
    this.lastPointer = undefined;
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    if (this.editMode && !this.pointerMoved) {
      this.emitToReact({ type: "editPoint", x: Math.round(world.x), y: Math.round(world.y) });
      this.floatText("좌표 추가", world.x, world.y - 44);
      return;
    }
    if (!this.placement) return;
    if (this.canPlaceAt(world.x, world.y)) {
      this.emitToReact({ type: "placeBuilding", building: this.placement, x: world.x, y: world.y });
      this.floatText("완성!", world.x, world.y - 80);
      this.cancelPlacement();
    } else {
      this.floatText("배치 불가", world.x, world.y - 70);
      this.emitToReact({ type: "notice", message: "그 위치에는 지을 수 없어요." });
    }
  }

  private canPlaceAt(x: number, y: number) {
    if (!this.state) return false;
    const zones = this.state.selectedRegion ? this.tuning.buildZones[this.state.selectedRegion] : undefined;
    if (zones?.length) {
      if (!zones.some((zone) => this.isPointInRect(x, y, zone))) return false;
    } else if (x < 150 || y < 130 || x > WORLD_W - 150 || y > WORLD_H - 130) {
      return false;
    }
    return this.state.buildings.every((building) => Phaser.Math.Distance.Between(x, y, building.x, building.y) >= MIN_BUILDING_DISTANCE);
  }

  private normalizeRect(rect: BuildZoneRect): BuildZoneRect {
    const x1 = Math.min(rect.x, rect.x + rect.width);
    const y1 = Math.min(rect.y, rect.y + rect.height);
    return {
      x: x1,
      y: y1,
      width: Math.abs(rect.width),
      height: Math.abs(rect.height),
    };
  }

  private isPointInRect(x: number, y: number, rect: BuildZoneRect) {
    const normalized = this.normalizeRect(rect);
    return x >= normalized.x && x <= normalized.x + normalized.width && y >= normalized.y && y <= normalized.y + normalized.height;
  }

  private applyMapView() {
    if (!this.cameras?.main) return;
    if (this.mapView === "overview") {
      const widthZoom = this.cameras.main.width / WORLD_W;
      const heightZoom = this.cameras.main.height / WORLD_H;
      this.cameras.main.setZoom(Math.min(widthZoom, heightZoom));
      this.cameras.main.centerOn(WORLD_W / 2, WORLD_H / 2);
      this.drawRouteGuide();
      return;
    }
    this.cameras.main.setZoom(PLAY_ZOOM);
    this.cameras.main.centerOn(
      Phaser.Math.Clamp(this.cameras.main.midPoint.x, 0, WORLD_W),
      Phaser.Math.Clamp(this.cameras.main.midPoint.y, 0, WORLD_H),
    );
    this.drawRouteGuide();
  }

  private animateMerchant(merchantId: string, target: RegionId) {
    const sprite = this.merchants.get(merchantId);
    if (!sprite) return;
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const route = this.tuning.merchantRoutes[target]?.length ? this.tuning.merchantRoutes[target]! : [targetPoints[target]];
    const returnRoute = [...route].reverse();
    const outboundTarget = route[route.length - 1] ?? targetPoints[target];
    sprite.setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setTexture("merchant-cart").setScale(0.88).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED,
      (from, to) => {
        const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
        this.safelyPlay(sprite, `merchant-cart-${direction}`);
      },
      () => {
        sprite.setAlpha(0).setPosition(outboundTarget[0], outboundTarget[1]);
        this.time.delayedCall(5000, () => {
          if (!this.isSpriteAlive(sprite)) return;
          sprite.setTexture("merchant-cart").setScale(0.88).setAlpha(1).setPosition(outboundTarget[0], outboundTarget[1]);
          this.moveSpriteOrthogonally(
            sprite,
            [...returnRoute.slice(1), MAIN_FRONT],
            MERCHANT_SPEED,
            (from, to) => {
              const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
              this.safelyPlay(sprite, `merchant-cart-${direction}`);
            },
            () => {
              sprite.setTexture("merchant-walk").setScale(1.12).setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setAlpha(0);
              this.safelyPlay(sprite, "merchant-down");
              this.emitToReact({ type: "merchantReturned", merchantId });
            },
          );
        });
      },
    );
  }

  private animateAmbientMerchant(sprite: Phaser.GameObjects.Sprite, target: RegionId) {
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const route = this.tuning.merchantRoutes[target]?.length ? this.tuning.merchantRoutes[target]! : [targetPoints[target]];
    sprite.setData("ambient", true);
    sprite.setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setTexture("merchant-cart").setScale(0.88).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED * 0.85,
      (from, to) => this.safelyPlay(sprite, `merchant-cart-${this.directionFromDelta(to[0] - from[0], to[1] - from[1])}`),
      () => {
        const returnRoute = [...route].reverse();
        this.time.delayedCall(1200, () => {
          if (!this.isSpriteAlive(sprite)) return;
          this.moveSpriteOrthogonally(
            sprite,
            [...returnRoute.slice(1), MAIN_FRONT],
            MERCHANT_SPEED * 0.85,
            (from, to) => this.safelyPlay(sprite, `merchant-cart-${this.directionFromDelta(to[0] - from[0], to[1] - from[1])}`),
            () => {
              sprite.setData("ambient", false);
            },
          );
        });
      },
    );
  }

  private animateProductWagon(target: RegionId) {
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const route = this.tuning.merchantRoutes[target]?.length ? this.tuning.merchantRoutes[target]! : [targetPoints[target]];
    const returnRoute = [...route].reverse();
    const outboundTarget = route[route.length - 1] ?? targetPoints[target];
    const sprite = this.add.sprite(MAIN_FRONT[0], MAIN_FRONT[1], "product-wagon", 0).setScale(0.94).setDepth(110);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED * 0.78,
      (from, to) => this.safelyPlay(sprite, `product-wagon-${this.directionFromDelta(to[0] - from[0], to[1] - from[1])}`),
      () => {
        sprite.setAlpha(0).setPosition(outboundTarget[0], outboundTarget[1]);
        this.time.delayedCall(3800, () => {
          if (!this.isSpriteAlive(sprite)) return;
          sprite.setAlpha(1).setPosition(outboundTarget[0], outboundTarget[1]);
          this.moveSpriteOrthogonally(
            sprite,
            [...returnRoute.slice(1), MAIN_FRONT],
            MERCHANT_SPEED * 0.78,
            (from, to) => this.safelyPlay(sprite, `product-wagon-${this.directionFromDelta(to[0] - from[0], to[1] - from[1])}`),
            () => {
              this.destroySprite(sprite);
              const product = regions[target].product;
              this.emitToReact({ type: "productWagonReturned", target, product });
            },
          );
        });
      },
    );
  }

  private animateMerchantEnter(merchantId: string, x: number, y: number) {
    let sprite = this.merchants.get(merchantId);
    if (!sprite) {
      sprite = this.add.sprite(x, y, "merchant-walk", 0).setScale(1.12).setDepth(90);
      this.merchants.set(merchantId, sprite);
    }
    sprite.setPosition(x, y).setTexture("merchant-walk").setScale(1.12).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      [MAIN_FRONT],
      MERCHANT_SPEED,
      (from, to) => {
        const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
        this.safelyPlay(sprite, `merchant-${direction}`);
      },
      () => {
        sprite?.setAlpha(0).setPosition(MAIN_FRONT[0], MAIN_FRONT[1]);
        this.floatText("본부 도착", MAIN_FRONT[0], MAIN_FRONT[1] - 52);
      },
    );
  }

  private drawRouteGuide() {
    this.routeGraphics?.destroy();
    this.routeGraphics = undefined;
    this.buildZoneHandles.forEach((handle) => handle.destroy());
    this.buildZoneHandles = [];
    this.liveBuildZoneRects.clear();
    if (this.mapView !== "overview" || !this.state?.selectedRegion) return;

    const graphics = this.add.graphics().setDepth(260);
    this.routeGraphics = graphics;
    const drawPoints = (points: Array<[number, number]>, color: number, closed = false) => {
      if (points.length === 0) return;
      const expanded = this.expandOrthogonalPath(points[0], points.slice(1));
      const linePoints = closed ? points : [points[0], ...expanded];
      graphics.lineStyle(6, color, 0.92);
      graphics.beginPath();
      graphics.moveTo(linePoints[0][0], linePoints[0][1]);
      linePoints.slice(1).forEach(([x, y]) => graphics.lineTo(x, y));
      if (closed && linePoints.length >= 3) graphics.closePath();
      graphics.strokePath();
      if (closed && linePoints.length >= 3) {
        graphics.fillStyle(color, 0.16);
        graphics.fillPath();
      }
      linePoints.forEach(([x, y], index) => {
        graphics.fillStyle(index === 0 ? 0x2f7d32 : color, 1);
        graphics.fillCircle(x, y, 13);
        graphics.lineStyle(3, 0x3b210e, 1);
        graphics.strokeCircle(x, y, 13);
      });
    };

    this.drawBuildZoneRects();

    if (this.editMode?.mode === "worker" || this.editMode?.mode === "buildZone") return;

    if (this.editMode?.target) {
      const points = this.tuning.merchantRoutes[this.editMode.target] ?? [];
      drawPoints([MAIN_FRONT, ...points], 0xf0b932);
    }
  }

  private drawBuildZoneRects() {
    if (!this.routeGraphics || !this.state?.selectedRegion) return;
    const zones = this.tuning.buildZones[this.state.selectedRegion] ?? [];
    zones.forEach((rawZone, zoneIndex) => {
      const zone = this.normalizeRect(rawZone);
      this.liveBuildZoneRects.set(zoneIndex, zone);
      this.routeGraphics!.lineStyle(6, 0x59c65a, 0.95);
      this.routeGraphics!.fillStyle(0x59c65a, 0.16);
      this.routeGraphics!.fillRect(zone.x, zone.y, zone.width, zone.height);
      this.routeGraphics!.strokeRect(zone.x, zone.y, zone.width, zone.height);

      const body = this.add
        .rectangle(zone.x + zone.width / 2, zone.y + zone.height / 2, zone.width, zone.height, 0x59c65a, 0.04)
        .setStrokeStyle(0, 0x59c65a)
        .setDepth(275)
        .setInteractive({ draggable: true, useHandCursor: true });
      const cornerHandles: Record<"nw" | "ne" | "sw" | "se", Phaser.GameObjects.Arc | undefined> = {
        nw: undefined,
        ne: undefined,
        sw: undefined,
        se: undefined,
      };
      const setLiveRect = (rect: BuildZoneRect) => {
        const normalized = this.normalizeRect(rect);
        this.liveBuildZoneRects.set(zoneIndex, normalized);
        body.setPosition(normalized.x + normalized.width / 2, normalized.y + normalized.height / 2);
        body.setSize(normalized.width, normalized.height);
        body.setDisplaySize(normalized.width, normalized.height);
        cornerHandles.nw?.setPosition(normalized.x, normalized.y);
        cornerHandles.ne?.setPosition(normalized.x + normalized.width, normalized.y);
        cornerHandles.sw?.setPosition(normalized.x, normalized.y + normalized.height);
        cornerHandles.se?.setPosition(normalized.x + normalized.width, normalized.y + normalized.height);
        this.redrawLiveBuildZones();
      };
      body.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const current = this.liveBuildZoneRects.get(zoneIndex) ?? zone;
        setLiveRect({
          x: dragX - current.width / 2,
          y: dragY - current.height / 2,
          width: current.width,
          height: current.height,
        });
      });
      body.on("dragend", () => {
        const liveRect = this.liveBuildZoneRects.get(zoneIndex) ?? zone;
        this.emitToReact({
          type: "moveBuildZoneRect",
          zoneIndex,
          rect: {
            x: Math.round(liveRect.x),
            y: Math.round(liveRect.y),
            width: Math.round(liveRect.width),
            height: Math.round(liveRect.height),
          },
        });
      });
      this.input.setDraggable(body);
      this.buildZoneHandles.push(body);

      const corners: Array<["nw" | "ne" | "sw" | "se", number, number]> = [
        ["nw", zone.x, zone.y],
        ["ne", zone.x + zone.width, zone.y],
        ["sw", zone.x, zone.y + zone.height],
        ["se", zone.x + zone.width, zone.y + zone.height],
      ];
      corners.forEach(([corner, x, y]) => {
        const handle = this.add
          .circle(x, y, 18, 0xfff0bd, 1)
          .setStrokeStyle(4, 0x3b210e)
          .setDepth(285)
          .setInteractive({ draggable: true, useHandCursor: true });
        cornerHandles[corner] = handle;
        handle.on("drag", (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
          const current = this.liveBuildZoneRects.get(zoneIndex) ?? zone;
          const left = corner.includes("w") ? dragX : current.x;
          const right = corner.includes("e") ? dragX : current.x + current.width;
          const top = corner.includes("n") ? dragY : current.y;
          const bottom = corner.includes("s") ? dragY : current.y + current.height;
          const next = this.normalizeRect({ x: left, y: top, width: right - left, height: bottom - top });
          setLiveRect({ ...next, width: Math.max(80, next.width), height: Math.max(80, next.height) });
        });
        handle.on("dragend", () => {
          const normalized = this.liveBuildZoneRects.get(zoneIndex) ?? zone;
          this.emitToReact({
            type: "moveBuildZoneRect",
            zoneIndex,
            rect: {
              ...normalized,
              width: Math.max(80, normalized.width),
              height: Math.max(80, normalized.height),
            },
          });
        });
        this.input.setDraggable(handle);
        this.buildZoneHandles.push(handle);
      });
    });
  }

  private redrawLiveBuildZones() {
    if (!this.routeGraphics) return;
    this.routeGraphics.clear();
    this.liveBuildZoneRects.forEach((zone) => {
      this.routeGraphics!.lineStyle(6, 0x59c65a, 0.95);
      this.routeGraphics!.fillStyle(0x59c65a, 0.16);
      this.routeGraphics!.fillRect(zone.x, zone.y, zone.width, zone.height);
      this.routeGraphics!.strokeRect(zone.x, zone.y, zone.width, zone.height);
    });
    if (this.editMode?.target) {
      const points = this.tuning.merchantRoutes[this.editMode.target] ?? [];
      if (points.length > 0) {
        const expanded = this.expandOrthogonalPath(MAIN_FRONT, points);
        const linePoints = [MAIN_FRONT, ...expanded];
        this.routeGraphics.lineStyle(6, 0xf0b932, 0.92);
        this.routeGraphics.beginPath();
        this.routeGraphics.moveTo(linePoints[0][0], linePoints[0][1]);
        linePoints.slice(1).forEach(([x, y]) => this.routeGraphics?.lineTo(x, y));
        this.routeGraphics.strokePath();
      }
    }
  }

  private floatText(text: string, x: number, y: number) {
    const label = this.add
      .text(x, y, text, {
        fontFamily: "Arial",
        fontSize: "24px",
        color: "#fff7d4",
        stroke: "#4b2a13",
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(300);
    this.tweens.add({
      targets: label,
      y: y - 54,
      alpha: 0,
      duration: 1200,
      onComplete: () => label.destroy(),
    });
  }
}
