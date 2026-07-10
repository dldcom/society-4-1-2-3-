import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hammer, HandCoins, Home, MapPinned, PackagePlus, Send, X } from "lucide-react";
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
  type VillageBuildingSpec,
} from "./gameData";
import type { GameState, Merchant, PlacedBuilding, RouteTuning, SceneCommand, SceneEvent } from "./types";

const emptyResources = () =>
  Object.fromEntries(allItems.map((item) => [item, 0])) as Record<ItemId, number>;

const canPay = (resources: Record<ItemId, number>, cost: Partial<Record<ItemId, number>>) =>
  Object.entries(cost).every(([item, amount]) => resources[item as ItemId] >= (amount ?? 0));

const TRADE_MIN_AMOUNT = 2;
const TRADE_STEP = 2;
const TRADE_MAX_AMOUNT = 10;
const AUTO_PRODUCTION_SECONDS = 15;
const MAX_WORKERS = 4;
const WORKER_BASE_COST = 6;
const WORKER_COST_STEP = 4;
const BUILD_STATUS_READY = "건설 가능";
const BUILD_STATUS_DONE = "완성";
const BUILD_STATUS_LOCKED = "잠김";
const BUILD_STATUS_MISSING = "자원 부족";
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

const autoProductionAmount = (game: GameState) =>
  1 + Math.floor(Math.max(0, game.workers - 1) / 2) + game.autoBonus;

const normalBuildings = (game: GameState) =>
  game.buildings.filter((building) => !isFeatureBuilding(building.spec));

const placedStageCount = (game: GameState, stage: number) =>
  normalBuildings(game).filter((building) => !isFeatureBuilding(building.spec) && building.spec.stage === stage).length;

const normalBuildingLimit = (stage: number) => NORMAL_BUILDING_MAX_COPIES[stage] ?? 1;

const isNormalBuildingUnlocked = (game: GameState, building: BuildingSpec) =>
  building.stage === 1 || placedStageCount(game, building.stage - 1) > 0;

const scaledNormalBuildingCost = (game: GameState, building: BuildingSpec) => {
  const copyNumber = placedStageCount(game, building.stage) + 1;
  const multiplier = building.stage <= 2 ? copyNumber : 1;
  return Object.fromEntries(
    Object.entries(building.cost).map(([item, amount]) => [item, (amount ?? 0) * multiplier]),
  ) as Partial<Record<ItemId, number>>;
};

const canBuildNormalBuilding = (game: GameState, building: BuildingSpec) => {
  if (!isNormalBuildingUnlocked(game, building)) return false;
  if (placedStageCount(game, building.stage) >= normalBuildingLimit(building.stage)) return false;
  return canPay(game.resources, scaledNormalBuildingCost(game, building));
};

const payCost = (resources: Record<ItemId, number>, cost: Partial<Record<ItemId, number>>) => {
  const next = { ...resources };
  Object.entries(cost).forEach(([item, amount]) => {
    next[item as ItemId] -= amount ?? 0;
  });
  return next;
};

const emptyCompanions = (): Partial<Record<RegionId, boolean>> => ({
  mountain: false,
  mine: false,
  rural: false,
  coast: false,
});

const hasRegionCompanion = (game: GameState, regionId: RegionId) =>
  Boolean(game.companions?.[regionId] || (regionId === "rural" && game.hasDog));

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

const makeInitialState = (regionId: RegionId): GameState => {
  const resources = emptyResources();
  (["grain", "seafood", "wood", "minerals"] as ItemId[]).forEach((item) => {
    resources[item] = 50;
  });
  return {
    selectedRegion: regionId,
    resources,
    workers: 1,
    merchants: [],
    development: 0,
    autoBonus: 0,
    builtStage: 0,
    featureBuildings: [],
    buildings: [],
    companions: emptyCompanions(),
    hasDog: false,
    stats: { trades: 0, productTrades: 0, crafts: 0 },
    success: false,
  };
};

type Modal = "build" | "trade" | "visit" | "craftProduct" | "productTrade" | "routes" | null;

const emptyTuning = (): RouteTuning => ({ workerSpots: {}, merchantRoutes: {}, buildZones: {} });


const visitBuildingPositions: Array<[number, number]> = [
  [940, 610],
  [1250, 560],
  [1090, 820],
  [1430, 780],
  [760, 830],
  [1200, 1040],
];

