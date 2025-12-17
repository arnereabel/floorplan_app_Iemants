const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.db');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database
let db;

function initDatabase() {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    // Open database
    db = new Database(DB_PATH);
    
    // Enable WAL mode for better concurrency
    db.pragma('journal_mode = WAL');

    // Create tables
    db.exec(`
        CREATE TABLE IF NOT EXISTS workplaces (
            id TEXT PRIMARY KEY,
            display_name TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT NOT NULL,
            shift TEXT NOT NULL,
            worker_name TEXT,
            task_description TEXT,
            project_number TEXT,
            phase TEXT,
            drawing TEXT,
            last_updated_at TEXT NOT NULL,
            PRIMARY KEY (id, shift)
        );

        CREATE INDEX IF NOT EXISTS idx_tasks_shift ON tasks(shift);
    `);

    console.log('Database initialized at:', DB_PATH);
}

// API Routes

// Get all workplace names
app.get('/api/workplaces', (req, res) => {
    try {
        const stmt = db.prepare('SELECT id, display_name FROM workplaces');
        const rows = stmt.all();
        
        const workplaces = {};
        rows.forEach(row => {
            workplaces[row.id] = { displayName: row.display_name };
        });
        
        res.json(workplaces);
    } catch (error) {
        console.error('Error getting workplaces:', error);
        res.status(500).json({ error: 'Failed to get workplaces' });
    }
});

// Update a workplace name
app.put('/api/workplaces/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { displayName } = req.body;
        
        const stmt = db.prepare(`
            INSERT INTO workplaces (id, display_name, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                display_name = excluded.display_name,
                updated_at = excluded.updated_at
        `);
        
        stmt.run(id, displayName, new Date().toISOString());
        
        res.json({ success: true, workplace: { displayName } });
    } catch (error) {
        console.error('Error updating workplace:', error);
        res.status(500).json({ error: 'Failed to update workplace' });
    }
});

// Get all tasks for a specific shift
app.get('/api/shifts/:shift/tasks', (req, res) => {
    try {
        const { shift } = req.params;
        const stmt = db.prepare('SELECT * FROM tasks WHERE shift = ?');
        const rows = stmt.all(shift);
        
        const tasks = {};
        rows.forEach(row => {
            tasks[row.id] = {
                workerName: row.worker_name,
                taskDescription: row.task_description,
                projectNumber: row.project_number,
                phase: row.phase,
                drawing: row.drawing,
                lastUpdatedAt: row.last_updated_at
            };
        });
        
        res.json(tasks);
    } catch (error) {
        console.error('Error getting tasks:', error);
        res.status(500).json({ error: 'Failed to get tasks' });
    }
});

// Get a specific task
app.get('/api/shifts/:shift/tasks/:taskId', (req, res) => {
    try {
        const { shift, taskId } = req.params;
        const stmt = db.prepare('SELECT * FROM tasks WHERE shift = ? AND id = ?');
        const row = stmt.get(shift, taskId);
        
        if (!row) {
            return res.json({});
        }
        
        const task = {
            workerName: row.worker_name,
            taskDescription: row.task_description,
            projectNumber: row.project_number,
            phase: row.phase,
            drawing: row.drawing,
            lastUpdatedAt: row.last_updated_at
        };
        
        res.json(task);
    } catch (error) {
        console.error('Error getting task:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});

// Update a specific task
app.put('/api/shifts/:shift/tasks/:taskId', (req, res) => {
    try {
        const { shift, taskId } = req.params;
        const { workerName, taskDescription, projectNumber, phase, drawing } = req.body;
        
        const stmt = db.prepare(`
            INSERT INTO tasks (id, shift, worker_name, task_description, project_number, phase, drawing, last_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, shift) DO UPDATE SET
                worker_name = excluded.worker_name,
                task_description = excluded.task_description,
                project_number = excluded.project_number,
                phase = excluded.phase,
                drawing = excluded.drawing,
                last_updated_at = excluded.last_updated_at
        `);
        
        const timestamp = new Date().toISOString();
        stmt.run(taskId, shift, workerName || null, taskDescription || null, 
                projectNumber || null, phase || null, drawing || null, timestamp);
        
        const task = {
            workerName,
            taskDescription,
            projectNumber,
            phase,
            drawing,
            lastUpdatedAt: timestamp
        };
        
        res.json({ success: true, task });
    } catch (error) {
        console.error('Error updating task:', error);
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    try {
        // Test database connection
        db.prepare('SELECT 1').get();
        res.json({ 
            status: 'ok', 
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        res.status(500).json({ 
            status: 'error', 
            timestamp: new Date().toISOString(),
            database: 'disconnected'
        });
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing database...');
    db.close();
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing database...');
    db.close();
    process.exit(0);
});

// Start server
function startServer() {
    try {
        initDatabase();
        app.listen(PORT, () => {
            console.log(`Task Distribution API server running on port ${PORT}`);
            console.log(`Database: ${DB_PATH}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
