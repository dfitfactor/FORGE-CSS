type MacroKey = 'calories' | 'protein' | 'carbs' | 'fat'

export interface USDAFood {
  fdcId: number
  description: string
  brandOwner?: string | null
  dataType?: string | null
  servingSize?: number | null
  servingSizeUnit?: string | null
  calories?: number | null
  protein?: number | null
  carbs?: number | null
  fat?: number | null
}

export interface USDAFoodSlot {
  slot: string
  focus: string
  foods: USDAFood[]
}

export interface USDAFoodSelectionParams {
  clientId: string
  primaryGoal?: string | null
  dailyCalories?: number | null
  proteinG?: number | null
  carbG?: number | null
  fatG?: number | null
  mealFrequency?: number | null
  physiqueFocus?: boolean
  dietaryPattern?: 'omnivore' | 'pescatarian' | 'vegetarian' | 'vegan'
  excludedFoodKeywords?: string[]
  phaseFocus?: 'general' | 'gut_health' | 'reintroduction' | 'elimination' | 'testing'
}

type FdcFoodSearchResponse = {
  foods?: Array<{
    fdcId: number
    description: string
    brandOwner?: string | null
    dataType?: string | null
    servingSize?: number | null
    servingSizeUnit?: string | null
    foodNutrients?: Array<{
      nutrientId?: number
      nutrientName?: string
      value?: number
    }>
  }>
}

type SlotDefinition = {
  slot: string
  focus: string
  searches: string[]
}

function dedupe(items: string[]) {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
}

function applyExclusions(searches: string[], excludedFoodKeywords: string[]) {
  if (excludedFoodKeywords.length === 0) return searches

  return searches.filter((search) => {
    const normalized = search.toLowerCase()
    return !excludedFoodKeywords.some((keyword) => normalized.includes(keyword))
  })
}

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const GENERIC_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)']

