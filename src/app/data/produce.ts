// ── produce.ts ─────────────────────────────────────────────────────────────
//
// Chunk 1 — Crop data model.
//
// GOLDEN RULE (same as types.ts): zero imports from React/hooks/context.
// Plain types, data, and pure functions only, so anything can import this
// without circular-dependency risk.
//
// A device's produce is now stored as one or more specific crops
// (`CropId[]`), never as a broad category. Category is a *derived* label —
// used for grouping in the selector UI and for the "assorted crates" mixed
// tile — not something we persist. Every crop below carries its own
// thresholds; there is no shared "tubers" target anymore.
//
// This file does not yet replace `PRODUCE_THRESHOLDS` / `ProduceMode` in
// types.ts — those stay in place, still driving the existing selector,
// dashboard badges, etc., until Chunk 3 (new visual selector) and Chunk 6
// (wizard integration) migrate those components over one at a time.

// ── Category (derived, not stored) ───────────────────────────────────────────

export type CategoryId = 'tubers' | 'fruits' | 'leafy' | 'legumes' | 'meat';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  tagline: string;
  accentColor: string;
  iconBg: string;
  iconColor: string;
  /** image id for the category tile, per the image-gen naming convention */
  imageId: string;
}

export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  tubers: {
    id: 'tubers', label: 'Tubers', tagline: 'Cassava, yam, cocoyam, sweet potato',
    accentColor: '#E67E22', iconBg: 'rgba(230,126,34,0.12)', iconColor: '#E67E22',
    imageId: 'tubers',
  },
  fruits: {
    id: 'fruits', label: 'Fruits & Vegetables', tagline: 'Tomato, pepper, plantain, citrus, and more',
    accentColor: '#27AE60', iconBg: 'rgba(39,174,96,0.12)', iconColor: '#27AE60',
    imageId: 'fruits',
  },
  leafy: {
    id: 'leafy', label: 'Leafy Vegetables', tagline: 'Cabbage, lettuce, kontomire, spring onion',
    accentColor: '#16A085', iconBg: 'rgba(22,160,133,0.12)', iconColor: '#16A085',
    imageId: 'leafy',
  },
  legumes: {
    id: 'legumes', label: 'Legumes', tagline: 'Cowpea, groundnut, soybean',
    accentColor: '#717182', iconBg: 'rgba(113,113,130,0.12)', iconColor: '#717182',
    imageId: 'legumes',
  },
  meat: {
    id: 'meat', label: 'Meat & Fish', tagline: 'Chicken, beef, tilapia',
    accentColor: '#B91C1C', iconBg: 'rgba(185,28,28,0.10)', iconColor: '#B91C1C',
    imageId: 'meat',
  },
};

// ── Crop ──────────────────────────────────────────────────────────────────────

export type CropId =
  | 'cassava' | 'yam' | 'cocoyam' | 'sweet-potato'
  | 'tomato' | 'pepper' | 'plantain' | 'orange' | 'mango' | 'pineapple' | 'watermelon'
  | 'cabbage' | 'lettuce' | 'kontomire' | 'spring-onion'
  | 'cowpea' | 'groundnut' | 'soybean'
  | 'chicken' | 'beef' | 'tilapia';

