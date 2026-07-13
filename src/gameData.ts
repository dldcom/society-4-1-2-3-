export type RegionId = "mountain" | "mine" | "rural" | "coast";
export type ResourceId = "wood" | "minerals" | "grain" | "seafood";
export type ProductId =
  | "ruralRiceSack"
  | "ruralVegetableBasket"
  | "ruralFlourSack"
  | "ruralFruitCrate"
  | "mountainLumberBundle"
  | "mountainHerbBasket"
  | "mountainMushroomBox"
  | "mountainHoneyJar"
  | "coastFishCrate"
  | "coastSaltPouch"
  | "coastSeaweedBundle"
  | "coastShellfishBasket"
  | "mineIronOreBox"
  | "mineToolBox"
  | "mineCoalSack"
  | "mineCogwheelParts";
export type ItemId = ResourceId | ProductId;

export type BuildingRole =
  | "생산"
  | "창고"
  | "쉼터"
  | "제작"
  | "교류"
  | "최종 완성";

export type BuildingAssetId = "basic" | "storage" | "worker" | "craft" | "advanced" | "final";
export type FeatureEffectKind = "production" | "craft" | "trade";

export type CompanionSpec = {
  name: string;
  action: string;
  adoptedMessage: string;
  resource: ResourceId;
};

export type BuildingSpec = {
  stage: number;
  name: string;
  asset: BuildingAssetId;
  role: BuildingRole;
  effect: string;
  cost: Partial<Record<ItemId, number>>;
};

export type FeatureBuildingSpec = {
  id: string;
  region: RegionId;
  product: ProductId;
  name: string;
  asset: string;
  effectKind: FeatureEffectKind;
  effect: string;
  cost: Partial<Record<ItemId, number>>;
};

export type VillageBuildingSpec = BuildingSpec | FeatureBuildingSpec;

export type ProductSpec = {
  id: ProductId;
  region: RegionId;
  name: string;
  asset: string;
  recipe: Partial<Record<ItemId, number>>;
  use: string;
};

export type RegionSpec = {
  id: RegionId;
  name: string;
  shortName: string;
  resource: ResourceId;
  product: ProductId;
  products: ProductId[];
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
  ruralRiceSack: "쌀가마니",
  ruralVegetableBasket: "채소바구니",
  ruralFlourSack: "밀가루포대",
  ruralFruitCrate: "과일상자",
  mountainLumberBundle: "목재묶음",
  mountainHerbBasket: "약초바구니",
  mountainMushroomBox: "버섯상자",
  mountainHoneyJar: "꿀단지",
  coastFishCrate: "생선상자",
  coastSaltPouch: "소금주머니",
  coastSeaweedBundle: "김꾸러미",
  coastShellfishBasket: "조개바구니",
  mineIronOreBox: "철광석상자",
  mineToolBox: "공구상자",
  mineCoalSack: "석탄자루",
  mineCogwheelParts: "톱니부품상자",
};

export const itemNames: Record<ItemId, string> = {
  ...resourceNames,
  ...productNames,
};

export const productIds: ProductId[] = [
  "ruralRiceSack",
  "ruralVegetableBasket",
  "ruralFlourSack",
  "ruralFruitCrate",
  "mountainLumberBundle",
  "mountainHerbBasket",
  "mountainMushroomBox",
  "mountainHoneyJar",
  "coastFishCrate",
  "coastSaltPouch",
  "coastSeaweedBundle",
  "coastShellfishBasket",
  "mineIronOreBox",
  "mineToolBox",
  "mineCoalSack",
  "mineCogwheelParts",
];

export const productsByRegion: Record<RegionId, ProductId[]> = {
  rural: ["ruralRiceSack", "ruralVegetableBasket", "ruralFlourSack", "ruralFruitCrate"],
  mountain: ["mountainLumberBundle", "mountainHerbBasket", "mountainMushroomBox", "mountainHoneyJar"],
  coast: ["coastFishCrate", "coastSaltPouch", "coastSeaweedBundle", "coastShellfishBasket"],
  mine: ["mineIronOreBox", "mineToolBox", "mineCoalSack", "mineCogwheelParts"],
};

