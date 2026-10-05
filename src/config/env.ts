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

function readCopernicusCredentials() {
  const clientId = process.env.COPERNICUS_CLIENT_ID?.trim()
  const clientSecret = process.env.COPERNICUS_CLIENT_SECRET?.trim()
  
  if (!clientId || !clientSecret) {
    throw new Error("COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET are required in environment variables")
  }

  return { clientId, clientSecret }
}

function readCopernicusConfig() {
  const searchDays = parseInt(process.env.COPERNICUS_SEARCH_DAYS || "30", 10)
  const maxCloudCover = parseInt(process.env.COPERNICUS_MAX_CLOUD_COVER || "20", 10)
  return { searchDays, maxCloudCover }
}

function readSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const inputBucket = process.env.SUPABASE_INPUT_BUCKET?.trim() || "geoenhance-inputs"
  const outputBucket = process.env.SUPABASE_OUTPUT_BUCKET?.trim() || "geoenhance-outputs"

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in environment variables")
  }

  return { url, serviceRoleKey, inputBucket, outputBucket }
}

function readFastApiWorkerUrl(): string {
  const raw = process.env.FASTAPI_WORKER_URL?.trim()
  return raw && raw.length > 0 ? raw : "http://localhost:8001"
}

export const env = {
  port: readPort(),
  frontendOrigin: readFrontendOrigin(),
  fastapiWorkerUrl: readFastApiWorkerUrl(),
  copernicus: {
    ...readCopernicusCredentials(),
    ...readCopernicusConfig()
  },
  supabase: readSupabaseConfig()
}