const makeVisitState = (base: GameState, regionId: RegionId): GameState => {
  const region = regions[regionId];
  const builtStage = Math.min(base.builtStage, region.buildings.length);
  return {
    ...base,
    selectedRegion: regionId,
    resources: emptyResources(),
    buildings: region.buildings.slice(0, builtStage).map((spec, index) => ({
      id: `visit-${regionId}-${spec.stage}`,
      spec,
      x: visitBuildingPositions[index]?.[0] ?? 1000 + index * 120,
      y: visitBuildingPositions[index]?.[1] ?? 650 + index * 80,
      hasMerchant: spec.stage === 1,
      productionBoosted: spec.stage >= 5,
    })),
    featureBuildings: base.featureBuildings ?? [],
    merchants: Array.from({ length: Math.max(base.merchants.length, builtStage >= 1 ? 1 : 0) }, (_, index) => ({
      id: `visit-merchant-${regionId}-${index}`,
      name: `상인${index + 1}`,
      status: index === 0 ? "traveling" as const : "idle" as const,
      buildingId: `visit-${regionId}-1`,
      target: base.selectedRegion ?? "rural",
    })),
    companions: { [regionId]: hasRegionCompanion(base, regionId) },
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
      buildZones: { ...(codeTuning.buildZones ?? {}), ...(localTuning.buildZones ?? {}) },
    };
  } catch {
    return { ...emptyTuning(), ...codeTuning };
  }
};

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [tuning, setTuning] = useState<RouteTuning>(() => loadTuning());
  const [editMode, setEditMode] = useState<{ mode: "worker" | "merchant" | "buildZone"; target?: RegionId } | null>(null);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [selectedMainBuilding, setSelectedMainBuilding] = useState(false);
  const [notice, setNotice] = useState("플레이할 지역을 고르세요.");
  const [command, setCommand] = useState<SceneCommand>();
  const [productionLeft, setProductionLeft] = useState(AUTO_PRODUCTION_SECONDS);
  const [tradeMerchant, setTradeMerchant] = useState<string | null>(null);
  const [tradeTarget, setTradeTarget] = useState<RegionId | null>(null);
  const [tradeAmount, setTradeAmount] = useState(2);
  const [visitRegion, setVisitRegion] = useState<RegionId | null>(null);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [craftProductId, setCraftProductId] = useState<ProductId | null>(null);
  const [sendProductId, setSendProductId] = useState<ProductId | null>(null);
  const [productTradeTarget, setProductTradeTarget] = useState<RegionId | null>(null);
  const [receiveProductId, setReceiveProductId] = useState<ProductId | null>(null);
  const [selectedBuildStage, setSelectedBuildStage] = useState<number | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const editModeRef = useRef<typeof editMode>(null);
  const visitRegionRef = useRef<RegionId | null>(null);
  const sceneBusyRef = useRef(false);

  const selectedRegion = game?.selectedRegion ? regions[game.selectedRegion] : null;
  const selectedBuilding = game?.buildings.find((building) => building.id === selectedBuildingId) ?? null;
  const sceneGame = useMemo(() => (game && visitRegion ? makeVisitState(game, visitRegion) : game), [game, visitRegion]);

  const pushCommand = useCallback((next: SceneCommand) => setCommand({ ...next }), []);

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
    pushCommand({ type: "setEditMode", mode: editMode?.mode ?? null, target: editMode?.target });
  }, [editMode, pushCommand]);

  useEffect(() => {
    pushCommand({ type: "setMapView", mode: modal === "routes" ? "overview" : "play" });
  }, [modal, pushCommand]);

  useEffect(() => {
    if (!game || game.success) return;
    const timer = window.setInterval(() => {
      setProductionLeft((left) => {
        if (left > 1) return left - 1;
        setGame((current) => {
          if (!current?.selectedRegion || current.success) return current;
          const region = regions[current.selectedRegion];
          const amount = autoProductionAmount(current);
          const resources = { ...current.resources };
          let bonus = 0;
          resources[region.resource] += amount;
          if (hasRegionCompanion(current, current.selectedRegion) && Math.random() < 0.45) {
            resources[region.resource] += 1;
            bonus += 1;
          }
          const message =
            bonus > 0
              ? `자동 +${amount + bonus} ${resourceNames[region.resource]}`
              : `자동 +${amount} ${resourceNames[region.resource]}`;
          setNotice(message);
          pushCommand({ type: "floatText", text: message });
          return { ...current, resources, development: current.development + 1 };
        });
        return AUTO_PRODUCTION_SECONDS;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [game, pushCommand]);

  const handleSceneEvent = useCallback((event: SceneEvent) => {
    if (event.type === "notice") {
      setNotice(event.message);
      return;
    }
    if (event.type === "selectBuilding") {
      if (visitRegionRef.current || sceneBusyRef.current) return;
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
        if (!activeMode.target) return current;
        const points = current.merchantRoutes[activeMode.target] ?? [];
        return {
          ...current,
          merchantRoutes: { ...current.merchantRoutes, [activeMode.target]: [...points, [event.x, event.y]] },
        };
      });
      setNotice(`좌표 ${event.x}, ${event.y} 추가`);
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
        const resources = { ...current.resources };
        resources[merchant.receiveResource] += merchant.receiveAmount;
        setNotice(`${merchant.name}이 ${resourceNames[merchant.receiveResource]} ${merchant.receiveAmount}개를 가져왔어요.`);
        pushCommand({ type: "floatText", text: `+${merchant.receiveAmount} ${resourceNames[merchant.receiveResource]}` });
        return {
          ...current,
          resources,
          merchants: current.merchants.map((item) =>
            item.id === event.merchantId
              ? { ...item, status: "idle", target: undefined, receiveResource: undefined, receiveAmount: undefined }
              : item,
          ),
          stats: { ...current.stats, trades: current.stats.trades + 1 },
          development: current.development + 4,
        };
      });
      return;
    }
    if (event.type === "productWagonReturned") {
      setGame((current) => {
        if (!current) return current;
        const resources = { ...current.resources };
        resources[event.product] += 1;
        const bonusDevelopment = hasFeatureEffect(current, "trade") ? 2 : 0;
        setNotice(`${regions[event.target].name}에서 ${productNames[event.product]}을 가져왔어요.`);
        pushCommand({ type: "floatText", text: `+1 ${productNames[event.product]}` });
        return {
          ...current,
          resources,
          stats: { ...current.stats, productTrades: current.stats.productTrades + 1 },
          development: current.development + 5 + bonusDevelopment,
        };
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
          setNotice(`${event.building.name} 완성! ${event.building.effect}`);
          setModal(null);
          return {
            ...current,
            resources,
            autoBonus: event.building.effectKind === "production" ? current.autoBonus + 1 : current.autoBonus,
            featureBuildings: [...current.featureBuildings, event.building.id],
            buildings: [...current.buildings, placed],
            development: current.development + 5,
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
        const success = event.building.stage === 6;
        setNotice(success ? "최종 건물 완성!" : `${event.building.name} 완성!`);
        setModal(null);
        return {
          ...current,
          resources,
          builtStage: Math.max(current.builtStage, event.building.stage),
          buildings: [...current.buildings, placed],
          development: current.development + event.building.stage * 4,
          success,
        };
      });
    }
  }, []);

  const startGame = (regionId: RegionId) => {
    const next = makeInitialState(regionId);
    setGame(next);
    setNotice(`${regions[regionId].name}을 선택했어요. 자원을 모아 발전시켜 보세요.`);
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
    if (!game) return;
    if (game.workers >= MAX_WORKERS) {
      setNotice("일꾼은 4명까지 함께할 수 있어요.");
      return;
    }
    const cost = workerRecruitCost(game.workers);
    if (game.resources.grain < cost) {
      setNotice("곡식이 부족합니다.");
      return;
    }
    setGame({
      ...game,
      resources: { ...game.resources, grain: game.resources.grain - cost },
      workers: game.workers + 1,
      development: game.development + 2,
    });
    setNotice("일꾼을 뽑았어요.");
  };

  const openCraftProduct = () => {
    if (!selectedRegion) return;
    setCraftProductId(selectedRegion.product);
    setModal("craftProduct");
  };

  const craftProduct = (productId: ProductId) => {
    if (!game || !selectedRegion) return;
    const product = productSpecs[productId];
    const cost = applyCraftDiscount({ ...product.recipe }, game, selectedRegion.id);
    if (!canPay(game.resources, cost)) {
      setNotice("자원이 부족합니다.");
      return;
    }
    const resources = payCost(game.resources, cost);
    resources[productId] += 1;
    setGame({
      ...game,
      resources,
      stats: { ...game.stats, crafts: game.stats.crafts + 1 },
      development: game.development + 4,
    });
    setNotice(`${product.name}을 만들었어요.`);
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
    if (!game?.selectedRegion || hasRegionCompanion(game, game.selectedRegion)) return;
    const regionId = game.selectedRegion;
    setGame({
      ...game,
      companions: { ...emptyCompanions(), ...(game.companions ?? {}), [regionId]: true },
      hasDog: regionId === "rural" ? true : game.hasDog,
      development: game.development + 2,
    });
    setNotice(companionSpecs[regionId].adoptedMessage);
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
    const firstTargetRegion = regionList.find((region) => region.id !== game.selectedRegion);
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
    setSelectedBuildingId(null);
    setSelectedMainBuilding(false);
    setModal(null);
    setVisitRegion(regionId);
    setNotice(`${regions[regionId].name} 지도로 이동하고 있어요.`);
    window.setTimeout(() => {
      setSceneBusy(false);
      setNotice(`${regions[regionId].name}을 구경하고 있어요.`);
    }, 850);
  };

  const returnHome = () => {
    if (!game?.selectedRegion) return;
    const homeRegion = game.selectedRegion;
    setSceneBusy(true);
    setSelectedBuildingId(null);
    setSelectedMainBuilding(false);
    setVisitRegion(null);
    setNotice(`${regions[homeRegion].name}으로 돌아가고 있어요.`);
    window.setTimeout(() => {
      setSceneBusy(false);
      setNotice(`${regions[homeRegion].name}으로 돌아왔어요.`);
    }, 850);
  };

  const openProductTrade = () => {
    if (!game || !selectedRegion) return;
    const firstTargetRegion = regionList.find((region) => region.id !== game.selectedRegion);
    const firstReceiveProduct = firstTargetRegion?.product ?? null;
    setSendProductId(selectedRegion.product);
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
      if (placedStageCount(game, building.stage) >= normalBuildingLimit(building.stage)) return BUILD_STATUS_DONE;
      if (!isNormalBuildingUnlocked(game, building)) return BUILD_STATUS_LOCKED;
      return canPay(game.resources, scaledNormalBuildingCost(game, building)) ? BUILD_STATUS_READY : BUILD_STATUS_MISSING;
    });
  }, [game, selectedRegion]);

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
        <PhaserGame regionId="rural" command={command} onEvent={handleSceneEvent} />
        <StartScreen onSelect={startGame} />
      </main>
    );
  }

  const idleMerchants = game.merchants.filter((merchant) => merchant.status === "idle");
  const activeTradeMerchant = game.merchants.find((merchant) => merchant.id === tradeMerchant && merchant.status === "idle");
  const otherRegions = regionList.filter((region) => region.id !== game.selectedRegion);
  const tradeLimit = maxTradeAmount(game, selectedRegion.id);
  const canSendTrade = Boolean(activeTradeMerchant && tradeTarget && tradeLimit >= TRADE_MIN_AMOUNT && tradeAmount <= tradeLimit);
  const craftProductChoices = [selectedRegion.product];
  const sendProductChoices = [selectedRegion.product];
  const targetProductChoices = productTradeTarget ? [regions[productTradeTarget].product] : [];
  const nextWorkerCost = workerRecruitCost(game.workers);
  const canRecruitWorker = game.workers < MAX_WORKERS && game.resources.grain >= nextWorkerCost;
  const unlockedFeatureBuildings =
    game.builtStage >= 6
      ? featureBuildingsByRegion[selectedRegion.id].filter((building) => building.product === selectedRegion.product)
      : [];

  return (
    <main className={modal === "routes" ? "game-shell route-mode" : "game-shell"}>
      <PhaserGame regionId={sceneGame?.selectedRegion ?? game.selectedRegion} command={command} onEvent={handleSceneEvent} />
      {modal !== "routes" && (
        <>
          <Hud game={game} productionLeft={productionLeft} />
          <div className="notice-board">{notice}</div>
          <div className="action-bar">
            <button className="game-button" onClick={() => setModal("build")}>
              <Hammer size={22} /> 건설하기
            </button>
            <button className="game-button" onClick={openTrade}>
              <HandCoins size={22} /> 교류하기
            </button>
            <button className="round-button" title="동선 편집" onClick={() => setModal("routes")}>
              <MapPinned size={22} />
            </button>
            <button className="round-button" title="배치 취소" onClick={() => pushCommand({ type: "cancelPlacement" })}>
              <X size={22} />
            </button>
          </div>
        </>
      )}


      {visitRegion && (
        <div className="visit-banner">
          <strong>{regions[visitRegion].name} 구경 중</strong>
          <span>{regions[visitRegion].name}도 우리 마을처럼 {game.builtStage}단계까지 발전했어요.</span>
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
            {game.workers >= MAX_WORKERS ? "일꾼 가득" : `일꾼 뽑기 · 곡식 ${nextWorkerCost}`}
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
            <button className="small-button" onClick={adoptCompanion} disabled={hasRegionCompanion(game, game.selectedRegion)}>
              {companionSpecs[game.selectedRegion].action}
            </button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 3 && (
            <button className="small-button" onClick={openVisit}>이웃 마을 구경하기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 4 && (
            <button className="small-button" onClick={openCraftProduct}>상품 만들기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 5 && (
            <button className="small-button" onClick={openProductTrade}>상품 보내기</button>
          )}
          {!isFeatureBuilding(selectedBuilding.spec) && selectedBuilding.spec.stage === 6 && <button className="small-button">완성 확인</button>}
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
                      {cost.missing > 0 && <em> -{cost.missing}</em>}
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
            <div className="choice-row">
              {game.merchants.map((merchant) => (
                <button
                  key={merchant.id}
                  className={tradeMerchant === merchant.id ? "choice selected" : "choice"}
                  disabled={merchant.status !== "idle"}
                  onClick={() => setTradeMerchant(merchant.id)}
                >
                  {merchant.name}
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
              const ready = canPay(game.resources, recipe);
              return (
                <button
                  className={craftProductId === productId ? "product-card selected" : "product-card"}
                  key={productId}
                  onClick={() => setCraftProductId(productId)}
                  type="button"
                >
                  <img src={product.asset} alt="" />
                  <strong>{product.name}</strong>
                  <span>보유 {game.resources[productId]}개</span>
                  <small>{product.use}</small>
                  <em className={ready ? "ready" : "missing"}>{formatCost(recipe)}</em>
                </button>
              );
            })}
          </div>
          <button
            className="game-button full"
            disabled={!craftProductId || !canPay(game.resources, applyCraftDiscount(productSpecs[craftProductId].recipe, game, selectedRegion.id))}
            onClick={() => craftProductId && craftProduct(craftProductId)}
          >
            <PackagePlus size={20} /> {craftProductId ? productNames[craftProductId] : "상품"} 만들기
          </button>
        </Modal>
      )}

      {modal === "productTrade" && (
        <Modal title="상품 보내기" onClose={() => setModal(null)}>
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
          onClearMerchant={(target) => {
            setTuning((current) => ({ ...current, merchantRoutes: { ...current.merchantRoutes, [target]: [] } }));
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
              const points = [...(current.merchantRoutes[target!] ?? [])];
              points.splice(index, 1);
              return { ...current, merchantRoutes: { ...current.merchantRoutes, [target!]: points } };
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

      {game.success && <Success game={game} onRestart={() => setGame(null)} />}
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
              <small>시작 자원: {resourceNames[region.resource]} 3개</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Hud({ game, productionLeft }: { game: GameState; productionLeft: number }) {
  const region = regions[game.selectedRegion!];
  const resourceItems: ItemId[] = ["grain", "seafood", "wood", "minerals"];
  productIds.forEach((item) => {
    if (item === region.product || game.resources[item] > 0) resourceItems.push(item);
  });
  return (
    <section className="hud">
      <strong>{region.name}</strong>
      <div className="resource-row">
        {resourceItems.map((item) => (
          <span className="resource-badge" key={item}>
            {itemNames[item]} {game.resources[item]}
          </span>
        ))}
      </div>
      <div className="mini-status">
        <span>일꾼 {game.workers}명</span>
        <span>상인 {game.merchants.filter((m) => m.status === "idle").length}/{game.merchants.length}명</span>
        <span>발전도 {game.development}</span>
        <span>자동 생산 {productionLeft}초</span>
      </div>
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
  onClearBuildZone,
  onAddBuildZone,
  onClearMerchant,
  onRemovePoint,
  onClose,
  onSave,
  notice,
}: {
  regionId: RegionId;
  tuning: RouteTuning;
  editMode: { mode: "worker" | "merchant" | "buildZone"; target?: RegionId } | null;
  onEditMode: (mode: { mode: "worker" | "merchant" | "buildZone"; target?: RegionId } | null) => void;
  onClearWorker: () => void;
  onClearBuildZone: () => void;
  onAddBuildZone: () => void;
  onClearMerchant: (target: RegionId) => void;
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
          const route = tuning.merchantRoutes[region.id] ?? [];
          const selected = editMode?.mode === "merchant" && editMode.target === region.id;
          return (
            <section className="route-card" key={region.id}>
              <header>
                <strong>상인 경로: {region.shortName}</strong>
                <div className="route-actions">
                  <button
                    className={selected ? "choice selected" : "choice"}
                    onClick={() => onEditMode(selected ? null : { mode: "merchant", target: region.id })}
                  >
                    찍기
                  </button>
                  <button className="choice" onClick={() => onClearMerchant(region.id)}>기본값</button>
                </div>
              </header>
              <PointList points={route} emptyText="경유점이 없으면 지역 방향으로 직선 왕복합니다." onRemove={(index) => onRemovePoint("merchant", region.id, index)} />
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

function Success({ game, onRestart }: { game: GameState; onRestart: () => void }) {
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
        </div>
        <button className="game-button full" onClick={onRestart}>처음으로</button>
      </section>
    </div>
  );
}
