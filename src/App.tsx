import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer, HandCoins, Home, PackagePlus, Send, X } from "lucide-react";
import PhaserGame from "./PhaserGame";
import generatedTuning from "./routeTuning.generated.json";
import {
  allItems,
  buildingAssetPath,
  companionSpecs,
  featureBuildingsByRegion,
  itemNames,
  mainBuildingAssetPath,
  productIds,
  productNames,
  productSpecs,
  regionList,
  regions,
  resourceNames,
  type BuildingSpec,
  type FeatureBuildingSpec,
  type ItemId,
  type ProductId,
  type RegionId,
  type ResourceId,
  type VillageBuildingSpec,
} from "./gameData";
import type { GameState, Merchant, PlacedBuilding, QueuedSceneCommand, RepeatMission, RouteTuning, SceneCommand, SceneEvent } from "./types";

const emptyResources = () =>
  Object.fromEntries(allItems.map((item) => [item, 0])) as Record<ItemId, number>;

const canPay = (resources: Record<ItemId, number>, cost: Partial<Record<ItemId, number>>) =>
  Object.entries(cost).every(([item, amount]) => resources[item as ItemId] >= (amount ?? 0));

const TRADE_MIN_AMOUNT = 2;
const TRADE_STEP = 2;
const TRADE_MAX_AMOUNT = 20;
const AUTO_PRODUCTION_SECONDS = 5;
const COMPANION_AUTO_BONUS_CHANCE = 0.15;
const GAME_SAVE_KEY = "four-region-exchange-village-game";
const STARTING_HOME_RESOURCE = 6;
const MAX_WORKERS = 4;
const WORKER_BASE_COST = 6;
const WORKER_COST_STEP = 4;
const FIRST_STAGE_REWARD = 4;
const VISITOR_DEVELOPMENT_THRESHOLDS = Array.from({ length: 8 }, (_, index) => (index + 1) * 40);
const PRODUCT_TRADE_DEVELOPMENT = 10;
const BUILD_STATUS_READY = "건설 가능";
const BUILD_STATUS_DONE = "완성";
const BUILD_STATUS_LOCKED = "잠김";
const BUILD_STATUS_MISSING = "자원 부족";
const BUILD_STATUS_IN_PROGRESS = "공사 중";
const BUILD_DURATION_MS = 5000;
const PRODUCT_CRAFT_DURATION_MS = 3000;
const PRODUCT_CRAFT_MAX_AMOUNT = 5;
const merchantPortraitAssets: Record<RegionId, string> = {
  rural: "/assets/merchants/merchant-walk-4x4.webp",
  mountain: "/assets/merchants/mountain-merchant-walk-4x4.png",
  mine: "/assets/merchants/mine-merchant-walk-4x4.png",
  coast: "/assets/merchants/coast-merchant-walk-4x4.png",
};
const NORMAL_BUILDING_MAX_COPIES: Record<number, number> = {
  1: 3,
  2: 2,
  3: 1,
  4: 1,
  5: 1,
  6: 1,
};

const maxTradeAmount = (game: GameState, regionId: RegionId) =>
  Math.min(TRADE_MAX_AMOUNT, Math.floor(game.resources[regions[regionId].resource] / TRADE_STEP) * TRADE_STEP);

const workerRecruitCost = (workers: number) => WORKER_BASE_COST + Math.max(0, workers - 1) * WORKER_COST_STEP;

const workerRecruitResource = (game: GameState) =>
  game.selectedRegion ? regions[game.selectedRegion].resource : "grain";

const unlockedProductChoices = (game: GameState, regionId: RegionId) =>
  game.productCatalogUnlocked ? regions[regionId].products : [regions[regionId].product];

const autoProductionAmount = (game: GameState) => game.workers + game.autoBonus;

const visitorCountForDevelopment = (development: number) =>
  VISITOR_DEVELOPMENT_THRESHOLDS.filter((threshold) => development >= threshold).length;

const normalBuildings = (game: GameState) =>
  game.buildings.filter((building) => !isFeatureBuilding(building.spec));

const placedStageCount = (game: GameState, stage: number) =>
  normalBuildings(game).filter((building) => !isFeatureBuilding(building.spec) && building.spec.stage === stage).length;

const scheduledStageCount = (game: GameState, stage: number) =>
  [game.construction, ...(game.constructionQueue ?? [])].filter(
    (construction) => construction && !isFeatureBuilding(construction.building.spec) && construction.building.spec.stage === stage,
  ).length;

const normalBuildingLimit = (stage: number) => NORMAL_BUILDING_MAX_COPIES[stage] ?? 1;

const isNormalBuildingUnlocked = (game: GameState, building: BuildingSpec) =>
  building.stage === 1 || placedStageCount(game, building.stage - 1) > 0;

const scaledNormalBuildingCost = (game: GameState, building: BuildingSpec) => {
  const copyNumber = placedStageCount(game, building.stage) + scheduledStageCount(game, building.stage) + 1;
  const multiplier = building.stage <= 2 ? copyNumber : 1;
  return Object.fromEntries(
    Object.entries(building.cost).map(([item, amount]) => [item, (amount ?? 0) * multiplier]),
  ) as Partial<Record<ItemId, number>>;
};

const canBuildNormalBuilding = (game: GameState, building: BuildingSpec) => {
  if (!isNormalBuildingUnlocked(game, building)) return false;
  if (placedStageCount(game, building.stage) + scheduledStageCount(game, building.stage) >= normalBuildingLimit(building.stage)) return false;
  return canPay(game.resources, scaledNormalBuildingCost(game, building));
};

const payCost = (resources: Record<ItemId, number>, cost: Partial<Record<ItemId, number>>) => {
  const next = { ...resources };
  Object.entries(cost).forEach(([item, amount]) => {
    next[item as ItemId] -= amount ?? 0;
  });
  return next;
};

const multiplyCost = (cost: Partial<Record<ItemId, number>>, amount: number) =>
  Object.fromEntries(
    Object.entries(cost).map(([item, itemAmount]) => [item, (itemAmount ?? 0) * amount]),
  ) as Partial<Record<ItemId, number>>;

const maxCraftableAmount = (
  resources: Record<ItemId, number>,
  cost: Partial<Record<ItemId, number>>,
) => {
  const limits = Object.entries(cost)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([item, amount]) => Math.floor(resources[item as ItemId] / (amount ?? 1)));
  return Math.min(PRODUCT_CRAFT_MAX_AMOUNT, ...(limits.length ? limits : [0]));
};

const emptyCompanions = (): Partial<Record<RegionId, boolean>> => ({
  mountain: false,
  mine: false,
  rural: false,
  coast: false,
});

const hasRegionCompanion = (game: GameState, regionId: RegionId) =>
  Boolean(game.companions?.[regionId] || (regionId === "rural" && game.hasDog));

const companionCount = (game: GameState, regionId: RegionId) =>
  game.companionCounts?.[regionId] ?? (hasRegionCompanion(game, regionId) ? 1 : 0);

const companionLimit = (game: GameState) => placedStageCount(game, 2);

const formatCost = (cost: Partial<Record<ItemId, number>>) =>
  Object.entries(cost)
    .map(([item, amount]) => `${itemNames[item as ItemId]} ${amount}`)
    .join(", ");

const isFeatureBuilding = (building: VillageBuildingSpec): building is FeatureBuildingSpec =>
  "effectKind" in building;

const hasFeatureEffect = (game: GameState, kind: FeatureBuildingSpec["effectKind"]) =>
  game.selectedRegion
    ? featureBuildingsByRegion[game.selectedRegion].some(
        (building) => building.effectKind === kind && game.featureBuildings.includes(building.id),
      )
    : false;

const applyCraftDiscount = (
  recipe: Partial<Record<ItemId, number>>,
  game: GameState,
  regionId: RegionId,
) => {
  if (!hasFeatureEffect(game, "craft")) return recipe;
  const resource = regions[regionId].resource;
  const amount = recipe[resource] ?? 0;
  if (amount <= 0) return recipe;
  return { ...recipe, [resource]: Math.max(0, amount - 1) };
};

type MissionStep = {
  id: string;
  title: string;
  detail: string;
  progress: string;
  target?: RegionId;
};

type MissionDialogState = {
  kind: "next" | "complete";
  mission: MissionStep;
};

type TradeResultDialogState = {
  target: RegionId;
  resource: ResourceId;
  amount: number;
};

