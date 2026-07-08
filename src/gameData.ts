export type RegionId = "mountain" | "mine" | "rural" | "coast";
export type ResourceId = "wood" | "minerals" | "grain" | "seafood";
export type ProductId = "forestBox" | "toolBox" | "plentyBundle" | "seaGiftBox";
export type ItemId = ResourceId | ProductId;

export type BuildingRole =
  | "생산"
  | "창고"
  | "쉼터"
  | "제작"
  | "교류"
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
  minerals: "광물",
  grain: "곡식",
  seafood: "해산물",
};

export const productNames: Record<ProductId, string> = {
  forestBox: "숲속 생활 상자",
  toolBox: "튼튼 도구 상자",
  plentyBundle: "풍요 꾸러미",
  seaGiftBox: "바다 선물 상자",
};

export const itemNames: Record<ItemId, string> = {
  ...resourceNames,
  ...productNames,
};

const productFinalCost = (ownResource: ResourceId, ownProduct: ProductId): Partial<Record<ItemId, number>> => ({
  [ownResource]: 8,
  [ownProduct]: 2,
  ...Object.fromEntries(Object.keys(productNames).filter((product) => product !== ownProduct).map((product) => [product, 1])),
});

export const regions: Record<RegionId, RegionSpec> = {
  mountain: {
    id: "mountain",
    name: "산간 지역",
    shortName: "산간",
    resource: "wood",
    product: "forestBox",
    productName: "숲속 생활 상자",
    bg: "/assets/mountain-region-v1.webp",
    point: "#3f8f4f",
    intro: "숲과 목공이 자라는 마을",
    recipe: { wood: 2, grain: 1, minerals: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 숲길", asset: "basic", role: "생산", effect: "나무 생산 기반", cost: { wood: 3 } },
      { stage: 2, name: "목재 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { wood: 4 } },
      { stage: 3, name: "나무꾼 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { wood: 5, grain: 1 } },
      { stage: 4, name: "목공 작업소", asset: "craft", role: "제작", effect: "숲속 생활 상자 제작", cost: { wood: 5, minerals: 2, seafood: 1 } },
      { stage: 5, name: "목재 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { wood: 6, minerals: 2, grain: 1 } },
      { stage: 6, name: "산림 교류회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("wood", "forestBox") },
    ],
  },
  mine: {
    id: "mine",
    name: "광산 지역",
    shortName: "광산",
    resource: "minerals",
    product: "toolBox",
    productName: "튼튼 도구 상자",
    bg: "/assets/factory-region-v1.webp",
    point: "#607d8b",
    intro: "광물과 도구가 나오는 마을",
    recipe: { minerals: 2, grain: 1, wood: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 광산", asset: "basic", role: "생산", effect: "광물 생산 기반", cost: { minerals: 3 } },
      { stage: 2, name: "광물 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { minerals: 4 } },
      { stage: 3, name: "광부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { minerals: 5, grain: 1 } },
      { stage: 4, name: "대장간", asset: "craft", role: "제작", effect: "튼튼 도구 상자 제작", cost: { minerals: 5, wood: 2, seafood: 1 } },
      { stage: 5, name: "광산 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { minerals: 6, wood: 3, grain: 1 } },
      { stage: 6, name: "광산 교류회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("minerals", "toolBox") },
    ],
  },
  rural: {
    id: "rural",
    name: "농촌 지역",
    shortName: "농촌",
    resource: "grain",
    product: "plentyBundle",
    productName: "풍요 꾸러미",
    bg: "/assets/rural-region-v1.webp",
    point: "#d8a328",
    intro: "밭과 창고가 따뜻한 마을",
    recipe: { grain: 2, wood: 1, minerals: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 농가", asset: "basic", role: "생산", effect: "상인 뽑기", cost: { grain: 3 } },
      { stage: 2, name: "곡식 창고", asset: "storage", role: "창고", effect: "강아지 입양", cost: { grain: 4 } },
      { stage: 3, name: "농부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { grain: 5, wood: 1 } },
      { stage: 4, name: "곡식 가공소", asset: "craft", role: "제작", effect: "풍요 꾸러미 만들기", cost: { grain: 5, wood: 2, minerals: 1, seafood: 1 } },
      { stage: 5, name: "곡식 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { grain: 6, minerals: 2, seafood: 1 } },
      { stage: 6, name: "풍요의 마을회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("grain", "plentyBundle") },
    ],
  },
  coast: {
    id: "coast",
    name: "해안 지역",
    shortName: "해안",
    resource: "seafood",
    product: "seaGiftBox",
    productName: "바다 선물 상자",
    bg: "/assets/coast-region-v1.webp",
    point: "#349bc5",
    intro: "바다와 시장이 가까운 마을",
    recipe: { seafood: 2, grain: 1, wood: 1, minerals: 1 },
    buildings: [
      { stage: 1, name: "작은 어장", asset: "basic", role: "생산", effect: "해산물 생산 기반", cost: { seafood: 3 } },
      { stage: 2, name: "냉장 창고", asset: "storage", role: "창고", effect: "자원 보관 기반", cost: { seafood: 4 } },
      { stage: 3, name: "어부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { seafood: 5, grain: 1 } },
      { stage: 4, name: "바다 포장소", asset: "craft", role: "제작", effect: "바다 선물 상자 제작", cost: { seafood: 5, wood: 2, minerals: 1 } },
      { stage: 5, name: "해안 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { seafood: 6, minerals: 2, grain: 1 } },
      { stage: 6, name: "해안 교류시장", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("seafood", "seaGiftBox") },
    ],
  },
};

export const regionList = Object.values(regions);

export const allItems: ItemId[] = [
  "grain",
  "seafood",
  "wood",
  "minerals",
  "plentyBundle",
  "forestBox",
  "toolBox",
  "seaGiftBox",
];

export const buildingAssetPath = (asset: BuildingSpec["asset"]) => `/assets/buildings/${asset}.webp`;
