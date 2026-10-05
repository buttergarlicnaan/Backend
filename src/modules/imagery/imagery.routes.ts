import { Router } from "express"
import { enhance, getJob, notifyJobComplete } from "./imagery.controller"

const router = Router()

router.post("/enhance", enhance)
router.get("/jobs/:jobId", getJob)
router.post("/jobs/:jobId/complete", notifyJobComplete)

export default router
