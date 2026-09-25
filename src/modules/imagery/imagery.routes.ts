import { Router } from "express"
import { enhance, getJob } from "./imagery.controller"

const router = Router()

// processArea from imagery.controller will be registered here
// when the enhancement API is added. Copernicus is not implemented yet.

router.post("/enhance", enhance)
router.get("/jobs/:jobId", getJob)

export default router
