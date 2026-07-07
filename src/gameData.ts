export type RegionId = "mountain" | "factory" | "rural" | "coast";
export type ResourceId = "wood" | "parts" | "grain" | "seafood";
export type ProductId = "woodBox" | "cart" | "lunchbox" | "seafoodPack";
export type ItemId = ResourceId | ProductId | "egg";

export type BuildingRole =
  | "생산"
  | "창고"
  | "쉼터"
  | "제작"
  | "자동 생산"
  | "최종 완성";

export type BuildingSpec = {
  stage: number;
  name: string;
  asset: "basic" | "storage" | "worker" | "craft" | "advanced" | "final";
  role: BuildingRole;
  effect: string;
  cost: Partial<Record<ItemId, number>>;
};

export type RegionSpec = {
  id: RegionId;
  name: string;
  shortName: string;
  resource: ResourceId;
  product: ProductId;
  productName: string;
  bg: string;
  point: string;
  intro: string;
  buildings: BuildingSpec[];
  recipe: Partial<Record<ItemId, number>>;
};

export const resourceNames: Record<ResourceId, string> = {
  wood: "나무",
  parts: "부품",
  grain: "곡식",
  seafood: "해산물",
};

export const productNames: Record<ProductId, string> = {
  woodBox: "목재 상자",
  cart: "수레",
  lunchbox: "도시락",
  seafoodPack: "해산물 꾸러미",
};

export const itemNames: Record<ItemId, string> = {
  ...resourceNames,
  ...productNames,
  egg: "달걀",
};

export const regions: Record<RegionId, RegionSpec> = {
  mountain: {
    id: "mountain",
    name: "산간 지역",
    shortName: "산간",
    resource: "wood",
    product: "woodBox",
    productName: "목재 상자",
    bg: "/assets/mountain-region-v1.webp",
    point: "#3f8f4f",
    intro: "숲과 목공이 자라는 마을",
    recipe: { wood: 2, parts: 1 },
    buildings: [
      { stage: 1, name: "작은 숲길", asset: "basic", role: "생산", effect: "나무 생산 기반", cost: { wood: 3 } },
      { stage: 2, name: "목재 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { wood: 4 } },
      { stage: 3, name: "나무꾼 쉼터", asset: "worker", role: "쉼터", effect: "일꾼 추가", cost: { wood: 5, grain: 1 } },
      { stage: 4, name: "목공소", asset: "craft", role: "제작", effect: "목재 상자 제작", cost: { wood: 5, parts: 2, seafood: 1 } },
      { stage: 5, name: "큰 벌목장", asset: "advanced", role: "자동 생산", effect: "자동 생산 강화", cost: { wood: 6, parts: 2, grain: 1 } },
      { stage: 6, name: "산림 마을 센터", asset: "final", role: "최종 완성", effect: "최종 완성", cost: { wood: 8, grain: 3, seafood: 2, parts: 3, woodBox: 2 } },
    ],
  },
  factory: {
    id: "factory",
    name: "공업 지역",
    shortName: "공업",
    resource: "parts",
    product: "cart",
    productName: "수레",
    bg: "/assets/factory-region-v1.webp",
    point: "#607d8b",
    intro: "기계와 물류가 움직이는 마을",
    recipe: { parts: 2, wood: 1 },
    buildings: [
      { stage: 1, name: "작은 공장", asset: "basic", role: "생산", effect: "부품 생산 기반", cost: { parts: 3 } },
      { stage: 2, name: "부품 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { parts: 4 } },
      { stage: 3, name: "기술자 쉼터", asset: "worker", role: "쉼터", effect: "일꾼 추가", cost: { parts: 5, grain: 1 } },
      { stage: 4, name: "조립소", asset: "craft", role: "제작", effect: "수레 제작", cost: { parts: 5, wood: 2, seafood: 1 } },
      { stage: 5, name: "큰 공장", asset: "advanced", role: "자동 생산", effect: "자동 생산 강화", cost: { parts: 6, wood: 3, grain: 1 } },
      { stage: 6, name: "물류 기계 공장", asset: "final", role: "최종 완성", effect: "최종 완성", cost: { parts: 8, grain: 3, seafood: 2, wood: 3, cart: 2 } },
    ],
  },
  rural: {
    id: "rural",
    name: "농촌 지역",
    shortName: "농촌",
    resource: "grain",
    product: "lunchbox",
    productName: "도시락",
    bg: "/assets/rural-region-v1.webp",
    point: "#d8a328",
    intro: "밭과 창고가 따뜻한 마을",
    recipe: { grain: 2, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 밭", asset: "basic", role: "생산", effect: "곡식 생산 기반", cost: { grain: 3 } },
      { stage: 2, name: "곡식 창고", asset: "storage", role: "창고", effect: "강아지 입양 가능", cost: { grain: 4 } },
      { stage: 3, name: "농부 쉼터", asset: "worker", role: "쉼터", effect: "일꾼 추가, 닭 상호작용", cost: { grain: 5, wood: 1 } },
      { stage: 4, name: "방앗간", asset: "craft", role: "제작", effect: "도시락 제작", cost: { grain: 5, wood: 2, parts: 1 } },
      { stage: 5, name: "큰 농장", asset: "advanced", role: "자동 생산", effect: "자동 생산 강화", cost: { grain: 6, parts: 2, seafood: 1 } },
      { stage: 6, name: "큰 급식센터", asset: "final", role: "최종 완성", effect: "최종 완성", cost: { grain: 8, seafood: 3, wood: 3, parts: 2, lunchbox: 2 } },
    ],
  },
  coast: {
    id: "coast",
    name: "해안 지역",
    shortName: "해안",
    resource: "seafood",
    product: "seafoodPack",
    productName: "해산물 꾸러미",
    bg: "/assets/coast-region-v1.webp",
    point: "#349bc5",
    intro: "바다와 시장이 가까운 마을",
    recipe: { seafood: 2, wood: 1 },
    buildings: [
      { stage: 1, name: "작은 어장", asset: "basic", role: "생산", effect: "해산물 생산 기반", cost: { seafood: 3 } },
      { stage: 2, name: "냉장 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { seafood: 4 } },
      { stage: 3, name: "어부 쉼터", asset: "worker", role: "쉼터", effect: "일꾼 추가", cost: { seafood: 5, grain: 1 } },
      { stage: 4, name: "생선 가게", asset: "craft", role: "제작", effect: "해산물 꾸러미 제작", cost: { seafood: 5, wood: 2, parts: 1 } },
      { stage: 5, name: "큰 어장", asset: "advanced", role: "자동 생산", effect: "자동 생산 강화", cost: { seafood: 6, parts: 2, grain: 1 } },
      { stage: 6, name: "큰 항구 시장", asset: "final", role: "최종 완성", effect: "최종 완성", cost: { seafood: 8, grain: 3, wood: 3, parts: 2, seafoodPack: 2 } },
    ],
  },
};

export const regionList = Object.values(regions);

export const allItems: ItemId[] = [
  "grain",
  "seafood",
  "wood",
  "parts",
  "woodBox",
  "cart",
  "lunchbox",
  "seafoodPack",
  "egg",
];

export const buildingAssetPath = (asset: BuildingSpec["asset"]) => `/assets/buildings/${asset}.webp`;