export interface CropProfile {
  id: CropId;
  category: CategoryId;
  label: string;
  /** image id for the crop tile, per the image-gen naming convention */
  imageId: string;
  targetTemperature: number;
  tempRange: [number, number];
  targetHumidity: number;
  humidityRange: [number, number];
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  /** null = not meaningfully chilling-sensitive; a number = never go below this */
  chillingFloor: number | null;
  /** true = alert direction is "too humid"; false = alert direction is "too dry" */
  humidAlertHigh: boolean;
  /**
   * Ethylene behavior, used by Chunk 2's compatibility check.
   * - 'producer-high': climacteric — ripens/produces a strong ethylene burst
   *   after harvest (banana/plantain, mango, tomato). Source: climacteric
   *   fruit is well established across UMD Extension, UC Davis, and Royal
   *   Society Biology Letters (Fenn & Giovannoni 2021) as continuing to
   *   ripen and generate an autocatalytic ethylene surge post-harvest.
   * - 'producer-low': non-climacteric — minimal ethylene production (pepper,
   *   orange, pineapple, watermelon). Confirmed non-climacteric across the
   *   same climacteric/non-climacteric literature.
   * - 'sensitive': damaged by ambient ethylene from nearby producers — this
   *   is UC Davis Postharvest Technology Center's Group 1 designation
   *   ("most sensitive green vegetables", cole crops) for leafy vegetables.
   * - 'neutral': not meaningfully in play — dried legumes/grains and animal
   *   products aren't part of ethylene postharvest physiology the way fresh
   *   produce is, and most tubers aren't flagged as ethylene-sensitive in
   *   the compatibility literature.
   */
  ethyleneRole: 'producer-high' | 'producer-low' | 'sensitive' | 'neutral';
  /**
   * Odor transfer risk in shared storage. Only 'emits' is asserted from a
   * specific source here (spring onion/allium odor transfer is standard
   * produce-storage guidance); everything else is 'neutral' rather than
   * guessed at, since no credible source was found classifying the other
   * crops in this list as odor absorbers.
   */
  odorRisk: 'emits' | 'absorbs' | 'neutral';
  storageNote: string;
  tips: { icon: string; text: string; severity: 'warn' | 'info' }[];
}

