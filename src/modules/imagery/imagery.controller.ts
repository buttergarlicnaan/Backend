import type { NextFunction, Request, Response } from "express"
import { AppError } from "../../middleware/errorHandler"
import { getImageryForBounds } from "./imagery.service"
import type { BoundingBox } from "./imagery.types"

function readCoordinate(value: unknown, name: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new AppError(400, `${name} must be a number`)
  }
  return value
}

function readBounds(body: unknown): BoundingBox {
  if (!body || typeof body !== "object") {
    throw new AppError(400, "Request body must be an object")
  }

  const payload = body as Record<string, unknown>

  return {
    north: readCoordinate(payload.north, "north"),
    south: readCoordinate(payload.south, "south"),
    east: readCoordinate(payload.east, "east"),
    west: readCoordinate(payload.west, "west"),
  }
}

/**
 * HTTP adapter for imagery. No public enhance endpoint is registered yet.
 */
export async function processArea(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const bounds = readBounds(req.body)
    const result = await getImageryForBounds(bounds)
    res.json(result)
  } catch (error) {
    next(error)
  }
}
