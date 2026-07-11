import Phaser from "phaser";
import {
  buildingAssetIds,
  buildingAssetPath,
  featureBuildingsByRegion,
  mainBuildingAssetPath,
  regions,
  type BuildingSpec,
  type FeatureBuildingSpec,
  type ProductId,
  type RegionId,
  type VillageBuildingSpec,
} from "./gameData";
import type { BuildZoneRect, GameState, RouteTuning, SceneCommand, SceneEvent } from "./types";

const WORLD_W = 2400;
const WORLD_H = 1500;
const MIN_BUILDING_DISTANCE = 118;
const WORKER_SCALE = 0.96;
const PLAY_ZOOM = 1.14;
const MERCHANT_SPEED = 230;
const WORKER_SPEED = 260;
const ANIMAL_SPEED = 115;
const ANIMAL_RESOURCE_CHANCE = 0.22;
const ANIMAL_RESOURCE_DISTANCE = 135;
const PERSON_CLEARANCE = 58;
const BUILDING_CLEARANCE = 108;
const NAV_TILE_SIZE = 48;
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
type CharacterSpriteKind = "workerWalk" | "workerHarvest" | "merchantWalk" | "merchantCart" | "productWagon";
type Direction = "down" | "left" | "right" | "up";

const buildingTextureKey = (regionId: RegionId, asset: BuildingSpec["asset"]) => `building-${regionId}-${asset}`;
const featureBuildingTextureKey = (id: string) => `feature-building-${id}`;
const mainBuildingTextureKey = (regionId: RegionId) => `building-${regionId}-main`;
const hammerTextureKey = "tool-hammer";
const visitorTextureKey = (id: string) => `visitor-${id}`;
const characterTextureKey = (regionId: RegionId, kind: CharacterSpriteKind) => `character-${regionId}-${kind}`;
const animalTextureKey = (regionId: RegionId) => `animal-${regionId}`;
const animalAnimationKey = (regionId: RegionId, direction: Direction) => `animal-${regionId}-${direction}`;
const workerHarvestAnimationKey = (regionId: RegionId) => `worker-harvest-${regionId}-loop`;
const characterAnimationKey = (regionId: RegionId, role: "worker" | "merchant" | "merchant-cart" | "product-wagon", direction: Direction) =>
  `${role}-${regionId}-${direction}`;

const characterSpriteSheets: Record<RegionId, Record<CharacterSpriteKind, string>> = {
  rural: {
    workerWalk: "/assets/workers/rural-worker-walk-4x4.webp",
    workerHarvest: "/assets/workers/rural-worker-harvest-4x4.webp",
    merchantWalk: "/assets/merchants/merchant-walk-4x4.webp",
    merchantCart: "/assets/merchants/merchant-cart-walk-4x4.webp",
    productWagon: "/assets/merchants/product-wagon-merchant-walk-4x4.webp",
  },
  mountain: {
    workerWalk: "/assets/workers/mountain-worker-walk-4x4.png",
    workerHarvest: "/assets/workers/mountain-worker-harvest-4x4.png",
    merchantWalk: "/assets/merchants/mountain-merchant-walk-4x4.png",
    merchantCart: "/assets/merchants/mountain-merchant-cart-walk-4x4.png",
    productWagon: "/assets/merchants/mountain-product-wagon-merchant-walk-4x4.png",
  },
  mine: {
    workerWalk: "/assets/workers/mine-worker-walk-4x4.png",
    workerHarvest: "/assets/workers/mine-worker-harvest-4x4.png",
    merchantWalk: "/assets/merchants/mine-merchant-walk-4x4.png",
    merchantCart: "/assets/merchants/mine-merchant-cart-walk-4x4.png",
    productWagon: "/assets/merchants/mine-product-wagon-merchant-walk-4x4.png",
  },
  coast: {
    workerWalk: "/assets/workers/coast-worker-walk-4x4.png",
    workerHarvest: "/assets/workers/coast-worker-harvest-4x4.png",
    merchantWalk: "/assets/merchants/coast-merchant-walk-4x4.png",
    merchantCart: "/assets/merchants/coast-merchant-cart-walk-4x4.png",
    productWagon: "/assets/merchants/coast-product-wagon-merchant-walk-4x4.png",
  },
};

const animalSpriteSheets: Record<RegionId, string> = {
  rural: "/assets/animals/farm-dog-walk-4x4.webp",
  mountain: "/assets/animals/forest-squirrel-walk-4x4.png",
  mine: "/assets/animals/mine-mole-walk-4x4.png",
  coast: "/assets/animals/coast-otter-walk-4x4.png",
};

const animalScales: Record<RegionId, number> = {
  rural: 1.05,
  mountain: 0.62,
  mine: 0.64,
  coast: 0.68,
};

const animalDirectionalScale = (regionId: RegionId, direction: Direction) =>
  regionId === "rural" && (direction === "up" || direction === "down") ? animalScales[regionId] * 0.88 : animalScales[regionId];

const ruralTestVisitors = [
  {
    id: "mountain-merchant",
    asset: "/assets/visitors/mountain-merchant-walk-4x4.png",
    spawn: [900, 700] as [number, number],
    route: [[900, 700], [1030, 700], [1030, 810], [900, 810]] as Array<[number, number]>,
  },
  {
    id: "mountain-artisan",
    asset: "/assets/visitors/mountain-artisan-walk-4x4.png",
    spawn: [1460, 690] as [number, number],
    route: [[1460, 690], [1330, 690], [1330, 800], [1460, 800]] as Array<[number, number]>,
  },
  {
    id: "mountain-traveler",
    asset: "/assets/visitors/mountain-traveler-walk-4x4.png",
    spawn: [1180, 980] as [number, number],
    route: [[1180, 980], [1280, 980], [1280, 1080], [1180, 1080]] as Array<[number, number]>,
  },
];

