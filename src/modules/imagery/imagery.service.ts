import { randomUUID } from "crypto"
import { AppError } from "../../middleware/errorHandler"
import type { BoundingBox, Job, JobStatus } from "./imagery.types"

// In-memory job storage
const jobs = new Map<string, Job>()

/**
 * Imagery orchestration. Copernicus access will live behind this service later.
 */
export async function getImageryForBounds(_bounds: BoundingBox): Promise<never> {
  throw new AppError(501, "Imagery retrieval is not implemented yet")
}

export function createEnhancementJob(): Job {
  const jobId = randomUUID()
  const job: Job = {
    jobId,
    status: "QUEUED"
  }
  jobs.set(jobId, job)
  
  // Simulate status progression
  simulateJobProgression(jobId)

  return { jobId: job.jobId, status: job.status }
}

export function getJobById(jobId: string): Job | undefined {
  return jobs.get(jobId)
}

function simulateJobProgression(jobId: string) {
  const progression: { status: JobStatus; delay: number }[] = [
    { status: "SEARCHING_IMAGERY", delay: 1000 },
    { status: "DOWNLOADING_IMAGERY", delay: 2000 },
    { status: "PREPARING_INPUT", delay: 2000 },
    { status: "ENHANCING", delay: 2000 },
    { status: "GENERATING_PREVIEW", delay: 2000 },
    { status: "COMPLETED", delay: 1000 },
  ]

  let accumulatedDelay = 0

  progression.forEach((step) => {
    accumulatedDelay += step.delay
    setTimeout(() => {
      const job = jobs.get(jobId)
      if (job) {
        job.status = step.status
        if (step.status === "COMPLETED") {
          job.result = {
            originalPreviewUrl: null,
            enhancedPreviewUrl: null,
            originalDownloadUrl: null,
            enhancedDownloadUrl: null
          }
        }
      }
    }, accumulatedDelay)
  })
}
