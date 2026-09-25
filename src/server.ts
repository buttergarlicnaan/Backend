import { env } from "./config/env"
import app from "./app"

app.listen(env.port, () => {
  console.log(`GeoEnhance API running on http://localhost:${env.port}`)
})