function hashSeed(input: string) {
  let hash = 0
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function rotate<T>(items: T[], offset: number) {
  if (items.length === 0) return items
  const normalizedOffset = offset % items.length
  return items.slice(normalizedOffset).concat(items.slice(0, normalizedOffset))
}

function findNutrient(
  nutrients: Array<{ nutrientId?: number; nutrientName?: string; value?: number }> | undefined,
  nutrientIds: number[],
  nameMatch: RegExp
) {
  const byId = nutrients?.find((nutrient) => typeof nutrient.nutrientId === 'number' && nutrientIds.includes(nutrient.nutrientId))
  if (byId && typeof byId.value === 'number') return byId.value

  const byName = nutrients?.find((nutrient) => typeof nutrient.nutrientName === 'string' && nameMatch.test(nutrient.nutrientName))
  return typeof byName?.value === 'number' ? byName.value : null
}

function normalizeFood(food: NonNullable<FdcFoodSearchResponse['foods']>[number]): USDAFood {
  return {
    fdcId: food.fdcId,
    description: normalizeFoodDescription(food.description),
    brandOwner: food.brandOwner ?? null,
    dataType: food.dataType ?? null,
    servingSize: food.servingSize ?? null,
    servingSizeUnit: food.servingSizeUnit ?? null,
    calories: findNutrient(food.foodNutrients, [1008], /energy/i),
    protein: findNutrient(food.foodNutrients, [1003], /protein/i),
    carbs: findNutrient(food.foodNutrients, [1005], /carbohydrate/i),
    fat: findNutrient(food.foodNutrients, [1004], /total lipid|fat/i),
  }
}

function normalizeFoodDescription(description: string) {
  return description
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(?:upc|gtin)\b[:\s-]*\d+/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .trim()
}

async function searchFoods(query: string, pageSize = 6): Promise<USDAFood[]> {
  const apiKey = process.env.USDA_FOODDATA_API_KEY?.trim()
  if (!apiKey) return []

  const response = await fetch(`${FDC_SEARCH_URL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      pageSize,
      dataType: GENERIC_DATA_TYPES,
      sortBy: 'dataType.keyword',
      sortOrder: 'asc',
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`USDA search failed (${response.status})`)
  }

  const data = (await response.json()) as FdcFoodSearchResponse
  return (data.foods ?? []).map(normalizeFood)
}

function getSlotDefinitions(params: USDAFoodSelectionParams): SlotDefinition[] {
  const goalText = String(params.primaryGoal ?? '').toLowerCase()
  const prefersFatLoss = /(fat loss|lose|cut|lean)/.test(goalText)
  const prefersMuscle = /(build|muscle|recomp|size|gain)/.test(goalText) || Boolean(params.physiqueFocus)

  const phaseFocus = params.phaseFocus ?? 'general'
  const dietaryPattern = params.dietaryPattern ?? 'omnivore'
  const excludedFoodKeywords = (params.excludedFoodKeywords ?? []).map((keyword) => keyword.toLowerCase())

  const proteinProfiles = {
    omnivore: {
      breakfast: prefersMuscle
        ? ['greek yogurt berries', 'egg whites oats', 'cottage cheese fruit']
        : ['oatmeal berries', 'greek yogurt fruit', 'eggs avocado toast'],
      lunch: prefersFatLoss
        ? ['chicken breast rice broccoli', 'turkey quinoa vegetables', 'salmon salad sweet potato']
        : ['lean beef rice vegetables', 'chicken pasta vegetables', 'salmon potato asparagus'],
      snack: prefersFatLoss
        ? ['cottage cheese apple almonds', 'tuna rice cakes', 'protein yogurt berries']
        : ['greek yogurt granola berries', 'turkey wrap fruit', 'protein shake banana peanut butter'],
      dinner: prefersMuscle
        ? ['salmon rice asparagus', 'lean steak potatoes vegetables', 'ground turkey pasta zucchini']
        : ['white fish vegetables potato', 'chicken vegetables rice', 'shrimp quinoa vegetables'],
      evening: prefersMuscle
        ? ['greek yogurt peanut butter', 'cottage cheese berries', 'casein pudding']
        : ['greek yogurt cinnamon', 'cottage cheese cucumber', 'protein yogurt'],
    },
    pescatarian: {
      breakfast: ['greek yogurt berries', 'cottage cheese fruit', 'eggs oats', 'tofu scramble oats'],
      lunch: ['salmon rice broccoli', 'tuna quinoa vegetables', 'tofu rice bowl vegetables'],
      snack: ['greek yogurt berries', 'cottage cheese apple almonds', 'tuna rice cakes', 'edamame fruit'],
      dinner: ['salmon potato asparagus', 'white fish rice vegetables', 'tofu quinoa zucchini', 'shrimp rice vegetables'],
      evening: ['greek yogurt cinnamon', 'cottage cheese berries', 'protein yogurt', 'tofu pudding'],
    },
    vegetarian: {
      breakfast: ['greek yogurt berries', 'cottage cheese fruit', 'egg whites oats', 'tofu scramble oats'],
      lunch: ['tofu rice bowl vegetables', 'tempeh quinoa vegetables', 'egg salad potato greens'],
      snack: ['greek yogurt berries', 'cottage cheese apple almonds', 'edamame fruit', 'protein yogurt'],
      dinner: ['tofu potato vegetables', 'tempeh rice zucchini', 'egg frittata vegetables', 'lentil quinoa bowl'],
      evening: ['greek yogurt cinnamon', 'cottage cheese berries', 'protein yogurt', 'tofu pudding'],
    },
    vegan: {
      breakfast: ['tofu scramble oats', 'soy yogurt berries', 'protein oats chia', 'overnight oats soy yogurt'],
      lunch: ['tofu rice bowl vegetables', 'tempeh quinoa vegetables', 'edamame potato greens'],
      snack: ['soy yogurt berries', 'edamame fruit', 'protein shake banana', 'chia pudding'],
      dinner: ['tofu potato vegetables', 'tempeh rice zucchini', 'edamame quinoa vegetables', 'lentil rice bowl'],
      evening: ['soy yogurt cinnamon', 'protein pudding', 'chia pudding', 'tofu pudding'],
    },
  }[dietaryPattern]

  const gutHealthOverrides =
    phaseFocus === 'gut_health' || phaseFocus === 'reintroduction' || phaseFocus === 'elimination' || phaseFocus === 'testing'
      ? {
          breakfast: ['greek yogurt blueberries', 'eggs white rice', 'tofu white rice zucchini', 'cottage cheese strawberries'],
          lunch: ['salmon white rice zucchini', 'white fish potato green beans', 'tofu rice carrots', 'turkey rice zucchini'],
          snack: ['greek yogurt kiwi', 'cottage cheese berries', 'edamame rice cakes', 'protein yogurt banana'],
          dinner: ['salmon potato zucchini', 'white fish rice carrots', 'tofu potato spinach', 'shrimp rice green beans'],
          evening: ['greek yogurt cinnamon', 'cottage cheese kiwi', 'soy yogurt berries', 'protein yogurt'],
        }
      : null

  const breakfastSearches = dedupe(applyExclusions(gutHealthOverrides?.breakfast ?? proteinProfiles.breakfast, excludedFoodKeywords))
  const lunchSearches = dedupe(applyExclusions(gutHealthOverrides?.lunch ?? proteinProfiles.lunch, excludedFoodKeywords))
  const snackSearches = dedupe(applyExclusions(gutHealthOverrides?.snack ?? proteinProfiles.snack, excludedFoodKeywords))
  const dinnerSearches = dedupe(applyExclusions(gutHealthOverrides?.dinner ?? proteinProfiles.dinner, excludedFoodKeywords))
  const eveningSnackSearches = dedupe(applyExclusions(gutHealthOverrides?.evening ?? proteinProfiles.evening, excludedFoodKeywords))

  return [
    { slot: 'Breakfast', focus: 'protein + structured carbs', searches: breakfastSearches },
    { slot: 'Morning Snack', focus: 'portable protein + fruit/fiber', searches: snackSearches },
    { slot: 'Lunch', focus: 'protein anchor + structured carbs + vegetables', searches: lunchSearches },
    { slot: 'Afternoon Snack', focus: 'recovery-friendly protein + easy carbs', searches: snackSearches.slice().reverse() },
    { slot: 'Dinner', focus: 'protein anchor + lighter carb load + vegetables', searches: dinnerSearches },
    { slot: 'Evening Snack', focus: 'protein-forward low decision option', searches: eveningSnackSearches },
  ]
}

export async function selectFoodsForMealPlan(
  params: USDAFoodSelectionParams
): Promise<USDAFoodSlot[]> {
  const slotDefinitions = getSlotDefinitions(params)
  const mealCount = Math.max(params.mealFrequency ?? 5, 3)
  const activeSlots = slotDefinitions.slice(0, Math.min(mealCount, slotDefinitions.length))
  const seedBase = `${params.clientId}:${params.primaryGoal ?? ''}:${params.dailyCalories ?? ''}:${params.proteinG ?? ''}:${params.carbG ?? ''}:${params.fatG ?? ''}:${params.physiqueFocus ? 'physique' : 'general'}`

  const selections = await Promise.all(
    activeSlots.map(async (slot, index) => {
      const rotatedSearches = rotate(slot.searches, hashSeed(`${seedBase}:${slot.slot}`))
      const searchResults = await Promise.all(
        rotatedSearches.slice(0, 2).map((query) => searchFoods(query, 4).catch(() => []))
      )

      const deduped = new Map<number, USDAFood>()
      for (const resultSet of searchResults) {
        for (const food of resultSet) {
          if (!deduped.has(food.fdcId)) deduped.set(food.fdcId, food)
        }
      }

      const foods = rotate(Array.from(deduped.values()), index).slice(0, 3)
      return {
        slot: slot.slot,
        focus: slot.focus,
        foods,
      }
    })
  )

  return selections
}

export function formatFoodsForPrompt(slots: USDAFoodSlot[]) {
  if (slots.length === 0) return 'No USDA foods available.'

  return slots
    .map((slot) => {
      const items = slot.foods.map((food) => {
        const macros = [
          typeof food.calories === 'number' ? `${Math.round(food.calories)} kcal` : null,
          typeof food.protein === 'number' ? `${Math.round(food.protein)}g protein` : null,
          typeof food.carbs === 'number' ? `${Math.round(food.carbs)}g carbs` : null,
          typeof food.fat === 'number' ? `${Math.round(food.fat)}g fat` : null,
        ].filter(Boolean).join(', ')
        return `- ${food.description}${macros ? ` [${macros}]` : ''}`
      }).join('\n')

      return `${slot.slot} (${slot.focus}):\n${items || '- No foods selected'}`
    })
    .join('\n\n')
}
