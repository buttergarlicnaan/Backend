import type { NextFunction, Request, Response } from "express"

export class AppError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "AppError"
    this.status = status
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: "Not found" })
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message })
    return
  }

  const message = err instanceof Error ? err.message : "Internal server error"
  res.status(500).json({ error: message })
}