export class VillageScene extends Phaser.Scene {
  private emitToReact: EmitEvent;
  private state?: GameState;
  private bg?: Phaser.GameObjects.Image;
  private mainBuilding?: Phaser.GameObjects.Image;
  private mainBuildingLabel?: Phaser.GameObjects.Container;
  private buildings = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Container>();
  private constructionObjects = new Map<string, { sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Container; hammer: Phaser.GameObjects.Image }>();
  private missionHalo?: Phaser.GameObjects.Ellipse;
  private missionBubble?: Phaser.GameObjects.Container;
  private missionTargetId?: string;
  private workers: Phaser.GameObjects.Sprite[] = [];
  private merchants = new Map<string, Phaser.GameObjects.Sprite>();
  private visitors = new Map<string, Phaser.GameObjects.Sprite>();
  private animals: Phaser.GameObjects.Sprite[] = [];
  private placement?: VillageBuildingSpec;
  private preview?: Phaser.GameObjects.Image;
  private initialRegion: RegionId;
  private tuning: RouteTuning = { workerSpots: {}, merchantRoutes: {}, workerSpawns: {}, merchantDestinations: {}, blockedTiles: {}, buildZones: {} };
  private editMode?: { mode: "worker" | "merchant" | "buildZone"; target?: RegionId };
  private mapView: "play" | "overview" = "play";
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private buildZoneHandles: Phaser.GameObjects.GameObject[] = [];
  private liveBuildZoneRects = new Map<number, BuildZoneRect>();
  private dragStart?: Phaser.Math.Vector2;
  private lastPointer?: Phaser.Math.Vector2;
  private pointerMoved = false;
  private editedTiles = new Set<string>();

  constructor(initialRegion: RegionId, emitToReact: EmitEvent) {
    super("VillageScene");
    this.initialRegion = initialRegion;
    this.emitToReact = emitToReact;
  }

  preload() {
    Object.values(regions).forEach((region) => this.load.image(`bg-${region.id}`, region.bg));
    Object.values(regions).forEach((region) => {
      buildingAssetIds.forEach((asset) => {
        this.load.image(buildingTextureKey(region.id, asset), buildingAssetPath(region.id, asset));
      });
      featureBuildingsByRegion[region.id].forEach((building) => {
        this.load.image(featureBuildingTextureKey(building.id), building.asset);
      });
      this.load.image(mainBuildingTextureKey(region.id), mainBuildingAssetPath(region.id));
    });
    this.load.image(hammerTextureKey, "/assets/tools/hammer.png");
    ruralTestVisitors.forEach((visitor) => {
      this.load.spritesheet(visitorTextureKey(visitor.id), visitor.asset, { frameWidth: 64, frameHeight: 64 });
    });
    Object.values(regions).forEach((region) => {
      const sheets = characterSpriteSheets[region.id];
      this.load.spritesheet(characterTextureKey(region.id, "workerWalk"), sheets.workerWalk, { frameWidth: 64, frameHeight: 64 });
      this.load.spritesheet(characterTextureKey(region.id, "workerHarvest"), sheets.workerHarvest, { frameWidth: 64, frameHeight: 64 });
      this.load.spritesheet(characterTextureKey(region.id, "merchantWalk"), sheets.merchantWalk, { frameWidth: 64, frameHeight: 64 });
      this.load.spritesheet(characterTextureKey(region.id, "merchantCart"), sheets.merchantCart, { frameWidth: 96, frameHeight: 96 });
      this.load.spritesheet(characterTextureKey(region.id, "productWagon"), sheets.productWagon, { frameWidth: 96, frameHeight: 96 });
    });
    Object.entries(animalSpriteSheets).forEach(([regionId, path]) => {
      this.load.spritesheet(animalTextureKey(regionId as RegionId), path, {
        frameWidth: 64,
        frameHeight: 64,
      });
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
      this.editedTiles.clear();
      if (this.editMode?.mode === "blockedPaint" || this.editMode?.mode === "blockedErase") this.recordEditedTile(pointer);
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
      this.animateProductWagon(command.target, command.product);
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
          .image(building.x, building.y, this.textureForBuilding(region.id, building.spec))
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
        const label = this.createBuildingLabel(building.spec.name, false).setPosition(building.x, building.y + 88);
        this.labels.set(building.id, label);
      }
      sprite.setTexture(this.textureForBuilding(region.id, building.spec));
      sprite.setPosition(building.x, building.y).setDepth(20 + building.y / 10);
      this.labels.get(building.id)?.setPosition(building.x, building.y + 88);
    });

