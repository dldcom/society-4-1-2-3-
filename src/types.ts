import type { ItemId, ProductId, RegionId, ResourceId, VillageBuildingSpec } from "./gameData";

export type PlacedBuilding = {
  id: string;
  spec: VillageBuildingSpec;
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
  productTrades: number;
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
  featureBuildings: string[];
  buildings: PlacedBuilding[];
  companions?: Partial<Record<RegionId, boolean>>;
  hasDog: boolean;
  stats: GameStats;
  success: boolean;
  isVisit?: boolean;
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
  | { type: "startPlacement"; building: VillageBuildingSpec }
  | { type: "cancelPlacement" }
  | { type: "merchantEnter"; merchantId: string; x: number; y: number }
  | { type: "merchantTravel"; merchantId: string; target: RegionId }
  | { type: "productWagonTravel"; target: RegionId; product: ProductId }
  | { type: "floatText"; text: string; x?: number; y?: number };

export type SceneEvent =
  | { type: "placeBuilding"; building: VillageBuildingSpec; x: number; y: number }
  | { type: "selectBuilding"; buildingId: string }
  | { type: "selectMainBuilding" }
  | { type: "merchantReturned"; merchantId: string }
  | { type: "productWagonReturned"; target: RegionId; product: ProductId }
  | { type: "companionFoundResource"; resource: ResourceId }
  | { type: "editPoint"; x: number; y: number }
  | { type: "moveBuildZoneRect"; zoneIndex: number; rect: BuildZoneRect }
  | { type: "notice"; message: string };
