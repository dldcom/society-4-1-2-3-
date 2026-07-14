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
const MAIN_FRONT_CLEARANCE = 240;
const WORKER_SCALE = 0.96;
const PLAY_ZOOM = 1.14;
const TABLET_PORTRAIT_PLAY_ZOOM = 0.9;
const TABLET_LANDSCAPE_PLAY_ZOOM = 0.96;
const MOBILE_MAX_WIDTH = 760;
const TABLET_MAX_WIDTH = 1180;
const COARSE_POINTER_TABLET_MAX_WIDTH = 1366;
const MERCHANT_SPEED = 230;
const WORKER_SPEED = 260;
const ANIMAL_SPEED = 115;
const ANIMAL_RESOURCE_CHANCE = 0.22;
const ANIMAL_RESOURCE_DISTANCE = 135;
const PERSON_CLEARANCE = 58;
const BUILDING_CLEARANCE = 108;
const WORKSHOP_CORRIDOR_WIDTH = 170;
const WORKSHOP_CORRIDOR_DEPTH = 130;
const WORKSHOP_CORRIDOR_OFFSET_Y = 84;
const WORKSHOP_WAGON_OFFSET_Y = 118;
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
const craftToolTextureKey = (regionId: RegionId) => `craft-tool-${regionId}`;
const craftToolAssets: Record<RegionId, string> = {
  rural: "/assets/tools/sickle.png",
  mountain: "/assets/tools/hand-saw.png",
  mine: "/assets/tools/hammer.png",
  coast: "/assets/tools/rope.png",
};
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

const VISITOR_DEVELOPMENT_THRESHOLDS = Array.from({ length: 8 }, (_, index) => (index + 1) * 40);

const developmentVisitorTypes = [
  {
    id: "mountain-merchant",
    asset: "/assets/visitors/mountain-merchant-walk-4x4.png",
    lines: ["우리 지역에는 높은 산과 울창한 숲이 많아요.", "이 마을에는 무엇이 유명한가요?"],
  },
  {
    id: "mountain-artisan",
    asset: "/assets/visitors/mountain-artisan-walk-4x4.png",
    lines: ["우리 지역에서는 나무를 여러 가지로 활용해요.", "튼튼한 도구는 여러 일에 필요해요."],
  },
  {
    id: "mountain-traveler",
    asset: "/assets/visitors/mountain-traveler-walk-4x4.png",
    lines: ["우리 지역에서는 높은 곳의 풍경을 볼 수 있어요.", "이곳의 자연환경은 우리 지역과 어떻게 다를까요?"],
  },
  {
    id: "rural-produce-merchant",
    asset: "/assets/visitors/rural-produce-merchant-walk-4x4.png",
    lines: ["우리 지역에는 넓은 논과 밭이 있어요.", "이 마을에서는 무엇을 많이 생산하나요?"],
  },
  {
    id: "rural-mill-technician",
    asset: "/assets/visitors/rural-mill-technician-walk-4x4.png",
    lines: ["우리 지역에서는 곡식을 여러 방법으로 가공해요.", "기계의 톱니가 움직이는 모습은 신기해요."],
  },
  {
    id: "rural-orchard-traveler",
    asset: "/assets/visitors/rural-orchard-traveler-walk-4x4.png",
    lines: ["우리 지역에는 과수원 나무가 잘 자라고 있어요.", "이곳은 계절에 따라 어떤 모습으로 바뀌나요?"],
  },
  {
    id: "coast-fish-merchant",
    asset: "/assets/visitors/coast-fish-merchant-walk-4x4.png",
    lines: ["우리 지역에서는 바다에서 다양한 것을 얻을 수 있어요.", "이 마을 사람들은 주로 어떤 일을 하나요?"],
  },
  {
    id: "coast-net-technician",
    asset: "/assets/visitors/coast-net-technician-walk-4x4.png",
    lines: ["우리 지역에서는 그물을 꼼꼼하게 손질해요.", "튼튼한 도구가 있으면 일을 하기 편리해요."],
  },
  {
    id: "coast-sailor-traveler",
    asset: "/assets/visitors/coast-sailor-traveler-walk-4x4.png",
    lines: ["우리 지역에서는 배를 타고 이동하기도 해요.", "이 마을에는 어떤 특별한 장소가 있나요?"],
  },
  {
    id: "mine-mineral-merchant",
    asset: "/assets/visitors/mine-mineral-merchant-walk-4x4.png",
    lines: ["우리 지역의 땅속에는 다양한 광물이 있어요.", "이 마을의 대표상품은 무엇인가요?"],
  },
  {
    id: "mine-blacksmith",
    asset: "/assets/visitors/mine-blacksmith-walk-4x4.png",
    lines: ["우리 지역에서는 광물로 여러 도구를 만들어요.", "재료에 따라 도구의 특징도 달라져요."],
  },
  {
    id: "mine-surveyor-traveler",
    asset: "/assets/visitors/mine-surveyor-traveler-walk-4x4.png",
    lines: ["우리 지역에는 땅속 자원을 찾는 사람들이 많아요.", "지도에서 이 마을은 어디에 있을까요?"],
  },
];

const commonVisitorLines = [
  "우리 지역과 다른 점을 찾아보고 있어요.",
  "지역마다 자연환경이 다르네요.",
  "이 마을의 특별한 점은 무엇인가요?",
  "사람들은 이곳에서 어떻게 생활하나요?",
  "이곳에서는 어떤 자원을 얻을 수 있나요?",
  "다른 지역을 구경하는 건 재미있어요.",
  "지역마다 하는 일이 조금씩 다르네요.",
  "마을을 천천히 둘러보고 싶어요.",
];

const visitorPatrols: Array<{ spawn: [number, number]; route: Array<[number, number]> }> = [
  { spawn: [900, 700], route: [[900, 700], [1030, 700], [1030, 810], [900, 810]] },
  { spawn: [1460, 690], route: [[1460, 690], [1330, 690], [1330, 800], [1460, 800]] },
  { spawn: [1180, 980], route: [[1180, 980], [1280, 980], [1280, 1080], [1180, 1080]] },
  { spawn: [760, 850], route: [[760, 850], [870, 850], [870, 950], [760, 950]] },
  { spawn: [1510, 900], route: [[1510, 900], [1390, 900], [1390, 1010], [1510, 1010]] },
  { spawn: [1100, 620], route: [[1100, 620], [1220, 620], [1220, 720], [1100, 720]] },
  { spawn: [1340, 1060], route: [[1340, 1060], [1450, 1060], [1450, 1160], [1340, 1160]] },
  { spawn: [820, 1060], route: [[820, 1060], [930, 1060], [930, 1160], [820, 1160]] },
];