const createRepeatMission = (game: GameState, previous?: RepeatMission): RepeatMission | undefined => {
  if (!game.selectedRegion) return undefined;
  const targets = regionList.filter((region) => region.id !== game.selectedRegion).map((region) => region.id);
  const candidates: Array<Pick<RepeatMission, "kind" | "target" | "goal">> = [
    { kind: "craft", goal: 1 },
    ...targets.map((target) => ({ kind: "productTrade" as const, target, goal: 1 })),
    ...targets.map((target) => ({ kind: "resourceTrade" as const, target, goal: 2 })),
  ];
  const alternatives = previous
    ? candidates.filter((candidate) => candidate.kind !== previous.kind || candidate.target !== previous.target)
    : candidates;
  const selected = alternatives[Math.floor(Math.random() * alternatives.length)] ?? candidates[0];
  return { ...selected, id: `repeat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, progress: 0 };
};

const advanceRepeatMission = (game: GameState, kind: RepeatMission["kind"], target?: RegionId): GameState => {
  const mission = game.repeatMission;
  if (!mission || mission.kind !== kind || mission.target !== target) return game;
  const progress = Math.min(mission.goal, mission.progress + 1);
  if (progress < mission.goal) return { ...game, repeatMission: { ...mission, progress } };
  const completed = {
    ...game,
    resources: { ...game.resources, [regions[game.selectedRegion!].resource]: game.resources[regions[game.selectedRegion!].resource] + 2 },
    development: game.development + 2,
  };
  return { ...completed, repeatMission: createRepeatMission(completed, mission) };
};

const getRepeatMissionStep = (mission: RepeatMission): MissionStep => {
  const targetName = mission.target ? regions[mission.target].name : "";
  if (mission.kind === "craft") return { id: mission.id, title: "반복 퀘스트: 대표 상품 만들기", detail: "대표 상품을 1개 만드세요.", progress: `${mission.progress}/${mission.goal}` };
  if (mission.kind === "productTrade") return { id: mission.id, title: `반복 퀘스트: ${targetName}에 상품 보내기`, detail: `${targetName}에 상품을 ${mission.goal}회 보내세요.`, progress: `${mission.progress}/${mission.goal}` };
  return { id: mission.id, title: `반복 퀘스트: ${targetName}과 자원 교류하기`, detail: `${targetName}과 일반 자원 교류를 ${mission.goal}회 완료하세요.`, progress: `${mission.progress}/${mission.goal}` };
};

const getCurrentMission = (game: GameState): MissionStep | null => {
  if (!game.selectedRegion) return null;
  const region = regions[game.selectedRegion];
  const firstBuilding = region.buildings[0];
  const secondBuilding = region.buildings[1];
  const thirdBuilding = region.buildings[2];
  const fourthBuilding = region.buildings[3];
  const fifthBuilding = region.buildings[4];
  const finalBuilding = region.buildings[5];
  const tradeTargets = regionList
    .filter((target) => target.id !== game.selectedRegion)
    .sort((left, right) => {
      const leftNeeded = secondBuilding.cost[left.resource] ? 1 : 0;
      const rightNeeded = secondBuilding.cost[right.resource] ? 1 : 0;
      return rightNeeded - leftNeeded;
    });
  const [firstTradeTarget, ...laterTradeTargets] = tradeTargets;
  const tradedRegions = game.tradedRegions ?? {};

  const hasMerchant = game.merchants.length > 0;
  const hasCompanion = hasRegionCompanion(game, game.selectedRegion);
  const hasAnyOwnProduct = region.products.some((product) => game.resources[product] > 0);
  const hasAnyProductBuilding = game.featureBuildings.length > 0;
  const hasAnyOtherProduct = productIds.some(
    (product) => !region.products.includes(product) && game.resources[product] > 0,
  );
  const classroomSuccess = game.stats.trades >= 1 && game.stats.crafts >= 1;

  if (game.workers < 1) {
    const workerResource = workerRecruitResource(game);
    return {
      id: "recruit-first-worker",
      title: "일꾼 뽑기",
      detail: `마을 본부를 눌러 ${resourceNames[workerResource]} ${workerRecruitCost(game.workers)}개로 첫 일꾼을 뽑으세요.`,
      progress: "1/16",
    };
  }

  if (game.builtStage < 1) {
    return {
      id: "build-stage-1",
      title: `${firstBuilding.name} 짓기`,
      detail: `${resourceNames[region.resource]} ${firstBuilding.cost[region.resource] ?? 3}개를 모아 첫 건물을 지으세요.`,
      progress: "2/16",
    };
  }

  if (!hasMerchant) {
    return {
      id: "recruit-merchant",
      title: "상인 뽑기",
      detail: `1단계 건물(${firstBuilding.name})을 눌러 상인을 뽑으세요.`,
      progress: "3/16",
    };
  }

  if (game.workers < 2) {
    const workerResource = workerRecruitResource(game);
    return {
      id: "recruit-second-worker",
      title: "일꾼 한 명 더 뽑기",
      detail: `마을 본부를 눌러 ${resourceNames[workerResource]} ${workerRecruitCost(game.workers)}개로 일꾼을 한 명 더 뽑으세요.`,
      progress: "4/16",
    };
  }

  if (firstTradeTarget && !tradedRegions[firstTradeTarget.id]) {
    return {
      id: `trade-resource-${firstTradeTarget.id}`,
      title: `${firstTradeTarget.name}과 교류하기`,
      detail: `상인을 보내 ${firstTradeTarget.name}에서 ${resourceNames[firstTradeTarget.resource]}을 받아오세요.`,
      progress: "5/16",
      target: firstTradeTarget.id,
    };
  }

  if (game.builtStage < 2) {
    return {
      id: "build-stage-2",
      title: `${secondBuilding.name} 짓기`,
      detail: "자원을 더 모아 2단계 건물을 지으세요.",
      progress: "6/16",
    };
  }

  if (!hasCompanion) {
    return {
      id: "adopt-companion",
      title: companionSpecs[game.selectedRegion].action,
      detail: `2단계 건물을 눌러 ${companionSpecs[game.selectedRegion].name}을 만나세요.`,
      progress: "7/16",
    };
  }

  const nextLaterTradeIndex = laterTradeTargets.findIndex((target) => !tradedRegions[target.id]);
  if (nextLaterTradeIndex >= 0) {
    const target = laterTradeTargets[nextLaterTradeIndex];
    return {
      id: `trade-resource-${target.id}`,
      title: `${target.name}과 교류하기`,
      detail: `상인을 보내 ${target.name}에서 ${resourceNames[target.resource]}을 받아오세요.`,
      progress: `${8 + nextLaterTradeIndex}/16`,
      target: target.id,
    };
  }

  if (game.builtStage < 3) {
    return {
      id: "build-stage-3",
      title: `${thirdBuilding.name} 짓기`,
      detail: "3단계 건물을 지으면 이웃 마을을 구경할 수 있어요.",
      progress: "10/16",
    };
  }

  if (!game.neighborVisitCompleted) {
    return {
      id: "visit-neighbor",
      title: "이웃 마을 구경하기",
      detail: "원하는 이웃 지역을 방문해 마을을 구경하세요.",
      progress: "11/16",
    };
  }

  if (game.builtStage < 4) {
    return {
      id: "build-stage-4",
      title: `${fourthBuilding.name} 짓기`,
      detail: "4단계 건물을 지어 대표 상품 만들기를 여세요.",
      progress: "12/16",
    };
  }

  if (!hasAnyOwnProduct && game.stats.crafts < 1) {
    return {
      id: "craft-product",
      title: `${region.productName} 만들기`,
      detail: `4단계 건물(${fourthBuilding.name})을 눌러 ${region.shortName} 대표 상품을 만드세요.`,
      progress: "13/16",
    };
  }

  if (false && !hasAnyProductBuilding) {
    return {
      id: "feature-building",
      title: "상품 건물 1개 짓기",
      detail: "만든 상품 1개로 생산·제작·교류를 도와주는 건물을 지어보세요.",
      progress: "10/11",
    };
  }

  if (game.builtStage < 5) {
    return {
      id: "build-stage-5",
      title: `${fifthBuilding.name} 짓기`,
      detail: "5단계 건물을 지으면 상품을 다른 지역으로 보낼 수 있어요.",
      progress: "14/16",
    };
  }

  if (game.stats.productTrades < 1 && !hasAnyOtherProduct) {
    return {
      id: "trade-product",
      title: "상품 보내기",
      detail: "5단계 건물을 눌러 다른 지역으로 대표 상품을 보내보세요.",
      progress: "15/16",
    };
  }

  if (false && game.stats.productTrades < 1 && !hasAnyOtherProduct) {
    return {
      id: "trade-product",
      title: "상품 보내기",
      detail: "5단계 건물을 눌러 다른 지역 상품과 바꿔보세요.",
      progress: "보너스",
    };
  }

  if (false && !classroomSuccess) {
    return {
      id: "classroom-success",
      title: "수업 성공 조건 달성하기",
      detail: "교류 1번 + 상품 1개 만들기를 해내면 수업 목표 성공입니다.",
      progress: "목표",
    };
  }

  if (game.builtStage < 6) {
    return {
      id: "final-building",
      title: `${finalBuilding.name} 완성하기`,
      detail: "마지막 6단계 건물을 지어 마을을 완성하세요.",
      progress: "16/16",
    };
  }

  if (!game.success) return null;

  if (!game.productCatalogUnlocked) {
    return {
      id: "hidden-product-catalog",
      title: "히든 퀘스트: 대표 상품 발견",
      detail: "6단계 건물을 눌러 지역의 나머지 대표 상품을 열어보세요.",
      progress: "히든",
    };
  }

  const featureBuildingCount = game.featureBuildings.length;
  const totalFeatureBuildings = featureBuildingsByRegion[game.selectedRegion].length;
  if (featureBuildingCount < totalFeatureBuildings) {
    return {
      id: "hidden-feature-building",
      title: "히든 퀘스트: 상품 건물 확장",
      detail: "대표 상품으로 상품 건물을 지어 마을의 기능을 확장하세요.",
      progress: `히든 ${featureBuildingCount + 1}/${totalFeatureBuildings}`,
    };
  }

  if (game.repeatMission) return getRepeatMissionStep(game.repeatMission);

  if (false && !game.success) {
    return {
      id: "final-building",
      title: `${finalBuilding.name} 완성하기`,
      detail: "더 도전하고 싶다면 최종 건물을 완성하세요.",
      progress: "도전",
    };
  }

  return {
    id: "complete",
    title: "마을 발전 완료!",
    detail: "지역마다 필요한 자원이 달라서 교류가 중요하다는 것을 확인했어요.",
    progress: "완료",
  };
};

const makeInitialState = (regionId: RegionId): GameState => {
  const resources = emptyResources();
  resources[regions[regionId].resource] = STARTING_HOME_RESOURCE;
  return {
    selectedRegion: regionId,
    resources,
    workers: 0,
    merchants: [],
    development: 0,
    autoBonus: 0,
    builtStage: 0,
    featureBuildings: [],
    buildings: [],
    construction: undefined,
    constructionQueue: [],
    companions: emptyCompanions(),
    companionCounts: {},
    hasDog: false,
    stats: { trades: 0, productTrades: 0, crafts: 0 },
    tradedRegions: {},
    neighborVisitCompleted: false,
    productCatalogUnlocked: false,
    success: false,
  };
};

const loadSavedGame = (): GameState | null => {
  try {
    const raw = window.localStorage.getItem(GAME_SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GameState;
    return saved.selectedRegion && regions[saved.selectedRegion]
      ? {
          ...saved,
          tradedRegions: saved.tradedRegions ?? {},
          neighborVisitCompleted: Boolean(saved.neighborVisitCompleted),
          productCatalogUnlocked: Boolean(saved.productCatalogUnlocked || saved.featureBuildings?.length),
          success: Boolean(saved.success),
        }
      : null;
  } catch {
    return null;
  }
};

type Modal = "build" | "trade" | "visit" | "craftProduct" | "craftResult" | "productTrade" | "routes" | "restart" | null;

const emptyTuning = (): RouteTuning => ({ workerSpots: {}, merchantRoutes: {}, workerSpawns: {}, merchantDestinations: {}, blockedTiles: {}, buildZones: {} });

const normalizeMerchantDestinations = (value: unknown): RouteTuning["merchantDestinations"] => {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const normalized: RouteTuning["merchantDestinations"] = {};
  const isPoint = (candidate: unknown): candidate is [number, number] =>
    Array.isArray(candidate) && candidate.length === 2 && candidate.every((item) => typeof item === "number");

  // Migrate the old target-only format by copying its coordinate to each possible origin.
  regionList.forEach((target) => {
    const legacyPoint = raw[target.id];
    if (!isPoint(legacyPoint)) return;
    regionList.forEach((origin) => {
      if (origin.id === target.id) return;
      normalized[origin.id] = { ...normalized[origin.id], [target.id]: legacyPoint };
    });
  });
  regionList.forEach((origin) => {
    const perOrigin = raw[origin.id];
    if (!perOrigin || typeof perOrigin !== "object" || Array.isArray(perOrigin)) return;
    regionList.forEach((target) => {
      const point = (perOrigin as Record<string, unknown>)[target.id];
      if (origin.id !== target.id && isPoint(point)) {
        normalized[origin.id] = { ...normalized[origin.id], [target.id]: point };
      }
    });
  });
  return normalized;
};


const defaultVisitBuildingPositions: Record<RegionId, Array<[number, number]>> = {
  rural: [[760, 460], [1120, 420], [1510, 520], [710, 880], [1150, 1010], [1620, 930]],
  mountain: [[720, 430], [1120, 360], [1570, 480], [760, 910], [1220, 980], [1750, 900]],
  mine: [[500, 360], [960, 280], [1780, 420], [580, 1010], [1300, 1120], [2070, 960]],
  coast: [[640, 420], [1080, 360], [1580, 510], [620, 940], [1130, 1060], [1710, 900]],
};

const getVisitBuildingPositions = (regionId: RegionId, tuning: RouteTuning): Array<[number, number]> => {
  const zones = tuning.buildZones[regionId] ?? [];
  if (zones.length < 6) return defaultVisitBuildingPositions[regionId];
  const zonePositions = zones.map((zone) => [
    Math.round(zone.x + zone.width / 2),
    Math.round(zone.y + zone.height / 2),
  ] as [number, number]);
  const isAwayFromHeadquarters = ([x, y]: [number, number]) => Math.hypot(x - 1200, y - 868) >= 250;
  const safePositions = zonePositions.filter(isAwayFromHeadquarters);
  const fallbackPositions = defaultVisitBuildingPositions[regionId].filter(isAwayFromHeadquarters);
  return [...safePositions, ...fallbackPositions].slice(0, 6);
};

const makeVisitState = (base: GameState, regionId: RegionId, tuning: RouteTuning): GameState => {
  const region = regions[regionId];
  // Visiting a neighboring region always shows its completed village.
  const builtStage = region.buildings.length;
  const positions = getVisitBuildingPositions(regionId, tuning);
  return {
    ...base,
    selectedRegion: regionId,
    resources: emptyResources(),
    workers: 4,
    builtStage,
    buildings: region.buildings.slice(0, builtStage).map((spec, index) => ({
      id: `visit-${regionId}-${spec.stage}`,
      spec,
      x: positions[index]?.[0] ?? 1000 + index * 120,
      y: positions[index]?.[1] ?? 650 + index * 80,
      hasMerchant: spec.stage === 1,
      productionBoosted: spec.stage >= 5,
    })),
    featureBuildings: base.featureBuildings ?? [],
    construction: undefined,
    constructionQueue: [],
    productCraft: undefined,
    merchants: Array.from({ length: 3 }, (_, index) => ({
      id: `visit-merchant-${regionId}-${index}`,
      name: `상인${index + 1}`,
      status: "traveling" as const,
      buildingId: `visit-${regionId}-1`,
      target: base.selectedRegion ?? "rural",
    })),
    companions: { [regionId]: hasRegionCompanion(base, regionId) },
    companionCounts: { [regionId]: companionCount(base, regionId) },
    hasDog: regionId === "rural" && hasRegionCompanion(base, "rural"),
    isVisit: true,
  };
};

const loadTuning = (): RouteTuning => {
  const codeTuning = generatedTuning as RouteTuning;
  try {
    const raw = window.localStorage.getItem("village-route-tuning");
    const localTuning = raw ? (JSON.parse(raw) as RouteTuning) : emptyTuning();
    return {
      workerSpots: { ...(codeTuning.workerSpots ?? {}), ...(localTuning.workerSpots ?? {}) },
      merchantRoutes: { ...(codeTuning.merchantRoutes ?? {}), ...(localTuning.merchantRoutes ?? {}) },
      // Code-saved spawn coordinates are the shared defaults for every player.
      workerSpawns: { ...(localTuning.workerSpawns ?? {}), ...(codeTuning.workerSpawns ?? {}) },
      merchantDestinations: regionList.reduce<RouteTuning["merchantDestinations"]>(
        (destinations, origin) => ({
          ...destinations,
          [origin.id]: {
            ...normalizeMerchantDestinations(codeTuning.merchantDestinations)[origin.id],
            ...normalizeMerchantDestinations(localTuning.merchantDestinations)[origin.id],
          },
        }),
        {},
      ),
      blockedTiles: { ...(codeTuning.blockedTiles ?? {}), ...(localTuning.blockedTiles ?? {}) },
      buildZones: { ...(codeTuning.buildZones ?? {}), ...(localTuning.buildZones ?? {}) },
    };
  } catch {
    return { ...emptyTuning(), ...codeTuning };
  }
};

export default function App() {
  const [game, setGame] = useState<GameState | null>(() => loadSavedGame());
  const [modal, setModal] = useState<Modal>(null);
  const [tuning, setTuning] = useState<RouteTuning>(() => loadTuning());
  const [tileHistory, setTileHistory] = useState<Array<{ regionId: RegionId; tiles: string[]; blocked: boolean[] }>>([]);
  const [editMode, setEditMode] = useState<{
    mode: "worker" | "merchantDestination" | "blockedPaint" | "blockedErase" | "buildZone";
    target?: RegionId;
  } | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedMainBuilding, setSelectedMainBuilding] = useState(false);
  const [notice, setNotice] = useState("플레이할 지역을 고르세요.");
  const [commands, setCommands] = useState<QueuedSceneCommand[]>([]);
  const [, setProductionLeft] = useState(AUTO_PRODUCTION_SECONDS);
  const [tradeMerchant, setTradeMerchant] = useState<string | null>(null);
  const [tradeTarget, setTradeTarget] = useState<RegionId | null>(null);
  const [tradeAmount, setTradeAmount] = useState(2);
  const [visitRegion, setVisitRegion] = useState<RegionId | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [assetLoading, setAssetLoading] = useState(() => ({ active: Boolean(game), progress: 0 }));
  const [hudHeight, setHudHeight] = useState(140);
  const [craftProductId, setCraftProductId] = useState<ProductId | null>(null);
  const [craftAmount, setCraftAmount] = useState(1);
  const [craftResult, setCraftResult] = useState<{ productId: ProductId; amount: number } | null>(null);
  const [sendProductId, setSendProductId] = useState<ProductId | null>(null);
  const [productTradeTarget, setProductTradeTarget] = useState<RegionId | null>(null);
  const [receiveProductId, setReceiveProductId] = useState<ProductId | null>(null);
  const [selectedBuildStage, setSelectedBuildStage] = useState<number | null>(null);
  const [missionDialog, setMissionDialog] = useState<MissionDialogState | null>(null);
  const [tradeResultDialog, setTradeResultDialog] = useState<TradeResultDialogState | null>(null);
  const [mainCompletionStep, setMainCompletionStep] = useState<"celebration" | "result" | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const editModeRef = useRef<typeof editMode>(null);
  const visitRegionRef = useRef<RegionId | null>(null);
  const sceneBusyRef = useRef(false);
  const transitionTargetRef = useRef<RegionId | null>(null);
  const previousMissionRef = useRef<MissionStep | null>(null);
  const nextCommandIdRef = useRef(0);

  const selectedRegion = game?.selectedRegion ? regions[game.selectedRegion] : null;
  const selectedBuilding = game?.buildings.find((building) => building.id === selectedBuildingId) ?? null;
  const sceneGame = useMemo(() => (game && visitRegion ? makeVisitState(game, visitRegion, tuning) : game), [game, visitRegion, tuning]);

  const pushCommand = useCallback((next: SceneCommand) => {
    const queued = { id: ++nextCommandIdRef.current, command: next };
    setCommands((current) => [...current, queued].slice(-100));
  }, []);
  const updateHudHeight = useCallback((height: number) => {
    setHudHeight((current) => current === height ? current : height);
  }, []);

  useEffect(() => {
    gameRef.current = game;
    editModeRef.current = editMode;
    visitRegionRef.current = visitRegion;
    sceneBusyRef.current = sceneBusy;
  }, [game, editMode, visitRegion, sceneBusy]);

  useEffect(() => {
    if (sceneGame) pushCommand({ type: "sync", state: sceneGame, tuning });
  }, [sceneGame, tuning, pushCommand]);

  useEffect(() => {
    window.localStorage.setItem("village-route-tuning", JSON.stringify(tuning));
    pushCommand({ type: "setTuning", tuning });
  }, [tuning, pushCommand]);

  useEffect(() => {
    if (game) window.localStorage.setItem(GAME_SAVE_KEY, JSON.stringify(game));
    else window.localStorage.removeItem(GAME_SAVE_KEY);
  }, [game]);

  useEffect(() => {
    if (!game || game.builtStage < 6 || game.success || mainCompletionStep) return;
    setMissionDialog(null);
    setTradeResultDialog(null);
    setMainCompletionStep("celebration");
  }, [game, mainCompletionStep]);

  useEffect(() => {
    pushCommand({ type: "setEditMode", mode: editMode?.mode ?? null, target: editMode?.target });
  }, [editMode, pushCommand]);

  useEffect(() => {
    pushCommand({ type: "setMapView", mode: modal === "routes" ? "overview" : "play" });
  }, [modal, pushCommand]);

  useEffect(() => {
    if (!game) {
      previousMissionRef.current = null;
      setMissionDialog(null);
      return;
    }
    if (craftResult) return;
    const mission = getCurrentMission(game);
    if (!mission) return;
    const previousMission = previousMissionRef.current;
    previousMissionRef.current = mission;

    if (!previousMission) {
      setMissionDialog({ kind: "next", mission });
      return;
    }
    if (previousMission.id !== mission.id) {
      setMissionDialog({ kind: "complete", mission: previousMission });
    }
  }, [game, craftResult]);

  useEffect(() => {
    if (!game?.selectedRegion || game.builtStage < 6 || game.repeatMission) return;
    const total = featureBuildingsByRegion[game.selectedRegion].length;
    if (game.featureBuildings.length < total) return;
    setGame((current) => current && !current.repeatMission ? { ...current, repeatMission: createRepeatMission(current) } : current);
  }, [game]);

  useEffect(() => {
    if (!game) return;
    const timer = window.setInterval(() => {
      setProductionLeft((left) => {
        if (left > 1) return left - 1;
        setGame((current) => {
          if (!current?.selectedRegion || current.workers < 1) return current;
          const region = regions[current.selectedRegion];
          const amount = autoProductionAmount(current);
          const resources = { ...current.resources };
          let bonus = 0;
          resources[region.resource] += amount;
          if (hasRegionCompanion(current, current.selectedRegion) && Math.random() < COMPANION_AUTO_BONUS_CHANCE) {
            resources[region.resource] += 1;
            bonus += 1;
          }
          const message =
            bonus > 0
              ? `자동 +${amount + bonus} ${resourceNames[region.resource]}`
              : `자동 +${amount} ${resourceNames[region.resource]}`;
          setNotice(message);
          pushCommand({ type: "floatText", text: message });
          return { ...current, resources };
        });
        return AUTO_PRODUCTION_SECONDS;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game, pushCommand]);

  useEffect(() => {
    if (!game?.productCraft) return;
    const expectedJob = game.productCraft;
    const timer = window.setTimeout(() => {
      setGame((current) => {
        const job = current?.productCraft;
        if (!current || !job || job.startedAt !== expectedJob.startedAt) return current;
        const resources = { ...current.resources, [job.productId]: current.resources[job.productId] + job.amount };
        setCraftResult({ productId: job.productId, amount: job.amount });
        setModal("craftResult");
        setNotice(`${productNames[job.productId]} ${job.amount}개를 만들었어요.`);
        return advanceRepeatMission({
          ...current,
          resources,
          productCraft: undefined,
          stats: { ...current.stats, crafts: current.stats.crafts + job.amount },
          development: current.development + 4 * job.amount,
        }, "craft");
      });
    }, Math.max(0, expectedJob.completesAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [game?.productCraft?.startedAt, game?.productCraft?.completesAt]);

  const handleSceneEvent = useCallback((event: SceneEvent) => {
    if (event.type === "assetLoading") {
      setAssetLoading({ active: true, progress: Math.round(event.progress * 100) });
      return;
    }
    if (event.type === "assetsReady") {
      setAssetLoading({ active: false, progress: 100 });
      return;
    }
    if (event.type === "regionShown") {
      if (transitionTargetRef.current !== event.regionId) return;
      transitionTargetRef.current = null;
      setSceneBusy(false);
      setNotice(visitRegionRef.current === event.regionId ? `${regions[event.regionId].name} 구경 중` : `${regions[event.regionId].name}으로 돌아왔어요.`);
      return;
    }
    if (event.type === "notice") {
      setNotice(event.message);
      return;
    }
    if (event.type === "selectBuilding") {
      if (visitRegionRef.current || sceneBusyRef.current) return;
      if (gameRef.current?.productCraft?.buildingId === event.buildingId) {
        setNotice("이 건물은 상품을 만드는 중이에요.");
        return;
      }
      setSelectedBuildingId(event.buildingId);
      setSelectedMainBuilding(false);
      return;
    }
    if (event.type === "selectMainBuilding") {
      if (visitRegionRef.current || sceneBusyRef.current) return;
      setSelectedBuildingId(null);
      setSelectedMainBuilding(true);
      return;
    }
    if (event.type === "editPoint") {
      setTuning((current) => {
        const activeGame = gameRef.current;
        const activeMode = editModeRef.current;
        if (!activeGame?.selectedRegion || !activeMode) return current;
        if (activeMode.mode === "worker") {
          const points = current.workerSpots[activeGame.selectedRegion] ?? [];
          return {
            ...current,
            workerSpots: { ...current.workerSpots, [activeGame.selectedRegion]: [...points, [event.x, event.y]] },
          };
        }
        if (activeMode.mode === "buildZone") {
          return current;
        }
        if (activeMode.mode !== "merchantDestination" || !activeMode.target) return current;
        return {
          ...current,
          merchantDestinations: {
            ...current.merchantDestinations,
            [activeGame.selectedRegion]: {
              ...current.merchantDestinations[activeGame.selectedRegion],
              [activeMode.target]: [event.x, event.y],
            },
          },
        };
      });
      setNotice(`좌표 ${event.x}, ${event.y} 추가`);
      return;
    }
    if (event.type === "editTiles") {
      setTuning((current) => {
        const regionId = gameRef.current?.selectedRegion;
        if (!regionId) return current;
        const blocked = new Set(current.blockedTiles?.[regionId] ?? []);
        setTileHistory((history) => [...history.slice(-29), { regionId, tiles: event.tiles, blocked: event.tiles.map((tile) => blocked.has(tile)) }]);
        event.tiles.forEach((tile) => event.blocked ? blocked.add(tile) : blocked.delete(tile));
        return { ...current, blockedTiles: { ...(current.blockedTiles ?? {}), [regionId]: [...blocked] } };
      });
      return;
    }
    if (event.type === "moveBuildZoneRect") {
      setTuning((current) => {
        const activeGame = gameRef.current;
        if (!activeGame?.selectedRegion) return current;
        const zones = [...(current.buildZones[activeGame.selectedRegion] ?? [])];
        if (!zones[event.zoneIndex]) return current;
        zones[event.zoneIndex] = event.rect;
        return { ...current, buildZones: { ...current.buildZones, [activeGame.selectedRegion]: zones } };
      });
      setNotice("건설 구역을 조정했어요.");
      return;
    }
    if (event.type === "merchantReturned") {
      setGame((current) => {
        if (!current) return current;
        const merchant = current.merchants.find((item) => item.id === event.merchantId);
        if (!merchant?.receiveResource || !merchant.receiveAmount) return current;
        const tradeTarget = merchant.target;
        const resources = { ...current.resources };
        resources[merchant.receiveResource] += merchant.receiveAmount;
        setNotice(`${merchant.name}이 ${resourceNames[merchant.receiveResource]} ${merchant.receiveAmount}개를 가져왔어요.`);
        if (tradeTarget) {
          setTradeResultDialog({
            target: tradeTarget,
            resource: merchant.receiveResource,
            amount: merchant.receiveAmount,
          });
        }
        pushCommand({ type: "floatText", text: `+${merchant.receiveAmount} ${resourceNames[merchant.receiveResource]}` });
        return advanceRepeatMission({
          ...current,
          resources,
          merchants: current.merchants.map((item) =>
            item.id === event.merchantId
              ? { ...item, status: "idle", target: undefined, receiveResource: undefined, receiveAmount: undefined }
              : item,
          ),
          stats: { ...current.stats, trades: current.stats.trades + 1 },
          tradedRegions: tradeTarget
            ? { ...(current.tradedRegions ?? {}), [tradeTarget]: true }
            : current.tradedRegions,
          development: current.development + 4,
        }, "resourceTrade", tradeTarget);
      });
      return;
    }
    if (event.type === "productWagonReturned") {
      setGame((current) => {
        if (!current) return current;
        const resources = { ...current.resources };
        resources[event.product] += 1;
        const bonusDevelopment = hasFeatureEffect(current, "trade") ? 2 : 0;
        const nextDevelopment = current.development + PRODUCT_TRADE_DEVELOPMENT + bonusDevelopment;
        const newVisitorArrived = visitorCountForDevelopment(nextDevelopment) > visitorCountForDevelopment(current.development);
        setNotice(
          newVisitorArrived
            ? `${productNames[event.product]} 교류로 마을이 알려져 새 방문객이 찾아왔어요!`
            : `${regions[event.target].name}에서 ${productNames[event.product]}을 가져왔어요. 발전도 +${PRODUCT_TRADE_DEVELOPMENT + bonusDevelopment}`,
        );
        pushCommand({ type: "floatText", text: `+1 ${productNames[event.product]}` });
        return advanceRepeatMission({
          ...current,
          resources,
          stats: { ...current.stats, productTrades: current.stats.productTrades + 1 },
          development: nextDevelopment,
        }, "productTrade", event.target);
      });
      return;
    }
    if (event.type === "companionFoundResource") {
      setGame((current) => {
        if (!current?.selectedRegion || current.isVisit) return current;
        const resources = { ...current.resources };
        resources[event.resource] += 1;
        const companionName = companionSpecs[current.selectedRegion].name;
        setNotice(`${companionName}가 ${resourceNames[event.resource]} 1개를 찾았어요.`);
        return { ...current, resources };
      });
      return;
    }
    if (event.type === "placeBuilding") {
      setGame((current) => {
        if (!current || !current.selectedRegion) return current;
        if (isFeatureBuilding(event.building)) {
          if (current.builtStage < 6) {
            setNotice("상품 건물은 최종 건물을 완성한 뒤 만들 수 있어요.");
            return current;
          }
          if (current.featureBuildings.includes(event.building.id)) {
            setNotice("이미 지은 상품 건물입니다.");
            return current;
          }
          if (!canPay(current.resources, event.building.cost)) {
            setNotice("상품이 부족합니다.");
            return current;
          }
          const placed: PlacedBuilding = {
            id: `feature-${event.building.id}`,
            spec: event.building,
            x: event.x,
            y: event.y,
            hasMerchant: false,
            productionBoosted: false,
          };
          const resources = payCost(current.resources, event.building.cost);
          const startedAt = Date.now();
          const construction = { building: placed, startedAt, completesAt: startedAt + BUILD_DURATION_MS };
          setNotice(`${event.building.name} 공사를 시작했어요.`);
          setModal(null);
          return {
            ...current,
            resources,
            construction: current.construction ?? construction,
            constructionQueue: current.construction ? [...(current.constructionQueue ?? []), construction] : current.constructionQueue,
          };
        }
        if (!canBuildNormalBuilding(current, event.building)) {
          setNotice("자원이 부족합니다.");
          return current;
        }
        const cost = scaledNormalBuildingCost(current, event.building);
        const placed: PlacedBuilding = {
          id: `building-${Date.now()}`,
          spec: event.building,
          x: event.x,
          y: event.y,
          hasMerchant: false,
          productionBoosted: false,
        };
        const resources = payCost(current.resources, cost);
        const startedAt = Date.now();
        const construction = { building: placed, startedAt, completesAt: startedAt + BUILD_DURATION_MS };
        setNotice(`${event.building.name} 공사를 시작했어요.`);
        setModal(null);
        return {
          ...current,
          resources,
          construction: current.construction ?? construction,
          constructionQueue: current.construction ? [...(current.constructionQueue ?? []), construction] : current.constructionQueue,
        };
      });
    }
  }, []);

  const startGame = (regionId: RegionId) => {
    const next = makeInitialState(regionId);
    setGame(next);
    setNotice(`${regions[regionId].name}을 선택했어요. 자원을 모아 발전시켜 보세요.`);
  };

  const restartGame = () => {
    setVisitRegion(null);
    setSceneBusy(false);
    setSelectedBuildingId(null);
    setSelectedMainBuilding(false);
    setProductionLeft(AUTO_PRODUCTION_SECONDS);
    setTradeMerchant(null);
    setTradeTarget(null);
    setModal(null);
    setGame(null);
  };

  const acknowledgeMissionDialog = () => {
    if (!missionDialog) return;
    if (missionDialog.kind === "complete") {
      const nextMission = game ? getCurrentMission(game) : null;
      setMissionDialog(nextMission ? { kind: "next", mission: nextMission } : null);
      return;
    }
    setMissionDialog(null);
  };

  const acknowledgeMainResult = () => {
    previousMissionRef.current = null;
    setMissionDialog(null);
    setMainCompletionStep(null);
    setGame((current) => current ? { ...current, success: true } : current);
  };

  const beginBuild = (building: VillageBuildingSpec) => {
    if (!game) return;
    if (isFeatureBuilding(building)) {
      if (game.builtStage < 6) {
        setNotice("상품 건물은 최종 건물을 완성한 뒤 만들 수 있어요.");
        return;
      }
      if (game.featureBuildings.includes(building.id)) {
        setNotice("이미 지은 상품 건물입니다.");
        return;
      }
      if (!canPay(game.resources, building.cost)) {
        setNotice("상품이 부족합니다.");
        return;
      }
      setNotice(`${building.name}을 지을 곳을 고르세요.`);
      setModal(null);
      pushCommand({ type: "startPlacement", building });
      return;
    }
    if (!isNormalBuildingUnlocked(game, building)) {
      setNotice("이전 건물부터 지어야 합니다.");
      return;
    }
    if (placedStageCount(game, building.stage) >= normalBuildingLimit(building.stage)) {
      setNotice("이 건물은 더 지을 수 없습니다.");
      return;
    }
    if (!canPay(game.resources, scaledNormalBuildingCost(game, building))) {
      setNotice("자원이 부족합니다.");
      return;
    }
    setNotice(`${building.name}을 지을 곳을 탭하세요.`);
    setModal(null);
    pushCommand({ type: "startPlacement", building });
  };

  const recruitMerchant = () => {
    if (!game || !selectedBuilding || isFeatureBuilding(selectedBuilding.spec) || selectedBuilding.spec.stage !== 1 || selectedBuilding.hasMerchant) return;
    const merchant: Merchant = {
      id: `merchant-${Date.now()}`,
      name: `상인${game.merchants.length + 1}`,
      status: "idle",
      buildingId: selectedBuilding.id,
      spawnX: selectedBuilding.x,
      spawnY: selectedBuilding.y + 92,
    };
    setGame({
      ...game,
      merchants: [...game.merchants, merchant],
      buildings: game.buildings.map((building) =>
        building.id === selectedBuilding.id ? { ...building, hasMerchant: true } : building,
      ),
      development: game.development + 2,
    });
    pushCommand({ type: "merchantEnter", merchantId: merchant.id, x: selectedBuilding.x, y: selectedBuilding.y + 92 });
    setNotice(`${merchant.name}을 뽑았어요.`);
  };

  const recruitWorker = () => {
    if (!game || !selectedRegion) return;
    if (game.workers >= MAX_WORKERS) {
      setNotice("일꾼은 4명까지 함께할 수 있어요.");
      return;
    }
    const cost = workerRecruitCost(game.workers);
    const resource = selectedRegion.resource;
    if (game.resources[resource] < cost) {
      setNotice(`${resourceNames[resource]}이 부족합니다.`);
      return;
    }
    setGame({
      ...game,
      resources: { ...game.resources, [resource]: game.resources[resource] - cost },
      workers: game.workers + 1,
      development: game.development + 2,
    });
    setNotice("일꾼을 뽑았어요.");
  };

  const unlockProductCatalog = () => {
    if (!game || !selectedRegion || game.builtStage < 6 || game.productCatalogUnlocked) return;
    setGame({ ...game, productCatalogUnlocked: true, development: game.development + 6 });
    setNotice(`${selectedRegion.shortName} 대표 상품 4종이 열렸어요.`);
  };

  const openCraftProduct = () => {
    if (!game || !selectedRegion || !selectedBuilding || isFeatureBuilding(selectedBuilding.spec) || selectedBuilding.spec.stage !== 4) return;
    if (game.productCraft) {
      setNotice("이미 상품을 만드는 중이에요.");
      return;
    }
    setCraftProductId(unlockedProductChoices(game, selectedRegion.id)[0]);
    setCraftAmount(1);
    setModal("craftProduct");
  };

  const craftProduct = (productId: ProductId, amount: number) => {
    if (!game || !selectedRegion || !selectedBuilding || isFeatureBuilding(selectedBuilding.spec) || selectedBuilding.spec.stage !== 4 || game.productCraft) return;
    const product = productSpecs[productId];
    const unitCost = applyCraftDiscount({ ...product.recipe }, game, selectedRegion.id);
    const available = maxCraftableAmount(game.resources, unitCost);
    const craftCount = Math.max(1, Math.min(PRODUCT_CRAFT_MAX_AMOUNT, amount));
    if (craftCount > available) {
      setNotice("선택한 수량을 만들 자원이 부족합니다.");
      return;
    }
    const cost = multiplyCost(unitCost, craftCount);
    if (!canPay(game.resources, cost)) {
      setNotice("자원이 부족합니다.");
      return;
    }
    const resources = payCost(game.resources, cost);
    const startedAt = Date.now();
    setGame({
      ...game,
      resources,
      productCraft: {
        buildingId: selectedBuilding.id,
        productId,
        amount: craftCount,
        startedAt,
        completesAt: startedAt + PRODUCT_CRAFT_DURATION_MS,
      },
    });
    setSelectedBuildingId(null);
    setModal(null);
    setNotice(`${product.name} ${craftCount}개를 만들기 시작했어요.`);
  };

  const boostProduction = () => {
    if (!game || !selectedBuilding || selectedBuilding.productionBoosted) return;
    setGame({
      ...game,
      autoBonus: game.autoBonus + 1,
      buildings: game.buildings.map((building) =>
        building.id === selectedBuilding.id ? { ...building, productionBoosted: true } : building,
      ),
      development: game.development + 4,
    });
    setNotice("자동 생산이 강해졌어요.");
  };

  const adoptCompanion = () => {
    if (!game?.selectedRegion || companionCount(game, game.selectedRegion) >= companionLimit(game)) return;
    const regionId = game.selectedRegion;
    const nextCount = companionCount(game, regionId) + 1;
    setGame({
      ...game,
      companions: { ...emptyCompanions(), ...(game.companions ?? {}), [regionId]: true },
      companionCounts: { ...(game.companionCounts ?? {}), [regionId]: nextCount },
      hasDog: regionId === "rural" ? true : game.hasDog,
      development: game.development + 2,
    });
    setNotice(`${companionSpecs[regionId].adoptedMessage} (${nextCount}/${companionLimit(game)})`);
  };

  const sendTrade = () => {
    if (!game || !selectedRegion || !tradeMerchant || !tradeTarget) return;
    const merchant = game.merchants.find((item) => item.id === tradeMerchant);
    if (!merchant || merchant.status !== "idle") return;
    const limit = maxTradeAmount(game, selectedRegion.id);
    if (tradeAmount < TRADE_MIN_AMOUNT || tradeAmount > limit) {
      setNotice("보낼 자원이 부족합니다.");
      return;
    }
    const received = Math.floor(tradeAmount / 2);
    const targetResource = regions[tradeTarget].resource;
    const resources = { ...game.resources };
    resources[selectedRegion.resource] -= tradeAmount;
    const travelingMerchants = game.merchants.map((item) =>
      item.id === tradeMerchant
        ? {
            ...item,
            status: "traveling" as const,
            target: tradeTarget,
            receiveResource: targetResource,
            receiveAmount: received,
          }
        : item,
    );
    setGame({ ...game, resources, merchants: travelingMerchants });
    setNotice(`${merchant.name}이 ${resourceNames[selectedRegion.resource]} ${tradeAmount}개를 싣고 출발했어요.`);
    setModal(null);
    pushCommand({ type: "merchantTravel", merchantId: tradeMerchant, target: tradeTarget });
  };

  const saveRoutesToCode = async () => {
    try {
      const tuningToSave: RouteTuning = {
        workerSpots: tuning.workerSpots,
        merchantRoutes: tuning.merchantRoutes,
        workerSpawns: tuning.workerSpawns,
        merchantDestinations: tuning.merchantDestinations,
        blockedTiles: tuning.blockedTiles,
        buildZones: tuning.buildZones,
      };
      const response = await fetch("/api/save-route-tuning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tuningToSave),
      });
      if (!response.ok) throw new Error(await response.text());
      window.localStorage.removeItem("village-route-tuning");
      setNotice("동선을 코드에 저장했어요.");
    } catch {
      setNotice("저장 실패: 개발 서버에서만 코드 저장이 됩니다.");
    }
  };

  const openTrade = () => {
    if (!game) return;
    const firstIdleMerchant = game.merchants.find((merchant) => merchant.status === "idle");
    const missionTarget = getCurrentMission(game)?.target;
    const firstTargetRegion = missionTarget
      ? regions[missionTarget]
      : regionList.find((region) => region.id !== game.selectedRegion);
    setTradeMerchant(firstIdleMerchant?.id ?? null);
    setTradeTarget(firstTargetRegion?.id ?? null);
    setTradeAmount(2);
    setModal("trade");
  };

  const openVisit = () => {
    setModal("visit");
  };

  const enterVisit = (regionId: RegionId) => {
    setSceneBusy(true);
    transitionTargetRef.current = regionId;
    setSelectedBuildingId(null);
    setSelectedMainBuilding(false);
    setModal(null);
    setVisitRegion(regionId);
    setNotice(`${regions[regionId].name} 지도로 이동하고 있어요.`);
  };

  const returnHome = () => {
    if (!game?.selectedRegion || !visitRegion) return;
    const homeRegion = game.selectedRegion;
    setGame((current) => current && current.builtStage >= 3
      ? { ...current, neighborVisitCompleted: true }
      : current);
    setSceneBusy(true);
    transitionTargetRef.current = homeRegion;
    setSelectedBuildingId(null);
    setSelectedMainBuilding(false);
    setVisitRegion(null);
    setNotice(`${regions[homeRegion].name}으로 돌아가고 있어요.`);
  };

  const openProductTrade = () => {
    if (!game || !selectedRegion) return;
    const firstTargetRegion = regionList.find((region) => region.id !== game.selectedRegion);
    const firstReceiveProduct = firstTargetRegion ? unlockedProductChoices(game, firstTargetRegion.id)[0] : null;
    setSendProductId(unlockedProductChoices(game, selectedRegion.id)[0]);
    setProductTradeTarget(firstTargetRegion?.id ?? null);
    setReceiveProductId(firstReceiveProduct);
    setModal("productTrade");
  };

  const sendProductTrade = () => {
    if (!game || !selectedRegion || !sendProductId || !productTradeTarget || !receiveProductId) return;
    if (game.resources[sendProductId] < 1) {
      setNotice(`${productNames[sendProductId]}이 부족합니다.`);
      return;
    }
    const resources = { ...game.resources, [sendProductId]: game.resources[sendProductId] - 1 };
    setGame({ ...game, resources });
    setNotice(`${productNames[sendProductId]}을 싣고 ${regions[productTradeTarget].name}으로 출발했어요.`);
    setModal(null);
    pushCommand({ type: "productWagonTravel", target: productTradeTarget, product: receiveProductId });
  };

  const buildStatuses = useMemo(() => {
    if (!game || !selectedRegion) return [];
    return selectedRegion.buildings.map((building) => {
      const totalStageCount = placedStageCount(game, building.stage) + scheduledStageCount(game, building.stage);
      if (totalStageCount >= normalBuildingLimit(building.stage)) {
        return scheduledStageCount(game, building.stage) > 0 ? BUILD_STATUS_IN_PROGRESS : BUILD_STATUS_DONE;
      }
      if (!isNormalBuildingUnlocked(game, building)) return BUILD_STATUS_LOCKED;
      return canPay(game.resources, scaledNormalBuildingCost(game, building)) ? BUILD_STATUS_READY : BUILD_STATUS_MISSING;
    });
  }, [game, selectedRegion]);

  useEffect(() => {
    if (!game || game.isVisit) return;
    const constructions = [game.construction, ...(game.constructionQueue ?? [])].filter((construction): construction is NonNullable<GameState["construction"]> => Boolean(construction));
    const timers = constructions.map((construction) => window.setTimeout(() => {
      setGame((current) => {
        if (!current) return current;
        const activeConstructions = [current.construction, ...(current.constructionQueue ?? [])].filter(
          (item): item is NonNullable<GameState["construction"]> => Boolean(item),
        );
        const completed = activeConstructions.find((item) => item.building.id === construction.building.id);
        if (!completed) return current;
        const { building } = completed;
        const remainingConstructions = activeConstructions.filter((item) => item.building.id !== completed.building.id);
        const feature = isFeatureBuilding(building.spec);
        const completedFirstStage = !feature && building.spec.stage === 1 && current.builtStage < 1;
        const completedFinalBuilding = !feature && building.spec.stage === 6;
        const featureBuildings = feature ? [...current.featureBuildings, building.spec.id] : current.featureBuildings;
        const resources = { ...current.resources };
        if (completedFirstStage && current.selectedRegion) {
          resources[regions[current.selectedRegion].resource] += FIRST_STAGE_REWARD;
        }
        setNotice(
          completedFinalBuilding
            ? "6단계 건물 완성! 모든 메인 퀘스트를 완료했어요."
            : completedFirstStage
              ? `${building.spec.name} 완성! 지역 자원 ${FIRST_STAGE_REWARD}개를 받았어요.`
              : `${building.spec.name} 완성!`,
        );
        const nextState: GameState = {
          ...current,
          resources,
          construction: remainingConstructions[0],
          constructionQueue: remainingConstructions.slice(1),
          autoBonus: feature && building.spec.effectKind === "production" ? current.autoBonus + 1 : current.autoBonus,
          featureBuildings,
          builtStage: feature ? current.builtStage : Math.max(current.builtStage, building.spec.stage),
          buildings: [...current.buildings, building],
          development: current.development + (feature ? 5 : building.spec.stage * 4),
          success: current.success,
        };
        const allFeatureBuildingsComplete = feature && nextState.builtStage >= 6 && featureBuildings.length >= featureBuildingsByRegion[nextState.selectedRegion!].length;
        return allFeatureBuildingsComplete && !nextState.repeatMission
          ? { ...nextState, repeatMission: createRepeatMission(nextState) }
          : nextState;
      });
    }, Math.max(0, construction.completesAt - Date.now())));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [game, game?.isVisit]);

  const selectedBuild = useMemo(() => {
    if (!selectedRegion || selectedBuildStage === null) return null;
    return selectedRegion.buildings.find((building) => building.stage === selectedBuildStage) ?? null;
  }, [selectedBuildStage, selectedRegion]);

  const selectedBuildStatus = useMemo(() => {
    if (!selectedBuild || !selectedRegion) return null;
    const index = selectedRegion.buildings.findIndex((building) => building.stage === selectedBuild.stage);
    return buildStatuses[index] ?? null;
  }, [buildStatuses, selectedBuild, selectedRegion]);

  const selectedBuildCosts = useMemo(() => {
    if (!game || !selectedBuild) return [];
    return Object.entries(scaledNormalBuildingCost(game, selectedBuild)).map(([item, required]) => {
      const id = item as ItemId;
      const needed = required ?? 0;
      const owned = game.resources[id];
      return {
        id,
        name: itemNames[id],
        needed,
        owned,
        missing: Math.max(0, needed - owned),
      };
    });
  }, [game, selectedBuild]);

  useEffect(() => {
    if (modal !== "build" || !game || !selectedRegion) return;
    const next = selectedRegion.buildings.find((building) => building.stage === game.builtStage + 1);
    setSelectedBuildStage((current) => {
      if (current && selectedRegion.buildings.some((building) => building.stage === current)) return current;
      return next?.stage ?? selectedRegion.buildings[0]?.stage ?? null;
    });
  }, [game, modal, selectedRegion]);

  if (!game || !selectedRegion) {
    return (
      <main className="game-shell">
        <PhaserGame regionId="rural" commands={commands} onEvent={handleSceneEvent} />
        <StartScreen onSelect={startGame} />
      </main>
    );
  }

  const idleMerchants = game.merchants.filter((merchant) => merchant.status === "idle");
  const activeTradeMerchant = game.merchants.find((merchant) => merchant.id === tradeMerchant && merchant.status === "idle");
  const otherRegions = regionList.filter((region) => region.id !== game.selectedRegion);
  const tradeLimit = maxTradeAmount(game, selectedRegion.id);
  const canSendTrade = Boolean(activeTradeMerchant && tradeTarget && tradeLimit >= TRADE_MIN_AMOUNT && tradeAmount <= tradeLimit);
  const craftProductChoices = unlockedProductChoices(game, selectedRegion.id);
  const selectedCraftRecipe = craftProductId
    ? applyCraftDiscount(productSpecs[craftProductId].recipe, game, selectedRegion.id)
    : {};
  const selectedCraftMax = craftProductId ? maxCraftableAmount(game.resources, selectedCraftRecipe) : 0;
  const selectedCraftCost = multiplyCost(selectedCraftRecipe, craftAmount);
  const sendProductChoices = unlockedProductChoices(game, selectedRegion.id);
  const targetProductChoices = productTradeTarget ? unlockedProductChoices(game, productTradeTarget) : [];
  const nextWorkerCost = workerRecruitCost(game.workers);
  const nextWorkerResource = selectedRegion.resource;
  const canRecruitWorker = game.workers < MAX_WORKERS && game.resources[nextWorkerResource] >= nextWorkerCost;
  const unlockedFeatureBuildings =
    game.builtStage >= 6 && game.productCatalogUnlocked
      ? featureBuildingsByRegion[selectedRegion.id]
      : [];
  const currentMission = getCurrentMission(game);
  const pulseBuildButton = currentMission ? ["build-stage-1", "build-stage-2", "build-stage-3", "build-stage-4", "build-stage-5", "final-building", "hidden-product-catalog", "hidden-feature-building"].includes(currentMission.id) || currentMission.id.startsWith("repeat-") && game.repeatMission?.kind === "craft" : false;
  const hasTravelingMerchant = game.merchants.some((merchant) => merchant.status === "traveling");
  const pulseTradeButton = (currentMission?.id.startsWith("trade-resource-") || currentMission?.id.startsWith("repeat-") && game.repeatMission?.kind !== "craft") && !hasTravelingMerchant;
  const actionsLockedUntilFirstWorker = game.workers < 1;

  return (
    <main className={modal === "routes" ? "game-shell route-mode" : "game-shell"} style={{ "--hud-height": `${hudHeight}px` } as React.CSSProperties}>
      <PhaserGame regionId={sceneGame?.selectedRegion ?? game.selectedRegion} initialState={sceneGame} commands={commands} onEvent={handleSceneEvent} />
      {assetLoading.active && <LoadingOverlay progress={assetLoading.progress} />}
      <button className="restart-button" onClick={() => setModal("restart")}>다시하기</button>
      {modal !== "routes" && (
        <>
          <Hud game={game} onHeightChange={updateHudHeight} />
          <MissionGuide game={game} />
          <div className="action-bar">
            <button className={pulseBuildButton ? "game-button mission-pulse" : "game-button"} disabled={actionsLockedUntilFirstWorker} title={actionsLockedUntilFirstWorker ? "일꾼을 먼저 뽑아야 합니다." : undefined} onClick={() => setModal("build")}>
              <Hammer size={22} /> 건설하기
            </button>
            <button className={pulseTradeButton ? "game-button mission-pulse" : "game-button"} disabled={actionsLockedUntilFirstWorker} title={actionsLockedUntilFirstWorker ? "일꾼을 먼저 뽑아야 합니다." : undefined} onClick={openTrade}>
              <HandCoins size={22} /> 교류하기
            </button>
          </div>
        </>
      )}

      {mainCompletionStep === "celebration"
        ? <MainCompletionDialog onConfirm={() => setMainCompletionStep("result")} />
        : mainCompletionStep === "result"
          ? <Success game={game} onConfirm={acknowledgeMainResult} />
          : tradeResultDialog
            ? <TradeResultDialog result={tradeResultDialog} onConfirm={() => setTradeResultDialog(null)} />
            : missionDialog && <MissionDialog dialog={missionDialog} onConfirm={acknowledgeMissionDialog} />}


      {visitRegion && !sceneBusy && (
        <div className="visit-banner">
          <strong>{regions[visitRegion].name} 구경 중</strong>
          <button className="small-button" onClick={returnHome}>우리 마을로 돌아가기</button>
        </div>
      )}

      {sceneBusy && <div className="scene-blocker">지도를 바꾸는 중입니다…</div>}

      {selectedMainBuilding && !visitRegion && modal !== "routes" && (
        <aside className="building-panel">
          <button className="close-button" onClick={() => setSelectedMainBuilding(false)} title="닫기">
            <X size={18} />
          </button>
          <img src={mainBuildingAssetPath(selectedRegion.id)} alt="" />
          <strong>마을 본부</strong>
          <span>{selectedRegion.name} · 중심 건물</span>
          <p>일꾼을 뽑고 상인을 보내는 곳</p>
          <button className="small-button" onClick={recruitWorker} disabled={!canRecruitWorker}>
            {game.workers >= MAX_WORKERS ? "일꾼 가득" : `일꾼 뽑기 · ${resourceNames[nextWorkerResource]} ${nextWorkerCost}`}
          </button>
        </aside>
      )}

      {selectedBuilding && !visitRegion && modal !== "routes" && (
        <aside className="building-panel">
          <button className="close-button" onClick={() => setSelectedBuildingId(null)} title="닫기">
            <X size={18} />
          </button>
          <img src={isFeatureBuilding(selectedBuilding.spec) ? selectedBuilding.spec.asset : buildingAssetPath(selectedRegion.id, selectedBuilding.spec.asset)} alt="" />
          <strong>{selectedBuilding.spec.name}</strong>
          {isFeatureBuilding(selectedBuilding.spec) ? (
            <>
              <span>{selectedRegion.name} · 상품 건물</span>
              <p>{productNames[selectedBuilding.spec.product]} · {selectedBuilding.spec.effect}</p>
            </>
          ) : (
            <>
              <span>{selectedRegion.name} · {selectedBuilding.spec.stage}단계</span>
              <p>{selectedBuilding.spec.role} · {selectedBuilding.spec.effect}</p>
            </>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 1 && (
            <button className="small-button" onClick={recruitMerchant} disabled={selectedBuilding.hasMerchant}>
              상인 뽑기
            </button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 2 && game.selectedRegion && (
            <button className="small-button" onClick={adoptCompanion} disabled={companionCount(game, game.selectedRegion) >= companionLimit(game)}>
              {companionSpecs[game.selectedRegion].action} ({companionCount(game, game.selectedRegion)}/{companionLimit(game)})
            </button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 3 && (
            <button className="small-button" onClick={openVisit}>이웃 마을 구경하기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 4 && (
            <button className="small-button" onClick={openCraftProduct} disabled={Boolean(game.productCraft)}>상품 만들기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 5 && (
            <button className="small-button" onClick={openProductTrade}>상품 보내기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 6 && (
            <button className="small-button" onClick={unlockProductCatalog} disabled={game.productCatalogUnlocked}>
              {game.productCatalogUnlocked ? "상품 4종 해금" : "대표 상품 발견"}
            </button>
          )}
        </aside>
      )}

      {modal === "build" && (
        <Modal title="건설하기" onClose={() => setModal(null)} wide>
          <div className="build-toolbar">
            <div>
              <strong>{selectedBuild ? selectedBuild.name : "건물 선택"}</strong>
              {selectedBuild ? (
                <div className="build-cost-row">
                  {selectedBuildCosts.map((cost) => (
                    <span className={cost.missing > 0 ? "build-cost missing" : "build-cost ready"} key={cost.id}>
                      {cost.name} {cost.owned}/{cost.needed}
                    </span>
                  ))}
                </div>
              ) : (
                <span>건설할 건물을 선택하세요.</span>
              )}
            </div>
            <button className="game-button" disabled={!selectedBuild || selectedBuildStatus !== BUILD_STATUS_READY} onClick={() => selectedBuild && beginBuild(selectedBuild)}>
              <Home size={18} /> 건설
            </button>
          </div>
          <div className="build-grid">
            {selectedRegion.buildings.map((building, index) => (
              <button
                className={`build-card ${buildStatuses[index] === BUILD_STATUS_READY ? "available" : "locked"} ${selectedBuildStage === building.stage ? "selected" : ""}`}
                key={building.stage}
                onClick={() => setSelectedBuildStage(building.stage)}
                type="button"
              >
                <div className="build-card-image">
                  <img src={buildingAssetPath(selectedRegion.id, building.asset)} alt="" />
                </div>
                <div className="build-card-body">
                  <strong>{building.stage}. {building.name}</strong>
                  <p>{building.effect}</p>
                  <span className="status">
                    {placedStageCount(game, building.stage)}/{normalBuildingLimit(building.stage)} · {buildStatuses[index]}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {unlockedFeatureBuildings.length > 0 && <section className="feature-build-section">
            <header>
              <strong>상품 건물</strong>
              <span>상품 1개로 지어요. 효과는 간단하게 생산, 제작, 교류를 도와줍니다.</span>
            </header>
            <div className="build-grid">
              {unlockedFeatureBuildings.map((building) => {
                const built = game.featureBuildings.includes(building.id);
                const locked = game.builtStage < 6;
                const ready = !built && !locked && canPay(game.resources, building.cost);
                return (
                  <button
                    className={`build-card ${ready ? "available" : "locked"}`}
                    disabled={built || locked}
                    key={building.id}
                    onClick={() => beginBuild(building)}
                    type="button"
                  >
                    <div className="build-card-image">
                      <img src={building.asset} alt="" />
                    </div>
                    <div className="build-card-body">
                      <strong>{building.name}</strong>
                      <p>{productNames[building.product]} 필요 · {building.effect}</p>
                      <span className="status">{built ? "완성" : locked ? "4단계 뒤 해금" : ready ? "건설 가능" : "상품 부족"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>}
        </Modal>
      )}

      {modal === "trade" && (
        <Modal title="교류하기" onClose={() => setModal(null)}>
          <section className="trade-section">
            <strong>상인</strong>
            <div className="choice-row merchant-choice-row">
              {game.merchants.map((merchant) => (
                <button
                  key={merchant.id}
                  className={`choice merchant-choice ${tradeMerchant === merchant.id ? "selected" : ""} ${merchant.status === "traveling" ? "traveling" : ""}`}
                  disabled={merchant.status !== "idle"}
                  onClick={() => setTradeMerchant(merchant.id)}
                  aria-pressed={tradeMerchant === merchant.id}
                >
                  <span
                    className="merchant-portrait"
                    style={{ backgroundImage: `url(${merchantPortraitAssets[selectedRegion.id]})` }}
                    aria-hidden="true"
                  />
                  <strong>{merchant.name.replace("상인", "상인 ")}</strong>
                  <small>{merchant.status === "traveling" ? "교류 중" : "대기 중"}</small>
                </button>
              ))}
              {game.merchants.length === 0 && <span className="empty-text">1단계 건물에서 상인을 뽑으세요.</span>}
            </div>
          </section>
          <section className="trade-section">
            <strong>대상 지역</strong>
            <div className="choice-row">
              {otherRegions.map((region) => (
                <button key={region.id} className={tradeTarget === region.id ? "choice selected" : "choice"} onClick={() => setTradeTarget(region.id)}>
                  {region.shortName} · {resourceNames[region.resource]}
                </button>
              ))}
            </div>
          </section>
          <section className="trade-section">
            <strong>보낼 수량</strong>
            <p className="trade-limit-note">보내기 최대 20개 · 받기 최대 10개</p>
            <div className="stepper">
              <button onClick={() => setTradeAmount(Math.max(TRADE_MIN_AMOUNT, tradeAmount - TRADE_STEP))}>-</button>
              <span>{resourceNames[selectedRegion.resource]} {tradeAmount}개 → {tradeTarget ? resourceNames[regions[tradeTarget].resource] : "자원"} {tradeAmount / 2}개</span>
              <button disabled={tradeAmount >= tradeLimit} onClick={() => setTradeAmount(Math.min(tradeLimit, tradeAmount + TRADE_STEP))}>+</button>
            </div>
          </section>
          <button className="game-button full" disabled={!canSendTrade || idleMerchants.length === 0} onClick={sendTrade}>
            <Send size={20} /> 보내기
          </button>
        </Modal>
      )}

      {modal === "visit" && (
        <Modal title="이웃 마을 구경하기" onClose={() => setModal(null)}>
          <section className="trade-section">
            <strong>구경할 지역</strong>
            <div className="choice-row">
              {otherRegions.map((region) => (
                <button key={region.id} className="choice" onClick={() => enterVisit(region.id)}>
                  {region.name}<br />
                  <small>{resourceNames[region.resource]} · {productNames[region.product]}</small>
                </button>
              ))}
            </div>
          </section>
        </Modal>
      )}

      {modal === "craftProduct" && (
        <Modal title="상품 만들기" onClose={() => setModal(null)} wide>
          <section className="trade-section">
            <strong>{selectedRegion.shortName}에서 만들 상품</strong>
            <p>대표상품은 다른 지역 자원이 조금씩 필요합니다. 만든 상품은 이웃 지역 상품과 바꾸거나 최종 건물 재료로 씁니다.</p>
          </section>
          <div className="product-grid">
            {craftProductChoices.map((productId) => {
              const product = productSpecs[productId];
              const recipe = applyCraftDiscount(product.recipe, game, selectedRegion.id);
              const craftable = maxCraftableAmount(game.resources, recipe);
              const ready = craftable > 0;
              return (
                <button
                  className={craftProductId === productId ? "product-card selected" : "product-card"}
                  key={productId}
                  onClick={() => {
                    setCraftProductId(productId);
                    setCraftAmount(1);
                  }}
                  type="button"
                >
                  <img src={product.asset} alt="" />
                  <strong>{product.name}</strong>
                  <span>보유 {game.resources[productId]}개</span>
                  <span>제작 가능 {craftable}개</span>
                  <small>{product.use}</small>
                  <em className={ready ? "ready" : "missing"}>{formatCost(recipe)}</em>
                </button>
              );
            })}
          </div>
          <section className="trade-section craft-amount-section">
            <strong>제작 수량</strong>
            <div className="stepper">
              <button disabled={craftAmount <= 1} onClick={() => setCraftAmount(Math.max(1, craftAmount - 1))}>-</button>
              <span>{craftProductId ? productNames[craftProductId] : "상품"} {craftAmount}개 · {formatCost(selectedCraftCost)}</span>
              <button disabled={craftAmount >= selectedCraftMax || craftAmount >= PRODUCT_CRAFT_MAX_AMOUNT} onClick={() => setCraftAmount(Math.min(selectedCraftMax, PRODUCT_CRAFT_MAX_AMOUNT, craftAmount + 1))}>+</button>
            </div>
          </section>
          <button
            className="game-button full"
            disabled={!craftProductId || selectedCraftMax < 1 || craftAmount > selectedCraftMax || game.productCraft !== undefined}
            onClick={() => craftProductId && craftProduct(craftProductId, craftAmount)}
          >
            <PackagePlus size={20} /> {craftProductId ? `${productNames[craftProductId]} ${craftAmount}개` : "상품"} 만들기
          </button>
        </Modal>
      )}

      {modal === "craftResult" && craftResult && (
        <Modal title="상품 제작 완료" onClose={() => { setCraftResult(null); setModal(null); }}>
          <section className="craft-result-card">
            <img src={productSpecs[craftResult.productId].asset} alt="" />
            <strong>{productNames[craftResult.productId]} {craftResult.amount}개를 만들었습니다.</strong>
          </section>
          <button className="game-button full" onClick={() => { setCraftResult(null); setModal(null); }}>확인</button>
        </Modal>
      )}

      {modal === "productTrade" && (
        <Modal title="상품 보내기" onClose={() => setModal(null)}>
          <section className="trade-section">
            <strong>교류 효과</strong>
            <p>상품 교류로 발전도 10을 얻습니다. 발전도 40마다 새 방문객이 찾아오며, 최대 8명이 머물러요.</p>
          </section>
          <section className="trade-section">
            <strong>보낼 상품</strong>
            <div className="product-grid compact">
              {sendProductChoices.map((productId) => (
                <button
                  className={sendProductId === productId ? "product-card selected" : "product-card"}
                  disabled={game.resources[productId] < 1}
                  key={productId}
                  onClick={() => setSendProductId(productId)}
                  type="button"
                >
                  <img src={productSpecs[productId].asset} alt="" />
                  <strong>{productNames[productId]}</strong>
                  <span>보유 {game.resources[productId]}개</span>
                </button>
              ))}
            </div>
          </section>
          <section className="trade-section">
            <strong>대상 지역</strong>
            <div className="choice-row">
              {otherRegions.map((region) => (
                <button
                  key={region.id}
                  className={productTradeTarget === region.id ? "choice selected" : "choice"}
                  onClick={() => {
                    setProductTradeTarget(region.id);
                    setReceiveProductId(region.product);
                  }}
                >
                  {region.shortName} · {productNames[region.product]}
                </button>
              ))}
            </div>
          </section>
          <section className="trade-section">
            <strong>받을 상품</strong>
            <div className="product-grid compact">
              {targetProductChoices.map((productId) => (
                <button
                  className={receiveProductId === productId ? "product-card selected" : "product-card"}
                  key={productId}
                  onClick={() => setReceiveProductId(productId)}
                  type="button"
                >
                  <img src={productSpecs[productId].asset} alt="" />
                  <strong>{productNames[productId]}</strong>
                  <small>{productSpecs[productId].use}</small>
                </button>
              ))}
            </div>
          </section>
          <button className="game-button full" disabled={!sendProductId || !receiveProductId || !productTradeTarget || game.resources[sendProductId] < 1} onClick={sendProductTrade}>
            <Send size={20} /> 상품 보내기
          </button>
        </Modal>
      )}

      {modal === "routes" && (
        <RouteEditor
          regionId={game.selectedRegion}
          tuning={tuning}
          editMode={editMode}
          onEditMode={(mode) => {
            setEditMode(mode);
            setNotice(mode ? "맵을 클릭해 좌표를 추가하세요." : "동선 편집을 멈췄어요.");
          }}
          onClearWorker={() => {
            setTuning((current) => ({ ...current, workerSpots: { ...current.workerSpots, [game.selectedRegion!]: [] } }));
            setNotice("일꾼 위치를 기본값으로 돌렸어요.");
          }}
          onUndoBlocked={() => {
            const previous = tileHistory[tileHistory.length - 1];
            if (!previous) return;
            setTuning((current) => {
              const blocked = new Set(current.blockedTiles?.[previous.regionId] ?? []);
              previous.tiles.forEach((tile, index) => previous.blocked[index] ? blocked.add(tile) : blocked.delete(tile));
              return { ...current, blockedTiles: { ...(current.blockedTiles ?? {}), [previous.regionId]: [...blocked] } };
            });
            setTileHistory((history) => history.slice(0, -1));
          }}
          onClearBuildZone={() => {
            setTuning((current) => ({
              ...current,
              buildZones: { ...current.buildZones, [game.selectedRegion!]: [] },
            }));
            setNotice("건설 구역을 기본값으로 돌렸어요.");
          }}
          onAddBuildZone={() => {
            setTuning((current) => {
              const zones = current.buildZones[game.selectedRegion!] ?? [];
              const offset = zones.length * 34;
              return {
                ...current,
                buildZones: {
                  ...current.buildZones,
                  [game.selectedRegion!]: [
                    ...zones,
                    { x: 930 + offset, y: 560 + offset, width: 520, height: 320 },
                  ],
                },
              };
            });
            setEditMode(null);
            setNotice("초록색 건설 구역을 추가했어요.");
          }}
          onClearMerchantDestination={(target) => {
            setTuning((current) => {
              const origin = game.selectedRegion!;
              const merchantDestinations = { ...current.merchantDestinations };
              const destinationsFromOrigin = { ...merchantDestinations[origin] };
              delete destinationsFromOrigin[target];
              merchantDestinations[origin] = destinationsFromOrigin;
              return { ...current, merchantDestinations };
            });
            setNotice(`${regions[target].shortName} 상인 경로를 기본값으로 돌렸어요.`);
          }}
          onRemovePoint={(kind, target, index) => {
            setTuning((current) => {
              if (kind === "worker") {
                const points = [...(current.workerSpots[game.selectedRegion!] ?? [])];
                points.splice(index, 1);
                return { ...current, workerSpots: { ...current.workerSpots, [game.selectedRegion!]: points } };
              }
              if (kind === "buildZone") {
                const polygons = [...(current.buildZones[game.selectedRegion!] ?? [])];
                polygons.splice(index, 1);
                return { ...current, buildZones: { ...current.buildZones, [game.selectedRegion!]: polygons } };
              }
              return current;
            });
          }}
          onClose={() => {
            setEditMode(null);
            setModal(null);
          }}
          onSave={saveRoutesToCode}
          notice={notice}
        />
      )}

      {modal === "restart" && (
        <Modal title="다시하기" onClose={() => setModal(null)}>
          <p>다시하기를 누르면 모든 기록이 사라집니다. 그래도 하시겠습니까?</p>
          <div className="modal-actions">
            <button className="game-button" onClick={restartGame}>다시하기</button>
            <button className="choice" onClick={() => setModal(null)}>취소하기</button>
          </div>
        </Modal>
      )}

    </main>
  );
}

function StartScreen({ onSelect }: { onSelect: (regionId: RegionId) => void }) {
  return (
    <div className="start-screen">
      <section className="start-panel">
        <span className="eyebrow">네 지역 교류 마을</span>
        <h1>플레이할 지역을 고르세요</h1>
        <p>하나의 지역을 맡아 자원을 모으고, 다른 지역과 교환하며 최종 건물을 완성합니다.</p>
        <div className="region-grid">
          {regionList.map((region) => (
            <button key={region.id} className="region-card" style={{ "--point": region.point } as React.CSSProperties} onClick={() => onSelect(region.id)}>
              <strong>{region.name}</strong>
              <span>{region.intro}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function LoadingOverlay({ progress }: { progress: number }) {
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <section className="loading-card">
        <strong>마을을 준비하고 있어요</strong>
        <span>배경과 건물을 불러오는 중…</span>
        <div className="loading-track" aria-label={`로딩 ${progress}%`}>
          <div className="loading-fill" style={{ width: `${progress}%` }} />
        </div>
        <b>{progress}%</b>
      </section>
    </div>
  );
}

function Hud({ game, onHeightChange }: { game: GameState; onHeightChange: (height: number) => void }) {
  const region = regions[game.selectedRegion!];
  const resourceItems: ItemId[] = ["grain", "seafood", "wood", "minerals"];
  const ownedProducts = productIds.filter((item) => game.resources[item] > 0);
  const hudRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const element = hudRef.current;
    if (!element) return;
    const reportHeight = () => onHeightChange(Math.ceil(element.getBoundingClientRect().height));
    reportHeight();
    const observer = new ResizeObserver(reportHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <section className="hud" ref={hudRef}>
      <div className="hud-title-row">
        <strong>{region.name} 자원</strong>
        <span className="hud-development">발전도 {game.development}</span>
      </div>
      <div className="resource-row primary-resources">
        {resourceItems.map((item) => (
          <span className={item === region.resource ? "resource-badge home-resource" : "resource-badge"} key={item}>
            {itemNames[item]} {game.resources[item]}
          </span>
        ))}
      </div>
      {ownedProducts.length > 0 && (
        <div className="product-mini-row" aria-label="보유 상품">
          <span>상품</span>
          {ownedProducts.map((item) => (
            <span className="product-mini-badge" key={item}>
              {itemNames[item]} {game.resources[item]}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function MissionDialog({ dialog, onConfirm }: { dialog: MissionDialogState; onConfirm: () => void }) {
  const isComplete = dialog.kind === "complete";

  return (
    <div className="mission-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="mission-dialog-title">
      <section className="mission-dialog">
        <span className="eyebrow">{isComplete ? "할 일 완료" : "다음 할 일"}</span>
        <span className="mission-badge">{isComplete ? "완료" : dialog.mission.progress}</span>
        <h2 id="mission-dialog-title">{isComplete ? `${dialog.mission.title} 완료!` : dialog.mission.title}</h2>
        {!isComplete && <p>{dialog.mission.detail}</p>}
        <button className="game-button mission-dialog-confirm" onClick={onConfirm}>확인</button>
      </section>
    </div>
  );
}

function TradeResultDialog({ result, onConfirm }: { result: TradeResultDialogState; onConfirm: () => void }) {
  return (
    <div className="mission-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="trade-result-dialog-title">
      <section className="mission-dialog">
        <span className="eyebrow">교류 완료</span>
        <span className="mission-badge">성공</span>
        <h2 id="trade-result-dialog-title">교류 성공!</h2>
        <p>{regions[result.target].name}과 교류하여<br />{resourceNames[result.resource]} {result.amount}개를 획득했습니다!</p>
        <button className="game-button mission-dialog-confirm" onClick={onConfirm}>확인</button>
      </section>
    </div>
  );
}

function MainCompletionDialog({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="mission-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="main-completion-dialog-title">
      <section className="mission-dialog">
        <span className="eyebrow">메인 퀘스트 완료</span>
        <span className="mission-badge">16/16</span>
        <h2 id="main-completion-dialog-title">축하합니다.<br />모든 퀘스트를 완료하였습니다.</h2>
        <button className="game-button mission-dialog-confirm" onClick={onConfirm}>확인</button>
      </section>
    </div>
  );
}

function MissionGuide({ game }: { game: GameState }) {
  const mission = getCurrentMission(game);
  if (!mission) return null;

  return (
    <section className="mission-guide" aria-label="다음 할 일">
      <div className="mission-guide-header">
        <span className="eyebrow">다음 할 일</span>
        <span className="mission-badge">{mission.progress}</span>
      </div>
      <strong>{mission.title}</strong>
      <p>{mission.detail}</p>
    </section>
  );
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
  nonBlocking = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
  nonBlocking?: boolean;
}) {
  return (
    <div className={nonBlocking ? "modal-backdrop non-blocking" : "modal-backdrop"}>
      <section className={wide ? "modal wide" : "modal"}>
        <header>
          <h2>{title}</h2>
          <button className="close-button" onClick={onClose} title="닫기">
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function RouteEditor({
  regionId,
  tuning,
  editMode,
  onEditMode,
  onClearWorker,
  onUndoBlocked,
  onClearBuildZone,
  onAddBuildZone,
  onClearMerchantDestination,
  onRemovePoint,
  onClose,
  onSave,
  notice,
}: {
  regionId: RegionId;
  tuning: RouteTuning;
  editMode: { mode: "worker" | "merchantDestination" | "blockedPaint" | "blockedErase" | "buildZone"; target?: RegionId } | null;
  onEditMode: (mode: { mode: "worker" | "merchantDestination" | "blockedPaint" | "blockedErase" | "buildZone"; target?: RegionId } | null) => void;
  onClearWorker: () => void;
  onUndoBlocked: () => void;
  onClearBuildZone: () => void;
  onAddBuildZone: () => void;
  onClearMerchantDestination: (target: RegionId) => void;
  onRemovePoint: (kind: "worker" | "merchant" | "buildZone", target: RegionId | undefined, index: number) => void;
  onClose: () => void;
  onSave: () => void;
  notice: string;
}) {
  const otherRegions = regionList.filter((region) => region.id !== regionId);
  const workerPoints = tuning.workerSpots[regionId] ?? [];
  const buildZones = tuning.buildZones[regionId] ?? [];

  return (
    <aside className="route-sidebar">
      <header className="route-sidebar-header">
        <div>
          <h2>동선 편집</h2>
          <span>{regions[regionId].name}</span>
        </div>
        <button className="close-button" onClick={onClose} title="닫기">
          <X size={20} />
        </button>
      </header>
      <p className="route-help">찍기를 누른 뒤 오른쪽 맵에서 원하는 위치를 클릭하세요.</p>
      <div className="route-notice">{notice}</div>
      <button className="game-button full route-save-button" onClick={onSave}>
        코드에 저장
      </button>
      <div className="route-editor">
        <section className="route-card">
          <header>
            <strong>일꾼 작업 위치</strong>
            <div className="route-actions">
              <button
                className={editMode?.mode === "worker" ? "choice selected" : "choice"}
                onClick={() => onEditMode(editMode?.mode === "worker" ? null : { mode: "worker" })}
              >
                찍기
              </button>
              <button className="choice" onClick={onClearWorker}>기본값</button>
            </div>
          </header>
          <PointList points={workerPoints} emptyText="직접 찍은 위치가 없으면 기본 벼밭 위치를 씁니다." onRemove={(index) => onRemovePoint("worker", undefined, index)} />
        </section>

        <section className="route-card">
          <header>
            <strong>이동 불가 타일</strong>
            <div className="route-actions">
              <button className={editMode?.mode === "blockedPaint" ? "choice selected" : "choice"} onClick={() => onEditMode(editMode?.mode === "blockedPaint" ? null : { mode: "blockedPaint" })}>막기</button>
              <button className={editMode?.mode === "blockedErase" ? "choice selected" : "choice"} onClick={() => onEditMode(editMode?.mode === "blockedErase" ? null : { mode: "blockedErase" })}>지우기</button>
              <button className="choice" onClick={onUndoBlocked}>되돌리기</button>
            </div>
          </header>
          <p className="empty-text">맵의 48px 타일을 클릭해 상인의 이동 불가 구역을 지정합니다.</p>
        </section>

        <section className="route-card">
          <header>
            <strong>건설 구역</strong>
            <div className="route-actions">
              <button className="choice" onClick={onAddBuildZone}>추가</button>
              <button className="choice" onClick={onClearBuildZone}>기본값</button>
            </div>
          </header>
          <BuildZoneList
            zones={buildZones}
            onRemovePolygon={(index) => onRemovePoint("buildZone", undefined, index)}
          />
        </section>

        {otherRegions.map((region) => {
          const destination = tuning.merchantDestinations[regionId]?.[region.id];
          const selected = editMode?.mode === "merchantDestination" && editMode.target === region.id;
          return (
            <section className="route-card" key={region.id}>
              <header>
                <strong>상인 도착지점: {region.shortName}</strong>
                <div className="route-actions">
                  <button
                    className={selected ? "choice selected" : "choice"}
                    onClick={() => onEditMode(selected ? null : { mode: "merchantDestination", target: region.id })}
                  >
                    찍기
                  </button>
                  <button className="choice" onClick={() => onClearMerchantDestination(region.id)}>기본값</button>
                </div>
              </header>
              <p className="empty-text">
                {destination ? `x ${destination[0]}, y ${destination[1]}` : "기본 도착지점"} · 이동 불가 타일을 피해 자동으로 이동합니다.
              </p>
            </section>
          );
        })}
      </div>
    </aside>
  );
}

function PointList({ points, emptyText, onRemove }: { points: Array<[number, number]>; emptyText: string; onRemove: (index: number) => void }) {
  if (points.length === 0) {
    return <p className="empty-text">{emptyText}</p>;
  }
  return (
    <ol className="point-list">
      {points.map(([x, y], index) => (
        <li key={`${x}-${y}-${index}`}>
          <span>{index + 1}. x {x}, y {y}</span>
          <button className="close-button" title="삭제" onClick={() => onRemove(index)}>
            <X size={16} />
          </button>
        </li>
      ))}
    </ol>
  );
}

function BuildZoneList({
  zones,
  onRemovePolygon,
}: {
  zones: NonNullable<RouteTuning["buildZones"][RegionId]>;
  onRemovePolygon: (index: number) => void;
}) {
  if (zones.length === 0) {
    return <p className="empty-text">추가를 누르면 이동/크기 조절 가능한 초록색 박스가 생깁니다.</p>;
  }

  return (
    <div className="zone-list">
      {zones.map((zone, index) => (
        <div className="zone-row" key={`zone-${index}`}>
          <span>구역 {index + 1} · {Math.round(zone.width)}x{Math.round(zone.height)}</span>
          <button className="close-button" title="삭제" onClick={() => onRemovePolygon(index)}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Success({ game, onConfirm }: { game: GameState; onConfirm: () => void }) {
  const region = regions[game.selectedRegion!];
  return (
    <div className="modal-backdrop success-backdrop">
      <section className="modal success-modal">
        <PackagePlus size={42} />
        <h2>{region.name} 완성!</h2>
        <p>자기 지역의 자원만으로는 끝까지 발전할 수 없었고, 다른 지역과 필요한 자원을 주고받아 최종 건물을 완성했어요.</p>
        <div className="result-grid">
          <span>교환 성공 {game.stats.trades}회</span>
          <span>상품 교류 {game.stats.productTrades}회</span>
          <span>제작 {game.stats.crafts}회</span>
          <span>발전도 {game.development}</span>
          <span>방문객 {visitorCountForDevelopment(game.development)}/8</span>
        </div>
        <button className="game-button full" onClick={onConfirm}>확인</button>
      </section>
    </div>
  );
}
