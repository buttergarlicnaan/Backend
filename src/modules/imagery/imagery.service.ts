import { randomUUID } from "crypto"
import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox, GeoJsonPolygon, Job, JobResult, JobStatus, SearchParameters, TemporalFrame } from "./imagery.types"
import { searchSentinel2L2A, downloadSentinel2TIFF, downloadSentinel2Preview } from "./copernicus.service"
import fs from "fs/promises"
import path from "path"
import { supabase } from "../storage/supabase.client"
import { env } from "../../config/env"

// In-memory job storage
const jobs = new Map<string, Job>()

/**
 * Imagery orchestration. Copernicus access will live behind this service later.
 */
export async function getImageryForBounds(_bounds: BoundingBox): Promise<never> {
  throw new AppError(501, "Imagery retrieval is not implemented yet")
}

export function createEnhancementJob(
  bounds: BoundingBox,
  searchParams: SearchParameters,
  aoi?: GeoJsonPolygon
): Job {
  const jobId = randomUUID()
  const job: Job = {
    jobId,
    status: "QUEUED",
    aoi
  }
  jobs.set(jobId, job)
  
  processImageryJob(jobId, bounds, searchParams)

  return { jobId: job.jobId, status: job.status }
}

export function getJobById(jobId: string): Job | undefined {
  return jobs.get(jobId)
}

export function completeJob(jobId: string, result: JobResult): Job {
  const job = jobs.get(jobId)
  if (!job) {
    throw new AppError(404, "Job not found")
  }
  job.status = "COMPLETED"
  job.result = {
    ...job.result,
    ...result
  }
  return job
}