export const productSpecs: Record<ProductId, ProductSpec> = {
  ruralRiceSack: {
    id: "ruralRiceSack",
    region: "rural",
    name: productNames.ruralRiceSack,
    asset: "/assets/products/rural-rice-sack.png",
    recipe: { grain: 4, wood: 1 },
    use: "기본 식량 상품. 최종 건물 재료와 지역 교류에 씁니다.",
  },
  ruralVegetableBasket: {
    id: "ruralVegetableBasket",
    region: "rural",
    name: productNames.ruralVegetableBasket,
    asset: "/assets/products/rural-vegetable-basket.png",
    recipe: { grain: 4, seafood: 2 },
    use: "일꾼과 마을을 돕는 신선한 식량 상품입니다.",
  },
  ruralFlourSack: {
    id: "ruralFlourSack",
    region: "rural",
    name: productNames.ruralFlourSack,
    asset: "/assets/products/rural-flour-sack.png",
    recipe: { grain: 5, minerals: 2 },
    use: "가공 식품과 다른 지역 제작 재료로 쓰기 좋습니다.",
  },
  ruralFruitCrate: {
    id: "ruralFruitCrate",
    region: "rural",
    name: productNames.ruralFruitCrate,
    asset: "/assets/products/rural-fruit-crate.png",
    recipe: { grain: 5, wood: 1, seafood: 2 },
    use: "교류 보상과 장터 건물 재료로 어울리는 상품입니다.",
  },
  mountainLumberBundle: {
    id: "mountainLumberBundle",
    region: "mountain",
    name: productNames.mountainLumberBundle,
    asset: "/assets/products/mountain-lumber-bundle.png",
    recipe: { wood: 4, minerals: 1 },
    use: "기본 산지 상품. 최종 건물 재료와 건설 재료로 씁니다.",
  },
  mountainHerbBasket: {
    id: "mountainHerbBasket",
    region: "mountain",
    name: productNames.mountainHerbBasket,
    asset: "/assets/products/mountain-herb-basket.png",
    recipe: { wood: 4, grain: 2 },
    use: "동물 친구와 일꾼을 돕는 자연 상품입니다.",
  },
  mountainMushroomBox: {
    id: "mountainMushroomBox",
    region: "mountain",
    name: productNames.mountainMushroomBox,
    asset: "/assets/products/mountain-mushroom-box.png",
    recipe: { wood: 5, seafood: 2 },
    use: "식량 교류와 제작 재료 사이를 이어주는 상품입니다.",
  },
  mountainHoneyJar: {
    id: "mountainHoneyJar",
    region: "mountain",
    name: productNames.mountainHoneyJar,
    asset: "/assets/products/mountain-honey-jar.png",
    recipe: { wood: 5, grain: 1, seafood: 2 },
    use: "가치가 높은 산지 선물 상품입니다.",
  },
  coastFishCrate: {
    id: "coastFishCrate",
    region: "coast",
    name: productNames.coastFishCrate,
    asset: "/assets/products/coast-fish-crate.png",
    recipe: { seafood: 4, wood: 1 },
    use: "기본 어촌 상품. 최종 건물 재료와 지역 교류에 씁니다.",
  },
  coastSaltPouch: {
    id: "coastSaltPouch",
    region: "coast",
    name: productNames.coastSaltPouch,
    asset: "/assets/products/coast-salt-pouch.png",
    recipe: { seafood: 4, minerals: 2 },
    use: "보관과 운반에 도움을 주는 바다 상품입니다.",
  },
  coastSeaweedBundle: {
    id: "coastSeaweedBundle",
    region: "coast",
    name: productNames.coastSeaweedBundle,
    asset: "/assets/products/coast-seaweed-bundle.png",
    recipe: { seafood: 5, grain: 2 },
    use: "식량 상품과 교환하기 좋은 어촌 특산품입니다.",
  },
  coastShellfishBasket: {
    id: "coastShellfishBasket",
    region: "coast",
    name: productNames.coastShellfishBasket,
    asset: "/assets/products/coast-shellfish-basket.png",
    recipe: { seafood: 5, wood: 1, minerals: 2 },
    use: "가치가 높은 바다 선물 상품입니다.",
  },
  mineIronOreBox: {
    id: "mineIronOreBox",
    region: "mine",
    name: productNames.mineIronOreBox,
    asset: "/assets/products/mine-iron-ore-box.png",
    recipe: { minerals: 4, wood: 1 },
    use: "기본 광산 상품. 최종 건물 재료와 제작 재료로 씁니다.",
  },
  mineToolBox: {
    id: "mineToolBox",
    region: "mine",
    name: productNames.mineToolBox,
    asset: "/assets/products/mine-tool-box.png",
    recipe: { minerals: 4, wood: 1, grain: 1 },
    use: "건설과 제작을 돕는 실용 상품입니다.",
  },
  mineCoalSack: {
    id: "mineCoalSack",
    region: "mine",
    name: productNames.mineCoalSack,
    asset: "/assets/products/mine-coal-sack.png",
    recipe: { minerals: 5, seafood: 2 },
    use: "가공소와 작업장에 어울리는 연료 상품입니다.",
  },
  mineCogwheelParts: {
    id: "mineCogwheelParts",
    region: "mine",
    name: productNames.mineCogwheelParts,
    asset: "/assets/products/mine-cogwheel-parts.png",
    recipe: { minerals: 5, wood: 3 },
    use: "고급 건물과 기계 장치에 쓰는 부품 상품입니다.",
  },
};

