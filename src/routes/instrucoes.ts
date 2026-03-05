import { Router } from 'express';
import { isAuthenticated } from '../middleware/authMiddleware';

const router = Router();

router.get('/', isAuthenticated, (req, res) => {
    res.send('Welcome to the instructions!');
});

export default router;