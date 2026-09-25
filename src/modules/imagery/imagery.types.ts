export interface BoundingBox {
  north: number
  south: number
  east: number
  west: number
}

export type JobStatus = 
  | "QUEUED"
  | "SEARCHING_IMAGERY"
  | "DOWNLOADING_IMAGERY"
  | "PREPARING_INPUT"
  | "ENHANCING"
  | "GENERATING_PREVIEW"
  | "COMPLETED"
  | "FAILED"

export interface JobResult {
  originalPreviewUrl: string | null
  enhancedPreviewUrl: string | null
  originalDownloadUrl: string | null
  enhancedDownloadUrl: string | null
}

export interface Job {
  jobId: string
  status: JobStatus
  result?: JobResult
}

export interface GeoJsonPolygon {
  type: string
  coordinates: number[][][]
}

export interface EnhanceRequest {
  geometry: GeoJsonPolygon
}