type DevelopmentVisitor = (typeof visitorPatrols)[number] & {
  id: string;
  typeId: string;
  asset: string;
};

export class VillageScene extends Phaser.Scene {
  private emitToReact: EmitEvent;
  private state?: GameState;
  private bg?: Phaser.GameObjects.Image;
  private mainBuilding?: Phaser.GameObjects.Image;
  private mainBuildingLabel?: Phaser.GameObjects.Container;
  private buildings = new Map<string, Phaser.GameObjects.Image>();
  private labels = new Map<string, Phaser.GameObjects.Container>();
  private constructionObjects = new Map<string, { sprite: Phaser.GameObjects.Image; label: Phaser.GameObjects.Container; hammer: Phaser.GameObjects.Image }>();
  private productCraftObjects?: { buildingId: string; icon: Phaser.GameObjects.Image; label: Phaser.GameObjects.Container };
  private missionHalo?: Phaser.GameObjects.Ellipse;
  private missionBubble?: Phaser.GameObjects.Container;
  private missionTargetId?: string;
  private workers: Phaser.GameObjects.Sprite[] = [];
  private workerRegion?: RegionId;
  private shownRegion?: RegionId;
  private merchants = new Map<string, Phaser.GameObjects.Sprite>();
  private visitors = new Map<string, Phaser.GameObjects.Sprite>();
  private developmentVisitors: DevelopmentVisitor[];
  private visitorSpeechTimer?: Phaser.Time.TimerEvent;
  private visitorSpeechHideTimer?: Phaser.Time.TimerEvent;
  private visitorSpeech?: { sprite: Phaser.GameObjects.Sprite; container: Phaser.GameObjects.Container; width: number; height: number };
  private lastVisitorSpeechLine?: string;
  private animals: Phaser.GameObjects.Sprite[] = [];
  private visitBustleTimer?: Phaser.Time.TimerEvent;
  private placement?: VillageBuildingSpec;
  private movingBuildingId?: string;
  private preview?: Phaser.GameObjects.Image;
  private placementCorridor?: Phaser.GameObjects.Rectangle;
  private initialRegion: RegionId;
  private tuning: RouteTuning = { workerSpots: {}, merchantRoutes: {}, workerSpawns: {}, merchantDestinations: {}, blockedTiles: {}, buildZones: {} };
  private editMode?: {
    mode: "worker" | "merchant" | "merchantDestination" | "workerSpawn" | "blockedPaint" | "blockedErase" | "buildZone";
    target?: RegionId;
  };
  private mapView: "play" | "overview" = "play";
  private routeGraphics?: Phaser.GameObjects.Graphics;
  private buildZoneHandles: Phaser.GameObjects.GameObject[] = [];
  private liveBuildZoneRects = new Map<number, BuildZoneRect>();
  private dragStart?: Phaser.Math.Vector2;
  private lastPointer?: Phaser.Math.Vector2;
  private pointerMoved = false;
  private editedTiles = new Set<string>();
  private mineMerchantTestStarted = false;
  private loadingRegions = new Set<RegionId>();
  private loadingCharacterAssets = new Set<string>();
  private loadingCharacterRegions = new Set<RegionId>();
  private loadingBuildingAssets = new Set<string>();
  private trackLoadingProgress = false;
  private hasReceivedTuning = false;
  private tuningSignature = "";

  constructor(initialRegion: RegionId, emitToReact: EmitEvent, initialState?: GameState) {
    super("VillageScene");
    this.initialRegion = initialRegion;
    this.emitToReact = emitToReact;
    this.state = initialState;
    const shuffledTypes = Phaser.Utils.Array.Shuffle([...developmentVisitorTypes]);
    this.developmentVisitors = visitorPatrols.map((patrol, index) => {
      const type = shuffledTypes[index];
      return {
        ...patrol,
        id: `development-visitor-${index + 1}`,
        typeId: type.id,
        asset: type.asset,
      };
    });
  }

  preload() {
    this.beginAssetLoad();
    this.load.on(Phaser.Loader.Events.PROGRESS, (progress: number) => {
      if (this.trackLoadingProgress) this.emitToReact({ type: "assetLoading", progress });
    });
    this.queueRegionAssets(this.initialRegion);
    this.load.image(hammerTextureKey, "/assets/tools/hammer.png");
    (Object.keys(craftToolAssets) as RegionId[]).forEach((regionId) => {
      this.load.image(craftToolTextureKey(regionId), craftToolAssets[regionId]);
    });
  }

  private beginAssetLoad() {
    this.trackLoadingProgress = true;
    this.emitToReact({ type: "assetLoading", progress: 0 });
  }

  private finishAssetLoad() {
    this.trackLoadingProgress = false;
    this.emitToReact({ type: "assetsReady" });
  }

  private queueRegionAssets(regionId: RegionId, state = this.state) {
    const region = regions[regionId];
    if (!this.textures.exists(`bg-${regionId}`)) this.load.image(`bg-${regionId}`, region.bg);
    const buildingSpecs = state?.selectedRegion === regionId
      ? [
        ...state.buildings.map((building) => building.spec),
        ...(state.construction ? [state.construction.building.spec] : []),
        ...(state.constructionQueue ?? []).map((construction) => construction.building.spec),
      ]
      : [];
    if (buildingSpecs.length > 0) {
      buildingSpecs.forEach((spec) => {
        if (this.isFeatureBuilding(spec)) {
          const key = featureBuildingTextureKey(spec.id);
          if (!this.textures.exists(key)) this.load.image(key, spec.asset);
          return;
        }
        const key = buildingTextureKey(regionId, spec.asset);
        if (!this.textures.exists(key)) this.load.image(key, buildingAssetPath(regionId, spec.asset));
      });
    } else {
      buildingAssetIds.forEach((asset) => {
        const key = buildingTextureKey(regionId, asset);
        if (!this.textures.exists(key)) this.load.image(key, buildingAssetPath(regionId, asset));
      });
    }
    const mainKey = mainBuildingTextureKey(regionId);
    if (!this.textures.exists(mainKey)) this.load.image(mainKey, mainBuildingAssetPath(regionId));
  }

