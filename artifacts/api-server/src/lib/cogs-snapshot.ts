import {
  calculateRecipeLineCost,
  convertQuantity,
} from "./profitability-calculator";

export interface RecipeComponent {
  ingredientId?: string | null;
  subrecipeId?: string | null;
  quantity: number;
  unit: string;
  wastePercent?: number;
}

export interface IngredientCostBasis {
  id: string;
  consumptionUnit: string;
  averageCost: number;
  purchaseCost: number;
  conversionFactor: number;
}

export interface SubrecipeDefinition {
  id: string;
  unit: string;
  yieldQuantity: number;
  items: RecipeComponent[];
}

export interface IngredientConsumption {
  ingredientId: string;
  quantity: number;
  unitCost: number;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} debe ser mayor que cero`);
  }
}

function assertWaste(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("La merma debe ser un porcentaje válido y no negativo");
  }
}

/**
 * Resolves a product recipe to immutable ingredient quantities and unit costs.
 * The returned quantities always use each ingredient's consumption unit.
 */
export function expandRecipeConsumption(input: {
  lines: RecipeComponent[];
  orderQuantity: number;
  ingredients: Map<string, IngredientCostBasis>;
  subrecipes: Map<string, SubrecipeDefinition>;
}): IngredientConsumption[] {
  assertPositive(input.orderQuantity, "La cantidad vendida");
  const totals = new Map<string, IngredientConsumption>();

  const expand = (
    lines: RecipeComponent[],
    multiplier: number,
    path: string[],
  ): void => {
    for (const line of lines) {
      assertPositive(line.quantity, "La cantidad de receta");
      const wastePercent = line.wastePercent ?? 0;
      assertWaste(wastePercent);
      const hasIngredient = Boolean(line.ingredientId);
      const hasSubrecipe = Boolean(line.subrecipeId);
      if (hasIngredient === hasSubrecipe) {
        throw new Error("Cada línea debe referenciar exactamente un ingrediente o subreceta");
      }

      if (line.ingredientId) {
        const ingredient = input.ingredients.get(line.ingredientId);
        if (!ingredient) {
          throw new Error(`Ingrediente inexistente: ${line.ingredientId}`);
        }
        assertPositive(ingredient.conversionFactor, "El factor de conversión");
        const useAverageCost = Number.isFinite(ingredient.averageCost)
          && ingredient.averageCost > 0;
        const sourceCost = useAverageCost ? ingredient.averageCost : ingredient.purchaseCost;
        if (!Number.isFinite(sourceCost) || sourceCost < 0) {
          throw new Error(`Coste inválido para ingrediente: ${line.ingredientId}`);
        }
        const cost = calculateRecipeLineCost({
          purchaseCost: sourceCost,
          conversionFactor: useAverageCost ? 1 : ingredient.conversionFactor,
          quantity: line.quantity,
          recipeUnit: line.unit,
          consumptionUnit: ingredient.consumptionUnit,
          wastePercent,
        });
        if (!Number.isFinite(cost.unitCost) || cost.unitCost < 0) {
          throw new Error(`Coste inválido para ingrediente: ${line.ingredientId}`);
        }
        const quantity = cost.normalizedQuantity
          * (1 + wastePercent / 100)
          * multiplier;
        const current = totals.get(line.ingredientId);
        if (current) {
          current.quantity += quantity;
        } else {
          totals.set(line.ingredientId, {
            ingredientId: line.ingredientId,
            quantity,
            unitCost: cost.unitCost,
          });
        }
        continue;
      }

      const subrecipeId = line.subrecipeId!;
      if (path.includes(subrecipeId)) {
        throw new Error(`Referencia circular de subrecetas: ${[...path, subrecipeId].join(" → ")}`);
      }
      const subrecipe = input.subrecipes.get(subrecipeId);
      if (!subrecipe) {
        throw new Error(`Subreceta inexistente: ${subrecipeId}`);
      }
      assertPositive(subrecipe.yieldQuantity, `El rendimiento de ${subrecipeId}`);
      if (subrecipe.items.length === 0) {
        throw new Error(`Subreceta sin composición: ${subrecipeId}`);
      }
      const normalizedQuantity = convertQuantity(
        line.quantity,
        line.unit,
        subrecipe.unit,
      );
      const batches = normalizedQuantity
        * (1 + wastePercent / 100)
        / subrecipe.yieldQuantity;
      expand(subrecipe.items, multiplier * batches, [...path, subrecipeId]);
    }
  };

  expand(input.lines, input.orderQuantity, []);
  return [...totals.values()];
}
