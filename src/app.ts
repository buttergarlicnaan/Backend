import express from "express"
import cors from "cors"
import { env } from "./config/env"
import { errorHandler, notFoundHandler } from "./middleware/errorHandler"
import healthRouter from "./modules/health/health.routes"
import imageryRouter from "./modules/imagery/imagery.routes"

const app = express()

app.use(
  cors({
    origin: env.frontendOrigin,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Range"],
    exposedHeaders: ["Content-Length", "Content-Range", "Accept-Ranges"],
  })
)
app.use(express.json())

app.use("/api", healthRouter)
app.use("/api", imageryRouter)

app.use(notFoundHandler)
app.use(errorHandler)

export default app
