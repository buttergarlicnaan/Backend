import { randomUUID } from "crypto"
import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox, Job, JobStatus, SearchParameters } from "./imagery.types"
import { searchSentinel2L2A, downloadSentinel2TIFF } from "./copernicus.service"
import fs from "fs/promises"
import path from "path"
import { supabase } from "../storage/supabase.client"

// In-memory job storage
const jobs = new Map<string, Job>()

/**
 * Imagery orchestration. Copernicus access will live behind this service later.
 */
export async function getImageryForBounds(_bounds: BoundingBox): Promise<never> {
  throw new AppError(501, "Imagery retrieval is not implemented yet")
}

export function createEnhancementJob(bounds: BoundingBox, searchParams: SearchParameters): Job {
  const jobId = randomUUID()
  const job: Job = {
    jobId,
    status: "QUEUED"
  }
  jobs.set(jobId, job)
  
  processImageryJob(jobId, bounds, searchParams)

  return { jobId: job.jobId, status: job.status }
}

export function getJobById(jobId: string): Job | undefined {
  return jobs.get(jobId)
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

    // Deduplicate by acquisition ID just in case
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
        console.log(`[Copernicus] Downloading TIFF ${index}/8: ${input.id}`)
        await downloadSentinel2TIFF(bounds, input.acquisitionDate, jobId, index)
      }
      index++
    }

    setStatus("TIFFS_RETRIEVED")

    setStatus("UPLOADING_INPUTS")
    const inputStoragePaths: string[] = []

    for (let i = 1; i <= 8; i++) {
      const fileName = `${String(i).padStart(2, '0')}.tif`
      const localFilePath = path.join(process.cwd(), "temporary", "jobs", jobId, "imagery", fileName)
      
      let fileBuffer: Buffer
      try {
        fileBuffer = await fs.readFile(localFilePath)
      } catch (err: any) {
        throw new Error(`Failed to read local TIFF file ${fileName}: ${err.message}`)
      }

      if (fileBuffer.length === 0) {
        throw new Error(`Local TIFF file ${fileName} is empty`)
      }

      const storagePath = `jobs/${jobId}/${fileName}`

      const { error } = await supabase.storage
        .from("geoenhance-inputs")
        .upload(storagePath, fileBuffer, {
          contentType: "image/tiff",
          upsert: true
        })

      if (error) {
        throw new Error(`Failed to upload ${fileName} to Supabase: ${error.message}`)
      }

      inputStoragePaths.push(storagePath)
      console.log(`[Supabase] Uploaded ${fileName} to geoenhance-inputs/${storagePath}`)
    }

    if (job) {
      job.inputStoragePaths = inputStoragePaths
    }

    setStatus("INPUTS_UPLOADED")

  } catch (error) {
    console.error("[Imagery] Job failed:", error)
    setStatus("FAILED")
  }
}