  private queueCharacterAssets(regionId: RegionId, state = this.state) {
    const region = regions[regionId];
    const sheets = characterSpriteSheets[regionId];
    const characterAssets: Array<[CharacterSpriteKind, string, number]> = [];
    if (!state || state.workers > 0) characterAssets.push(["workerWalk", sheets.workerWalk, 64], ["workerHarvest", sheets.workerHarvest, 64]);
    if (!state || state.merchants.length > 0) characterAssets.push(["merchantWalk", sheets.merchantWalk, 64], ["merchantCart", sheets.merchantCart, 96]);
    if (!state || state.isVisit) characterAssets.push(["productWagon", sheets.productWagon, 96]);
    characterAssets.forEach(([kind, path, frameSize]) => {
      const key = characterTextureKey(regionId, kind);
      if (!this.textures.exists(key)) this.load.spritesheet(key, path, { frameWidth: frameSize, frameHeight: frameSize });
    });
    const hasCompanion = Boolean(state?.companions?.[regionId] || (regionId === "rural" && state?.hasDog));
    const animalKey = animalTextureKey(regionId);
    if ((!state || hasCompanion) && !this.textures.exists(animalKey)) this.load.spritesheet(animalKey, animalSpriteSheets[regionId], { frameWidth: 64, frameHeight: 64 });
    if (!state || !state.isVisit) {
      developmentVisitorTypes.forEach((visitor) => {
        const key = visitorTextureKey(visitor.id);
        if (!this.textures.exists(key)) this.load.spritesheet(key, visitor.asset, { frameWidth: 64, frameHeight: 64 });
      });
    }
  }

  private hasRegionAssets(regionId: RegionId, state = this.state) {
    if (!this.textures.exists(`bg-${regionId}`) || !this.textures.exists(mainBuildingTextureKey(regionId))) return false;
    const buildingSpecs = state?.selectedRegion === regionId
      ? [
        ...state.buildings.map((building) => building.spec),
        ...(state.construction ? [state.construction.building.spec] : []),
        ...(state.constructionQueue ?? []).map((construction) => construction.building.spec),
      ]
      : [];
    if (!buildingSpecs.every((spec) => this.textures.exists(this.textureForBuilding(regionId, spec)))) return false;
    return true;
  }

