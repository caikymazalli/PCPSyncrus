import { tenant } from '../models';

// ... other code ...

// Updated API endpoint
app.get('/api/instrucoes', (req, res) => {
    // Replace all references to tenant.instructions with tenant.workInstructions
    const instructions = tenant.workInstructions; // updated reference
    // ... further processing ...
    res.json(instructions);
});