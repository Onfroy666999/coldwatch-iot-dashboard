// ── produce.ts ─────────────────────────────────────────────────────────────
//
// Chunk 1 :  Crop data model.
//
// GOLDEN RULE (same as types.ts): zero imports from React/hooks/context.
// Plain types, data, and pure functions only, so anything can import this
// without circular-dependency risk.
//
// A device's produce is now stored as one or more specific crops
// (`CropId[]`), never as a broad category. Category is a *derived* label : 
// used for grouping in the selector UI and for the "assorted crates" mixed
// tile :  not something we persist. Every crop below carries its own
// thresholds; there is no shared "tubers" target anymore.
//
// This file does not yet replace `PRODUCE_THRESHOLDS` / `ProduceMode` in
// types.ts :  those stay in place, still driving the existing selector,
// dashboard badges, etc., until Chunk 3 (new visual selector) and Chunk 6
// (wizard integration) migrate those components over one at a time.

// ── Category (derived, not stored) ───────────────────────────────────────────

export type CategoryId = 'tubers' | 'fruits' | 'vegetables' | 'leafy' | 'legumes' | 'meat';

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
    id: 'fruits', label: 'Fruits', tagline: 'Plantain, banana, citrus, mango, and more',
    accentColor: '#27AE60', iconBg: 'rgba(39,174,96,0.12)', iconColor: '#27AE60',
    imageId: 'fruits',
  },
  vegetables: {
    id: 'vegetables', label: 'Vegetables', tagline: 'Tomato, pepper, bell pepper, onion',
    accentColor: '#E63946', iconBg: 'rgba(230,57,70,0.12)', iconColor: '#E63946',
    imageId: 'vegetables',
  },
  leafy: {
    id: 'leafy', label: 'Leafy Vegetables', tagline: 'Cabbage, lettuce, kontomire, spring onion',
    accentColor: '#16A085', iconBg: 'rgba(22,160,133,0.12)', iconColor: '#16A085',
    imageId: 'leafy',
  },
  legumes: {
    // Internal id kept as 'legumes' (stable ids per the migration guide) : 
    // only the display label changes to reflect maize/rice joining the group.
    id: 'legumes', label: 'Grains & Legumes', tagline: 'Cowpea, groundnut, soybean, beans, maize, rice',
    accentColor: '#717182', iconBg: 'rgba(113,113,130,0.12)', iconColor: '#717182',
    imageId: 'legumes',
  },
  meat: {
    id: 'meat', label: 'Meat & Fish', tagline: 'Chicken, beef, tilapia',
    accentColor: '#B91C1C', iconBg: 'rgba(185,28,28,0.10)', iconColor: '#B91C1C',
    imageId: 'meat',
  },
};

// Fallback glyph shown until a real photo exists at /produce-images/{imageId}.jpg.
// Single source of truth :  both AddDeviceFlow.tsx and ProduceGuide.tsx import
// this rather than each keeping their own copy, so a future category change
// can't update one and silently miss the other.
export const CATEGORY_EMOJI: Record<CategoryId, string> = {
  tubers: '🥔', fruits: '🥭', vegetables: '🍅', leafy: '🥬', legumes: '🌿', meat: '🍗',
};

// ── Crop ──────────────────────────────────────────────────────────────────────

export type CropId =
  | 'cassava' | 'yam' | 'cocoyam' | 'sweet-potato'
  | 'tomato' | 'pepper' | 'chili-pepper' | 'bell-pepper' | 'garden-egg' | 'okra' | 'cucumber' | 'carrot'
  | 'plantain' | 'banana' | 'orange' | 'mango' | 'pineapple' | 'watermelon'
  | 'cabbage' | 'lettuce' | 'kontomire' | 'spring-onion' | 'onion'
  | 'cowpea' | 'groundnut' | 'soybean' | 'beans' | 'maize' | 'rice'
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
   * - 'producer-high': climacteric :  ripens/produces a strong ethylene burst
   *   after harvest (banana/plantain, mango, tomato). Source: climacteric
   *   fruit is well established across UMD Extension, UC Davis, and Royal
   *   Society Biology Letters (Fenn & Giovannoni 2021) as continuing to
   *   ripen and generate an autocatalytic ethylene surge post-harvest.
   * - 'producer-low': non-climacteric :  minimal ethylene production (pepper,
   *   orange, pineapple, watermelon). Confirmed non-climacteric across the
   *   same climacteric/non-climacteric literature.
   * - 'sensitive': damaged by ambient ethylene from nearby producers :  this
   *   is UC Davis Postharvest Technology Center's Group 1 designation
   *   ("most sensitive green vegetables", cole crops) for leafy vegetables.
   * - 'neutral': not meaningfully in play :  dried legumes/grains and animal
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
  /**
   * Human-readable approximate storage duration under the conditions this
   * profile targets. Deliberately a range, not a single number :  postharvest
   * life varies with maturity at harvest, handling, and variety, and stating
   * false precision here would be worse than a documented range.
   */
  shelfLife: string;
  /**
   * The 2-4 most consequential real mistakes people actually make with this
   * crop :  not a rephrasing of every tip above, just the ones that most
   * directly shorten shelf life or create a food-safety risk.
   */
  commonMistakes: string[];
  /** Short citation strings :  same sources already used in this file's tips/storageNote, not new claims. */
  references: string[];
  tips: { icon: string; text: string; severity: 'warn' | 'info' }[];
}