    this.renderConstruction();
    this.renderMissionMarker();
    this.renderWorkers();
    this.renderMerchants();
    this.renderVisitors();
    this.renderAnimals();
  }

  private renderConstruction() {
    const constructions = [this.state?.construction, ...(this.state?.constructionQueue ?? [])].filter(
      (construction): construction is NonNullable<GameState["construction"]> => Boolean(construction),
    );
    const activeIds = new Set(constructions.map((construction) => construction.building.id));
    this.constructionObjects.forEach((objects, id) => {
      if (activeIds.has(id)) return;
      objects.sprite.destroy();
      objects.label.destroy();
      objects.hammer.destroy();
      this.constructionObjects.delete(id);
    });
    if (!this.state?.selectedRegion) return;
    constructions.forEach((construction) => {
      const building = construction.building;
      let objects = this.constructionObjects.get(building.id);
      if (!objects) {
        const sprite = this.add.image(building.x, building.y, this.textureForBuilding(this.state!.selectedRegion!, building.spec)).setDisplaySize(160, 160).setAlpha(0.48);
        const label = this.createBuildingLabel("공사 중", false);
        const hammer = this.createConstructionHammer().setDepth(80).setAngle(-30);
        this.tweens.add({ targets: hammer, angle: 18, y: "+=16", duration: 260, ease: "Quad.easeIn", yoyo: true, repeat: -1, repeatDelay: 110 });
        objects = { sprite, label, hammer };
        this.constructionObjects.set(building.id, objects);
      }
      objects.sprite.setTexture(this.textureForBuilding(this.state.selectedRegion, building.spec)).setPosition(building.x, building.y).setDepth(20 + building.y / 10);
      objects.label.setPosition(building.x, building.y + 88);
      objects.hammer.setPosition(building.x + 42, building.y - 30);
    });
  }

  private createConstructionHammer() {
    return this.add.image(0, 0, hammerTextureKey).setDisplaySize(62, 62);
  }

  private renderWorkers() {
    if (!this.state?.selectedRegion) return;
    const regionId = this.currentRegion();
    while (this.workers.length < this.state.workers) {
      const index = this.workers.length;
      const target = this.getWorkerSpot(index);
      const spawn = this.getWorkerSpawn(index);
      const sprite = this.add.sprite(spawn[0], spawn[1], characterTextureKey(regionId, "workerWalk"), 0).setScale(WORKER_SCALE).setDepth(80);
      this.workers.push(sprite);
      this.moveSpriteOrthogonally(
        sprite,
        [target],
        WORKER_SPEED,
        (from, to) => {
          const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
          this.safelyPlay(sprite, characterAnimationKey(regionId, "worker", direction));
        },
        () => {
          sprite.setTexture(characterTextureKey(regionId, "workerHarvest"));
          this.safelyPlay(sprite, workerHarvestAnimationKey(regionId));
          this.floatText("작업 시작", target[0], target[1] - 48);
        },
      );
    }
    while (this.workers.length > this.state.workers) {
      const worker = this.workers.pop();
      if (worker) this.destroySprite(worker);
    }
  }

  private createBuildingLabel(name: string, isMain: boolean) {
    const text = this.add
      .text(0, -1, name, {
        fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: isMain ? "18px" : "17px",
        fontStyle: "bold",
        color: "#4a2c18",
      })
      .setOrigin(0.5);
    const width = Math.max(isMain ? 112 : 94, text.width + 30);
    const height = 34;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x3b2112, 0.24);
    shadow.fillRoundedRect(-width / 2 + 3, -height / 2 + 4, width, height, 8);
    const board = this.add.graphics();
    board.fillStyle(isMain ? 0xffe4a3 : 0xf7dfad, 0.98);
    board.lineStyle(3, isMain ? 0x8a5424 : 0x795033, 1);
    board.fillRoundedRect(-width / 2, -height / 2, width, height, 8);
    board.strokeRoundedRect(-width / 2, -height / 2, width, height, 8);
    board.lineStyle(1, 0xfff4d4, 0.72);
    board.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 5);
    if (isMain) {
      board.fillStyle(0xb97826, 1);
      board.fillCircle(-width / 2 + 11, 0, 3);
      board.fillCircle(width / 2 - 11, 0, 3);
    }
    return this.add.container(0, 0, [shadow, board, text]).setDepth(70);
  }

  private createMissionBubble() {
    const text = this.add
      .text(0, 0, "여기!", {
        fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: "21px",
        fontStyle: "bold",
        color: "#4a2a14",
      })
      .setOrigin(0.5);
    const width = 74;
    const height = 38;
    const shadow = this.add.graphics();
    shadow.fillStyle(0x3b2112, 0.2);
    shadow.fillRoundedRect(-width / 2 + 3, -height / 2 + 4, width, height, 11);
    shadow.fillTriangle(-7 + 3, height / 2 + 2, 9 + 3, height / 2 + 2, 1 + 3, height / 2 + 14);
    const bubble = this.add.graphics();
    bubble.fillStyle(0xfff5d6, 0.99);
    bubble.lineStyle(3, 0xc2872f, 1);
    bubble.fillRoundedRect(-width / 2, -height / 2, width, height, 11);
    bubble.strokeRoundedRect(-width / 2, -height / 2, width, height, 11);
    bubble.fillStyle(0xfff5d6, 1);
    bubble.fillTriangle(-7, height / 2 - 2, 9, height / 2 - 2, 0, height / 2 + 11);
    bubble.lineStyle(3, 0xc2872f, 1);
    bubble.lineBetween(-7, height / 2 - 1, 0, height / 2 + 11);
    bubble.lineBetween(0, height / 2 + 11, 9, height / 2 - 1);
    return this.add.container(0, 0, [shadow, bubble, text]).setDepth(112);
  }

  private renderMainBuilding() {
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    if (!this.mainBuilding) {
      this.mainBuilding = this.add
        .image(MAIN_BUILDING[0], MAIN_BUILDING[1], mainBuildingTextureKey(regionId))
        .setDisplaySize(190, 190)
        .setInteractive({ useHandCursor: true })
        .setDepth(20 + MAIN_BUILDING[1] / 10);
      this.mainBuilding.on("pointerup", () => {
        if (!this.pointerMoved) this.emitToReact({ type: "selectMainBuilding" });
      });
      this.mainBuildingLabel = this.createBuildingLabel("마을 본부", true).setPosition(MAIN_BUILDING[0], MAIN_BUILDING[1] + 105);
    }
    this.mainBuilding.setTexture(mainBuildingTextureKey(regionId));
  }

  private renderMissionMarker() {
    const target = this.getMissionTargetBuilding();
    if (!target) {
      this.clearMissionMarker();
      return;
    }

    if (!this.missionHalo) {
      this.missionHalo = this.add
        .ellipse(target.x, target.y + 4, 184, 128)
        .setStrokeStyle(4, 0xf3bd3d, 0.78)
        .setDepth(108);
      this.tweens.add({
        targets: this.missionHalo,
        scaleX: 1.06,
        scaleY: 1.06,
        alpha: 0.38,
        duration: 760,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    if (!this.missionBubble) {
      this.missionBubble = this.createMissionBubble().setPosition(target.x, target.y - 94);
      this.tweens.add({
        targets: this.missionBubble,
        y: target.y - 101,
        scaleX: 1.025,
        scaleY: 1.025,
        duration: 680,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    if (this.missionTargetId !== target.id) {
      this.tweens.killTweensOf(this.missionBubble);
      this.missionBubble.setPosition(target.x, target.y - 94).setScale(1);
      this.tweens.add({
        targets: this.missionBubble,
        y: target.y - 101,
        scaleX: 1.025,
        scaleY: 1.025,
        duration: 680,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.missionTargetId = target.id;
    this.missionHalo.setPosition(target.x, target.y + 4).setVisible(true);
    this.missionBubble.setPosition(target.x, this.missionBubble.y).setVisible(true);
  }

  private clearMissionMarker() {
    if (this.missionHalo) {
      this.tweens.killTweensOf(this.missionHalo);
      this.missionHalo.destroy();
      this.missionHalo = undefined;
    }
    if (this.missionBubble) {
      this.tweens.killTweensOf(this.missionBubble);
      this.missionBubble.destroy();
      this.missionBubble = undefined;
    }
    this.missionTargetId = undefined;
  }

  private getMissionTargetBuilding(): PlacedBuilding | undefined {
    if (!this.state || this.state.isVisit || this.state.success) return undefined;
    const regionId = this.state.selectedRegion;
    if (!regionId) return undefined;

    if (this.state.builtStage >= 1 && this.state.merchants.length === 0) {
      return this.findStageBuilding(1);
    }
    if (this.state.builtStage >= 2 && !this.hasRegionCompanion(regionId)) {
      return this.findStageBuilding(2);
    }
    if (this.state.builtStage === 3) {
      return this.findStageBuilding(3);
    }
    if (this.state.builtStage >= 4 && this.state.stats.crafts < 1) {
      return this.findStageBuilding(4);
    }
    if (this.state.builtStage >= 5 && this.state.stats.productTrades < 1) {
      return this.findStageBuilding(5);
    }
    return undefined;
  }

  private findStageBuilding(stage: number): PlacedBuilding | undefined {
    return this.state?.buildings.find((building) => !this.isFeatureBuilding(building.spec) && building.spec.stage === stage);
  }

  private hasRegionCompanion(regionId: RegionId) {
    return Boolean(this.state?.companions?.[regionId] || (regionId === "rural" && this.state?.hasDog));
  }

  private isFeatureBuilding(spec: VillageBuildingSpec): spec is FeatureBuildingSpec {
    return "effectKind" in spec;
  }

  private textureForBuilding(regionId: RegionId, spec: VillageBuildingSpec) {
    return this.isFeatureBuilding(spec) ? featureBuildingTextureKey(spec.id) : buildingTextureKey(regionId, spec.asset);
  }

  private createAnimations() {
    Object.values(regions).forEach((region) => {
      const harvestKey = workerHarvestAnimationKey(region.id);
      if (!this.anims.exists(harvestKey)) {
        this.anims.create({
          key: harvestKey,
          frames: this.anims.generateFrameNumbers(characterTextureKey(region.id, "workerHarvest"), { start: 0, end: 3 }),
          frameRate: 6,
          repeat: -1,
        });
      }
      this.createDirectionalAnimation(characterTextureKey(region.id, "workerWalk"), `worker-${region.id}`);
      this.createDirectionalAnimation(characterTextureKey(region.id, "merchantWalk"), `merchant-${region.id}`);
      this.createDirectionalAnimation(characterTextureKey(region.id, "merchantCart"), `merchant-cart-${region.id}`);
      this.createDirectionalAnimation(characterTextureKey(region.id, "productWagon"), `product-wagon-${region.id}`);
    });
    Object.values(regions).forEach((region) => this.createDirectionalAnimation(animalTextureKey(region.id), `animal-${region.id}`));
    ruralTestVisitors.forEach((visitor) => this.createVisitorDirectionalAnimation(visitorTextureKey(visitor.id), `visitor-${visitor.id}`));
  }

  private createDirectionalAnimation(texture: string, prefix: string) {
    (["down", "left", "right", "up"] as Direction[]).forEach((direction, row) => {
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

  private directionFromDelta(dx: number, dy: number): Direction {
    if (Math.abs(dx) > Math.abs(dy)) return dx >= 0 ? "right" : "left";
    return dy >= 0 ? "down" : "up";
  }

  private currentRegion(): RegionId {
    return this.state?.selectedRegion ?? this.initialRegion;
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

  private getBuildingObstacles() {
    const placedBuildings = this.state?.buildings.map((building) => ({ x: building.x, y: building.y, radius: BUILDING_CLEARANCE })) ?? [];
    const constructions = [this.state?.construction, ...(this.state?.constructionQueue ?? [])]
      .filter((construction): construction is NonNullable<GameState["construction"]> => Boolean(construction))
      .map((construction) => construction.building);
    return [
      { x: MAIN_BUILDING[0], y: MAIN_BUILDING[1], radius: 118 },
      ...placedBuildings,
      ...constructions.map((construction) => ({ x: construction.x, y: construction.y, radius: BUILDING_CLEARANCE })),
    ];
  }

  private getPeople(exclude?: Phaser.GameObjects.Sprite) {
    return [
      ...this.workers,
      ...this.merchants.values(),
      ...this.visitors.values(),
      ...this.animals,
    ].filter((sprite) => sprite !== exclude && this.isSpriteAlive(sprite) && sprite.alpha > 0.05);
  }

  private resolveMovementTarget(sprite: Phaser.GameObjects.Sprite, target: [number, number]): [number, number] {
    let x = Phaser.Math.Clamp(target[0], 96, WORLD_W - 96);
    let y = Phaser.Math.Clamp(target[1], 96, WORLD_H - 96);
    for (let pass = 0; pass < 3; pass += 1) {
      this.getBuildingObstacles().forEach((obstacle) => {
        const distance = Phaser.Math.Distance.Between(x, y, obstacle.x, obstacle.y);
        if (distance >= obstacle.radius) return;
        const angle = distance > 0 ? Phaser.Math.Angle.Between(obstacle.x, obstacle.y, x, y) : Phaser.Math.Angle.Between(obstacle.x, obstacle.y, sprite.x, sprite.y);
        x = obstacle.x + Math.cos(angle) * obstacle.radius;
        y = obstacle.y + Math.sin(angle) * obstacle.radius;
      });
      this.getPeople(sprite).forEach((person) => {
        const distance = Phaser.Math.Distance.Between(x, y, person.x, person.y);
        if (distance >= PERSON_CLEARANCE) return;
        const angle = distance > 0 ? Phaser.Math.Angle.Between(person.x, person.y, x, y) : Phaser.Math.Angle.Between(person.x, person.y, sprite.x, sprite.y);
        x = person.x + Math.cos(angle) * PERSON_CLEARANCE;
        y = person.y + Math.sin(angle) * PERSON_CLEARANCE;
      });
      x = Phaser.Math.Clamp(x, 96, WORLD_W - 96);
      y = Phaser.Math.Clamp(y, 96, WORLD_H - 96);
    }
    return [x, y];
  }

  private buildingDetour(from: [number, number], to: [number, number]) {
    for (const obstacle of this.getBuildingObstacles()) {
      if (from.y === to.y) {
        const left = Math.min(from.x, to.x);
        const right = Math.max(from.x, to.x);
        if (obstacle.x >= left && obstacle.x <= right && Math.abs(from.y - obstacle.y) < obstacle.radius) {
          const detourY = Phaser.Math.Clamp(obstacle.y + (from.y <= obstacle.y ? -obstacle.radius : obstacle.radius), 96, WORLD_H - 96);
          return [[from[0], detourY], [to[0], detourY]] as Array<[number, number]>;
        }
      }
      if (from.x === to.x) {
        const top = Math.min(from.y, to.y);
        const bottom = Math.max(from.y, to.y);
        if (obstacle.y >= top && obstacle.y <= bottom && Math.abs(from.x - obstacle.x) < obstacle.radius) {
          const detourX = Phaser.Math.Clamp(obstacle.x + (from.x <= obstacle.x ? -obstacle.radius : obstacle.radius), 96, WORLD_W - 96);
          return [[detourX, from[1]], [detourX, to[1]]] as Array<[number, number]>;
        }
      }
    }
    return [] as Array<[number, number]>;
  }

  private buildSafePath(sprite: Phaser.GameObjects.Sprite, targets: Array<[number, number]>) {
    const requestedPoints = this.expandOrthogonalPath([sprite.x, sprite.y], targets.map((target) => this.resolveMovementTarget(sprite, target)));
    const safePoints: Array<[number, number]> = [];
    let previous: [number, number] = [sprite.x, sprite.y];
    requestedPoints.forEach((point) => {
      const detour = this.buildingDetour(previous, point);
      safePoints.push(...detour, point);
      previous = point;
    });
    return safePoints;
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
    const points = this.buildSafePath(sprite, targets);
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

  private getWorkerSpawn(index: number): [number, number] {
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    const spawns = this.tuning.workerSpawns?.[regionId] ?? [];
    return spawns[index] ?? [MAIN_FRONT[0] + index * 42, MAIN_FRONT[1]];
  }

  private repositionWorkers() {
    const regionId = this.currentRegion();
    this.workers.forEach((worker, index) => {
      const [x, y] = this.resolveMovementTarget(worker, this.getWorkerSpot(index));
      this.tweens.killTweensOf(worker);
      worker.setPosition(x, y).setTexture(characterTextureKey(regionId, "workerHarvest"));
      this.safelyPlay(worker, workerHarvestAnimationKey(regionId));
    });
  }

  private renderMerchants() {
    if (!this.state) return;
    const regionId = this.currentRegion();
    const ids = new Set(this.state.merchants.map((merchant) => merchant.id));
    this.merchants.forEach((sprite, id) => {
      if (!ids.has(id)) {
        this.destroySprite(sprite);
        this.merchants.delete(id);
      }
    });
    this.state.merchants.forEach((merchant, index) => {
      if (!this.merchants.has(merchant.id)) {
        const sprite = this.add
          .sprite(MAIN_FRONT[0] + index * 12, MAIN_FRONT[1], characterTextureKey(regionId, "merchantWalk"), 0)
          .setScale(WORKER_SCALE)
          .setAlpha(0)
          .setDepth(90);
        this.merchants.set(merchant.id, sprite);
      }
      const sprite = this.merchants.get(merchant.id)!;
      if (merchant.status === "traveling" && this.state?.isVisit && !this.tweens.isTweening(sprite) && !sprite.getData("ambient")) {
        this.animateAmbientMerchant(sprite, merchant.target ?? this.state.selectedRegion ?? "rural");
      } else if (merchant.status === "idle" && !this.tweens.isTweening(sprite)) {
        this.safelyPlay(
          sprite.setTexture(characterTextureKey(regionId, "merchantWalk")).setScale(WORKER_SCALE).setAlpha(this.state?.isVisit ? 1 : 0),
          characterAnimationKey(regionId, "merchant", "down"),
        );
      }
    });
  }

  private renderVisitors() {
    const showVisitors = this.state?.selectedRegion === "rural" && !this.state?.isVisit;
    if (!showVisitors) {
      this.visitors.forEach((visitor) => this.destroySprite(visitor));
      this.visitors.clear();
      return;
    }
    ruralTestVisitors.forEach((visitor) => {
      if (this.visitors.has(visitor.id)) return;
      const sprite = this.add
        .sprite(visitor.spawn[0], visitor.spawn[1], visitorTextureKey(visitor.id), 0)
        .setScale(WORKER_SCALE)
        .setDepth(20 + visitor.spawn[1] / 10);
      this.visitors.set(visitor.id, sprite);
      this.startVisitorPatrol(sprite, visitor);
    });
  }

  private createVisitorDirectionalAnimation(texture: string, prefix: string) {
    (["down", "up", "left", "right"] as Direction[]).forEach((direction, row) => {
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

  private startVisitorPatrol(sprite: Phaser.GameObjects.Sprite, visitor: (typeof ruralTestVisitors)[number], routeIndex = 1) {
    if (!this.isSpriteAlive(sprite) || this.state?.selectedRegion !== "rural" || this.state.isVisit) return;
    const target = visitor.route[routeIndex % visitor.route.length];
    const from: [number, number] = [sprite.x, sprite.y];
    this.safelyPlay(sprite, `visitor-${visitor.id}-${this.directionFromDelta(target[0] - from[0], target[1] - from[1])}`);
    this.moveSpriteOrthogonally(sprite, [target], 76, undefined, () => {
      this.time.delayedCall(550, () => this.startVisitorPatrol(sprite, visitor, routeIndex + 1));
    });
  }

  private renderAnimals() {
    if (!this.state) return;
    const regionId = this.currentRegion();
    const companionCount = this.state.companionCounts?.[regionId] ?? (this.hasRegionCompanion(regionId) ? 1 : 0);
    const currentAnimalRegion = this.animals[0]?.getData("regionId") as RegionId | undefined;
    if (companionCount < 1 || currentAnimalRegion !== regionId) {
      this.animals.forEach((animal) => this.destroySprite(animal));
      this.animals = [];
      if (companionCount < 1) return;
    }
    this.animals = this.animals.filter((animal) => this.isSpriteAlive(animal));
    while (this.animals.length > companionCount) {
      const animal = this.animals.pop();
      if (animal) this.destroySprite(animal);
    }
    while (this.animals.length < companionCount) {
      const spawn = this.getCompanionSpawnPoint(this.animals.length);
      this.addCompanion(regionId, spawn[0], spawn[1]);
    }
    this.animals.forEach((animal) => {
      if (this.isSpriteAlive(animal) && !animal.getData("wandering")) this.wanderCompanion(animal, regionId);
    });
  }

  private addCompanion(regionId: RegionId, x: number, y: number) {
    const companion = this.add.sprite(x, y, animalTextureKey(regionId), 0).setScale(animalScales[regionId]).setDepth(95);
    companion.setData("regionId", regionId);
    companion.setData("wandering", false);
    const [safeX, safeY] = this.resolveMovementTarget(companion, [x, y]);
    companion.setPosition(safeX, safeY);
    this.safelyPlay(companion, animalAnimationKey(regionId, "down"));
    this.animals.push(companion);
    this.time.delayedCall(450, () => this.wanderCompanion(companion, regionId));
  }

  private getCompanionSpawnPoint(index = 0): [number, number] {
    const storages = this.state?.buildings.filter((building) => !this.isFeatureBuilding(building.spec) && building.spec.stage === 2) ?? [];
    const storage = storages[index % storages.length];
    if (!storage) return [MAIN_FRONT[0] + index * 62, MAIN_FRONT[1]];
    return this.offsetFromBuilding(storage.x, storage.y, index % 2 === 0 ? -46 : 46, 78);
  }

  private getCompanionDestinations(): Array<[number, number]> {
    const buildingDestinations =
      this.state?.buildings.flatMap((building, index) => {
        const side = index % 2 === 0 ? -1 : 1;
        return [
          this.offsetFromBuilding(building.x, building.y, side * 76, 82),
          this.offsetFromBuilding(building.x, building.y, -side * 58, 26),
        ];
      }) ?? [];
    return [MAIN_FRONT, ...buildingDestinations];
  }

  private offsetFromBuilding(x: number, y: number, dx: number, dy: number): [number, number] {
    return [Phaser.Math.Clamp(x + dx, 120, WORLD_W - 120), Phaser.Math.Clamp(y + dy, 120, WORLD_H - 120)];
  }

  private pickCompanionDestination(sprite: Phaser.GameObjects.Sprite): [number, number] {
    const destinations = this.getCompanionDestinations().filter(
      ([x, y]) => Phaser.Math.Distance.Between(sprite.x, sprite.y, x, y) > 48,
    );
    if (!destinations.length) return MAIN_FRONT;
    return Phaser.Utils.Array.GetRandom(destinations);
  }

  private isResourceBuilding(spec: VillageBuildingSpec): spec is BuildingSpec {
    return !this.isFeatureBuilding(spec) && (spec.stage === 1 || spec.stage === 2);
  }

  private isNearResourceBuilding(sprite: Phaser.GameObjects.Sprite) {
    return Boolean(
      this.state?.buildings.some(
        (building) =>
          this.isResourceBuilding(building.spec) &&
          Phaser.Math.Distance.Between(sprite.x, sprite.y, building.x, building.y) <= ANIMAL_RESOURCE_DISTANCE,
      ),
    );
  }

  private maybeCompanionFindsResource(sprite: Phaser.GameObjects.Sprite, regionId: RegionId) {
    if (this.state?.isVisit || !this.isNearResourceBuilding(sprite) || Math.random() > ANIMAL_RESOURCE_CHANCE) return;
    this.companionSpeechBubble(sprite, "찾았다 +1");
    this.emitToReact({ type: "companionFoundResource", resource: regions[regionId].resource });
  }

  private wanderCompanion(sprite: Phaser.GameObjects.Sprite, regionId: RegionId) {
    if (!this.isSpriteAlive(sprite) || sprite.getData("regionId") !== regionId || sprite.getData("wandering")) return;
    sprite.setData("wandering", true);
    const target = this.pickCompanionDestination(sprite);
    this.moveSpriteOrthogonally(
      sprite,
      [target],
      ANIMAL_SPEED,
      (from, to) => {
        const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
        sprite.setDepth(90 + sprite.y / 20);
        sprite.setScale(animalDirectionalScale(regionId, direction));
        this.safelyPlay(sprite, animalAnimationKey(regionId, direction));
      },
      () => {
        if (!this.isSpriteAlive(sprite)) return;
        sprite.setDepth(90 + sprite.y / 20);
        sprite.stop();
        sprite.setTexture(animalTextureKey(regionId)).setFrame(0).setScale(animalDirectionalScale(regionId, "down"));
        this.maybeCompanionFindsResource(sprite, regionId);
        const pauseMs = Phaser.Math.Between(1200, 3200);
        this.time.delayedCall(pauseMs, () => {
          if (!this.isSpriteAlive(sprite)) return;
          sprite.setData("wandering", false);
          this.wanderCompanion(sprite, regionId);
        });
      },
    );
  }

  private startPlacement(building: VillageBuildingSpec) {
    this.placement = building;
    this.preview?.destroy();
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    this.preview = this.add
      .image(WORLD_W / 2, WORLD_H / 2, this.textureForBuilding(regionId, building))
      .setDisplaySize(168, 168)
      .setAlpha(0.65)
      .setDepth(200);
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
    if (pointer.isDown && (this.editMode?.mode === "blockedPaint" || this.editMode?.mode === "blockedErase")) {
      this.recordEditedTile(pointer);
      return;
    }
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
    if (this.editMode?.mode === "blockedPaint" || this.editMode?.mode === "blockedErase") {
      if (this.editedTiles.size === 0) this.recordEditedTile(pointer);
      return;
    }
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
    return this.state.buildings.every((building) => Phaser.Math.Distance.Between(x, y, building.x, building.y) >= MIN_BUILDING_DISTANCE)
      && this.getPeople().every((person) => Phaser.Math.Distance.Between(x, y, person.x, person.y) >= BUILDING_CLEARANCE);
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

  private findNavigationPath(start: [number, number], destination: [number, number]) {
    const columns = Math.ceil(WORLD_W / NAV_TILE_SIZE);
    const rows = Math.ceil(WORLD_H / NAV_TILE_SIZE);
    const toTile = ([x, y]: [number, number]) => [Phaser.Math.Clamp(Math.floor(x / NAV_TILE_SIZE), 0, columns - 1), Phaser.Math.Clamp(Math.floor(y / NAV_TILE_SIZE), 0, rows - 1)] as [number, number];
    const [startX, startY] = toTile(start);
    const [endX, endY] = toTile(destination);
    const key = (x: number, y: number) => `${x},${y}`;
    const blocked = new Set(this.tuning.blockedTiles?.[this.currentRegion()] ?? []);
    const obstacles = this.getBuildingObstacles();
    const passable = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= columns || y >= rows || blocked.has(key(x, y))) return false;
      const centerX = x * NAV_TILE_SIZE + NAV_TILE_SIZE / 2;
      const centerY = y * NAV_TILE_SIZE + NAV_TILE_SIZE / 2;
      return obstacles.every((obstacle) => Phaser.Math.Distance.Between(centerX, centerY, obstacle.x, obstacle.y) >= obstacle.radius);
    };
    const queue: Array<[number, number]> = [[startX, startY]];
    const previous = new Map<string, string>();
    const visited = new Set([key(startX, startY)]);
    while (queue.length) {
      const [x, y] = queue.shift()!;
      if (x === endX && y === endY) break;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
        const nextX = x + dx;
        const nextY = y + dy;
        const nextKey = key(nextX, nextY);
        if (!visited.has(nextKey) && passable(nextX, nextY)) {
          visited.add(nextKey);
          previous.set(nextKey, key(x, y));
          queue.push([nextX, nextY]);
        }
      });
    }
    if (!visited.has(key(endX, endY))) return null;
    const tiles: Array<[number, number]> = [];
    for (let current = key(endX, endY); current !== key(startX, startY); current = previous.get(current)!) {
      const [x, y] = current.split(",").map(Number);
      tiles.push([x * NAV_TILE_SIZE + NAV_TILE_SIZE / 2, y * NAV_TILE_SIZE + NAV_TILE_SIZE / 2]);
    }
    return tiles.reverse();
  }

  private animateMerchant(merchantId: string, target: RegionId) {
    const sprite = this.merchants.get(merchantId);
    if (!sprite) return;
    const regionId = this.currentRegion();
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const destination = this.tuning.merchantDestinations?.[target] ?? targetPoints[target];
    const route = this.findNavigationPath(MAIN_FRONT, destination);
    if (!route) {
      this.emitToReact({ type: "notice", message: "상인이 갈 수 있는 길이 없습니다." });
      return;
    }
    const outboundTarget = route[route.length - 1] ?? destination;
    sprite.setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setTexture(characterTextureKey(regionId, "merchantCart")).setScale(0.88).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED,
        (from, to) => {
          const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
          this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", direction));
        },
      () => {
        sprite.setAlpha(0).setPosition(outboundTarget[0], outboundTarget[1]);
        this.time.delayedCall(5000, () => {
          if (!this.isSpriteAlive(sprite)) return;
          sprite.setTexture(characterTextureKey(regionId, "merchantCart")).setScale(0.88).setAlpha(1).setPosition(outboundTarget[0], outboundTarget[1]);
          this.moveSpriteOrthogonally(
            sprite,
            this.findNavigationPath(outboundTarget, MAIN_FRONT) ?? [MAIN_FRONT],
            MERCHANT_SPEED,
            (from, to) => {
              const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
              this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", direction));
            },
            () => {
              sprite.setTexture(characterTextureKey(regionId, "merchantWalk")).setScale(WORKER_SCALE).setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setAlpha(0);
              this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant", "down"));
              this.emitToReact({ type: "merchantReturned", merchantId });
            },
          );
        });
      },
    );
  }

  private animateAmbientMerchant(sprite: Phaser.GameObjects.Sprite, target: RegionId) {
    const regionId = this.currentRegion();
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const route = this.tuning.merchantRoutes[target]?.length ? this.tuning.merchantRoutes[target]! : [targetPoints[target]];
    sprite.setData("ambient", true);
    sprite.setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setTexture(characterTextureKey(regionId, "merchantCart")).setScale(0.88).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED * 0.85,
      (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
      () => {
        const returnRoute = [...route].reverse();
        this.time.delayedCall(1200, () => {
          if (!this.isSpriteAlive(sprite)) return;
          this.moveSpriteOrthogonally(
            sprite,
            [...returnRoute.slice(1), MAIN_FRONT],
            MERCHANT_SPEED * 0.85,
            (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
            () => {
              sprite.setData("ambient", false);
            },
          );
        });
      },
    );
  }

  private animateProductWagon(target: RegionId, product: ProductId) {
    const regionId = this.currentRegion();
    const targetPoints: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const route = this.tuning.merchantRoutes[target]?.length ? this.tuning.merchantRoutes[target]! : [targetPoints[target]];
    const returnRoute = [...route].reverse();
    const outboundTarget = route[route.length - 1] ?? targetPoints[target];
    const sprite = this.add.sprite(MAIN_FRONT[0], MAIN_FRONT[1], characterTextureKey(regionId, "productWagon"), 0).setScale(0.94).setDepth(110);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED * 0.78,
      (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "product-wagon", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
      () => {
        sprite.setAlpha(0).setPosition(outboundTarget[0], outboundTarget[1]);
        this.time.delayedCall(3800, () => {
          if (!this.isSpriteAlive(sprite)) return;
          sprite.setAlpha(1).setPosition(outboundTarget[0], outboundTarget[1]);
          this.moveSpriteOrthogonally(
            sprite,
            [...returnRoute.slice(1), MAIN_FRONT],
            MERCHANT_SPEED * 0.78,
            (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "product-wagon", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
            () => {
              this.destroySprite(sprite);
              this.emitToReact({ type: "productWagonReturned", target, product });
            },
          );
        });
      },
    );
  }

  private animateMerchantEnter(merchantId: string, x: number, y: number) {
    const regionId = this.currentRegion();
    let sprite = this.merchants.get(merchantId);
    if (!sprite) {
      sprite = this.add.sprite(x, y, characterTextureKey(regionId, "merchantWalk"), 0).setScale(WORKER_SCALE).setDepth(90);
      this.merchants.set(merchantId, sprite);
    }
    sprite.setPosition(x, y).setTexture(characterTextureKey(regionId, "merchantWalk")).setScale(WORKER_SCALE).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      [MAIN_FRONT],
      MERCHANT_SPEED,
      (from, to) => {
        const direction = this.directionFromDelta(to[0] - from[0], to[1] - from[1]);
        this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant", direction));
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
    this.drawNavigationGrid(graphics);
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

  private recordEditedTile(pointer: Phaser.Input.Pointer) {
    const world = pointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const tileX = Math.floor(world.x / NAV_TILE_SIZE);
    const tileY = Math.floor(world.y / NAV_TILE_SIZE);
    if (tileX < 0 || tileY < 0 || tileX * NAV_TILE_SIZE >= WORLD_W || tileY * NAV_TILE_SIZE >= WORLD_H) return;
    const tile = `${tileX},${tileY}`;
    if (this.editedTiles.has(tile)) return;
    this.editedTiles.add(tile);
    this.emitToReact({ type: "editTiles", tiles: [tile], blocked: this.editMode?.mode === "blockedPaint" });
  }

  private drawNavigationGrid(graphics: Phaser.GameObjects.Graphics) {
    const regionId = this.state?.selectedRegion;
    if (!regionId) return;
    graphics.lineStyle(1, 0x27451f, 0.28);
    for (let x = 0; x <= WORLD_W; x += NAV_TILE_SIZE) {
      graphics.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += NAV_TILE_SIZE) {
      graphics.lineBetween(0, y, WORLD_W, y);
    }
    (this.tuning.blockedTiles?.[regionId] ?? []).forEach((tile) => {
      const [tileX, tileY] = tile.split(",").map(Number);
      if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) return;
      graphics.fillStyle(0xc9473d, 0.55);
      graphics.fillRect(tileX * NAV_TILE_SIZE + 1, tileY * NAV_TILE_SIZE + 1, NAV_TILE_SIZE - 2, NAV_TILE_SIZE - 2);
      graphics.lineStyle(2, 0x7d211d, 0.8);
      graphics.strokeRect(tileX * NAV_TILE_SIZE + 1, tileY * NAV_TILE_SIZE + 1, NAV_TILE_SIZE - 2, NAV_TILE_SIZE - 2);
    });
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

  private companionSpeechBubble(sprite: Phaser.GameObjects.Sprite, text: string) {
    if (!this.isSpriteAlive(sprite)) return;
    const paddingX = 14;
    const paddingY = 8;
    const label = this.add
      .text(0, 0, text, {
        fontFamily: "Arial",
        fontSize: "20px",
        color: "#3f2a17",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(302);
    const width = label.width + paddingX * 2;
    const height = label.height + paddingY * 2;
    const x = sprite.x;
    const y = sprite.y - 58;
    const bubble = this.add.graphics().setDepth(301);
    bubble.fillStyle(0xfff7db, 0.96);
    bubble.lineStyle(3, 0x6a4524, 0.95);
    bubble.fillRoundedRect(x - width / 2, y - height / 2, width, height, 10);
    bubble.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 10);
    bubble.fillTriangle(x - 8, y + height / 2 - 1, x + 8, y + height / 2 - 1, x, y + height / 2 + 12);
    bubble.strokeTriangle(x - 8, y + height / 2 - 1, x + 8, y + height / 2 - 1, x, y + height / 2 + 12);
    label.setPosition(x, y);
    const targets = [bubble, label];
    this.tweens.add({
      targets,
      y: "-=18",
      alpha: 0,
      delay: 850,
      duration: 550,
      ease: "Sine.easeInOut",
      onComplete: () => {
        bubble.destroy();
        label.destroy();
      },
    });
  }
}
