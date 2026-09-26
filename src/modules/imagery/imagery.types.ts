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
  | "TIFFS_RETRIEVED"
  | "UPLOADING_INPUTS"
  | "INPUTS_UPLOADED"
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
  warning?: string
  uniqueAcquisitionCount?: number
  modelInputCount?: number
  duplicatedInputs?: boolean
  inputStoragePaths?: string[]
  imagery?: Array<{
    id: string
    collection: string
    acquisitionDate: string | null
    cloudCover: number | null
    bbox: number[] | null
  }>
}

export interface GeoJsonPolygon {
  type: string
  coordinates: number[][][]
}

export interface SearchParameters {
  startDate: string
  endDate: string
  maxCloudCover: number
}

export interface EnhanceRequest {
  geometry: GeoJsonPolygon
  startDate?: string
  endDate?: string
  maxCloudCover?: number
}
