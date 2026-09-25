import dotenv from "dotenv"

dotenv.config()

function readPort(): number {
  const raw = process.env.PORT
  if (!raw) {
    return 8000
  }

  const port = Number(raw)
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("PORT must be a positive integer")
  }

  return port
}

function readFrontendOrigin(): string {
  const origin = process.env.FRONTEND_ORIGIN?.trim()
  return origin && origin.length > 0 ? origin : "http://localhost:5173"
}

export const env = {
  port: readPort(),
  frontendOrigin: readFrontendOrigin(),
}
