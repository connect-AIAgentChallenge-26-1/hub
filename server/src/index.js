import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { rateLimit } from './middleware/rateLimit.js'
import lettersRouter from './routes/letters.js'
import responsesRouter from './routes/responses.js'
import rolesRouter from './routes/roles.js'
import roleTasksRouter from './routes/roleTasks.js'
import confirmRouter from './routes/confirm.js'
import suggestRouter from './routes/suggest.js'
import harvestRouter from './routes/harvest.js'
import expensesRouter from './routes/expenses.js'
import shareRouter from './routes/share.js'

dotenv.config()
const app = express()

// Render 등 프록시 뒤에서도 req.ip가 실제 클라이언트 IP를 가리키게 한다(rate limit 정확도).
app.set('trust proxy', 1)

app.use(cors({ origin: process.env.CLIENT_ORIGIN }))
app.use(express.json())
// 같은 IP에서 짧은 시간에 쓰기 요청(참가자 응답 제출 등)이 몰리는 걸 막는다.
app.use('/api/letters', rateLimit({ windowMs: 60_000, max: 30 }))
app.use('/api/letters', lettersRouter)
app.use('/api/letters', responsesRouter)
app.use('/api/letters', rolesRouter)
app.use('/api/letters', roleTasksRouter)
app.use('/api/letters', confirmRouter)
app.use('/api/letters', suggestRouter)
app.use('/api/letters', harvestRouter)
app.use('/api/letters', expensesRouter)
app.use('/share', shareRouter)

app.listen(process.env.PORT, () => console.log(`서버 실행 중: ${process.env.PORT}`))
