const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

// Middleware
app.use(cors());
app.use(express.json());

// Ensure data directory exists
async function ensureDataDir() {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'shifts'), { recursive: true });
        await fs.mkdir(path.join(DATA_DIR, 'workplaces'), { recursive: true });
    } catch (error) {
        console.error('Error creating data directories:', error);
    }
}

// Helper function to read JSON file
async function readJSON(filePath) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return null; // File doesn't exist
        }
        throw error;
    }
}

// Helper function to write JSON file
async function writeJSON(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// API Routes

// Get all workplace names
app.get('/api/workplaces', async (req, res) => {
    try {
        const workplacesPath = path.join(DATA_DIR, 'workplaces', 'names.json');
        const workplaces = await readJSON(workplacesPath) || {};
        res.json(workplaces);
    } catch (error) {
        console.error('Error getting workplaces:', error);
        res.status(500).json({ error: 'Failed to get workplaces' });
    }
});

// Update a workplace name
app.put('/api/workplaces/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { displayName } = req.body;
        
        const workplacesPath = path.join(DATA_DIR, 'workplaces', 'names.json');
        const workplaces = await readJSON(workplacesPath) || {};
        
        workplaces[id] = { displayName };
        await writeJSON(workplacesPath, workplaces);
        
        res.json({ success: true, workplace: workplaces[id] });
    } catch (error) {
        console.error('Error updating workplace:', error);
        res.status(500).json({ error: 'Failed to update workplace' });
    }
});

// Get all tasks for a specific shift
app.get('/api/shifts/:shift/tasks', async (req, res) => {
    try {
        const { shift } = req.params;
        const tasksPath = path.join(DATA_DIR, 'shifts', `${shift}.json`);
        const tasks = await readJSON(tasksPath) || {};
        res.json(tasks);
    } catch (error) {
        console.error('Error getting tasks:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// Get a specific task
app.get('/api/shifts/:shift/tasks/:taskId', async (req, res) => {
    try {
        const { shift, taskId } = req.params;
        const tasksPath = path.join(DATA_DIR, 'shifts', `${shift}.json`);
        const tasks = await readJSON(tasksPath) || {};
        const task = tasks[taskId] || {};
        res.json(task);
    } catch (error) {
        console.error('Error getting task:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});

// Update a specific task
app.put('/api/shifts/:shift/tasks/:taskId', async (req, res) => {
    try {
        const { shift, taskId } = req.params;
        const taskData = req.body;
        
        const tasksPath = path.join(DATA_DIR, 'shifts', `${shift}.json`);
        const tasks = await readJSON(tasksPath) || {};
        
        // Merge with existing data
        tasks[taskId] = {
            ...tasks[taskId],
            ...taskData,
            lastUpdatedAt: new Date().toISOString()
        };
        
        await writeJSON(tasksPath, tasks);
        
        res.json({ success: true, task: tasks[taskId] });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
async function startServer() {
    await ensureDataDir();
    app.listen(PORT, () => {
        console.log(`Task Distribution API server running on port ${PORT}`);
        console.log(`Data directory: ${DATA_DIR}`);
    });
}

startServer().catch(console.error);
