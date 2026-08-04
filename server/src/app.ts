import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { matchRateLimiter, subsidiesRateLimiter } from './middleware/rate-limit.js'
import { healthRouter } from './routes/health.js'
import { matchRouter } from './routes/match.js'
import { subsidiesRouter } from './routes/subsidies.js'

export const app = express()

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.use('/api/health', healthRouter)
app.use('/api/subsidies', subsidiesRateLimiter, subsidiesRouter)
app.use('/api/match', matchRateLimiter, matchRouter)
