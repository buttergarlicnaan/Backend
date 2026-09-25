import { randomUUID } from "crypto"
import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox, Job, JobStatus, SearchParameters } from "./imagery.types"
import { searchSentinel2L2A } from "./copernicus.service"

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
  
  simulateJobProgression(jobId, bounds, searchParams)

  return { jobId: job.jobId, status: job.status }
}

export function getJobById(jobId: string): Job | undefined {
  return jobs.get(jobId)
}

async function simulateJobProgression(jobId: string, bounds: BoundingBox, searchParams: SearchParameters) {
  const setStatus = (status: JobStatus) => {
    const job = jobs.get(jobId)
    if (job) job.status = status
  }
  
  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  try {
    await delay(1000)
    setStatus("SEARCHING_IMAGERY")

    const metadata = await searchSentinel2L2A(bounds, searchParams)
    
    if (!metadata || metadata.length === 0) {
      setStatus("FAILED")
      return
    }

    const job = jobs.get(jobId)
    if (job) {
      job.imagery = metadata
      if (metadata.length < 8) {
        job.warning = `Only ${metadata.length} suitable images were found within your selected date range and cloud-cover limit. Additional imagery may be selected outside your original criteria to provide the 8 images required by the enhancement model. This may affect enhancement quality.`
      }
    }

    await delay(2000)
    setStatus("DOWNLOADING_IMAGERY")

    await delay(2000)
    setStatus("PREPARING_INPUT")

    await delay(2000)
    setStatus("ENHANCING")

    await delay(2000)
    setStatus("GENERATING_PREVIEW")

    await delay(1000)
    setStatus("COMPLETED")

    const completedJob = jobs.get(jobId)
    if (completedJob) {
      completedJob.result = {
        originalPreviewUrl: null,
        enhancedPreviewUrl: null,
        originalDownloadUrl: null,
        enhancedDownloadUrl: null
      }
    }
  } catch (error) {
    console.error("[Imagery] Job failed:", error)
    setStatus("FAILED")
  }
}
