import cors from 'cors';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

// Enable CORS
const corsOptions = {
    origin: 'http://yourdomain.com', // replace with your domain
    optionsSuccessStatus: 200
};

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

// Apply middleware
export const securityMiddleware = (app) => {
    app.use(cors(corsOptions));
    app.use(limiter);
    app.use(helmet()); // adds various security headers
};