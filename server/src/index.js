import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
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

app.use(cors({ origin: process.env.CLIENT_ORIGIN }))
app.use(express.json())
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