export const featureBuildingsByRegion: Record<RegionId, FeatureBuildingSpec[]> = {
  rural: [
    {
      id: "rural-meal-storage",
      region: "rural",
      product: "ruralRiceSack",
      name: "급식 창고",
      asset: "/assets/buildings/candidates/rural/12-meal-storage.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { ruralRiceSack: 1 },
    },
    {
      id: "rural-vegetable-field-shed",
      region: "rural",
      product: "ruralVegetableBasket",
      name: "채소 밭막",
      asset: "/assets/buildings/candidates/rural/09-vegetable-field-shed.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { ruralVegetableBasket: 1 },
    },
    {
      id: "rural-rice-mill",
      region: "rural",
      product: "ruralFlourSack",
      name: "방앗간",
      asset: "/assets/buildings/candidates/rural/11-rice-mill.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { ruralFlourSack: 1 },
    },
    {
      id: "rural-farm-market-stall",
      region: "rural",
      product: "ruralFruitCrate",
      name: "농산물 장터",
      asset: "/assets/buildings/candidates/rural/16-farm-market-stall.png",
      effectKind: "trade",
      effect: "상품 교류 발전도 +2",
      cost: { ruralFruitCrate: 1 },
    },
  ],
  mountain: [
    {
      id: "mountain-log-stacking-shed",
      region: "mountain",
      product: "mountainLumberBundle",
      name: "통나무 창고",
      asset: "/assets/buildings/candidates/mountain/08-log-stacking-shed.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { mountainLumberBundle: 1 },
    },
    {
      id: "mountain-herb-storage-hut",
      region: "mountain",
      product: "mountainHerbBasket",
      name: "약초 저장소",
      asset: "/assets/buildings/candidates/mountain/14-herb-storage-hut.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { mountainHerbBasket: 1 },
    },
    {
      id: "mountain-forest-market-stall",
      region: "mountain",
      product: "mountainMushroomBox",
      name: "숲 장터",
      asset: "/assets/buildings/candidates/mountain/16-forest-market-stall.png",
      effectKind: "trade",
      effect: "상품 교류 발전도 +2",
      cost: { mountainMushroomBox: 1 },
    },
    {
      id: "mountain-cabin",
      region: "mountain",
      product: "mountainHoneyJar",
      name: "산장",
      asset: "/assets/buildings/candidates/mountain/09-mountain-cabin.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { mountainHoneyJar: 1 },
    },
  ],
  coast: [
    {
      id: "coast-seafood-market-stall",
      region: "coast",
      product: "coastFishCrate",
      name: "해산물 시장",
      asset: "/assets/buildings/candidates/coast/14-seafood-market-stall.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { coastFishCrate: 1 },
    },
    {
      id: "coast-salt-storage",
      region: "coast",
      product: "coastSaltPouch",
      name: "소금 창고",
      asset: "/assets/buildings/candidates/coast/12-salt-storage.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { coastSaltPouch: 1 },
    },
    {
      id: "coast-net-drying-hut",
      region: "coast",
      product: "coastSeaweedBundle",
      name: "그물 말림막",
      asset: "/assets/buildings/candidates/coast/09-net-drying-hut.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { coastSeaweedBundle: 1 },
    },
    {
      id: "coast-shellfish-workbench",
      region: "coast",
      product: "coastShellfishBasket",
      name: "조개 작업대",
      asset: "/assets/buildings/candidates/coast/10-shellfish-workbench.png",
      effectKind: "trade",
      effect: "상품 교류 발전도 +2",
      cost: { coastShellfishBasket: 1 },
    },
  ],
  mine: [
    {
      id: "mine-stone-storage",
      region: "mine",
      product: "mineIronOreBox",
      name: "돌 저장소",
      asset: "/assets/buildings/candidates/mine/09-stone-storage.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { mineIronOreBox: 1 },
    },
    {
      id: "mine-tool-repair-shop",
      region: "mine",
      product: "mineToolBox",
      name: "공구 수리소",
      asset: "/assets/buildings/candidates/mine/11-tool-repair-shop.png",
      effectKind: "craft",
      effect: "상품 만들 때 자원 1개 덜",
      cost: { mineToolBox: 1 },
    },
    {
      id: "mine-coal-loading-shed",
      region: "mine",
      product: "mineCoalSack",
      name: "석탄 적재장",
      asset: "/assets/buildings/candidates/mine/15-coal-loading-shed.png",
      effectKind: "production",
      effect: "자동 생산 +1",
      cost: { mineCoalSack: 1 },
    },
    {
      id: "mine-mineral-appraisal",
      region: "mine",
      product: "mineCogwheelParts",
      name: "부품 작업소",
      asset: "/assets/buildings/candidates/mine/13-mineral-appraisal.png",
      effectKind: "trade",
      effect: "상품 교류 발전도 +2",
      cost: { mineCogwheelParts: 1 },
    },
  ],
};