export const CROPS: Record<CropId, CropProfile> = {
  // ── Tubers ──────────────────────────────────────────────────────────────────
  cassava: {
    id: 'cassava', category: 'tubers', label: 'Cassava', imageId: 'cassava',
    targetTemperature: 12, tempRange: [10, 15], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 15, criticalTemperature: 18, warningHumidity: 82, criticalHumidity: 92,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cassava deteriorates fast once harvested regardless of temperature — high humidity slows moisture loss, which matters more than extreme cold here.',
    tips: [
      { icon: '💧', text: 'Keep humidity high (85–90%) to stop roots from drying out and cracking.', severity: 'warn' },
      { icon: '⚠️', text: "Don't go below 10°C — vascular streaking (internal browning) sets in quickly.", severity: 'warn' },
    ],
  },
  yam: {
    id: 'yam', category: 'tubers', label: 'Yam', imageId: 'yam',
    targetTemperature: 14, tempRange: [13, 17], targetHumidity: 75, humidityRange: [70, 80],
    warningTemperature: 17, criticalTemperature: 20, warningHumidity: 82, criticalHumidity: 88,
    chillingFloor: 13, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'One of the most chilling-sensitive tubers — treat the 13°C floor as a hard limit, not a guideline.',
    tips: [
      { icon: '⚠️', text: 'Critical: never below 13°C. Chilling injury causes rot and discolouration within 24 hours.', severity: 'warn' },
      { icon: '💧', text: 'Moderate humidity (70–80%) prevents fungal growth on the skin without encouraging sprouting.', severity: 'info' },
    ],
  },
  cocoyam: {
    id: 'cocoyam', category: 'tubers', label: 'Cocoyam', imageId: 'cocoyam',
    targetTemperature: 13, tempRange: [12, 16], targetHumidity: 82, humidityRange: [80, 85],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 88, criticalHumidity: 92,
    chillingFloor: 12, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Similar chilling sensitivity to yam, but prefers slightly higher humidity to protect its thinner skin.',
    tips: [
      { icon: '⚠️', text: 'Keep above 12°C to avoid chilling injury.', severity: 'warn' },
      { icon: '💧', text: 'Skin is thinner than yam — a touch more humidity (80–85%) helps prevent shrivelling.', severity: 'info' },
    ],
  },
  'sweet-potato': {
    id: 'sweet-potato', category: 'tubers', label: 'Sweet Potato', imageId: 'sweet-potato',
    targetTemperature: 14, tempRange: [13, 16], targetHumidity: 85, humidityRange: [80, 85],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 88, criticalHumidity: 92,
    chillingFloor: 13, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Extremely chilling-sensitive — even brief exposure below 13°C causes internal decay that only shows up after cutting.',
    tips: [
      { icon: '⚠️', text: 'Critical: never below 13°C, even briefly. Damage is often invisible until the root is cut open.', severity: 'warn' },
      { icon: '💧', text: 'High humidity (80–85%) prevents weight loss and skin pitting.', severity: 'info' },
    ],
  },

  // ── Fruits & vegetables ───────────────────────────────────────────────────────
  tomato: {
    id: 'tomato', category: 'fruits', label: 'Tomato', imageId: 'tomato',
    targetTemperature: 13, tempRange: [12, 15], targetHumidity: 90, humidityRange: [85, 90],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 12, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Below 12°C, tomatoes lose flavour and develop pitting even if they look fine on the outside.',
    tips: [
      { icon: '🍅', text: "Don't go below 12°C — chilling injury shows up as pitting and poor ripening, not visible rot.", severity: 'warn' },
      { icon: '💧', text: 'High humidity (85–90%) slows shrivelling; watch for condensation build-up.', severity: 'info' },
    ],
  },
  pepper: {
    id: 'pepper', category: 'fruits', label: 'Pepper', imageId: 'pepper',
    targetTemperature: 10, tempRange: [8, 12], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 13, criticalTemperature: 16, warningHumidity: 86, criticalHumidity: 97,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Needs very high humidity — peppers lose crispness fast in dry air, well before temperature becomes the issue.',
    tips: [
      { icon: '💧', text: 'Very high humidity (90–95%) needed — peppers wilt within hours in dry air.', severity: 'warn' },
      { icon: 'ℹ️', text: 'More cold-tolerant than most fruit — chilling floor is 7°C, lower than tomato or plantain.', severity: 'info' },
    ],
  },
  plantain: {
    id: 'plantain', category: 'fruits', label: 'Plantain', imageId: 'plantain',
    targetTemperature: 13, tempRange: [12, 14], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 15, criticalTemperature: 18, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 12, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Skin blackens fast below 12°C — this is the classic banana-family chilling injury.',
    tips: [
      { icon: '🍌', text: "Don't store below 12°C — skin blackens and ripening turns uneven.", severity: 'warn' },
      { icon: 'ℹ️', text: 'Ripens quickly above 14°C — monitor closely if you need a longer storage window.', severity: 'info' },
    ],
  },
  orange: {
    id: 'orange', category: 'fruits', label: 'Orange', imageId: 'orange',
    targetTemperature: 8, tempRange: [5, 10], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 11, criticalTemperature: 14, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 3, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Citrus tolerates cold much better than tropical fruit — this is the least chilling-sensitive fruit in the list.',
    tips: [
      { icon: 'ℹ️', text: 'Handles cold well — chilling floor is only 3°C, far lower than banana or mango.', severity: 'info' },
      { icon: '💧', text: 'Keep humid (85–90%) to prevent the peel from drying and hardening.', severity: 'info' },
    ],
  },
  mango: {
    id: 'mango', category: 'fruits', label: 'Mango', imageId: 'mango',
    targetTemperature: 12, tempRange: [10, 13], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 14, criticalTemperature: 17, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Ripens fast once above target — the storage window is short compared to citrus.',
    tips: [
      { icon: '🥭', text: 'Ripens rapidly above 13°C. Monitor closely and sell within the storage window.', severity: 'info' },
      { icon: '⚠️', text: "Don't go below 10°C — causes uneven ripening and grey pulp discolouration.", severity: 'warn' },
    ],
  },
  pineapple: {
    id: 'pineapple', category: 'fruits', label: 'Pineapple', imageId: 'pineapple',
    targetTemperature: 10, tempRange: [7, 13], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 14, criticalTemperature: 17, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Chilling injury shows up as a dull, water-soaked look at the base — check that spot first if something seems off.',
    tips: [
      { icon: '⚠️', text: "Don't go below 7°C — chilling injury shows as dull, water-soaked patches near the base.", severity: 'warn' },
    ],
  },
  watermelon: {
    id: 'watermelon', category: 'fruits', label: 'Watermelon', imageId: 'watermelon',
    targetTemperature: 10, tempRange: [7, 15], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 82, criticalHumidity: 93,
    chillingFloor: 5, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'The most cold-tolerant fruit here — widest safe range of any crop in the fruits category.',
    tips: [
      { icon: 'ℹ️', text: 'Widest safe range of any fruit here (7–15°C) — flexible if sharing space with other produce.', severity: 'info' },
    ],
  },

  // ── Leafy vegetables ──────────────────────────────────────────────────────────
  cabbage: {
    id: 'cabbage', category: 'leafy', label: 'Cabbage', imageId: 'cabbage',
    targetTemperature: 3, tempRange: [0, 5], targetHumidity: 97, humidityRange: [95, 98],
    warningTemperature: 6, criticalTemperature: 9, warningHumidity: 90, criticalHumidity: 100,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Tolerates near-freezing well — the real risk here is humidity dropping, not temperature.',
    tips: [
      { icon: '💧', text: 'Needs 95–98% humidity — loses marketability within hours if it drops.', severity: 'warn' },
    ],
  },
  lettuce: {
    id: 'lettuce', category: 'leafy', label: 'Lettuce', imageId: 'lettuce',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 98, humidityRange: [95, 100],
    warningTemperature: 5, criticalTemperature: 8, warningHumidity: 90, criticalHumidity: 100,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'The most humidity-demanding crop in the whole dataset — wilts within hours below 90%.',
    tips: [
      { icon: '💧', text: 'Needs near-saturation humidity (95–100%) — wilts within hours below 90%.', severity: 'warn' },
      { icon: '❄️', text: 'Benefits from cold more than any other crop — do not compromise by storing with tubers or fruit.', severity: 'info' },
    ],
  },
  kontomire: {
    id: 'kontomire', category: 'leafy', label: 'Kontomire (Cocoyam Leaves)', imageId: 'kontomire',
    targetTemperature: 5, tempRange: [2, 7], targetHumidity: 93, humidityRange: [90, 95],
    warningTemperature: 8, criticalTemperature: 11, warningHumidity: 86, criticalHumidity: 98,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Wilts fast — this is a short-hold crop even under ideal conditions.',
    tips: [
      { icon: '💧', text: 'High humidity (90–95%) is essential to stop wilting.', severity: 'warn' },
    ],
  },
  'spring-onion': {
    id: 'spring-onion', category: 'leafy', label: 'Spring Onion', imageId: 'spring-onion',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 95, humidityRange: [90, 95],
    warningTemperature: 5, criticalTemperature: 8, warningHumidity: 86, criticalHumidity: 98,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'neutral', odorRisk: 'emits',
    storageNote: 'Thin stalks dry out quickly — treat humidity as seriously as you would for lettuce.',
    tips: [
      { icon: '💧', text: 'Thin stalks lose moisture fast — keep humidity at 90–95%.', severity: 'warn' },
    ],
  },

  // ── Legumes ───────────────────────────────────────────────────────────────────
  cowpea: {
    id: 'cowpea', category: 'legumes', label: 'Cowpea', imageId: 'cowpea',
    targetTemperature: 15, tempRange: [12, 20], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 74, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cold storage is optional for cowpea — the real risk is humidity encouraging mould, not temperature.',
    tips: [
      { icon: '🌾', text: 'Keep humidity below 70% at all times to prevent mould growth on dried beans.', severity: 'warn' },
    ],
  },
  groundnut: {
    id: 'groundnut', category: 'legumes', label: 'Groundnut', imageId: 'groundnut',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'The most aflatoxin-prone crop in the dataset — humidity control matters more here than for any other legume.',
    tips: [
      { icon: '⚠️', text: 'Aflatoxin risk is high — keep humidity below 65% at all times, stricter than other legumes.', severity: 'warn' },
    ],
  },
  soybean: {
    id: 'soybean', category: 'legumes', label: 'Soybean', imageId: 'soybean',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 74, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cold storage is optional — humidity control is what actually protects shelf life.',
    tips: [
      { icon: '🌾', text: 'Keep below 70% humidity to prevent mould.', severity: 'warn' },
    ],
  },

  // ── Meat & fish ───────────────────────────────────────────────────────────────
  chicken: {
    id: 'chicken', category: 'meat', label: 'Chicken', imageId: 'chicken',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 5, criticalTemperature: 7, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: 0, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Must never exceed 7°C — bacterial growth above this threshold renders it unsafe within hours.',
    tips: [
      { icon: '⚠️', text: 'Must never exceed 7°C — bacterial growth above this threshold makes it unsafe within hours.', severity: 'warn' },
      { icon: '💧', text: 'Keep humidity at 55–65%. Too high causes surface slime; too low dries the skin.', severity: 'warn' },
    ],
  },
  beef: {
    id: 'beef', category: 'meat', label: 'Beef', imageId: 'beef',
    targetTemperature: 1, tempRange: [-1, 4], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 5, criticalTemperature: 7, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: -1, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Tolerates the coldest range of the meat crops — slightly below freezing is fine for fresh beef.',
    tips: [
      { icon: '⚠️', text: 'Must stay below 7°C at all times — a single excursion above this is a food-safety event, not just quality loss.', severity: 'warn' },
    ],
  },
  tilapia: {
    id: 'tilapia', category: 'meat', label: 'Tilapia', imageId: 'tilapia',
    targetTemperature: 1, tempRange: [0, 2], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 3, criticalTemperature: 4, warningHumidity: 72, criticalHumidity: 78,
    chillingFloor: 0, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Spoils faster than any other crop in the dataset — the critical threshold is intentionally tighter than chicken or beef.',
    tips: [
      { icon: '⚠️', text: 'Spoils faster than meat — keep at 0–2°C, right at ice temperature, and treat 4°C as a hard critical limit.', severity: 'warn' },
    ],
  },
};

