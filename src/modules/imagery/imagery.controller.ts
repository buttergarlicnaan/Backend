import type { NextFunction, Request, Response } from "express"
import { AppError } from "../../middleware/errorHandler"
import { getImageryForBounds, createEnhancementJob, getJobById } from "./imagery.service"
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

export async function enhance(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const body = req.body

    if (!body || typeof body !== "object") {
      throw new AppError(400, "Request body must be an object")
    }

    const { geometry } = body as Record<string, any>

    if (!geometry || geometry.type !== "Polygon" || !geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new AppError(400, "A valid Polygon geometry is required")
    }

    const job = createEnhancementJob()
    res.status(202).json(job)
  } catch (error) {
    next(error)
  }
}

export async function getJob(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jobId } = req.params
    const job = getJobById(jobId)

    if (!job) {
      throw new AppError(404, "Job not found")
    }

    res.json(job)
  } catch (error) {
    next(error)
  }
}