export const companionSpecs: Record<RegionId, CompanionSpec> = {
  mountain: {
    name: "다람쥐",
    action: "다람쥐 만나기",
    adoptedMessage: "다람쥐가 숲길 친구가 되었어요.",
    resource: "wood",
  },
  mine: {
    name: "두더지",
    action: "두더지 만나기",
    adoptedMessage: "두더지가 광산 친구가 되었어요.",
    resource: "minerals",
  },
  rural: {
    name: "강아지",
    action: "강아지 입양",
    adoptedMessage: "강아지를 입양했어요.",
    resource: "grain",
  },
  coast: {
    name: "수달",
    action: "수달 만나기",
    adoptedMessage: "수달이 해안 친구가 되었어요.",
    resource: "seafood",
  },
};

const primaryProductByRegion: Record<RegionId, ProductId> = {
  rural: "ruralRiceSack",
  mountain: "mountainLumberBundle",
  coast: "coastFishCrate",
  mine: "mineIronOreBox",
};

const productFinalCost = (ownRegion: RegionId, ownResource: ResourceId): Partial<Record<ItemId, number>> => ({
  [ownResource]: 95,
  ...Object.fromEntries(
    (["grain", "seafood", "wood", "minerals"] as ResourceId[])
      .filter((resource) => resource !== ownResource)
      .map((resource) => [resource, 20]),
  ),
  ...Object.fromEntries(
    Object.entries(primaryProductByRegion)
      .map(([, product]) => [product, 2]),
  ),
});

