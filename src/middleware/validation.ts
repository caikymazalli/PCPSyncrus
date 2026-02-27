import { z } from 'zod';

// Define your Zod schema here
const mySchema = z.object({
  // Example of a string field
  name: z.string().min(1, 'Name is required'),
  // Example of a number field
  age: z.number().positive('Age must be a positive number'),
});

const schemaValidationMiddleware = (req, res, next) => {
  try {
    // Validate incoming request data
    mySchema.parse(req.body);
    next(); // Continue to the next middleware
  } catch (error) {
    res.status(400).json({ error: error.errors }); // Handle validation errors
  }
};

export default schemaValidationMiddleware;