  private ensureRegionAssets(regionId: RegionId) {
    if (this.hasRegionAssets(regionId)) return true;
    if (this.loadingRegions.has(regionId)) return false;
    this.loadingRegions.add(regionId);
    this.beginAssetLoad();
    this.queueRegionAssets(regionId);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingRegions.delete(regionId);
      this.createAnimationsForRegion(regionId);
      this.renderState();
      this.finishAssetLoad();
    });
    this.load.start();
    return false;
  }

  private ensureCharacterAssetsForState(regionId: RegionId) {
    if (!this.state || this.loadingCharacterRegions.has(regionId)) return;
    const needsWorkers = this.state.workers > 0 && !this.textures.exists(characterTextureKey(regionId, "workerWalk"));
    const needsMerchants = this.state.merchants.length > 0 && !this.textures.exists(characterTextureKey(regionId, "merchantWalk"));
    const needsWagon = Boolean(this.state.isVisit) && !this.textures.exists(characterTextureKey(regionId, "productWagon"));
    const needsAnimal = (this.state.companionCounts?.[regionId] ?? (this.hasRegionCompanion(regionId) ? 1 : 0)) > 0
      && !this.textures.exists(animalTextureKey(regionId));
    const needsVisitors = !this.state.isVisit
      && developmentVisitorTypes.some((visitor) => !this.textures.exists(visitorTextureKey(visitor.id)));
    if (!needsWorkers && !needsMerchants && !needsWagon && !needsAnimal && !needsVisitors) return;
    this.loadingCharacterRegions.add(regionId);
    this.queueCharacterAssets(regionId);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingCharacterRegions.delete(regionId);
      this.createAnimationsForRegion(regionId);
      this.renderState();
    });
    this.load.start();
  }

  private ensureProductWagonAsset(regionId: RegionId, onReady: () => void) {
    const key = characterTextureKey(regionId, "productWagon");
    if (this.textures.exists(key)) return true;
    if (this.loadingCharacterAssets.has(key)) return false;
    this.loadingCharacterAssets.add(key);
    this.load.spritesheet(key, characterSpriteSheets[regionId].productWagon, { frameWidth: 96, frameHeight: 96 });
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingCharacterAssets.delete(key);
      this.createAnimationsForRegion(regionId);
      onReady();
    });
    this.load.start();
    return false;
  }

  private ensureBuildingAsset(regionId: RegionId, building: VillageBuildingSpec, onReady: () => void) {
    const key = this.textureForBuilding(regionId, building);
    if (this.textures.exists(key)) return true;
    if (this.loadingBuildingAssets.has(key)) return false;
    this.loadingBuildingAssets.add(key);
    if (this.isFeatureBuilding(building)) this.load.image(key, building.asset);
    else this.load.image(key, buildingAssetPath(regionId, building.asset));
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.loadingBuildingAssets.delete(key);
      onReady();
    });
    this.load.start();
    return false;
  }

  create() {
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setZoom(this.playZoomForViewport());
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
    if (this.state) this.renderState();
    this.finishAssetLoad();
  }

  update() {
    const speech = this.visitorSpeech;
    if (!speech) return;
    if (!this.isSpriteAlive(speech.sprite)) {
      this.clearVisitorSpeech();
      return;
    }
    const view = this.cameras.main.worldView;
    const halfWidth = speech.width / 2 + 8;
    const x = Phaser.Math.Clamp(speech.sprite.x, view.left + halfWidth, view.right - halfWidth);
    const y = Math.max(view.top + speech.height / 2 + 8, speech.sprite.y - 72);
    speech.container.setPosition(x, y);
  }

  applyCommand(command: SceneCommand) {
    if (command.type === "sync") {
      this.tuning = command.tuning;
      this.hasReceivedTuning = true;
      this.tuningSignature = JSON.stringify(command.tuning);
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
      const nextSignature = JSON.stringify(command.tuning);
      const tuningChanged = this.tuningSignature !== "" && nextSignature !== this.tuningSignature;
      this.tuning = command.tuning;
      this.hasReceivedTuning = true;
      this.tuningSignature = nextSignature;
      this.renderState();
      if (tuningChanged) this.repositionWorkers();
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
    if (command.type === "startMoveBuilding") {
      const building = this.state?.buildings.find((item) => item.id === command.buildingId);
      if (building) this.startPlacement(building.spec, building.id, building.x, building.y);
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
    if (!this.ensureRegionAssets(region.id)) return;
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
          if (this.pointerMoved || this.placement) return;
          if (this.state?.isVisit) {
            this.emitToReact({ type: "notice", message: "구경 중에는 건물을 조작할 수 없어요." });
            return;
          }
          if (this.state?.productCraft?.buildingId === building.id) {
            this.emitToReact({ type: "notice", message: "이 건물은 상품을 만드는 중이에요." });
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
      if (this.state.productCraft?.buildingId === building.id) {
        sprite.disableInteractive().setAlpha(0.82);
      } else {
        if (!sprite.input?.enabled) sprite.setInteractive({ useHandCursor: true });
        sprite.setAlpha(this.movingBuildingId === building.id ? 0.22 : 1);
      }
      this.labels.get(building.id)
        ?.setPosition(building.x, building.y + 88)
        .setAlpha(this.movingBuildingId === building.id ? 0.22 : 1);
    });

    this.renderConstruction();
    this.renderProductCrafting();
    this.renderMissionMarker();
    if (this.hasReceivedTuning) {
      this.ensureCharacterAssetsForState(region.id);
      this.renderWorkers();
      this.renderMerchants();
      this.renderVisitors();
      this.renderAnimals();
      this.renderVisitBustle();
      this.runMineMerchantNavigationTest();
    }
    if (this.shownRegion !== region.id) {
      this.shownRegion = region.id;
      this.emitToReact({ type: "regionShown", regionId: region.id });
    }
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

  private renderProductCrafting() {
    const job = this.state?.productCraft;
    const building = job ? this.state?.buildings.find((item) => item.id === job.buildingId) : undefined;
    if (!job || !building || !this.state?.selectedRegion) {
      this.productCraftObjects?.icon.destroy();
      this.productCraftObjects?.label.destroy();
      this.productCraftObjects = undefined;
      return;
    }

    if (!this.productCraftObjects || this.productCraftObjects.buildingId !== job.buildingId) {
      this.productCraftObjects?.icon.destroy();
      this.productCraftObjects?.label.destroy();
      const icon = this.add
        .image(building.x + 38, building.y - 58, craftToolTextureKey(this.state.selectedRegion))
        .setDisplaySize(58, 58)
        .setDepth(95)
        .setAngle(-18);
      const label = this.createBuildingLabel("상품 제작 중", false).setDepth(96);
      this.tweens.add({
        targets: icon,
        angle: 18,
        y: "+=12",
        duration: 300,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
      });
      this.productCraftObjects = { buildingId: job.buildingId, icon, label };
    }

    this.productCraftObjects.icon.setX(building.x + 38);
    this.productCraftObjects.label.setPosition(building.x, building.y - 112);
  }

  private renderWorkers() {
    if (!this.state?.selectedRegion) return;
    const regionId = this.currentRegion();
    if (this.workerRegion !== regionId) {
      this.workers.forEach((worker) => this.destroySprite(worker));
      this.workers = [];
      this.workerRegion = regionId;
    }
    if (!this.textures.exists(characterTextureKey(regionId, "workerWalk")) || !this.textures.exists(characterTextureKey(regionId, "workerHarvest"))) {
      return;
    }
    while (this.workers.length < this.state.workers) {
      const index = this.workers.length;
      const target = this.getWorkerSpawn(index);
      const spawn: [number, number] = [MAIN_FRONT[0] + index * 42, MAIN_FRONT[1]];
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
    this.workers.forEach((worker, index) => {
      if (!this.isInsideWorkshopCorridor(worker.x, worker.y, 24)) return;
      const [x, y] = this.resolveMovementTarget(worker, this.getWorkerSpot(index));
      this.tweens.killTweensOf(worker);
      worker.setPosition(x, y).setTexture(characterTextureKey(regionId, "workerHarvest"));
      this.safelyPlay(worker, workerHarvestAnimationKey(regionId));
    });
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
    this.createAnimationsForRegion(this.initialRegion);
  }

  private createAnimationsForRegion(regionId: RegionId) {
    const harvestKey = workerHarvestAnimationKey(regionId);
    if (this.textures.exists(characterTextureKey(regionId, "workerHarvest")) && !this.anims.exists(harvestKey)) {
      this.anims.create({
        key: harvestKey,
        frames: this.anims.generateFrameNumbers(characterTextureKey(regionId, "workerHarvest"), { start: 0, end: 3 }),
        frameRate: 6,
        repeat: -1,
      });
    }
    this.createDirectionalAnimation(characterTextureKey(regionId, "workerWalk"), `worker-${regionId}`);
    this.createDirectionalAnimation(characterTextureKey(regionId, "merchantWalk"), `merchant-${regionId}`);
    this.createDirectionalAnimation(characterTextureKey(regionId, "merchantCart"), `merchant-cart-${regionId}`);
    this.createDirectionalAnimation(characterTextureKey(regionId, "productWagon"), `product-wagon-${regionId}`);
    this.createDirectionalAnimation(animalTextureKey(regionId), `animal-${regionId}`);
    developmentVisitorTypes.forEach((visitor) => this.createVisitorDirectionalAnimation(visitorTextureKey(visitor.id), `visitor-${visitor.id}`));
  }

  private createDirectionalAnimation(texture: string, prefix: string) {
    if (!this.textures.exists(texture)) return;
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

  private getPlacementBlockers() {
    return [
      ...this.workers,
      ...this.merchants.values(),
      ...this.animals,
    ].filter((sprite) => this.isSpriteAlive(sprite) && sprite.alpha > 0.05);
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
    const availableSpots = spots.filter(([x, y]) => !this.isInsideWorkshopCorridor(x, y, 36));
    const safeSpots = availableSpots.length ? availableSpots : spots;
    return safeSpots[index % safeSpots.length];
  }

  private getWorkerSpawn(index: number): [number, number] {
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    const spawns = this.tuning.workerSpawns?.[regionId] ?? [];
    if (spawns[index]) return spawns[index];
    if (this.state?.isVisit) return RESOURCE_SPOTS[regionId][index % RESOURCE_SPOTS[regionId].length];
    return [MAIN_FRONT[0] + index * 42, MAIN_FRONT[1]];
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
    if (!this.textures.exists(characterTextureKey(regionId, "merchantWalk")) || !this.textures.exists(characterTextureKey(regionId, "merchantCart"))) return;
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
      } else if (merchant.status === "traveling" && !this.state?.isVisit && !sprite.getData("tradeJourney")) {
        this.animateMerchant(merchant.id, merchant.target ?? this.state.selectedRegion ?? "rural");
      } else if (merchant.status === "idle" && !this.tweens.isTweening(sprite)) {
        this.safelyPlay(
          sprite.setTexture(characterTextureKey(regionId, "merchantWalk")).setScale(WORKER_SCALE).setAlpha(this.state?.isVisit ? 1 : 0),
          characterAnimationKey(regionId, "merchant", "down"),
        );
      }
    });
  }

  private renderVisitBustle() {
    if (!this.state?.isVisit) {
      this.visitBustleTimer?.remove(false);
      this.visitBustleTimer = undefined;
      return;
    }
    if (this.visitBustleTimer) return;
    const launchWagon = () => {
      if (!this.state?.isVisit) {
        this.visitBustleTimer = undefined;
        return;
      }
      const regionId = this.currentRegion();
      const target = (Object.keys(regions) as RegionId[]).find((id) => id !== regionId) ?? "rural";
      this.animateProductWagon(target, regions[regionId].product);
      this.visitBustleTimer = this.time.delayedCall(4200, launchWagon);
    };
    this.visitBustleTimer = this.time.delayedCall(900, launchWagon);
  }

  private renderVisitors() {
    const regionId = this.currentRegion();
    const hasRequiredVisitorAssets = this.state?.isVisit
      ? this.textures.exists(characterTextureKey(regionId, "merchantWalk"))
      : developmentVisitorTypes.every((visitor) => this.textures.exists(visitorTextureKey(visitor.id)));
    if (!hasRequiredVisitorAssets) {
      this.stopVisitorSpeech();
      this.visitors.forEach((visitor) => this.destroySprite(visitor));
      this.visitors.clear();
      return;
    }
    if (this.state?.isVisit) {
      this.stopVisitorSpeech();
      const ids = Array.from({ length: 3 }, (_, index) => `visit-crowd-${index}`);
      this.visitors.forEach((visitor, id) => {
        if (!ids.includes(id)) {
          this.destroySprite(visitor);
          this.visitors.delete(id);
        }
      });
      ids.forEach((id, index) => {
        if (this.visitors.has(id)) return;
        const sprite = this.add
          .sprite(760 + index * 150, 950 + (index % 2) * 110, characterTextureKey(regionId, "merchantWalk"), 0)
          .setScale(WORKER_SCALE)
          .setDepth(88 + index);
        this.visitors.set(id, sprite);
        this.startVisitCrowdPatrol(sprite, regionId, index);
      });
      return;
    }
    const showVisitors = Boolean(this.state?.selectedRegion) && !this.state?.isVisit;
    if (!showVisitors) {
      this.stopVisitorSpeech();
      this.visitors.forEach((visitor) => this.destroySprite(visitor));
      this.visitors.clear();
      return;
    }
    const visitorCount = VISITOR_DEVELOPMENT_THRESHOLDS.filter(
      (threshold) => (this.state?.development ?? 0) >= threshold,
    ).length;
    const activeVisitors = this.developmentVisitors.slice(0, visitorCount);
    const activeVisitorIds = new Set(activeVisitors.map((visitor) => visitor.id));
    this.visitors.forEach((visitor, id) => {
      if (!activeVisitorIds.has(id)) {
        this.destroySprite(visitor);
        this.visitors.delete(id);
      }
    });
    activeVisitors.forEach((visitor) => {
      if (this.visitors.has(visitor.id)) return;
      const sprite = this.add
        .sprite(visitor.spawn[0], visitor.spawn[1], visitorTextureKey(visitor.typeId), 0)
        .setScale(WORKER_SCALE)
        .setDepth(20 + visitor.spawn[1] / 10);
      sprite.setData("visitorTypeId", visitor.typeId);
      this.visitors.set(visitor.id, sprite);
      this.startVisitorPatrol(sprite, visitor);
    });
    this.scheduleVisitorSpeech();
  }

  private createVisitorDirectionalAnimation(texture: string, prefix: string) {
    if (!this.textures.exists(texture)) return;
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

  private startVisitorPatrol(sprite: Phaser.GameObjects.Sprite, visitor: DevelopmentVisitor, routeIndex = 1) {
    if (!this.isSpriteAlive(sprite) || !this.state?.selectedRegion || this.state.isVisit) return;
    const target = visitor.route[routeIndex % visitor.route.length];
    const from: [number, number] = [sprite.x, sprite.y];
    this.safelyPlay(sprite, `visitor-${visitor.typeId}-${this.directionFromDelta(target[0] - from[0], target[1] - from[1])}`);
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
    if (!this.textures.exists(animalTextureKey(regionId))) return;
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
    return [MAIN_FRONT, ...buildingDestinations].filter(([x, y]) => !this.isInsideWorkshopCorridor(x, y, 30));
  }

  private scheduleVisitorSpeech() {
    if (this.visitorSpeechTimer || this.state?.isVisit || this.visitors.size === 0) return;
    this.visitorSpeechTimer = this.time.delayedCall(Phaser.Math.Between(7000, 12000), () => {
      this.visitorSpeechTimer = undefined;
      this.showRandomVisitorSpeech();
      this.scheduleVisitorSpeech();
    });
  }

  private showRandomVisitorSpeech() {
    if (this.state?.isVisit || this.visitorSpeech) return;
    const candidates = [...this.visitors.entries()]
      .filter(([id, sprite]) => id.startsWith("development-visitor-") && this.isSpriteAlive(sprite))
      .map(([, sprite]) => sprite);
    if (candidates.length === 0) return;
    const sprite = Phaser.Utils.Array.GetRandom(candidates);
    const visitorTypeId = sprite.getData("visitorTypeId") as string | undefined;
    const visitorType = developmentVisitorTypes.find((visitor) => visitor.id === visitorTypeId);
    if (!visitorType) return;
    const linePool = Math.random() < 0.2 ? commonVisitorLines : visitorType.lines;
    const differentLines = linePool.filter((line) => line !== this.lastVisitorSpeechLine);
    const line = Phaser.Utils.Array.GetRandom(differentLines.length > 0 ? differentLines : linePool);
    this.lastVisitorSpeechLine = line;
    this.createVisitorSpeechBubble(sprite, line);
  }

  private createVisitorSpeechBubble(sprite: Phaser.GameObjects.Sprite, line: string) {
    this.clearVisitorSpeech();
    const label = this.add.text(0, 0, line, {
      fontFamily: "Arial",
      fontSize: "20px",
      color: "#3f2a17",
      fontStyle: "bold",
      align: "center",
      wordWrap: { width: 340, useAdvancedWrap: true },
    }).setOrigin(0.5);
    const width = Math.min(372, label.width + 28);
    const height = label.height + 18;
    const background = this.add.graphics();
    background.fillStyle(0xfff7db, 0.97);
    background.lineStyle(3, 0x6a4524, 0.96);
    background.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    background.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    background.fillTriangle(-8, height / 2 - 1, 8, height / 2 - 1, 0, height / 2 + 11);
    background.strokeTriangle(-8, height / 2 - 1, 8, height / 2 - 1, 0, height / 2 + 11);
    const container = this.add.container(sprite.x, sprite.y - 72, [background, label]).setDepth(310);
    this.visitorSpeech = { sprite, container, width, height: height + 11 };
    this.visitorSpeechHideTimer = this.time.delayedCall(3000, () => this.clearVisitorSpeech());
  }

  private clearVisitorSpeech() {
    this.visitorSpeechHideTimer?.remove(false);
    this.visitorSpeechHideTimer = undefined;
    this.visitorSpeech?.container.destroy(true);
    this.visitorSpeech = undefined;
  }

  private stopVisitorSpeech() {
    this.visitorSpeechTimer?.remove(false);
    this.visitorSpeechTimer = undefined;
    this.clearVisitorSpeech();
  }

  private offsetFromBuilding(x: number, y: number, dx: number, dy: number): [number, number] {
    return [Phaser.Math.Clamp(x + dx, 120, WORLD_W - 120), Phaser.Math.Clamp(y + dy, 120, WORLD_H - 120)];
  }

  private isWorkshopSpec(spec: VillageBuildingSpec) {
    return !this.isFeatureBuilding(spec) && spec.stage === 5;
  }

  private getWorkshopCorridor(x: number, y: number): BuildZoneRect {
    return {
      x: x - WORKSHOP_CORRIDOR_WIDTH / 2,
      y: y + WORKSHOP_CORRIDOR_OFFSET_Y,
      width: WORKSHOP_CORRIDOR_WIDTH,
      height: WORKSHOP_CORRIDOR_DEPTH,
    };
  }

  private getWorkshopBuildings(excludeBuildingId?: string) {
    const constructions = [this.state?.construction, ...(this.state?.constructionQueue ?? [])]
      .filter((construction): construction is NonNullable<GameState["construction"]> => Boolean(construction))
      .map((construction) => construction.building);
    return [...(this.state?.buildings ?? []), ...constructions].filter(
      (building) => building.id !== excludeBuildingId && this.isWorkshopSpec(building.spec),
    );
  }

  private isInsideWorkshopCorridor(x: number, y: number, padding = 0, excludeBuildingId?: string) {
    return this.getWorkshopBuildings(excludeBuildingId).some((building) => {
      const corridor = this.getWorkshopCorridor(building.x, building.y);
      return x >= corridor.x - padding
        && x <= corridor.x + corridor.width + padding
        && y >= corridor.y - padding
        && y <= corridor.y + corridor.height + padding;
    });
  }

  private circleIntersectsRect(x: number, y: number, radius: number, rect: BuildZoneRect) {
    const closestX = Phaser.Math.Clamp(x, rect.x, rect.x + rect.width);
    const closestY = Phaser.Math.Clamp(y, rect.y, rect.y + rect.height);
    return Phaser.Math.Distance.Between(x, y, closestX, closestY) < radius;
  }

  private getWorkshopWagonStart(): [number, number] {
    const workshop = this.getWorkshopBuildings()[0];
    return workshop
      ? this.offsetFromBuilding(workshop.x, workshop.y, 0, WORKSHOP_WAGON_OFFSET_Y)
      : MAIN_FRONT;
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

  private startPlacement(
    building: VillageBuildingSpec,
    movingBuildingId?: string,
    initialX = WORLD_W / 2,
    initialY = WORLD_H / 2,
  ) {
    const regionId = this.state?.selectedRegion ?? this.initialRegion;
    if (!this.ensureBuildingAsset(regionId, building, () => this.startPlacement(building, movingBuildingId, initialX, initialY))) {
      this.emitToReact({ type: "notice", message: "건물 도면을 불러오는 중입니다." });
      return;
    }
    this.placement = building;
    this.movingBuildingId = movingBuildingId;
    this.preview?.destroy();
    this.preview = this.add
      .image(initialX, initialY, this.textureForBuilding(regionId, building))
      .setDisplaySize(168, 168)
      .setAlpha(0.65)
      .setDepth(200);
    this.placementCorridor?.destroy();
    this.placementCorridor = this.isWorkshopSpec(building)
      ? this.add.rectangle(
          initialX,
          initialY + WORKSHOP_CORRIDOR_OFFSET_Y + WORKSHOP_CORRIDOR_DEPTH / 2,
          WORKSHOP_CORRIDOR_WIDTH,
          WORKSHOP_CORRIDOR_DEPTH,
          0x88ff88,
          0.18,
        ).setStrokeStyle(3, 0x88ff88, 0.8).setDepth(199)
      : undefined;
    this.renderState();
  }

  private cancelPlacement() {
    this.placement = undefined;
    this.movingBuildingId = undefined;
    this.preview?.destroy();
    this.preview = undefined;
    this.placementCorridor?.destroy();
    this.placementCorridor = undefined;
    this.renderState();
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
      const canPlace = this.canPlaceAt(world.x, world.y);
      this.preview.setPosition(world.x, world.y);
      this.preview.setTint(canPlace ? 0x88ff88 : 0xff7777);
      this.placementCorridor
        ?.setPosition(world.x, world.y + WORKSHOP_CORRIDOR_OFFSET_Y + WORKSHOP_CORRIDOR_DEPTH / 2)
        .setFillStyle(canPlace ? 0x88ff88 : 0xff7777, 0.18)
        .setStrokeStyle(3, canPlace ? 0x88ff88 : 0xff7777, 0.8);
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
      if (this.movingBuildingId) {
        this.emitToReact({ type: "moveBuilding", buildingId: this.movingBuildingId, x: world.x, y: world.y });
        this.floatText("이동 완료!", world.x, world.y - 80);
      } else {
        this.emitToReact({ type: "placeBuilding", building: this.placement, x: world.x, y: world.y });
        this.floatText("완성!", world.x, world.y - 80);
      }
      this.cancelPlacement();
    } else {
      if (!this.isInBuildZone(world.x, world.y)) {
        this.floatText("건설불가 지역", world.x, world.y - 70);
        this.emitToReact({ type: "notice", message: "건설불가 지역입니다." });
        if (!this.movingBuildingId) this.cancelPlacement();
        return;
      }
      this.floatText("배치 불가", world.x, world.y - 70);
      this.emitToReact({ type: "notice", message: "그 위치에는 지을 수 없어요." });
    }
  }

  private isInBuildZone(x: number, y: number) {
    if (!this.state?.selectedRegion) return false;
    const zones = this.tuning.buildZones[this.state.selectedRegion] ?? [];
    if (zones.length > 0) return zones.some((zone) => this.isPointInRect(x, y, zone));
    return x >= 150 && y >= 130 && x <= WORLD_W - 150 && y <= WORLD_H - 130;
  }

  private startVisitCrowdPatrol(sprite: Phaser.GameObjects.Sprite, regionId: RegionId, index: number) {
    if (!this.isSpriteAlive(sprite) || !this.state?.isVisit || this.currentRegion() !== regionId) return;
    const buildings = this.state.buildings;
    const building = buildings[(index + Phaser.Math.Between(0, Math.max(0, buildings.length - 1))) % buildings.length];
    const target = building
      ? this.offsetFromBuilding(building.x, building.y, index % 2 === 0 ? -92 : 92, index % 3 === 0 ? 104 : 62)
      : [900 + index * 120, 760] as [number, number];
    this.moveSpriteOrthogonally(
      sprite,
      [target],
      82,
      (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
      () => this.time.delayedCall(700 + index * 160, () => this.startVisitCrowdPatrol(sprite, regionId, index)),
    );
  }

  private canPlaceAt(x: number, y: number) {
    if (!this.state) return false;
    const isInMainFrontClearance =
      y >= MAIN_BUILDING[1] && Phaser.Math.Distance.Between(x, y, MAIN_FRONT[0], MAIN_FRONT[1]) < MAIN_FRONT_CLEARANCE;
    if (isInMainFrontClearance) return false;
    const zones = this.state.selectedRegion ? this.tuning.buildZones[this.state.selectedRegion] : undefined;
    if (zones?.length) {
      if (!zones.some((zone) => this.isPointInRect(x, y, zone))) return false;
    } else if (x < 150 || y < 130 || x > WORLD_W - 150 || y > WORLD_H - 130) {
      return false;
    }
    const constructions = [this.state.construction, ...(this.state.constructionQueue ?? [])]
      .filter((construction): construction is NonNullable<GameState["construction"]> => Boolean(construction))
      .map((construction) => construction.building);
    const buildings = [...this.state.buildings, ...constructions].filter(
      (building) => building.id !== this.movingBuildingId,
    );
    const clearsBuildings = buildings.every((building) => Phaser.Math.Distance.Between(x, y, building.x, building.y) >= MIN_BUILDING_DISTANCE);
    const clearsPeople = this.getPlacementBlockers().every((person) => Phaser.Math.Distance.Between(x, y, person.x, person.y) >= BUILDING_CLEARANCE);
    const clearsWorkshopCorridors = !this.isInsideWorkshopCorridor(x, y, 84, this.movingBuildingId);
    if (!clearsBuildings || !clearsPeople || !clearsWorkshopCorridors) return false;

    if (!this.placement || !this.isWorkshopSpec(this.placement)) return true;
    const corridor = this.getWorkshopCorridor(x, y);
    const corridorCorners: Array<[number, number]> = [
      [corridor.x, corridor.y],
      [corridor.x + corridor.width, corridor.y],
      [corridor.x, corridor.y + corridor.height],
      [corridor.x + corridor.width, corridor.y + corridor.height],
    ];
    if (!corridorCorners.every(([cornerX, cornerY]) => this.isInBuildZone(cornerX, cornerY))) return false;

    const obstacles = [
      { x: MAIN_BUILDING[0], y: MAIN_BUILDING[1], radius: 118 },
      ...buildings.map((building) => ({ x: building.x, y: building.y, radius: 84 })),
    ];
    return obstacles.every((obstacle) => !this.circleIntersectsRect(obstacle.x, obstacle.y, obstacle.radius, corridor));
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
    this.cameras.main.setZoom(this.playZoomForViewport());
    this.cameras.main.centerOn(
      Phaser.Math.Clamp(this.cameras.main.midPoint.x, 0, WORLD_W),
      Phaser.Math.Clamp(this.cameras.main.midPoint.y, 0, WORLD_H),
    );
    this.drawRouteGuide();
  }

  private playZoomForViewport() {
    const width = this.cameras?.main?.width ?? this.scale.width;
    const height = this.cameras?.main?.height ?? this.scale.height;
    if (width <= MOBILE_MAX_WIDTH) return PLAY_ZOOM;
    const hasCoarsePointer = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    const isTablet = width <= TABLET_MAX_WIDTH || (hasCoarsePointer && width <= COARSE_POINTER_TABLET_MAX_WIDTH);
    if (!isTablet) return PLAY_ZOOM;
    return height > width ? TABLET_PORTRAIT_PLAY_ZOOM : TABLET_LANDSCAPE_PLAY_ZOOM;
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

  private findVisitTrafficRoute(start: [number, number]): Array<[number, number]> {
    const candidates: Array<[number, number]> = [
      [MAIN_FRONT[0] + 420, MAIN_FRONT[1]], [MAIN_FRONT[0] - 420, MAIN_FRONT[1]],
      [MAIN_FRONT[0], MAIN_FRONT[1] + 340], [MAIN_FRONT[0], MAIN_FRONT[1] - 340],
      [MAIN_FRONT[0] + 520, MAIN_FRONT[1] + 260], [MAIN_FRONT[0] - 520, MAIN_FRONT[1] + 260],
      [MAIN_FRONT[0] + 520, MAIN_FRONT[1] - 260], [MAIN_FRONT[0] - 520, MAIN_FRONT[1] - 260],
    ];
    for (const candidate of candidates) {
      const route = this.findNavigationPath(start, candidate);
      if (route && route.length >= 3) return route;
    }
    return [[MAIN_FRONT[0] + 360, MAIN_FRONT[1] + 220]];
  }

  private getMerchantDestination(target: RegionId): [number, number] {
    const defaultDestinations: Record<RegionId, [number, number]> = {
      mountain: [330, 240],
      mine: [2050, 280],
      rural: [360, 1260],
      coast: [2070, 1230],
    };
    const origin = this.currentRegion();
    return this.tuning.merchantDestinations?.[origin]?.[target] ?? defaultDestinations[target];
  }

  private animateMerchant(merchantId: string, target: RegionId) {
    const sprite = this.merchants.get(merchantId);
    if (!sprite || sprite.getData("tradeJourney")) return;
    sprite.setData("tradeJourney", true);
    const regionId = this.currentRegion();
    const destination = this.getMerchantDestination(target);
    const route = this.findNavigationPath(MAIN_FRONT, destination);
    if (!route) {
      sprite.setData("tradeJourney", false);
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
              sprite.setData("tradeJourney", false);
              sprite.setTexture(characterTextureKey(regionId, "merchantWalk")).setScale(WORKER_SCALE).setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setAlpha(0);
              this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant", "down"));
              this.emitToReact({ type: "merchantReturned", merchantId });
            },
          );
        });
      },
    );
  }

  /**
   * 광산 맵의 이동 불가 타일을 확인하기 위한 임시 시나리오입니다.
   * 실제 교역 상인과 같은 findNavigationPath()를 사용하므로, 차단 타일을 통과하지 않습니다.
   */
  private runMineMerchantNavigationTest() {
    if (this.mineMerchantTestStarted || this.currentRegion() !== "mine") return;
    this.mineMerchantTestStarted = true;

    (["mountain", "coast", "rural"] as RegionId[]).forEach((target, index) => {
      this.time.delayedCall(index * 250, () => {
        if (this.currentRegion() !== "mine") return;
        const start: [number, number] = [MAIN_FRONT[0] + (index - 1) * 22, MAIN_FRONT[1]];
        const route = this.findNavigationPath(start, this.getMerchantDestination(target));
        if (!route) {
          this.emitToReact({ type: "notice", message: `${regions[target].name} 방향으로 갈 수 있는 길이 없습니다.` });
          return;
        }
        const merchant = this.add
          .sprite(start[0], start[1], characterTextureKey("mine", "merchantCart"), 0)
          .setScale(0.88)
          .setDepth(100 + index);
        this.moveSpriteOrthogonally(
          merchant,
          route,
          MERCHANT_SPEED,
          (from, to) => this.safelyPlay(merchant, characterAnimationKey("mine", "merchant-cart", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
          () => this.destroySprite(merchant),
        );
      });
    });
  }

  private animateAmbientMerchant(sprite: Phaser.GameObjects.Sprite, target: RegionId) {
    const regionId = this.currentRegion();
    const destination = this.getMerchantDestination(target);
    const route = this.findNavigationPath(MAIN_FRONT, destination) ?? (this.state?.isVisit ? this.findVisitTrafficRoute(MAIN_FRONT) : null);
    if (!route) return;
    sprite.setData("ambient", true);
    sprite.setPosition(MAIN_FRONT[0], MAIN_FRONT[1]).setTexture(characterTextureKey(regionId, "merchantCart")).setScale(0.88).setAlpha(1);
    this.moveSpriteOrthogonally(
      sprite,
      route,
      MERCHANT_SPEED * 0.85,
      (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
      () => {
        this.time.delayedCall(1200, () => {
          if (!this.isSpriteAlive(sprite)) return;
          const returnRoute = this.findNavigationPath([sprite.x, sprite.y], MAIN_FRONT) ?? [MAIN_FRONT];
          this.moveSpriteOrthogonally(
            sprite,
            returnRoute,
            MERCHANT_SPEED * 0.85,
            (from, to) => this.safelyPlay(sprite, characterAnimationKey(regionId, "merchant-cart", this.directionFromDelta(to[0] - from[0], to[1] - from[1]))),
            () => {
              sprite.setData("ambient", false);
              this.time.delayedCall(700, () => {
                if (this.state?.isVisit && this.isSpriteAlive(sprite)) this.animateAmbientMerchant(sprite, target);
              });
            },
          );
        });
      },
    );
  }

  private animateProductWagon(target: RegionId, product: ProductId) {
    const regionId = this.currentRegion();
    if (!this.ensureProductWagonAsset(regionId, () => this.animateProductWagon(target, product))) return;
    const destination = this.getMerchantDestination(target);
    let wagonStart = this.getWorkshopWagonStart();
    let route = this.findNavigationPath(wagonStart, destination) ?? (this.state?.isVisit ? this.findVisitTrafficRoute(wagonStart) : null);
    if (!route && (wagonStart[0] !== MAIN_FRONT[0] || wagonStart[1] !== MAIN_FRONT[1])) {
      wagonStart = MAIN_FRONT;
      route = this.findNavigationPath(wagonStart, destination) ?? (this.state?.isVisit ? this.findVisitTrafficRoute(wagonStart) : null);
    }
    if (!route) return;
    const outboundTarget = route[route.length - 1] ?? destination;
    const sprite = this.add.sprite(wagonStart[0], wagonStart[1], characterTextureKey(regionId, "productWagon"), 0).setScale(0.94).setDepth(110);
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
          const returnRoute = this.findNavigationPath(outboundTarget, wagonStart) ?? [wagonStart];
          this.moveSpriteOrthogonally(
            sprite,
            returnRoute,
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

    if (this.editMode?.mode === "merchantDestination" && this.editMode.target) {
      const [x, y] = this.getMerchantDestination(this.editMode.target);
      graphics.fillStyle(0xf0b932, 1);
      graphics.fillCircle(x, y, 17);
      graphics.lineStyle(4, 0x3b210e, 1);
      graphics.strokeCircle(x, y, 17);
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
    if (this.editMode?.mode === "merchantDestination" && this.editMode.target) {
      const [x, y] = this.getMerchantDestination(this.editMode.target);
      this.routeGraphics.fillStyle(0xf0b932, 1);
      this.routeGraphics.fillCircle(x, y, 17);
      this.routeGraphics.lineStyle(4, 0x3b210e, 1);
      this.routeGraphics.strokeCircle(x, y, 17);
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