export const CROP_LIST: CropId[] = Object.keys(CROPS) as CropId[];

// ── Pure helper functions ──────────────────────────────────────────────────────

export function getCrop(id: CropId): CropProfile {
  return CROPS[id];
}

export function getCategoryOfCrop(id: CropId): CategoryId {
  return CROPS[id].category;
}

export function getCropsByCategory(category: CategoryId): CropProfile[] {
  return CROP_LIST.filter(id => CROPS[id].category === category).map(id => CROPS[id]);
}

// ── Compatibility (Chunk 2) ──────────────────────────────────────────────────
//
// Single source of truth for "can these crops share one device?" — both the
// selector (live feedback while picking crops) and the wizard (suggesting a
// second device) call this instead of duplicating rules.

export type CompatibilityTier = 'compatible' | 'caution' | 'incompatible';

export interface CompatibilityReason {
  tier: 'caution' | 'incompatible';
  message: string;
}

export interface CompatibilityResult {
  tier: CompatibilityTier;
  reasons: CompatibilityReason[];
  /** Present only when tier === 'incompatible' — what to do about it. */
  suggestion: string | null;
}

export function getCompatibility(cropIds: CropId[]): CompatibilityResult {
  const profiles = cropIds.map(getCrop);
  if (profiles.length <= 1) return { tier: 'compatible', reasons: [], suggestion: null };

  const reasons: CompatibilityReason[] = [];

  // Hard rule — meat/fish never shares storage with anything else. This is a
  // food-safety cross-contamination concern, not a quality/shelf-life one, so
  // there's no "caution" tier for it — it's always a hard block.
  const hasMeat    = profiles.some(p => p.category === 'meat');
  const hasNonMeat = profiles.some(p => p.category !== 'meat');
  if (hasMeat && hasNonMeat) {
    reasons.push({
      tier: 'incompatible',
      message: 'Meat/fish must never share cold storage with produce — this is a cross-contamination risk, not a quality issue.',
    });
  }

  // Hard rule — the crops' temperature ranges don't overlap at all, so no
  // single setpoint can satisfy every crop in the set simultaneously.
  const rangeLow  = Math.max(...profiles.map(p => p.tempRange[0]));
  const rangeHigh = Math.min(...profiles.map(p => p.tempRange[1]));
  if (rangeLow > rangeHigh) {
    reasons.push({
      tier: 'incompatible',
      message: `These crops need incompatible temperatures at the same time (one needs ${rangeLow}°C or higher, another needs ${rangeHigh}°C or lower) — no single setpoint works for both.`,
    });
  }

  // Caution — an ethylene producer alongside an ethylene-sensitive crop
  // speeds up spoilage/wilting in the sensitive one, but doesn't make shared
  // storage impossible (separate crates within the same device helps).
  const hasProducer  = profiles.some(p => p.ethyleneRole === 'producer-high');
  const hasSensitive = profiles.some(p => p.ethyleneRole === 'sensitive');
  if (hasProducer && hasSensitive) {
    reasons.push({
      tier: 'caution',
      message: 'One crop releases ethylene as it ripens, which speeds up spoilage and wilting in the ethylene-sensitive leafy vegetables stored nearby. Keep them in separate crates if possible.',
    });
  }

  // Caution — humidity ranges don't overlap, even though temperature does.
  // More forgiving than a temperature clash since humidity varies more by
  // shelf position within a device, so this stays a warning, not a block.
  const humidLow  = Math.max(...profiles.map(p => p.humidityRange[0]));
  const humidHigh = Math.min(...profiles.map(p => p.humidityRange[1]));
  if (rangeLow <= rangeHigh && humidLow > humidHigh) {
    reasons.push({
      tier: 'caution',
      message: `Humidity needs don't overlap (one needs ${humidLow}% or higher, another needs ${humidHigh}% or lower) — workable if positioned in different zones of the same unit, but not ideal.`,
    });
  }

  // Caution — an odor emitter (currently just spring onion) can transfer
  // flavor/smell to other produce in an enclosed space.
  if (profiles.some(p => p.odorRisk === 'emits')) {
    reasons.push({
      tier: 'caution',
      message: 'One crop has a strong odor that can transfer to other produce in the same enclosed space — keep it bagged or wrapped if possible.',
    });
  }

  const tier: CompatibilityTier = reasons.some(r => r.tier === 'incompatible')
    ? 'incompatible'
    : reasons.length > 0 ? 'caution' : 'compatible';

  const suggestion = tier === 'incompatible'
    ? 'Add a second device (or a separate compartment) for these crops instead of storing them together.'
    : null;

  return { tier, reasons, suggestion };
}

