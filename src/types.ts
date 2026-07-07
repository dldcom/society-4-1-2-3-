import type { BuildingSpec, ItemId, RegionId, ResourceId } from "./gameData";

export type PlacedBuilding = {
  id: string;
  spec: BuildingSpec;
  x: number;
  y: number;
  hasMerchant: boolean;
  productionBoosted: boolean;
};

export type Merchant = {
  id: string;
  name: string;
  status: "idle" | "traveling";
  buildingId: string;
  spawnX?: number;
  spawnY?: number;
  receiveResource?: ResourceId;
  receiveAmount?: number;
  target?: RegionId;
};

export type GameStats = {
  trades: number;
  gifts: number;
  crafts: number;
};

export type GameState = {
  selectedRegion: RegionId | null;
  resources: Record<ItemId, number>;
  workers: number;
  merchants: Merchant[];
  development: number;
  autoBonus: number;
  builtStage: number;
  buildings: PlacedBuilding[];
  hasDog: boolean;
  hasChicken: boolean;
  stats: GameStats;
  success: boolean;
};

export type BuildZoneRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RouteTuning = {
  workerSpots: Partial<Record<RegionId, Array<[number, number]>>>;
  merchantRoutes: Partial<Record<RegionId, Array<[number, number]>>>;
  buildZones: Partial<Record<RegionId, BuildZoneRect[]>>;
};

export type SceneCommand =
  | { type: "sync"; state: GameState; tuning: RouteTuning }
  | { type: "setState"; state: GameState }
  | { type: "setTuning"; tuning: RouteTuning }
  | { type: "setEditMode"; mode: "worker" | "merchant" | "buildZone" | null; target?: RegionId }
  | { type: "setMapView"; mode: "play" | "overview" }
  | { type: "startPlacement"; building: BuildingSpec }
  | { type: "cancelPlacement" }
  | { type: "merchantEnter"; merchantId: string; x: number; y: number }
  | { type: "merchantTravel"; merchantId: string; target: RegionId }
  | { type: "floatText"; text: string; x?: number; y?: number };

export type SceneEvent =
  | { type: "placeBuilding"; building: BuildingSpec; x: number; y: number }
  | { type: "selectBuilding"; buildingId: string }
  | { type: "selectMainBuilding" }
  | { type: "merchantReturned"; merchantId: string }
  | { type: "editPoint"; x: number; y: number }
  | { type: "moveBuildZoneRect"; zoneIndex: number; rect: BuildZoneRect }
  | { type: "notice"; message: string };