async function processImageryJob(jobId: string, bounds: BoundingBox, searchParams: SearchParameters) {
  const setStatus = (status: JobStatus) => {
    const job = jobs.get(jobId)
    if (job) job.status = status
  }

  try {
    setStatus("SEARCHING_IMAGERY")

    const rawMetadata = await searchSentinel2L2A(bounds, searchParams)
    
    const job = jobs.get(jobId)
    if (!job) return

    if (!rawMetadata || rawMetadata.length === 0) {
      job.warning = "No suitable Sentinel-2 imagery was found for the selected area, date range, and cloud-cover limit."
      setStatus("FAILED")
      return
    }

    // Deduplicate by acquisition ID
    const uniqueMap = new Map<string, any>()
    for (const m of rawMetadata) {
      if (!uniqueMap.has(m.id)) {
        uniqueMap.set(m.id, m)
      }
    }
    const uniqueMetadata = Array.from(uniqueMap.values())
    const uniqueCount = uniqueMetadata.length

    job.uniqueAcquisitionCount = uniqueCount
    job.modelInputCount = 8
    job.duplicatedInputs = uniqueCount < 8
    job.imagery = uniqueMetadata

    if (uniqueCount < 8) {
      job.warning = `Only ${uniqueCount} unique Sentinel-2 images were available within the selected criteria. Existing imagery was duplicated to provide the 8 inputs required by the enhancement model. Results may be less reliable because of limited source imagery.`
      console.log(`[Copernicus] Duplicating imagery because fewer than 8 unique acquisitions were available.`)
    }

    // Prepare exactly 8 inputs deterministically
    const selectedInputs = []
    for (let i = 0; i < 8; i++) {
      selectedInputs.push(uniqueMetadata[i % uniqueCount])
    }

    setStatus("DOWNLOADING_IMAGERY")

    let index = 1
    for (const input of selectedInputs) {
      if (input.acquisitionDate) {
        console.log(`[Copernicus] Downloading 19-channel TIFF ${index}/8: ${input.id}`)
        await downloadSentinel2TIFF(bounds, input.acquisitionDate, jobId, index)

        try {
          console.log(`[Copernicus] Generating RGB preview ${index}/8: ${input.id}`)
          await downloadSentinel2Preview(bounds, input.acquisitionDate, jobId, index)
        } catch (previewErr) {
          console.warn(`[Copernicus] Frame preview ${index} generation failed (non-fatal):`, previewErr)
        }
      }
      index++
    }

    setStatus("TIFFS_RETRIEVED")
    setStatus("UPLOADING_INPUTS")

    const inputStoragePaths: string[] = []
    const temporalFrames: TemporalFrame[] = []

    for (let i = 1; i <= 8; i++) {
      const tiffFileName = `${String(i).padStart(2, '0')}.tif`
      const previewFileName = `preview_${String(i).padStart(2, '0')}.png`
      const localTiffPath = path.join(process.cwd(), "temporary", "jobs", jobId, "imagery", tiffFileName)
      const localPreviewPath = path.join(process.cwd(), "temporary", "jobs", jobId, "imagery", previewFileName)
      
      let tiffBuffer: Buffer
      try {
        tiffBuffer = await fs.readFile(localTiffPath)
      } catch (err: any) {
        throw new Error(`Failed to read local TIFF file ${tiffFileName}: ${err.message}`)
      }

      if (tiffBuffer.length === 0) {
        throw new Error(`Local TIFF file ${tiffFileName} is empty`)
      }

      const tiffStoragePath = `jobs/${jobId}/${tiffFileName}`

      const { error: tiffUploadError } = await supabase.storage
        .from(env.supabase.inputBucket)
        .upload(tiffStoragePath, tiffBuffer, {
          contentType: "image/tiff",
          upsert: true
        })

      if (tiffUploadError) {
        throw new Error(`Failed to upload ${tiffFileName} to Supabase: ${tiffUploadError.message}`)
      }

      inputStoragePaths.push(tiffStoragePath)
      console.log(`[Supabase] Uploaded ${tiffFileName} to ${env.supabase.inputBucket}/${tiffStoragePath}`)

      // Create signed URL for raw TIFF
      const { data: tiffSignedData } = await supabase.storage
        .from(env.supabase.inputBucket)
        .createSignedUrl(tiffStoragePath, 86400)

      let previewSignedUrl = ""
      const previewStoragePath = `jobs/${jobId}/${previewFileName}`
      try {
        const previewBuffer = await fs.readFile(localPreviewPath)
        if (previewBuffer.length > 0) {
          const { error: previewUploadError } = await supabase.storage
            .from(env.supabase.inputBucket)
            .upload(previewStoragePath, previewBuffer, {
              contentType: "image/png",
              upsert: true
            })

          if (!previewUploadError) {
            const { data: previewSignedData } = await supabase.storage
              .from(env.supabase.inputBucket)
              .createSignedUrl(previewStoragePath, 86400)
            previewSignedUrl = previewSignedData?.signedUrl || ""
            console.log(`[Supabase] Uploaded ${previewFileName} to ${env.supabase.inputBucket}/${previewStoragePath}`)
          }
        }
      } catch {
        // Preview upload optional fallback
      }

      const localPreviewUrl = `http://localhost:${env.port}/api/jobs/${jobId}/files/${previewFileName}`
      const inputMeta = selectedInputs[i - 1]
      temporalFrames.push({
        frameIndex: i,
        acquisitionId: inputMeta.id,
        timestamp: inputMeta.acquisitionDate || new Date().toISOString(),
        cloudCover: inputMeta.cloudCover,
        rawTiffUrl: tiffSignedData?.signedUrl || "",
        previewUrl: localPreviewUrl || previewSignedUrl,
        storagePath: tiffStoragePath
      })
    }

    if (job) {
      job.inputStoragePaths = inputStoragePaths
      job.temporalFrames = temporalFrames
    }

    setStatus("INPUTS_UPLOADED")

    // Dispatch TIFFs directly to FastAPI ML worker as multipart FormData
    // ML model route: POST /api/v1/predict
    // ML model response: JSON with download URLs for super_resolved.tif and uncertainty_map.tif
    setStatus("INFERENCE_PROCESSING")
    try {
      console.log(`[FastAPI] Sending 8 TIFFs to ML worker at ${env.fastapiWorkerUrl}/api/v1/predict`)
      
      const formData = new FormData()
      
      for (let i = 1; i <= 8; i++) {
        const tiffFileName = `${String(i).padStart(2, '0')}.tif`
        const localTiffPath = path.join(process.cwd(), "temporary", "jobs", jobId, "imagery", tiffFileName)
        const tiffBuffer = await fs.readFile(localTiffPath)
        const blob = new Blob([tiffBuffer], { type: "image/tiff" })
        formData.append("files", blob, tiffFileName)
      }

      const res = await fetch(`${env.fastapiWorkerUrl}/api/v1/predict`, {
        method: "POST",
        body: formData
      })

      if (!res.ok) {
        const errText = await res.text()
        console.warn(`[FastAPI] Worker returned status ${res.status}: ${errText}`)
        setStatus("FAILED")
      } else {
        // ML model returns JSON with all 4 output file URLs
        const mlResult = await res.json() as {
          request_id: string
          success: boolean
          files: {
            super_resolved:       string  // legacy alias for super_resolved_tif
            uncertainty_map:      string  // legacy alias for uncertainty_map_tif
            super_resolved_tif:   string
            super_resolved_png:   string
            uncertainty_map_tif:  string
            uncertainty_map_png:  string
            zip_archive:          string
          }
        }

        console.log(`[FastAPI] Inference completed. request_id=${mlResult.request_id}`)
        console.log(`[FastAPI] Downloading output files from ML model...`)

        const outputDir = path.join(process.cwd(), "temporary", "jobs", jobId, "output")
        await fs.mkdir(outputDir, { recursive: true })

        // Helper: download a file from the ML model and upload to Supabase
        const downloadAndUpload = async (relUrl: string, supabaseFileName: string, contentType: string): Promise<string> => {
          const fullUrl = `${env.fastapiWorkerUrl}${relUrl}`
          console.log(`[FastAPI] Downloading ${supabaseFileName} from ${fullUrl}`)
          
          const dlRes = await fetch(fullUrl)
          if (!dlRes.ok) {
            throw new Error(`Failed to download ${supabaseFileName} from ML model: ${dlRes.status}`)
          }

          const buffer = Buffer.from(await dlRes.arrayBuffer())
          const localPath = path.join(outputDir, supabaseFileName)
          await fs.writeFile(localPath, buffer)
          console.log(`[FastAPI] Downloaded ${supabaseFileName} (${buffer.length} bytes)`)

          const storagePath = `jobs/${jobId}/${supabaseFileName}`
          const { error: uploadError } = await supabase.storage
            .from(env.supabase.outputBucket)
            .upload(storagePath, buffer, { contentType, upsert: true })

          if (uploadError) {
            throw new Error(`Failed to upload ${supabaseFileName} to Supabase: ${uploadError.message}`)
          }

          const { data: signedData } = await supabase.storage
            .from(env.supabase.outputBucket)
            .createSignedUrl(storagePath, 86400)
          
          console.log(`[Supabase] Uploaded ${supabaseFileName} to output bucket`)
          return signedData?.signedUrl || ""
        }

        // Download all 4 output files: 2 TIFFs + 2 PNGs
        const hrTifUrl       = await downloadAndUpload(mlResult.files.super_resolved_tif,    "super_resolved.tif",     "image/tiff")
        const hrPngUrl       = await downloadAndUpload(mlResult.files.super_resolved_png,    "super_resolved.png",     "image/png")
        const uncTifUrl      = await downloadAndUpload(mlResult.files.uncertainty_map_tif,   "uncertainty_map.tif",    "image/tiff")
        const uncPngUrl      = await downloadAndUpload(mlResult.files.uncertainty_map_png,   "uncertainty_map.png",    "image/png")

        // Browser display uses local PNG/TIFF endpoints (no CORS/Range issues).
        const localFile = (filename: string) =>
          `http://localhost:${env.port}/api/jobs/${jobId}/files/${filename}`

        completeJob(jobId, {
          hrPsUrl:         localFile("super_resolved.tif") || hrTifUrl || null,
          uncertaintyUrl:  localFile("uncertainty_map.tif") || uncTifUrl || null,
          previewRgbUrl:   localFile("super_resolved.png") || hrPngUrl || null,
          rawBaselineUrl:  localFile("uncertainty_map.png") || uncPngUrl || null,
        })

        console.log(`[FastAPI] Inference fully completed and all 4 outputs uploaded for job ${jobId}`)
      }
    } catch (err: any) {
      console.warn(`[FastAPI] Worker dispatch failed (${err.message}).`)
      setStatus("FAILED")
    }

  } catch (error) {
    console.error("[Imagery] Job failed:", error)
    setStatus("FAILED")
  }
}