export interface CombinedTargets {
  targetTemperature: number;
  targetHumidity: number;
  warningTemperature: number;
  criticalTemperature: number;
  warningHumidity: number;
  criticalHumidity: number;
  chillingFloor: number | null;
  humidAlertHigh: boolean;
  /**
   * true when getCompatibility() returned 'incompatible' for this crop set —
   * i.e. there is no temperature that satisfies every crop, or the set mixes
   * meat/fish with produce. When this is true, targetTemperature below is a
   * best-effort fallback (protects the most chilling-sensitive crop), not a
   * genuinely safe setpoint — the UI must surface the incompatibility itself
   * via getCompatibility() rather than relying on this number looking fine.
   */
  hasConflict: boolean;
}

/**
 * Derive the actual applied thresholds for a device from its selected
 * crop(s). Single crop → that crop's own numbers, unchanged. Multiple crops
 * ("mixed" storage) → picks a setpoint from the real overlap of every crop's
 * tempRange when one exists, rather than a formula that could land outside
 * a crop's own chilling floor while simultaneously flagging that floor as
 * violated (the previous version of this function had exactly that bug).
 */
export function deriveTargetsForCrops(cropIds: CropId[]): CombinedTargets {
  const profiles = cropIds.map(getCrop);

  if (profiles.length === 0) {
    // No crop configured — safe neutral default, no chilling-injury framing.
    return {
      targetTemperature: 8, targetHumidity: 85,
      warningTemperature: 10, criticalTemperature: 13,
      warningHumidity: 90, criticalHumidity: 95,
      chillingFloor: null, humidAlertHigh: false, hasConflict: false,
    };
  }

  if (profiles.length === 1) {
    const p = profiles[0];
    return {
      targetTemperature: p.targetTemperature, targetHumidity: p.targetHumidity,
      warningTemperature: p.warningTemperature, criticalTemperature: p.criticalTemperature,
      warningHumidity: p.warningHumidity, criticalHumidity: p.criticalHumidity,
      chillingFloor: p.chillingFloor, humidAlertHigh: p.humidAlertHigh, hasConflict: false,
    };
  }

  const compatibility = getCompatibility(cropIds);

  // Protect the most sensitive crop in the set on every axis.
  const floors = profiles.map(p => p.chillingFloor).filter((f): f is number => f !== null);
  const chillingFloor = floors.length ? Math.max(...floors) : null;
  const criticalTemperature = Math.min(...profiles.map(p => p.criticalTemperature));
  const warningTemperature = Math.min(...profiles.map(p => p.warningTemperature));

  // The real workable band: where every crop's own tempRange overlaps,
  // further capped below the tightest critical ceiling. If this band is
  // empty, getCompatibility() has already flagged 'incompatible' — the
  // target below is a documented best-effort fallback, not a safe number.
  const rangeLow  = Math.max(...profiles.map(p => p.tempRange[0]));
  const rangeHigh = Math.min(Math.min(...profiles.map(p => p.tempRange[1])), criticalTemperature - 1);

  const meanTarget = profiles.reduce((s, p) => s + p.targetTemperature, 0) / profiles.length;
  let targetTemperature: number;
  if (rangeLow <= rangeHigh) {
    // A workable band exists — bias toward the mean, clamped to the band.
    targetTemperature = parseFloat(Math.min(rangeHigh, Math.max(rangeLow, meanTarget)).toFixed(1));
  } else {
    // No workable band (mirrors compatibility.tier === 'incompatible').
    // Best-effort only: protect the most chilling-sensitive crop's floor
    // even though some other crop in the set will sit outside its own
    // comfort range — the UI must surface the incompatibility itself.
    targetTemperature = parseFloat(Math.max(rangeLow, chillingFloor ?? rangeLow).toFixed(1));
  }

  const humidAlertHigh = profiles.some(p => p.humidAlertHigh);
  // If any crop's danger direction is "too humid", the combined ceiling must
  // respect the strictest (lowest) high-humidity warning among those crops.
  const highRiskProfiles = profiles.filter(p => p.humidAlertHigh);
  const lowRiskProfiles = profiles.filter(p => !p.humidAlertHigh);
  const warningHumidity = highRiskProfiles.length
    ? Math.min(...highRiskProfiles.map(p => p.warningHumidity))
    : Math.max(...lowRiskProfiles.map(p => p.warningHumidity));
  const criticalHumidity = highRiskProfiles.length
    ? Math.min(...highRiskProfiles.map(p => p.criticalHumidity))
    : Math.max(...lowRiskProfiles.map(p => p.criticalHumidity));
  const targetHumidity = parseFloat(
    (profiles.reduce((s, p) => s + p.targetHumidity, 0) / profiles.length).toFixed(0)
  );

  return {
    targetTemperature, targetHumidity,
    warningTemperature, criticalTemperature,
    warningHumidity, criticalHumidity,
    chillingFloor, humidAlertHigh,
    hasConflict: compatibility.tier === 'incompatible',
  };
}
