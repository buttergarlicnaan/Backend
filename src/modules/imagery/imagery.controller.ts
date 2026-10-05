import type { NextFunction, Request, Response } from "express"
import fs from "fs/promises"
import path from "path"
import { AppError } from "../../middleware/errorHandler"
import { getImageryForBounds, createEnhancementJob, getJobById, completeJob } from "./imagery.service"
import type { BoundingBox } from "./imagery.types"

const SAFE_JOB_ID = /^[a-zA-Z0-9_-]+$/
const ALLOWED_JOB_FILES = new Set([
  "super_resolved.tif",
  "super_resolved.png",
  "uncertainty_map.tif",
  "uncertainty_map.png",
  "preview_01.png",
  "preview_02.png",
  "preview_03.png",
  "preview_04.png",
  "preview_05.png",
  "preview_06.png",
  "preview_07.png",
  "preview_08.png",
  "01.tif",
  "02.tif",
  "03.tif",
  "04.tif",
  "05.tif",
  "06.tif",
  "07.tif",
  "08.tif",
])

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

    // Handle frontend payload nesting data-flow regression without breaking API contract
    let payload = body as Record<string, any>
    if (payload.geometry && payload.geometry.type !== 'Polygon' && payload.geometry.geometry) {
      payload = payload.geometry
    }

    const { geometry } = payload

    if (!geometry || geometry.type !== "Polygon" || !geometry.coordinates || !Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
      throw new AppError(400, "A valid Polygon geometry is required")
    }

    const coords = geometry.coordinates[0]
    
    if (!Array.isArray(coords)) {
      throw new AppError(400, "Invalid geometry coordinates format")
    }

    const lons: number[] = []
    const lats: number[] = []

    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) {
        throw new AppError(400, "Each coordinate must be an array of [longitude, latitude]")
      }

      const lon = Number(c[0])
      const lat = Number(c[1])

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
        throw new AppError(400, `Coordinates must be finite numbers, got: [${c[0]}, ${c[1]}]`)
      }

      lons.push(lon)
      lats.push(lat)
    }

    if (lons.length === 0) {
      throw new AppError(400, "Coordinates array cannot be empty")
    }

    const bounds: BoundingBox = {
      north: Math.max(...lats),
      south: Math.min(...lats),
      east: Math.max(...lons),
      west: Math.min(...lons)
    }

    if (bounds.west >= bounds.east || bounds.south >= bounds.north) {
      throw new AppError(400, "Geometry must have a valid non-zero area")
    }

    const { startDate, endDate, maxCloudCover } = payload

    if (startDate !== undefined) {
      if (typeof startDate !== 'string' || Number.isNaN(Date.parse(startDate))) {
        throw new AppError(400, "A valid startDate is required")
      }
    }

    if (endDate !== undefined) {
      if (typeof endDate !== 'string' || Number.isNaN(Date.parse(endDate))) {
        throw new AppError(400, "A valid endDate is required")
      }
    }

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      throw new AppError(400, "startDate must be before or equal to endDate")
    }

    if (maxCloudCover !== undefined) {
      if (typeof maxCloudCover !== 'number' || maxCloudCover < 0 || maxCloudCover > 100) {
        throw new AppError(400, "A valid maxCloudCover between 0 and 100 is required")
      }
    }
    
    const searchParams = { startDate, endDate, maxCloudCover }

    const job = createEnhancementJob(bounds, searchParams, geometry)
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

export async function getJobFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jobId, filename } = req.params

    if (!SAFE_JOB_ID.test(jobId) || !ALLOWED_JOB_FILES.has(filename)) {
      throw new AppError(400, "Invalid job file request")
    }

    const backendRoot = process.cwd()
    const repoRoot = path.resolve(backendRoot, "..")
    const candidates = [
      path.join(backendRoot, "temporary", "jobs", jobId, "output", filename),
      path.join(backendRoot, "temporary", "jobs", jobId, "imagery", filename),
      path.join(repoRoot, "output", "jobs", jobId, filename),
      path.join(repoRoot, "input", "jobs", jobId, filename),
    ]

    for (const candidate of candidates) {
      try {
        await fs.access(candidate)
        return res.sendFile(path.resolve(candidate))
      } catch {
        // try next location
      }
    }

    throw new AppError(404, `File ${filename} was not found for this job`)
  } catch (error) {
    next(error)
  }
}

export async function notifyJobComplete(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { jobId } = req.params
    const { hrPsUrl, uncertaintyUrl, rawBaselineUrl, previewRgbUrl } = req.body || {}

    const job = completeJob(jobId, {
      hrPsUrl: hrPsUrl || null,
      uncertaintyUrl: uncertaintyUrl || null,
      rawBaselineUrl: rawBaselineUrl || null,
      previewRgbUrl: previewRgbUrl || null
    })

    res.json({ success: true, job })
  } catch (error) {
    next(error)
  }
}
