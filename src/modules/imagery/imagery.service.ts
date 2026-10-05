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

      const inputMeta = selectedInputs[i - 1]
      temporalFrames.push({
        frameIndex: i,
        acquisitionId: inputMeta.id,
        timestamp: inputMeta.acquisitionDate || new Date().toISOString(),
        cloudCover: inputMeta.cloudCover,
        rawTiffUrl: tiffSignedData?.signedUrl || "",
        previewUrl: previewSignedUrl,
        storagePath: tiffStoragePath
      })
    }

    if (job) {
      job.inputStoragePaths = inputStoragePaths
      job.temporalFrames = temporalFrames
    }

    setStatus("INPUTS_UPLOADED")

    // Notify/dispatch to FastAPI ML worker
    setStatus("INFERENCE_PROCESSING")
    try {
      console.log(`[FastAPI] Notifying ML worker at ${env.fastapiWorkerUrl}/api/tasks/infer`)
      const res = await fetch(`${env.fastapiWorkerUrl}/api/tasks/infer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          aoi: job.aoi,
          bounds,
          inputBucket: env.supabase.inputBucket,
          outputBucket: env.supabase.outputBucket,
          temporalFrames: job.temporalFrames
        })
      })

      if (!res.ok) {
        const body = await res.text()
        console.warn(`[FastAPI] Worker returned status ${res.status}: ${body}`)
      } else {
        console.log(`[FastAPI] Inference task registered successfully for job ${jobId}`)
      }
    } catch (err: any) {
      console.warn(`[FastAPI] Worker dispatch offline or deferred (${err.message}). Job remains INFERENCE_PROCESSING.`)
    }

  } catch (error) {
    console.error("[Imagery] Job failed:", error)
    setStatus("FAILED")
  }
}
