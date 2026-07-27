import { Dimension, DimensionName, DimensionPoint } from '../types';

/**
 * Generates all possible combinations of values across multiple dimensions.
 *
 * This function creates a complete set of combinations by pairing each value from one dimension
 * with each value from all other dimensions. It effectively builds a collection of test points
 * that cover every possible combination of the provided dimension values.
 *
 * @example
 * // With these dimensions:
 * const dimensions = [
 *   { metrics: ["latency", "throughput"] },
 *   { "test-cases": ["small-input", "large-input"] }
 * ];
 *
 * // The function produces:
 * [
 *   { metrics: "latency", "test-cases": "small-input" },
 *   { metrics: "latency", "test-cases": "large-input" },
 *   { metrics: "throughput", "test-cases": "small-input" },
 *   { metrics: "throughput", "test-cases": "large-input" }
 * ]
 *
 * @returns An array of DimensionPoint objects, each representing one specific combination of dimension values
 */
export function crossMultiply(dimensions: Dimension[]): DimensionPoint[] {
  return dimensions.reduce((points: DimensionPoint[], dimension, index) => {
    const [[dimensionName, dimensionValues]] = Object.entries(dimension);

    // Initially, each point consists of a single dimension
    if (index == 0) return dimensionValues.map((value) => ({ [dimensionName as DimensionName]: value }));

    // For each dimension, append dimension values to each of the existing points
    return points.flatMap((point) => {
      return dimensionValues.map((value) => {
        return { ...point, [dimensionName as DimensionName]: value };
      });
    });
  }, []);
}

export function pointToTitle(point: DimensionPoint): string {
  const keyValue = Object.entries(point)
    .map(([name, value]) => `${name}: ${value}`)
    .join(', ');

  return `(${keyValue})`;
}
