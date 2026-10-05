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
  | "INFERENCE_PROCESSING"
  | "COMPLETED"
  | "FAILED"

export interface TemporalFrame {
  frameIndex: number
  acquisitionId: string
  timestamp: string
  cloudCover: number | null
  rawTiffUrl: string
  previewUrl: string
  storagePath: string
}

export interface JobResult {
  hrPsUrl: string | null
  uncertaintyUrl: string | null
  rawBaselineUrl: string | null
  previewRgbUrl: string | null
  originalPreviewUrl?: string | null
  enhancedPreviewUrl?: string | null
  originalDownloadUrl?: string | null
  enhancedDownloadUrl?: string | null
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
  temporalFrames?: TemporalFrame[]
  aoi?: GeoJsonPolygon
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
