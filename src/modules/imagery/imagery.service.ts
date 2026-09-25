import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox } from "./imagery.types"

/**
 * Imagery orchestration. Copernicus access will live behind this service later.
 */
export async function getImageryForBounds(_bounds: BoundingBox): Promise<never> {
  throw new AppError(501, "Imagery retrieval is not implemented yet")
}
