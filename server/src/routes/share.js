import { Router } from 'express'
import { shareRedirect } from '../controllers/shareController.js'

const router = Router()

router.get('/:token', shareRedirect)

export default router