export const regions: Record<RegionId, RegionSpec> = {
  mountain: {
    id: "mountain",
    name: "산간 지역",
    shortName: "산간",
    resource: "wood",
    product: "mountainLumberBundle",
    products: productsByRegion.mountain,
    productName: productNames.mountainLumberBundle,
    bg: "/assets/mountain-region-v1.webp",
    point: "#3f8f4f",
    intro: "숲과 목공이 자라는 마을",
    recipe: { wood: 2, grain: 1, minerals: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 숲길", asset: "basic", role: "생산", effect: "나무 생산 기반", cost: { wood: 3 } },
      { stage: 2, name: "목재 창고", asset: "storage", role: "창고", effect: "다람쥐 만나기", cost: { wood: 4 } },
      { stage: 3, name: "나무꾼 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { wood: 5, grain: 1 } },
      { stage: 4, name: "목공 작업소", asset: "craft", role: "제작", effect: "산지 상품 제작", cost: { wood: 5, minerals: 2, seafood: 1 } },
      { stage: 5, name: "목재 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { wood: 6, minerals: 2, grain: 1 } },
      { stage: 6, name: "산림 교류회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("mountain", "wood") },
    ],
  },
  mine: {
    id: "mine",
    name: "광산 지역",
    shortName: "광산",
    resource: "minerals",
    product: "mineIronOreBox",
    products: productsByRegion.mine,
    productName: productNames.mineIronOreBox,
    bg: "/assets/mine-region-v2.webp",
    point: "#607d8b",
    intro: "광물과 도구가 나오는 마을",
    recipe: { minerals: 2, grain: 1, wood: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 광산", asset: "basic", role: "생산", effect: "광물 생산 기반", cost: { minerals: 3 } },
      { stage: 2, name: "광물 창고", asset: "storage", role: "창고", effect: "두더지 만나기", cost: { minerals: 4 } },
      { stage: 3, name: "광부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { minerals: 5, grain: 1 } },
      { stage: 4, name: "대장간", asset: "craft", role: "제작", effect: "광산 상품 제작", cost: { minerals: 5, wood: 2, seafood: 1 } },
      { stage: 5, name: "광산 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { minerals: 6, wood: 3, grain: 1 } },
      { stage: 6, name: "광산 교류회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("mine", "minerals") },
    ],
  },
  rural: {
    id: "rural",
    name: "농촌 지역",
    shortName: "농촌",
    resource: "grain",
    product: "ruralRiceSack",
    products: productsByRegion.rural,
    productName: productNames.ruralRiceSack,
    bg: "/assets/rural-region-v1.webp",
    point: "#d8a328",
    intro: "밭과 창고가 따뜻한 마을",
    recipe: { grain: 2, wood: 1, minerals: 1, seafood: 1 },
    buildings: [
      { stage: 1, name: "작은 농가", asset: "basic", role: "생산", effect: "상인 뽑기", cost: { grain: 3 } },
      { stage: 2, name: "곡식 창고", asset: "storage", role: "창고", effect: "강아지 입양", cost: { grain: 4 } },
      { stage: 3, name: "농부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { grain: 5, wood: 1 } },
      { stage: 4, name: "곡식 가공소", asset: "craft", role: "제작", effect: "농촌 상품 만들기", cost: { grain: 5, wood: 2, minerals: 1, seafood: 1 } },
      { stage: 5, name: "곡식 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { grain: 6, minerals: 2, seafood: 1 } },
      { stage: 6, name: "풍요의 마을회관", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("rural", "grain") },
    ],
  },
  coast: {
    id: "coast",
    name: "해안 지역",
    shortName: "해안",
    resource: "seafood",
    product: "coastFishCrate",
    products: productsByRegion.coast,
    productName: productNames.coastFishCrate,
    bg: "/assets/coast-region-v1.webp",
    point: "#349bc5",
    intro: "바다와 시장이 가까운 마을",
    recipe: { seafood: 2, grain: 1, wood: 1, minerals: 1 },
    buildings: [
      { stage: 1, name: "작은 어장", asset: "basic", role: "생산", effect: "해산물 생산 기반", cost: { seafood: 3 } },
      { stage: 2, name: "냉장 창고", asset: "storage", role: "창고", effect: "수달 만나기", cost: { seafood: 4 } },
      { stage: 3, name: "어부 쉼터", asset: "worker", role: "쉼터", effect: "이웃 마을 구경", cost: { seafood: 5, grain: 1 } },
      { stage: 4, name: "바다 포장소", asset: "craft", role: "제작", effect: "어촌 상품 제작", cost: { seafood: 5, wood: 2, minerals: 1 } },
      { stage: 5, name: "해안 작업장", asset: "advanced", role: "교류", effect: "상품 보내기", cost: { seafood: 6, minerals: 2, grain: 1 } },
      { stage: 6, name: "해안 교류시장", asset: "final", role: "최종 완성", effect: "최종 완성", cost: productFinalCost("coast", "seafood") },
    ],
  },
};

const balancedBuildingCosts: Record<RegionId, Array<Partial<Record<ItemId, number>>>> = {
  mountain: [
    { wood: 2 },
    { wood: 18, minerals: 2 },
    { wood: 32, grain: 6, minerals: 6, seafood: 6 },
    { wood: 48, grain: 10, minerals: 10, seafood: 10 },
    { wood: 70, grain: 15, minerals: 15, seafood: 15, mountainLumberBundle: 2 },
    productFinalCost("mountain", "wood"),
  ],
  mine: [
    { minerals: 2 },
    { minerals: 18, grain: 2 },
    { minerals: 32, grain: 6, seafood: 6, wood: 6 },
    { minerals: 48, grain: 10, seafood: 10, wood: 10 },
    { minerals: 70, grain: 15, seafood: 15, wood: 15, mineIronOreBox: 2 },
    productFinalCost("mine", "minerals"),
  ],
  rural: [
    { grain: 2 },
    { grain: 18, seafood: 2 },
    { grain: 32, seafood: 6, wood: 6, minerals: 6 },
    { grain: 48, seafood: 10, wood: 10, minerals: 10 },
    { grain: 70, seafood: 15, wood: 15, minerals: 15, ruralRiceSack: 2 },
    productFinalCost("rural", "grain"),
  ],
  coast: [
    { seafood: 2 },
    { seafood: 18, wood: 2 },
    { seafood: 32, grain: 6, wood: 6, minerals: 6 },
    { seafood: 48, grain: 10, wood: 10, minerals: 10 },
    { seafood: 70, grain: 15, wood: 15, minerals: 15, coastFishCrate: 2 },
    productFinalCost("coast", "seafood"),
  ],
};

Object.entries(balancedBuildingCosts).forEach(([regionId, costs]) => {
  regions[regionId as RegionId].buildings.forEach((building, index) => {
    building.cost = costs[index] ?? building.cost;
  });
});

export const regionList = Object.values(regions);

export const allItems: ItemId[] = [
  "grain",
  "seafood",
  "wood",
  "minerals",
  ...productIds,
];

export const buildingAssetIds: BuildingAssetId[] = ["basic", "storage", "worker", "craft", "advanced", "final"];

const ruralBuildingAssetPaths: Record<BuildingAssetId, string> = {
  basic: "/assets/buildings/candidates/rural/01-small-farmhouse.png",
  storage: "/assets/buildings/candidates/rural/02-grain-storage.png",
  worker: "/assets/buildings/candidates/rural/03-farmer-rest.png",
  craft: "/assets/buildings/candidates/rural/04-grain-processing.png",
  advanced: "/assets/buildings/candidates/rural/05-grain-work-yard.png",
  final: "/assets/buildings/candidates/rural/06-rural-exchange-yard.png",
};

const regionalBuildingAssetPaths: Record<RegionId, Record<BuildingAssetId, string>> = {
  rural: ruralBuildingAssetPaths,
  mountain: {
    basic: "/assets/buildings/candidates/mountain/01-small-forest-path.png",
    storage: "/assets/buildings/candidates/mountain/02-lumber-storage.png",
    worker: "/assets/buildings/candidates/mountain/03-woodcutter-rest.png",
    craft: "/assets/buildings/candidates/mountain/04-carpentry-workshop.png",
    advanced: "/assets/buildings/candidates/mountain/05-lumber-work-yard.png",
    final: "/assets/buildings/candidates/mountain/06-forest-exchange-hall.png",
  },
  mine: {
    basic: "/assets/buildings/candidates/mine/01-small-mine.png",
    storage: "/assets/buildings/candidates/mine/02-mineral-storage.png",
    worker: "/assets/buildings/candidates/mine/03-miner-rest.png",
    craft: "/assets/buildings/candidates/mine/04-blacksmith-forge.png",
    advanced: "/assets/buildings/candidates/mine/05-mining-workshop.png",
    final: "/assets/buildings/candidates/mine/06-mining-exchange-hall.png",
  },
  coast: {
    basic: "/assets/buildings/candidates/coast/01-small-fishery.png",
    storage: "/assets/buildings/candidates/coast/02-seafood-storage.png",
    worker: "/assets/buildings/candidates/coast/03-fisher-rest.png",
    craft: "/assets/buildings/candidates/coast/04-sea-gift-packing.png",
    advanced: "/assets/buildings/candidates/coast/05-coastal-workshop.png",
    final: "/assets/buildings/candidates/coast/06-coastal-exchange-market.png",
  },
};

const mainBuildingAssetPaths: Record<RegionId, string> = {
  rural: "/assets/buildings/candidates/rural/07-village-hall.png",
  mountain: "/assets/buildings/candidates/mountain/07-main-hall.png",
  mine: "/assets/buildings/candidates/mine/07-main-office.png",
  coast: "/assets/buildings/candidates/coast/07-main-hall.png",
};

export const buildingAssetPath = (regionId: RegionId, asset: BuildingAssetId) => regionalBuildingAssetPaths[regionId][asset];

export const mainBuildingAssetPath = (regionId: RegionId) => mainBuildingAssetPaths[regionId];
