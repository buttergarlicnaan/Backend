import { env } from "../../config/env"
import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox } from "./imagery.types"

let tokenCache: { token: string; expiresAt: number } | null = null

export async function getCopernicusAccessToken(): Promise<string> {
  const now = Date.now()
  if (tokenCache && tokenCache.expiresAt > now + 60000) {
    return tokenCache.token
  }

  const { clientId, clientSecret } = env.copernicus

  const params = new URLSearchParams()
  params.append("grant_type", "client_credentials")
  params.append("client_id", clientId)
  params.append("client_secret", clientSecret)

  try {
    const response = await fetch("https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString()
    })

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status}`)
    }

    const data = await response.json()
    
    tokenCache = {
      token: data.access_token,
      expiresAt: now + (data.expires_in * 1000)
    }

    return tokenCache.token
  } catch (error) {
    console.error("[Copernicus] Authentication failed:", error)
    throw new AppError(500, "Failed to authenticate with Copernicus Data Space")
  }
}

export interface CopernicusImageryMetadata {
  id: string
  collection: string
  acquisitionDate: string | null
  cloudCover: number | null
  bbox: number[] | null
}

export async function searchSentinel2L2A(bounds: BoundingBox): Promise<CopernicusImageryMetadata | null> {
  const token = await getCopernicusAccessToken()

  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(endDate.getDate() - env.copernicus.searchDays)

  const bboxStr = `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`
  const timeStr = `${startDate.toISOString()}/${endDate.toISOString()}`
  const maxCloud = env.copernicus.maxCloudCover

  if (
    bounds.west >= bounds.east ||
    bounds.south >= bounds.north
  ) {
    console.error("[Copernicus] Invalid bounds:", bounds)
    throw new AppError(400, "Invalid imagery search bounds")
  }

  const body = {
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    datetime: timeStr,
    collections: ["sentinel-2-l2a"],
    limit: 10
  }

  console.log("[Copernicus] Searching with bounds:", bounds)
  console.log("[Copernicus] Catalog request body:", body)

  try {
    const response = await fetch("https://sh.dataspace.copernicus.eu/catalog/v1/search", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("[Copernicus] Catalog HTTP error:", {
        status: response.status,
        statusText: response.statusText,
        body: errorBody,
      })
      throw new Error(`Catalog search failed: ${response.status}`)
    }

    const data = await response.json()

    console.log("[Copernicus] Catalog results:", data.features?.length ?? 0)

    console.log(
      "[Copernicus] Cloud covers:",
      (data.features ?? []).map((feature: any) => feature.properties?.["eo:cloud_cover"])
    )

    if (!data.features || data.features.length === 0) {
      return null
    }

    const matchingFeatures = data.features.filter((feature: any) => {
      const cloudCover = feature.properties?.["eo:cloud_cover"]
      return typeof cloudCover === "number" && cloudCover <= maxCloud
    })

    console.log("[Copernicus] Max cloud cover:", maxCloud)
    console.log("[Copernicus] Matching results:", matchingFeatures.length)

    if (matchingFeatures.length === 0) {
      return null
    }

    const feature = matchingFeatures[0]

    console.log("[Copernicus] Selected imagery:", {
      id: feature.id,
      collection: feature.collection,
      acquisitionDate: feature.properties?.datetime ?? null,
      cloudCover: feature.properties?.["eo:cloud_cover"] ?? null,
      bbox: feature.bbox ?? null,
    })

    return {
      id: feature.id,
      collection: feature.collection,
      acquisitionDate: feature.properties?.datetime || null,
      cloudCover: feature.properties?.["eo:cloud_cover"] ?? null,
      bbox: feature.bbox || null
    }
  } catch (error) {
    console.error("[Copernicus] Catalog search failed:", error)
    throw new AppError(500, "Failed to search Copernicus Catalog")
  }
}