export const CROPS: Record<CropId, CropProfile> = {
  // ── Tubers ──────────────────────────────────────────────────────────────────
  cassava: {
    id: 'cassava', category: 'tubers', label: 'Cassava', imageId: 'cassava',
    targetTemperature: 12, tempRange: [10, 15], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 15, criticalTemperature: 18, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cassava deteriorates fast once harvested regardless of temperature :  high humidity slows moisture loss, which matters more than extreme cold here.',
    shelfLife: '1–2 months at 10–15°C, 85–90% humidity',
    commonMistakes: [
      'Leaving roots at room temperature after harvest :  cassava deteriorates within days regardless of how fresh it looked when picked.',
      'Letting humidity drop below 85% :  the roots dry out and crack well before 1–2 months is up.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Keep humidity high (85–90%) to stop roots from drying out and cracking.', severity: 'warn' },
      { icon: '⚠️', text: "Don't go below 10°C :  vascular streaking (internal browning) sets in quickly.", severity: 'warn' },
    ],
  },
  yam: {
    id: 'yam', category: 'tubers', label: 'Yam', imageId: 'yam',
    targetTemperature: 14, tempRange: [13, 17], targetHumidity: 75, humidityRange: [70, 80],
    warningTemperature: 17, criticalTemperature: 20, warningHumidity: 82, criticalHumidity: 88,
    chillingFloor: 13, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'One of the most chilling-sensitive tubers :  treat the 13°C floor as a hard limit, not a guideline.',
    shelfLife: '2–7 months at 15°C, 70–80% humidity',
    commonMistakes: [
      "Storing colder than 13°C 'to be extra safe' :  this triggers chilling injury (rot, discoloration) rather than preventing it.",
      'Using the same high humidity as cassava or cocoyam :  yam actually wants comparatively drier air (70–80%), not 85%+.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
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
    shelfLife: 'roughly 4 months under good conditions',
    commonMistakes: [
      "Letting humidity fall below 80% :  cocoyam's thin skin shrivels faster than yam's under the same dry air.",
      'Storing below the 12°C floor :  chilling injury sets in quickly and is often invisible until the corm is cut.',
    ],
    references: [
      "UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table (listed under Taro/Cocoyam/Eddoe/Dasheen :  note this source's own temperature figure is broader than the tropical-cocoyam-specific 12°C floor used in this profile; the floor itself is unchanged)",
    ],
    tips: [
      { icon: '⚠️', text: 'Keep above 12°C to avoid chilling injury.', severity: 'warn' },
      { icon: '💧', text: 'Skin is thinner than yam :  a touch more humidity (80–85%) helps prevent shrivelling.', severity: 'info' },
    ],
  },
  'sweet-potato': {
    id: 'sweet-potato', category: 'tubers', label: 'Sweet Potato', imageId: 'sweet-potato',
    targetTemperature: 14, tempRange: [13, 16], targetHumidity: 85, humidityRange: [80, 85],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 88, criticalHumidity: 92,
    chillingFloor: 13, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Extremely chilling-sensitive :  even brief exposure below 13°C causes internal decay that only shows up after cutting.',
    shelfLife: '4–7 months at 13–15°C, 85–95% humidity',
    commonMistakes: [
      'Cutting into a root to check quality :  chilling damage is often invisible from outside and only shows once cut open.',
      'Storing below 13°C, even briefly :  damage can set in faster here than in any other tuber in this list.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '⚠️', text: 'Critical: never below 13°C, even briefly. Damage is often invisible until the root is cut open.', severity: 'warn' },
      { icon: '💧', text: 'High humidity (80–85%) prevents weight loss and skin pitting.', severity: 'info' },
    ],
  },

  // ── Vegetables ─────────────────────────────────────────────────────────────────
  tomato: {
    id: 'tomato', category: 'vegetables', label: 'Tomato', imageId: 'tomato',
    targetTemperature: 13, tempRange: [12, 15], targetHumidity: 90, humidityRange: [85, 90],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 12, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Below 12°C, tomatoes lose flavour and develop pitting even if they look fine on the outside.',
    shelfLife: '1–5 weeks depending on ripeness at harvest :  mature-green fruit can hold 2–5 weeks at 12–13°C, firm-ripe fruit only 1–3 weeks at 12–13°C',
    commonMistakes: [
      "Storing below 12°C :  causes pitting and poor ripening that isn't visible until later, not obvious rot.",
      'Storing next to ethylene-sensitive leafy vegetables :  tomato is a strong ethylene producer and speeds up their wilting.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '🍅', text: "Don't go below 12°C :  chilling injury shows up as pitting and poor ripening, not visible rot.", severity: 'warn' },
      { icon: '💧', text: 'High humidity (85–90%) slows shrivelling; watch for condensation build-up.', severity: 'info' },
    ],
  },
  pepper: {
    id: 'pepper', category: 'vegetables', label: 'Pepper', imageId: 'pepper',
    targetTemperature: 10, tempRange: [8, 12], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 13, criticalTemperature: 16, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Needs very high humidity :  peppers lose crispness fast in dry air, well before temperature becomes the issue.',
    shelfLife: '2–3 weeks at 7–10°C',
    commonMistakes: [
      'Storing in dry air :  peppers wilt within hours below 90% humidity, faster than almost anything else in this list.',
      'Assuming the same chilling floor as tomato or plantain :  pepper actually tolerates cold better (7°C floor).',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Very high humidity (90–95%) needed :  peppers wilt within hours in dry air.', severity: 'warn' },
      { icon: 'ℹ️', text: 'More cold-tolerant than most fruit :  chilling floor is 7°C, lower than tomato or plantain.', severity: 'info' },
    ],
  },
  'bell-pepper': {
    // Sourced from UC Davis Postharvest Research and Extension Center's
    // bell pepper fact sheet: non-climacteric, very low ethylene production
    // (0.1-0.2 µl/kg·hr), optimal storage ~7.5°C with chilling injury
    // developing below ~5°C after extended storage, very high humidity
    // needs. Near-identical Capsicum physiology to the existing 'pepper'
    // (chili) entry :  same genus, same postharvest profile :  kept as a
    // separate crop since bell pepper is the distinct sweet variety
    // commonly grown here, not a duplicate of chili/scotch bonnet.
    id: 'bell-pepper', category: 'vegetables', label: 'Bell Pepper', imageId: 'bell-pepper',
    targetTemperature: 8, tempRange: [7, 10], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 11, criticalTemperature: 14, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Same family as chili pepper :  very low ethylene, needs very high humidity, and water loss (not cold) is the main quality risk.',
    shelfLife: '2–3 weeks at 7–10°C',
    commonMistakes: [
      'Storing in dry air :  like chili pepper, bell pepper shrivels fast below 90% humidity.',
      'Holding below 7°C for more than about two weeks :  pitting and decay follow even though the fruit looks fine at first.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Very high humidity (90–95%) needed :  bell peppers shrivel fast in dry air.', severity: 'warn' },
      { icon: 'ℹ️', text: "Don't store below 7°C for long :  pitting and decay develop after about two weeks at that temperature.", severity: 'info' },
    ],
  },
  'chili-pepper': {
    // Distinct market item from the existing 'pepper' entry (which this
    // dataset already models as hot chili/scotch bonnet :  see bell-pepper's
    // own storageNote above: "same family as chili pepper"). Kept as its own
    // profile rather than merged, matching this project's existing precedent
    // of treating visually/commercially distinct market items separately
    // even when postharvest physiology nearly overlaps (onion vs
    // spring-onion, beans vs cowpea). Thresholds mirror 'pepper' closely,
    // since true chilis share near-identical postharvest physiology per UC
    // Davis PREC :  this is a judgment call, flagged for confirmation.
    id: 'chili-pepper', category: 'vegetables', label: 'Chili Pepper', imageId: 'chili-pepper',
    targetTemperature: 10, tempRange: [8, 12], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 13, criticalTemperature: 16, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Same postharvest physiology as the other chilis in this list :  needs very high humidity, and water loss (not cold) is the main quality risk.',
    shelfLife: '2–3 weeks at 7–10°C',
    commonMistakes: [
      'Storing in dry air :  chilis wilt within hours below 90% humidity.',
      'Assuming it needs the same chilling floor as tomato or plantain :  chili tolerates cold better (7°C floor).',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Very high humidity (90–95%) needed :  chilis wilt within hours in dry air.', severity: 'warn' },
      { icon: 'ℹ️', text: 'More cold-tolerant than most fruit :  chilling floor is 7°C, lower than tomato or plantain.', severity: 'info' },
    ],
  },
  'garden-egg': {
    // Sourced from UC Davis PREC's Eggplant Produce Fact Sheet: 10-12°C,
    // 90-95% RH, moderate-to-high ethylene sensitivity, ~14-day max storage
    // life even under ideal conditions. Ghanaian garden egg (Solanum
    // aethiopicum/S. macrocarpon) shares the same Solanaceae postharvest
    // physiology as the eggplant this fact sheet covers.
    id: 'garden-egg', category: 'vegetables', label: 'Garden Egg', imageId: 'gardeneggs',
    targetTemperature: 11, tempRange: [10, 12], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 14, criticalTemperature: 18, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Chilling-sensitive earlier than most :  injury sets in below 10°C, and even under ideal conditions it only keeps about two weeks.',
    shelfLife: '10–14 days at 10–12°C',
    commonMistakes: [
      'Refrigerating below 10°C :  garden egg is one of the more chilling-sensitive crops in this list, injured well before typical fridge temperatures.',
      'Storing near ripening fruit like banana or tomato :  garden egg is ethylene-sensitive and softens/discolors faster nearby.',
      'Expecting long storage life :  even at ideal conditions, quality drops sharply after about two weeks.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Eggplant Produce Fact Sheet',
    ],
    tips: [
      { icon: '🌡️', text: "Don't go below 10°C :  one of the more chilling-sensitive crops in this dataset.", severity: 'warn' },
      { icon: 'ℹ️', text: 'Keep away from ripening fruit :  it\'s ethylene-sensitive and spoils faster nearby.', severity: 'info' },
    ],
  },
  okra: {
    // Sourced from UC Davis PREC's Okra Produce Fact Sheet (very high
    // humidity 95-100% needed, chilling injury below recommended range, low
    // ethylene production) and Oklahoma State Extension's concrete numbers
    // (45-50°F / 7-10°C, 90% RH, chilling injury below 45°F/7°C).
    id: 'okra', category: 'vegetables', label: 'Okra', imageId: 'okra',
    targetTemperature: 8, tempRange: [7, 10], targetHumidity: 93, humidityRange: [90, 96],
    warningTemperature: 13, criticalTemperature: 16, warningHumidity: 87, criticalHumidity: 78,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Needs some of the highest humidity in this dataset (90–96%) :  pods toughen and lose their fresh appearance fast in dry air.',
    shelfLife: '7–10 days at 7–10°C',
    commonMistakes: [
      'Storing in anything less than very high humidity :  okra pods dehydrate and toughen faster than most produce here.',
      'Refrigerating below 7°C :  chilling injury shows as surface discoloration and pitting.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Okra Produce Fact Sheet',
      'Oklahoma State University Extension :  Okra Production',
    ],
    tips: [
      { icon: '💧', text: 'Needs 90–96% humidity :  among the highest in this dataset. Pods toughen fast in dry air.', severity: 'warn' },
      { icon: 'ℹ️', text: "Don't go below 7°C :  chilling injury shows as surface discoloration and pitting.", severity: 'info' },
    ],
  },
  cucumber: {
    // Sourced from UC Davis PREC's Cucumber Produce Fact Sheet: chilling
    // sensitive below 10°C (injury within 2-3 days), freezing injury at
    // -0.5°C, and clearly ethylene-sensitive (causes yellowing on exposure).
    id: 'cucumber', category: 'vegetables', label: 'Cucumber', imageId: 'cucumber',
    targetTemperature: 11, tempRange: [10, 13], targetHumidity: 92, humidityRange: [90, 95],
    warningTemperature: 15, criticalTemperature: 18, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Chilling injury sets in fast below 10°C :  within 2–3 days, not gradually :  and exposure to ethylene causes yellowing.',
    shelfLife: '10–14 days at 10–13°C',
    commonMistakes: [
      'Refrigerating below 10°C :  unlike most produce, cucumber shows chilling injury (water-soaked pitting) within just 2–3 days, not weeks.',
      'Storing near ripening fruit :  cucumber yellows faster when exposed to ethylene from bananas, tomatoes, or similar.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cucumber Produce Fact Sheet',
    ],
    tips: [
      { icon: '🌡️', text: 'Chilling injury sets in within 2–3 days below 10°C :  faster than most produce in this list.', severity: 'warn' },
      { icon: 'ℹ️', text: 'Ethylene exposure causes yellowing :  keep away from ripening fruit.', severity: 'info' },
    ],
  },
  carrot: {
    // Sourced from UC Davis PREC's Carrot Produce Fact Sheet: carrots are
    // notably more cold-tolerant than the other vegetables in this list
    // (long-term storage near 0°C, not chilling-sensitive), need very high
    // humidity to prevent desiccation, and are clearly ethylene-sensitive : 
    // exposure to as little as 0.5ppm causes perceptible bitterness within
    // two weeks (isocoumarin formation), so PREC explicitly advises against
    // mixing carrots with ethylene producers.
    id: 'carrot', category: 'vegetables', label: 'Carrot', imageId: 'carrot',
    targetTemperature: 1, tempRange: [0, 2], targetHumidity: 96, humidityRange: [95, 98],
    warningTemperature: 4, criticalTemperature: 8, warningHumidity: 90, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Unlike most vegetables here, carrot is not chilling-sensitive :  it keeps best held near freezing. Ethylene exposure turns it bitter, not just soft.',
    shelfLife: '4–6 months at 0–2°C, 95–98% humidity',
    commonMistakes: [
      "Treating it like other vegetables that need warmth :  carrot actually wants to be held near 0°C, colder than tomato, pepper, or okra.",
      'Storing next to ripening fruit or root vegetables :  as little as 0.5ppm ethylene makes carrots taste bitter within two weeks, even though they still look fine.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Carrot Produce Fact Sheet',
    ],
    tips: [
      { icon: '🌡️', text: 'Store near 0°C :  carrot is not chilling-sensitive, unlike most vegetables in this list.', severity: 'info' },
      { icon: '⚠️', text: 'Ethylene exposure causes bitterness (not just softening) :  keep away from ripening fruit.', severity: 'warn' },
    ],
  },
  // ── Fruits ─────────────────────────────────────────────────────────────────────
  plantain: {
    id: 'plantain', category: 'fruits', label: 'Plantain', imageId: 'plantain',
    targetTemperature: 13, tempRange: [12, 14], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 15, criticalTemperature: 18, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 12, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Skin blackens fast below 12°C :  this is the classic banana-family chilling injury.',
    shelfLife: '1–5 weeks at 13–15°C',
    commonMistakes: [
      'Storing below 12°C :  causes the classic banana-family chilling injury: blackened skin and uneven ripening.',
      'Leaving above 14°C for too long :  ripening accelerates quickly and shortens the usable storage window.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '🍌', text: "Don't store below 12°C :  skin blackens and ripening turns uneven.", severity: 'warn' },
      { icon: 'ℹ️', text: 'Ripens quickly above 14°C :  monitor closely if you need a longer storage window.', severity: 'info' },
    ],
  },
  banana: {
    // Sourced from UC Davis PREC's banana fact sheets: climacteric,
    // chilling injury develops below ~13°C (symptoms: peel browning, dull/
    // smokey coloration, failure to ripen), 85-95% humidity. Distinct
    // profile from plantain despite being the same genus (Musa) :  banana
    // is the sweet dessert fruit, plantain the cooking starch, and banana's
    // chilling threshold sits about a degree higher across most sources.
    id: 'banana', category: 'fruits', label: 'Banana', imageId: 'banana',
    targetTemperature: 14, tempRange: [13, 15], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 13, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Chilling injury (peel browning, failure to ripen) develops below 13°C :  slightly more cold-sensitive than plantain.',
    shelfLife: '1–4 weeks at 13–15°C',
    commonMistakes: [
      'Storing below 13°C :  peel browns and the fruit can fail to ripen properly at all.',
      'Storing next to leafy vegetables :  banana is a strong ethylene producer and will speed up their wilting.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '🍌', text: "Don't store below 13°C :  peel browns and ripening can fail entirely.", severity: 'warn' },
      { icon: 'ℹ️', text: 'A strong ethylene producer :  keep away from ethylene-sensitive leafy vegetables if storing together.', severity: 'info' },
    ],
  },
  orange: {
    id: 'orange', category: 'fruits', label: 'Orange', imageId: 'orange',
    targetTemperature: 8, tempRange: [5, 10], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 11, criticalTemperature: 14, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 3, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Citrus tolerates cold much better than tropical fruit :  this is the least chilling-sensitive fruit in the list.',
    shelfLife: '3–8 weeks at 3–9°C in drier climates; up to 8–12 weeks at 0–2°C in humid climates',
    commonMistakes: [
      'Assuming citrus needs the same cold tolerance as tropical fruit :  orange handles cold far better (3°C floor) than banana or mango.',
      'Letting humidity drop :  the peel dries and hardens well before the fruit itself spoils.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: 'ℹ️', text: 'Handles cold well :  chilling floor is only 3°C, far lower than banana or mango.', severity: 'info' },
      { icon: '💧', text: 'Keep humid (85–90%) to prevent the peel from drying and hardening.', severity: 'info' },
    ],
  },
  mango: {
    id: 'mango', category: 'fruits', label: 'Mango', imageId: 'mango',
    targetTemperature: 12, tempRange: [10, 13], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 14, criticalTemperature: 17, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 10, humidAlertHigh: false,
    ethyleneRole: 'producer-high', odorRisk: 'neutral',
    storageNote: 'Ripens fast once above target :  the storage window is short compared to citrus.',
    shelfLife: '2–3 weeks at 13°C',
    commonMistakes: [
      'Storing below 10°C :  causes uneven ripening and grey pulp discoloration.',
      'Not accounting for how fast mango ripens once above target :  the usable window is shorter than most fruit here.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '🥭', text: 'Ripens rapidly above 13°C. Monitor closely and sell within the storage window.', severity: 'info' },
      { icon: '⚠️', text: "Don't go below 10°C :  causes uneven ripening and grey pulp discolouration.", severity: 'warn' },
    ],
  },
  pineapple: {
    id: 'pineapple', category: 'fruits', label: 'Pineapple', imageId: 'pineapple',
    targetTemperature: 10, tempRange: [7, 13], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 14, criticalTemperature: 17, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 7, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'Chilling injury shows up as a dull, water-soaked look at the base :  check that spot first if something seems off.',
    shelfLife: '2–4 weeks at 7–13°C',
    commonMistakes: [
      'Storing below 7°C :  chilling injury shows as a dull, water-soaked patch near the base, easy to miss at a glance.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '⚠️', text: "Don't go below 7°C :  chilling injury shows as dull, water-soaked patches near the base.", severity: 'warn' },
    ],
  },
  watermelon: {
    id: 'watermelon', category: 'fruits', label: 'Watermelon', imageId: 'watermelon',
    targetTemperature: 10, tempRange: [7, 15], targetHumidity: 88, humidityRange: [85, 90],
    warningTemperature: 16, criticalTemperature: 19, warningHumidity: 82, criticalHumidity: 75,
    chillingFloor: 5, humidAlertHigh: false,
    ethyleneRole: 'producer-low', odorRisk: 'neutral',
    storageNote: 'The most cold-tolerant fruit here :  widest safe range of any crop in the fruits category.',
    shelfLife: '2–3 weeks at 10–15°C',
    commonMistakes: [
      "Treating watermelon as equally cold-sensitive as other fruit :  it's actually the most cold-tolerant fruit in this list (5°C floor) and has room to flex if sharing space.",
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: 'ℹ️', text: 'Widest safe range of any fruit here (7–15°C) :  flexible if sharing space with other produce.', severity: 'info' },
    ],
  },

  // ── Leafy vegetables ──────────────────────────────────────────────────────────
  cabbage: {
    id: 'cabbage', category: 'leafy', label: 'Cabbage', imageId: 'cabbage',
    targetTemperature: 3, tempRange: [0, 5], targetHumidity: 97, humidityRange: [95, 98],
    warningTemperature: 6, criticalTemperature: 9, warningHumidity: 90, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Tolerates near-freezing well, the real risk here is humidity dropping, not temperature.',
    shelfLife: '3–6 weeks for early-season heads; late-season heads can hold 5–6 months, both at 0°C',
    commonMistakes: [
      'Letting humidity drop below 90% :  cabbage loses marketability within hours once it does.',
      'Not distinguishing early- vs late-season heads :  early crop spoils many times faster than late crop even at the same temperature.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Needs 95–98% humidity. It  will lose marketability within hours if it drops.', severity: 'warn' },
    ],
  },
  lettuce: {
    id: 'lettuce', category: 'leafy', label: 'Lettuce', imageId: 'lettuce',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 98, humidityRange: [95, 100],
    warningTemperature: 5, criticalTemperature: 8, warningHumidity: 90, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'The most humidity-demanding crop in the whole dataset :  wilts within hours below 90%.',
    shelfLife: '2–3 weeks at 0°C',
    commonMistakes: [
      'Letting humidity fall below 90%. lettuce will wilt within hours, faster than any other crop in this dataset.',
      "Compromising on temperature to share space with tubers or fruit :  lettuce benefits from cold more than anything else here and shouldn't be the one crop that gives ground.",
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Needs near-saturation humidity (95–100%) :  wilts within hours below 90%.', severity: 'warn' },
      { icon: '❄️', text: 'Benefits from cold more than any other crop :  do not compromise by storing with tubers or fruit.', severity: 'info' },
    ],
  },
  kontomire: {
    id: 'kontomire', category: 'leafy', label: 'Kontomire (Cocoyam Leaves)', imageId: 'kontomire',
    targetTemperature: 5, tempRange: [2, 7], targetHumidity: 93, humidityRange: [90, 95],
    warningTemperature: 8, criticalTemperature: 11, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'sensitive', odorRisk: 'neutral',
    storageNote: 'Wilts fast :  this is a short-hold crop even under ideal conditions.',
    shelfLife: 'roughly 5–7 days even under good conditions',
    commonMistakes: [
      'Expecting the same hold time as temperate leafy greens :  kontomire is a warm-climate leaf and has a genuinely short window regardless of care taken.',
      'Letting humidity drop below 90% :  wilting accelerates almost immediately.',
    ],
    references: [
      "UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table (general 'Leafy Greens, warm season' category :  no cocoyam-leaf-specific entry exists in this source)",
    ],
    tips: [
      { icon: '💧', text: 'High humidity (90–95%) is essential to stop wilting.', severity: 'warn' },
    ],
  },
  'spring-onion': {
    id: 'spring-onion', category: 'leafy', label: 'Spring Onion', imageId: 'spring-onion',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 95, humidityRange: [90, 95],
    warningTemperature: 5, criticalTemperature: 8, warningHumidity: 86, criticalHumidity: 78,
    chillingFloor: null, humidAlertHigh: false,
    ethyleneRole: 'neutral', odorRisk: 'emits',
    storageNote: 'Thin stalks dry out quickly :  treat humidity as seriously as you would for lettuce.',
    shelfLife: 'about 3 weeks at 0°C',
    commonMistakes: [
      'Letting the thin stalks dry out :  spring onion loses moisture faster than most leafy crops and needs 90–95% humidity to compensate.',
      'Storing unwrapped near other produce :  its odor transfers to whatever shares the space.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '💧', text: 'Thin stalks lose moisture fast :  keep humidity at 90–95%.', severity: 'warn' },
    ],
  },
  onion: {
    // Sourced directly from UC Davis PREC's "Onions (Dry)" fact sheet : 
    // genuinely different from almost everything else in this dataset.
    // Recommended long-term storage is 0°C at only 65-70% humidity (most
    // other produce here wants 85-95%); UC Davis explicitly states
    // "ethylene may encourage sprouting and growth of decay-causing fungi"
    // (ethylene-sensitive, not a producer) and that onions are "both
    // storage-odor sources for other commodities... and storage-odor
    // absorbers" :  bidirectional, but 'emits' is the operative direction
    // for compatibility warnings here. humidAlertHigh is true because the
    // danger direction is excess humidity causing rot, the opposite of
    // most crops in this list.
    id: 'onion', category: 'vegetables', label: 'Onion', imageId: 'onion',
    targetTemperature: 1, tempRange: [0, 4], targetHumidity: 67, humidityRange: [65, 70],
    warningTemperature: 5, criticalTemperature: 10, warningHumidity: 75, criticalHumidity: 85,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'sensitive', odorRisk: 'emits',
    storageNote: 'Needs low humidity (65–70%), not high :  the opposite of most produce. Excess humidity causes rot, not dryness.',
    shelfLife: '1–8 months at 0°C, provided humidity stays low (65–70%)',
    commonMistakes: [
      'Using the same high humidity as other produce :  onion is the outlier here and needs it kept low; high humidity causes rot, not dryness.',
      'Storing near ripening fruit :  ethylene exposure encourages sprouting and decay in onion, the opposite effect it has on climacteric fruit.',
    ],
    references: [
      'UC Davis Postharvest Research and Extension Center :  Cantwell (2001) Long-Term Storage Properties table',
    ],
    tips: [
      { icon: '⚠️', text: 'Keep humidity low (65–70%) with good ventilation :  high humidity causes rot, unlike most other crops.', severity: 'warn' },
      { icon: 'ℹ️', text: 'Ethylene exposure encourages sprouting and decay :  keep away from ripening fruit.', severity: 'info' },
    ],
  },

  // ── Grains & Legumes ────────────────────────────────────────────────────────────
  cowpea: {
    id: 'cowpea', category: 'legumes', label: 'Cowpea', imageId: 'cowpea',
    targetTemperature: 15, tempRange: [12, 20], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 74, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cold storage is optional for cowpea :  the real risk is humidity encouraging mould, not temperature.',
    shelfLife: "several months to about a year when kept dry and below ~70% humidity :  cold storage extends life further but isn't required",
    commonMistakes: [
      'Assuming dried cowpea needs refrigeration like fresh produce :  the real risk is humidity-driven mould, not warmth on its own.',
      'Letting humidity climb above 70% :  this is what actually shortens shelf life for dried legumes, not temperature.',
    ],
    references: [
      "MSU Extension (dry bean storage); Saskatchewan Pulse Growers postharvest guide (general dry-legume storage principle; Cantwell's own 'Cowpeas' entry covers fresh green pods, a different product with a multi-day, not multi-month, shelf life)",
    ],
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
    storageNote: 'The most aflatoxin-prone crop in the dataset :  humidity control matters more here than for any other legume.',
    shelfLife: '6–12 months in-shell when kept dry and cool; shelled kernels are more perishable due to their oil content',
    commonMistakes: [
      'Letting humidity exceed 65% :  groundnut is the most aflatoxin-prone crop in this dataset, stricter than any other legume here.',
      'Storing shelled and in-shell groundnut under identical conditions :  shelled kernels spoil faster and deserve tighter humidity control.',
    ],
    references: [
      'FAO mycotoxin-prevention manual; Muga et al. 2019 aflatoxin study',
    ],
    tips: [
      { icon: '⚠️', text: 'Aflatoxin risk is high :  keep humidity below 65% at all times, stricter than other legumes.', severity: 'warn' },
    ],
  },
  soybean: {
    id: 'soybean', category: 'legumes', label: 'Soybean', imageId: 'soybean',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 74, criticalHumidity: 80,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Cold storage is optional :  humidity control is what actually protects shelf life.',
    shelfLife: '6–12 months when kept dry and cool',
    commonMistakes: [
      'Relying on cold storage instead of humidity control :  for soybean, humidity is what actually protects shelf life.',
      'Letting humidity climb above 70% :  invites mould growth well before any temperature-driven spoilage would occur.',
    ],
    references: [
      'MSU Extension (dry bean storage); Saskatchewan Pulse Growers postharvest guide',
    ],
    tips: [
      { icon: '🌾', text: 'Keep below 70% humidity to prevent mould.', severity: 'warn' },
    ],
  },
  beans: {
    // Sourced from MSU Extension (dry bean storage) and Saskatchewan Pulse
    // Growers' postharvest guide: dry beans (Phaseolus vulgaris :  the common
    // "beans" sold in Ghanaian markets, distinct from cowpea) spoil via mould
    // once ambient humidity climbs, not via cold :  same dry-legume profile
    // shape as cowpea/soybean, kept as its own crop since it's a genuinely
    // different species with its own local name.
    id: 'beans', category: 'legumes', label: 'Beans', imageId: 'beans',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Dry beans keep almost indefinitely if kept cool and dry :  humidity above 65% is what invites mould, not warmth on its own.',
    shelfLife: 'up to about a year when kept dry, cool, and below ~65% humidity',
    commonMistakes: [
      "Assuming 'beans' here means the same thing as cowpea :  they're a genuinely different species with their own storage profile, even though both are dry legumes.",
      'Letting humidity exceed 65% :  this is the main driver of mould in dry beans, more so than warmth.',
    ],
    references: [
      'MSU Extension (dry bean storage); Saskatchewan Pulse Growers postharvest guide',
    ],
    tips: [
      { icon: '🌾', text: 'Keep humidity below 65% :  this matters more than temperature for dry beans.', severity: 'warn' },
    ],
  },
  maize: {
    // Sourced from FAO's mycotoxin-prevention manual and multiple aflatoxin
    // studies (Muga et al. 2019; CAES field report): storage fungi need
    // ≥65% RH to establish, and aflatoxin contamination stays below the
    // 5µg/kg safety limit when ambient RH is kept under ~60%. Matches
    // groundnut's strictness :  maize is similarly aflatoxin-prone.
    id: 'maize', category: 'legumes', label: 'Maize', imageId: 'maize',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Aflatoxin-prone like groundnut :  keeping humidity below 60–65% is the main defense, since the fungus that produces it needs damp grain to establish.',
    shelfLife: '6–12 months when dried to below ~13% grain moisture and kept below ~65% humidity; hermetic (sealed) storage extends this further',
    commonMistakes: [
      'Letting ambient humidity exceed 65% :  aflatoxin risk rises sharply past this point, the same strictness needed for groundnut.',
      'Storing before grain is properly dried :  the moisture content at storage time matters as much as the storage conditions themselves.',
    ],
    references: [
      'FAO mycotoxin-prevention manual; Muga et al. 2019 aflatoxin study',
    ],
    tips: [
      { icon: '⚠️', text: 'Aflatoxin risk rises sharply above 65% humidity :  keep it below that at all times.', severity: 'warn' },
    ],
  },
  rice: {
    // Sourced from IRRI's Rice Knowledge Bank equilibrium-moisture-content
    // guidance: safe milled/paddy rice storage needs grain moisture ≤14%,
    // which in the tropics corresponds to keeping ambient RH below roughly
    // 70–77% :  above that, grain re-absorbs moisture from the air and
    // quality drops. Kept slightly stricter (65% target) for a comfortable
    // safety margin, consistent with the other grains in this dataset.
    id: 'rice', category: 'legumes', label: 'Rice', imageId: 'rice',
    targetTemperature: 15, tempRange: [10, 20], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 22, criticalTemperature: 27, warningHumidity: 70, criticalHumidity: 77,
    chillingFloor: null, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Rice re-absorbs moisture from humid air (it\'s hygroscopic) :  once ambient humidity climbs past ~70%, grain moisture rises past the safe 14% mark and quality drops.',
    shelfLife: '6–12 months for paddy or milled rice kept dry and below ~70% humidity; properly dried and sealed rice can last considerably longer',
    commonMistakes: [
      'Underestimating how hygroscopic rice is :  it pulls moisture straight from humid air even in sealed bags with poor seals, unlike most other grains.',
      'Letting humidity climb past 70% :  grain moisture rises past the safe 14% mark and both mould and pest risk follow.',
    ],
    references: [
      'IRRI Rice Knowledge Bank :  equilibrium moisture content guidance',
    ],
    tips: [
      { icon: '🌾', text: 'Keep humidity below 70% :  rice pulls moisture straight from the air, which invites mould and pests.', severity: 'warn' },
    ],
  },

  // ── Meat & fish ───────────────────────────────────────────────────────────────
  chicken: {
    id: 'chicken', category: 'meat', label: 'Chicken', imageId: 'chicken',
    targetTemperature: 2, tempRange: [0, 4], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 5, criticalTemperature: 7, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: 0, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Must never exceed 7°C :  bacterial growth above this threshold renders it unsafe within hours.',
    shelfLife: '1–2 days refrigerated (0–4°C); up to about 9 months if kept frozen',
    commonMistakes: [
      'Letting temperature exceed 7°C, even briefly :  bacterial growth crosses into unsafe territory within hours past this point, not just a quality issue.',
      'Storing at humidity outside 55–65% :  too high causes surface slime, too low dries the skin.',
    ],
    references: [
      'USDA FoodSafety.gov :  Cold Storage Chart',
    ],
    tips: [
      { icon: '⚠️', text: 'Must never exceed 7°C :  bacterial growth above this threshold makes it unsafe within hours.', severity: 'warn' },
      { icon: '💧', text: 'Keep humidity at 55–65%. Too high causes surface slime; too low dries the skin.', severity: 'warn' },
    ],
  },
  beef: {
    id: 'beef', category: 'meat', label: 'Beef', imageId: 'beef',
    targetTemperature: 1, tempRange: [-1, 4], targetHumidity: 60, humidityRange: [55, 65],
    warningTemperature: 5, criticalTemperature: 7, warningHumidity: 68, criticalHumidity: 75,
    chillingFloor: -1, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Tolerates the coldest range of the meat crops :  slightly below freezing is fine for fresh beef.',
    shelfLife: '3–5 days refrigerated for whole cuts (1–2 days if ground); 4–12 months frozen depending on cut',
    commonMistakes: [
      'Treating a single excursion above 7°C as a quality issue rather than what it actually is :  a food-safety event.',
      'Storing whole cuts and ground beef under the same shelf-life assumption :  ground beef spoils considerably faster.',
    ],
    references: [
      'USDA FoodSafety.gov :  Cold Storage Chart',
    ],
    tips: [
      { icon: '⚠️', text: 'Must stay below 7°C at all times :  a single excursion above this is a food-safety event, not just quality loss.', severity: 'warn' },
    ],
  },
  tilapia: {
    id: 'tilapia', category: 'meat', label: 'Tilapia', imageId: 'tilapia',
    targetTemperature: 1, tempRange: [0, 2], targetHumidity: 65, humidityRange: [60, 70],
    warningTemperature: 3, criticalTemperature: 4, warningHumidity: 72, criticalHumidity: 78,
    chillingFloor: 0, humidAlertHigh: true,
    ethyleneRole: 'neutral', odorRisk: 'neutral',
    storageNote: 'Spoils faster than any other crop in the dataset :  the critical threshold is intentionally tighter than chicken or beef.',
    shelfLife: '1–2 days refrigerated; several months if kept frozen',
    commonMistakes: [
      'Applying the same shelf-life expectations as chicken or beef :  tilapia spoils faster than either and needs the tightest critical threshold (4°C) of any crop in this dataset.',
      "Storing at 0–2°C but treating a drift toward 4°C as acceptable :  for tilapia specifically, that's already the hard limit, not a buffer.",
    ],
    references: [
      'USDA FoodSafety.gov :  Cold Storage Chart',
    ],
    tips: [
      { icon: '⚠️', text: 'Spoils faster than meat :  keep at 0–2°C, right at ice temperature, and treat 4°C as a hard critical limit.', severity: 'warn' },
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
// Single source of truth for "can these crops share one device?" :  both the
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
  /** Present only when tier === 'incompatible' :  what to do about it. */
  suggestion: string | null;
}

export function getCompatibility(cropIds: CropId[]): CompatibilityResult {
  const profiles = cropIds.map(getCrop);
  if (profiles.length <= 1) return { tier: 'compatible', reasons: [], suggestion: null };

  const reasons: CompatibilityReason[] = [];

  // Hard rule :  meat/fish never shares storage with anything else. This is a
  // food-safety cross-contamination concern, not a quality/shelf-life one, so
  // there's no "caution" tier for it :  it's always a hard block.
  const hasMeat    = profiles.some(p => p.category === 'meat');
  const hasNonMeat = profiles.some(p => p.category !== 'meat');
  if (hasMeat && hasNonMeat) {
    reasons.push({
      tier: 'incompatible',
      message: 'Meat/fish must never share cold storage with produce :  this is a cross-contamination risk, not a quality issue.',
    });
  }

  // Hard rule :  the crops' temperature ranges don't overlap at all, so no
  // single setpoint can satisfy every crop in the set simultaneously.
  const rangeLow  = Math.max(...profiles.map(p => p.tempRange[0]));
  const rangeHigh = Math.min(...profiles.map(p => p.tempRange[1]));
  if (rangeLow > rangeHigh) {
    reasons.push({
      tier: 'incompatible',
      message: `These crops need incompatible temperatures at the same time (one needs ${rangeLow}°C or higher, another needs ${rangeHigh}°C or lower) :  no single setpoint works for both.`,
    });
  }

  // Caution :  an ethylene producer alongside an ethylene-sensitive crop
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

  // Caution :  humidity ranges don't overlap, even though temperature does.
  // More forgiving than a temperature clash since humidity varies more by
  // shelf position within a device, so this stays a warning, not a block : 
  // UNLESS the crops also disagree on alert *direction* (humidAlertHigh).
  // The device data model (see backend Device.humidAlertHigh) only supports
  // one direction per device :  a single boolean, not independent low/high
  // bounds. So mixing a "too dry" crop with a "too humid" crop isn't just
  // uncomfortable, it's a real monitoring gap: whichever direction the
  // combined thresholds end up favoring, the other crop's actual danger
  // zone goes completely unwatched, silently. That's a hard block, not a
  // caution :  a second device is the only real fix, not compartments.
  const humidLow  = Math.max(...profiles.map(p => p.humidityRange[0]));
  const humidHigh = Math.min(...profiles.map(p => p.humidityRange[1]));
  if (rangeLow <= rangeHigh && humidLow > humidHigh) {
    const directionMismatch = profiles.some(p => p.humidAlertHigh) && profiles.some(p => !p.humidAlertHigh);
    if (directionMismatch) {
      reasons.push({
        tier: 'incompatible',
        message: `These crops need opposite humidity conditions :  one needs it kept dry (below ${humidHigh}%) to avoid rot, another needs it kept humid (above ${humidLow}%) to avoid wilting. A single device can only watch for one direction at a time, so combining them leaves one crop's actual danger zone completely unmonitored :  use separate devices, not just separate crates.`,
      });
    } else {
      reasons.push({
        tier: 'caution',
        message: `Humidity needs don't overlap (one needs ${humidLow}% or higher, another needs ${humidHigh}% or lower) :  workable if positioned in different zones of the same unit, but not ideal.`,
      });
    }
  }

  // Caution :  an odor emitter (spring onion, onion) can transfer flavor/smell
  // to other produce in an enclosed space.
  if (profiles.some(p => p.odorRisk === 'emits')) {
    reasons.push({
      tier: 'caution',
      message: 'One crop has a strong odor that can transfer to other produce in the same enclosed space :  keep it bagged or wrapped if possible.',
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

// ── Compatibility matrix (Chunk 2 :  pairwise, scored) ────────────────────────
//
// getCompatibility(cropIds) above answers "can this whole selected set share
// one device?" :  a single aggregate tier for the wizard's validation step,
// and it stays in place since AddDeviceFlow's current Compatibility screen
// still calls it directly. This section answers a different, complementary
// question: "how well do these two SPECIFIC crops get along?" :  a scored
// 0–100 relationship between exactly two crops. That's what Chunk 3's visual
// pairwise cards ([Cassava] + [Yam] ✅/❌) need :  one badge per pair the user
// has picked, not one summary badge for the whole set. Both engines read the
// same underlying crop data; neither duplicates or overrides the other's
// thresholds.

export type PairTier = 'excellent' | 'good' | 'acceptable' | 'poor' | 'never';

export interface TemperatureMatch {
  overlaps: boolean;
  /** The workable shared band, if overlaps is true; otherwise null. */
  overlapRange: [number, number] | null;
}

export interface HumidityMatch {
  overlaps: boolean;
  /**
   * true when the two crops want opposite alert directions (one needs kept
   * dry, one needs kept humid) :  a hard block, not just a tight range,
   * since a device only monitors one direction at a time (see the identical
   * reasoning in getCompatibility() above).
   */
  directionConflict: boolean;
  overlapRange: [number, number] | null;
}

export interface EthyleneInteraction {
  /** true when one crop is a high ethylene producer and the other is
   * ethylene-sensitive :  speeds up spoilage/wilting in the sensitive one. */
  concern: boolean;
}

export interface PairCompatibility {
  cropA: CropId;
  cropB: CropId;
  score: number; // 0–100
  tier: PairTier;
  reasons: string[];
  temperatureMatch: TemperatureMatch;
  humidityMatch: HumidityMatch;
  ethyleneInteraction: EthyleneInteraction;
  odorConcern: boolean;
}

export function scoreToTier(score: number): PairTier {
  if (score >= 85) return 'excellent';
  if (score >= 65) return 'good';
  if (score >= 40) return 'acceptable';
  if (score >= 20) return 'poor';
  return 'never';
}

/**
 * Scored, structured compatibility between exactly two crops :  the building
 * block Chunk 3's visual pairwise cards query directly, one call per pair.
 */
export function getPairCompatibility(cropA: CropId, cropB: CropId): PairCompatibility {
  const a = getCrop(cropA);
  const b = getCrop(cropB);
  const reasons: string[] = [];
  let score = 100;

  // Hard block :  food safety, not a quality tradeoff. Overrides everything.
  if ((a.category === 'meat') !== (b.category === 'meat')) {
    return {
      cropA, cropB, score: 0, tier: 'never',
      reasons: ['Meat/fish must never share cold storage with produce :  this is a cross-contamination risk, not a quality issue.'],
      temperatureMatch: { overlaps: false, overlapRange: null },
      humidityMatch: { overlaps: false, directionConflict: false, overlapRange: null },
      ethyleneInteraction: { concern: false },
      odorConcern: false,
    };
  }

  // Temperature
  const tempLow  = Math.max(a.tempRange[0], b.tempRange[0]);
  const tempHigh = Math.min(a.tempRange[1], b.tempRange[1]);
  const tempOverlaps = tempLow <= tempHigh;
  if (!tempOverlaps) {
    score -= 55;
    reasons.push(`These crops need incompatible temperatures at the same time (one needs ${tempLow}°C or higher, another needs ${tempHigh}°C or lower) :  no single setpoint works for both.`);
  }

  // Humidity
  const humidLow  = Math.max(a.humidityRange[0], b.humidityRange[0]);
  const humidHigh = Math.min(a.humidityRange[1], b.humidityRange[1]);
  const humidOverlaps = humidLow <= humidHigh;
  const directionConflict = a.humidAlertHigh !== b.humidAlertHigh;
  if (directionConflict) {
    score -= 60;
    reasons.push('These crops need opposite humidity conditions :  one needs it kept dry, the other needs it kept humid. A single device can only watch one direction at a time, so combining them leaves one crop\'s danger zone unmonitored.');
  } else if (!humidOverlaps) {
    score -= 20;
    reasons.push(`Humidity needs don't overlap (one needs ${humidLow}% or higher, another needs ${humidHigh}% or lower) :  workable in separate zones of the same unit, but not ideal.`);
  }

  // Ethylene
  const ethyleneConcern =
    (a.ethyleneRole === 'producer-high' && b.ethyleneRole === 'sensitive') ||
    (b.ethyleneRole === 'producer-high' && a.ethyleneRole === 'sensitive');
  if (ethyleneConcern) {
    score -= 15;
    reasons.push('One crop releases ethylene as it ripens, which speeds up spoilage and wilting in the other :  keep them in separate crates if possible.');
  }

  // Odor
  const odorConcern = a.odorRisk === 'emits' || b.odorRisk === 'emits';
  if (odorConcern) {
    score -= 10;
    reasons.push('One crop has a strong odor that can transfer to the other in an enclosed space :  keep it bagged or wrapped if possible.');
  }

  score = Math.max(0, Math.min(100, score));
  // Either hard-block condition should always read as 'never', regardless of
  // how the cumulative arithmetic above happens to land.
  const tier = (!tempOverlaps || directionConflict) ? 'never' : scoreToTier(score);

  return {
    cropA, cropB, score, tier, reasons,
    temperatureMatch: { overlaps: tempOverlaps, overlapRange: tempOverlaps ? [tempLow, tempHigh] : null },
    humidityMatch: { overlaps: humidOverlaps, directionConflict, overlapRange: humidOverlaps ? [humidLow, humidHigh] : null },
    ethyleneInteraction: { concern: ethyleneConcern },
    odorConcern,
  };
}

/** Every crop that pairs 'excellent' or 'good' with the given crop. */
export function getCompatibleCrops(cropId: CropId): CropId[] {
  return CROP_LIST.filter(id => {
    if (id === cropId) return false;
    return ['excellent', 'good'].includes(getPairCompatibility(cropId, id).tier);
  });
}

/** Every crop that pairs 'poor' or 'never' with the given crop. */
export function getConflicts(cropId: CropId): CropId[] {
  return CROP_LIST.filter(id => {
    if (id === cropId) return false;
    return ['poor', 'never'].includes(getPairCompatibility(cropId, id).tier);
  });
}

/**
 * Overall 0–100 score for a whole selected set :  the average of every
 * unique pair's score, except a single 'never' pair caps the entire set's
 * score at 15 no matter how many good pairs are also present. A weak-link
 * problem (e.g. one bad pairing in an otherwise-fine crate) shouldn't get
 * diluted into a passable-looking average.
 */
export function getStorageScore(cropIds: CropId[]): number {
  if (cropIds.length <= 1) return 100;
  const pairs: PairCompatibility[] = [];
  for (let i = 0; i < cropIds.length; i++) {
    for (let j = i + 1; j < cropIds.length; j++) {
      pairs.push(getPairCompatibility(cropIds[i], cropIds[j]));
    }
  }
  const hasNever = pairs.some(p => p.tier === 'never');
  const avg = Math.round(pairs.reduce((s, p) => s + p.score, 0) / pairs.length);
  return hasNever ? Math.min(15, avg) : avg;
}

// ── General mixing-guide examples ────────────────────────────────────────────
//
// Category-level illustrative examples, independent of whatever the user
// has actually selected :  a quick visual reference for "what generally
// pairs well" and "what generally doesn't", using the compat-good-*/
// compat-warn-* images from the original image-gen batch. Every claim here
// is verified against getPairCompatibility(), not just asserted.

export interface CompatibilityExample {
  id: string;
  imageId: string;
  tier: 'compatible' | 'incompatible';
  title: string;
  description: string;
}

export const COMPATIBILITY_EXAMPLES: CompatibilityExample[] = [
  {
    id: 'good-tubers', imageId: 'compat-good-tubers-tubers', tier: 'compatible',
    title: 'Yam, cocoyam, and sweet potato store well together',
    description: "These three share close enough humidity needs to store together. Cassava is the exception :  it deteriorates by drying out fast, unlike the others, so it's pickier about sharing space.",
  },
  {
    id: 'good-citrus', imageId: 'compat-good-fruits-citrus', tier: 'compatible',
    title: 'Citrus pairs well with firm fruit',
    description: 'Oranges and mangoes share compatible storage conditions and neither is especially ethylene-sensitive.',
  },
  {
    id: 'good-dry', imageId: 'compat-good-legumes-dry', tier: 'compatible',
    title: 'Dry grains and legumes store together',
    description: 'Cowpea, beans, groundnut, soybean, maize, and rice all follow the same low-humidity storage principle.',
  },
  {
    id: 'warn-leafy', imageId: 'compat-warn-separate-leafy', tier: 'incompatible',
    title: 'Keep leafy greens separate from tubers',
    description: 'Leafy vegetables need much higher humidity than tubers :  storing them together compromises both.',
  },
  {
    id: 'warn-fruit-veg', imageId: 'compat-warn-separate-fruit-veg', tier: 'incompatible',
    title: 'Keep ripening fruit away from leafy greens',
    description: 'Ethylene from ripening fruit (banana, plantain, mango, tomato) speeds up wilting and spoilage in leafy greens.',
  },
  {
    id: 'warn-meat', imageId: 'compat-warn-separate-meat', tier: 'incompatible',
    title: 'Never store meat or fish with produce',
    description: 'This is a food-safety rule, not a quality one-cross-contamination risk, always a hard block.',
  },
];

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
   * true when getCompatibility() returned 'incompatible' for this crop set : 
   * i.e. there is no temperature that satisfies every crop, or the set mixes
   * meat/fish with produce. When this is true, targetTemperature below is a
   * best-effort fallback (protects the most chilling-sensitive crop), not a
   * genuinely safe setpoint :  the UI must surface the incompatibility itself
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
    // No crop configured :  safe neutral default, no chilling-injury framing.
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
  // empty, getCompatibility() has already flagged 'incompatible' :  the
  // target below is a documented best-effort fallback, not a safe number.
  const rangeLow  = Math.max(...profiles.map(p => p.tempRange[0]));
  const rangeHigh = Math.min(Math.min(...profiles.map(p => p.tempRange[1])), criticalTemperature - 1);

  const meanTarget = profiles.reduce((s, p) => s + p.targetTemperature, 0) / profiles.length;
  let targetTemperature: number;
  if (rangeLow <= rangeHigh) {
    // A workable band exists :  bias toward the mean, clamped to the band.
    targetTemperature = parseFloat(Math.min(rangeHigh, Math.max(rangeLow, meanTarget)).toFixed(1));
  } else {
    // No workable band (mirrors compatibility.tier === 'incompatible').
    // Best-effort only: protect the most chilling-sensitive crop's floor
    // even though some other crop in the set will sit outside its own
    // comfort range :  the UI must surface the incompatibility itself.
    targetTemperature = parseFloat(Math.max(rangeLow, chillingFloor ?? rangeLow).toFixed(1));
  }

  const humidAlertHigh = profiles.some(p => p.humidAlertHigh);
  // If any crop's danger direction is "too humid", the combined ceiling must
  // respect the strictest (lowest) high-humidity warning among those crops.
  // NOTE: when the set mixes both directions (some crops need low humidity,
  // others need high), getCompatibility() now flags that as 'incompatible'
  // (see above) precisely because no single warningHumidity/criticalHumidity
  // pair can protect both :  this branch's output in that case is the same
  // kind of documented best-effort fallback as the temperature side below,
  // not a real fix. It exists so the function always returns *a* number
  // rather than throwing, not because the number is trustworthy here.
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
