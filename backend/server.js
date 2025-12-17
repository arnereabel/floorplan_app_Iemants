const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'tasks.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for photo uploads
const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { shift, taskId } = req.params;
        const uploadPath = path.join(UPLOADS_DIR, shift, taskId);
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${timestamp}${ext}`);
    }
});

const photoUpload = multer({
    storage: photoStorage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Configure multer for PDF uploads
const pdfStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const { shift, taskId } = req.params;
        const uploadPath = path.join(UPLOADS_DIR, shift, taskId, 'pdfs');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const { pdfType } = req.params;
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `${pdfType}-${timestamp}${ext}`);
    }
});

const pdfUpload = multer({
    storage: pdfStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for PDFs
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed!'), false);
        }
    }
});

// Configure multer for floorplan uploads
const floorplanStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(UPLOADS_DIR, 'floorplan');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const ext = path.extname(file.originalname);
        cb(null, `floorplan-${timestamp}${ext}`);
    }
});

const floorplanUpload = multer({
    storage: floorplanStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static frontend files from parent directory
const FRONTEND_DIR = path.join(__dirname, '..');
app.use(express.static(FRONTEND_DIR));

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
            worker_name_2 TEXT,
            task_description TEXT,
            project_number TEXT,
            phase TEXT,
            drawing TEXT,
            photos TEXT DEFAULT '[]',
            pdf_project TEXT,
            pdf_phase TEXT,
            pdf_drawing TEXT,
            last_updated_at TEXT NOT NULL,
            PRIMARY KEY (id, shift)
        );

        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS box_positions (
            id TEXT PRIMARY KEY,
            x INTEGER NOT NULL,
            y INTEGER NOT NULL,
            width INTEGER NOT NULL,
            height INTEGER NOT NULL,
            updated_at TEXT NOT NULL
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
                workerName2: row.worker_name_2,
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
            workerName2: row.worker_name_2,
            taskDescription: row.task_description,
            projectNumber: row.project_number,
            phase: row.phase,
            drawing: row.drawing,
            photos: row.photos ? JSON.parse(row.photos) : [],
            pdfProject: row.pdf_project,
            pdfPhase: row.pdf_phase,
            pdfDrawing: row.pdf_drawing,
            lastUpdatedAt: row.last_updated_at
        };

        res.json(task);
    } catch (error) {
        console.error('Error getting task:', error);
        res.status(500).json({ error: 'Failed to get task' });
    }
});

// Upload photo for a task
app.post('/api/shifts/:shift/tasks/:taskId/photos', photoUpload.single('photo'), (req, res) => {
    try {
        const { shift, taskId } = req.params;

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get current photos
        const stmt = db.prepare('SELECT photos FROM tasks WHERE shift = ? AND id = ?');
        const row = stmt.get(shift, taskId);

        let photos = [];
        if (row && row.photos) {
            photos = JSON.parse(row.photos);
        }

        // Add new photo
        const filename = req.file.filename;
        photos.push(filename);

        // Update database
        const updateStmt = db.prepare(`
            INSERT INTO tasks (id, shift, photos, last_updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id, shift) DO UPDATE SET
                photos = excluded.photos,
                last_updated_at = excluded.last_updated_at
        `);

        updateStmt.run(taskId, shift, JSON.stringify(photos), new Date().toISOString());

        res.json({ success: true, filename, photos });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ error: 'Failed to upload photo' });
    }
});

// Serve photo file
app.get('/api/photos/:shift/:taskId/:filename', (req, res) => {
    try {
        const { shift, taskId, filename } = req.params;
        const filePath = path.join(UPLOADS_DIR, shift, taskId, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Photo not found' });
        }

        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving photo:', error);
        res.status(500).json({ error: 'Failed to serve photo' });
    }
});

// Delete photo from a task
app.delete('/api/shifts/:shift/tasks/:taskId/photos/:filename', (req, res) => {
    try {
        const { shift, taskId, filename } = req.params;

        // Get current photos
        const stmt = db.prepare('SELECT photos FROM tasks WHERE shift = ? AND id = ?');
        const row = stmt.get(shift, taskId);

        if (!row || !row.photos) {
            return res.status(404).json({ error: 'Task not found' });
        }

        let photos = JSON.parse(row.photos);
        photos = photos.filter(p => p !== filename);

        // Update database
        const updateStmt = db.prepare(`
            UPDATE tasks SET photos = ?, last_updated_at = ?
            WHERE shift = ? AND id = ?
        `);

        updateStmt.run(JSON.stringify(photos), new Date().toISOString(), shift, taskId);

        // Delete file
        const filePath = path.join(UPLOADS_DIR, shift, taskId, filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        res.json({ success: true, photos });
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).json({ error: 'Failed to delete photo' });
    }
});

// Upload PDF for a task (project, phase, or drawing)
app.post('/api/shifts/:shift/tasks/:taskId/pdf/:pdfType', pdfUpload.single('pdf'), (req, res) => {
    try {
        const { shift, taskId, pdfType } = req.params;

        if (!['project', 'phase', 'drawing'].includes(pdfType)) {
            return res.status(400).json({ error: 'Invalid PDF type' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filename = req.file.filename;
        const columnName = `pdf_${pdfType}`;

        // Get current PDF
        const stmt = db.prepare(`SELECT ${columnName} FROM tasks WHERE shift = ? AND id = ?`);
        const row = stmt.get(shift, taskId);

        // Delete old PDF file if exists
        if (row && row[columnName]) {
            const oldFilePath = path.join(UPLOADS_DIR, shift, taskId, 'pdfs', row[columnName]);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
        }

        // Update database
        const updateStmt = db.prepare(`
            INSERT INTO tasks (id, shift, ${columnName}, last_updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id, shift) DO UPDATE SET
                ${columnName} = excluded.${columnName},
                last_updated_at = excluded.last_updated_at
        `);

        updateStmt.run(taskId, shift, filename, new Date().toISOString());

        res.json({ success: true, filename, pdfType });
    } catch (error) {
        console.error('Error uploading PDF:', error);
        res.status(500).json({ error: 'Failed to upload PDF' });
    }
});

// Serve PDF file
app.get('/api/pdfs/:shift/:taskId/:pdfType/:filename', (req, res) => {
    try {
        const { shift, taskId, pdfType, filename } = req.params;

        if (!['project', 'phase', 'drawing'].includes(pdfType)) {
            return res.status(400).json({ error: 'Invalid PDF type' });
        }

        const filePath = path.join(UPLOADS_DIR, shift, taskId, 'pdfs', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving PDF:', error);
        res.status(500).json({ error: 'Failed to serve PDF' });
    }
});

// Delete PDF from a task
app.delete('/api/shifts/:shift/tasks/:taskId/pdf/:pdfType', (req, res) => {
    try {
        const { shift, taskId, pdfType } = req.params;

        if (!['project', 'phase', 'drawing'].includes(pdfType)) {
            return res.status(400).json({ error: 'Invalid PDF type' });
        }

        const columnName = `pdf_${pdfType}`;

        // Get current PDF
        const stmt = db.prepare(`SELECT ${columnName} FROM tasks WHERE shift = ? AND id = ?`);
        const row = stmt.get(shift, taskId);

        if (!row || !row[columnName]) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        // Delete file
        const filePath = path.join(UPLOADS_DIR, shift, taskId, 'pdfs', row[columnName]);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Update database
        const updateStmt = db.prepare(`
            UPDATE tasks SET ${columnName} = NULL, last_updated_at = ?
            WHERE shift = ? AND id = ?
        `);

        updateStmt.run(new Date().toISOString(), shift, taskId);

        res.json({ success: true, pdfType });
    } catch (error) {
        console.error('Error deleting PDF:', error);
        res.status(500).json({ error: 'Failed to delete PDF' });
    }
});

// Update a specific task
app.put('/api/shifts/:shift/tasks/:taskId', (req, res) => {
    try {
        const { shift, taskId } = req.params;
        const { workerName, workerName2, taskDescription, projectNumber, phase, drawing } = req.body;

        const stmt = db.prepare(`
            INSERT INTO tasks (id, shift, worker_name, worker_name_2, task_description, project_number, phase, drawing, last_updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id, shift) DO UPDATE SET
                worker_name = excluded.worker_name,
                worker_name_2 = excluded.worker_name_2,
                task_description = excluded.task_description,
                project_number = excluded.project_number,
                phase = excluded.phase,
                drawing = excluded.drawing,
                last_updated_at = excluded.last_updated_at
        `);

        const timestamp = new Date().toISOString();
        stmt.run(taskId, shift, workerName || null, workerName2 || null, taskDescription || null,
            projectNumber || null, phase || null, drawing || null, timestamp);

        const task = {
            workerName,
            workerName2,
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

// Upload floorplan image
app.post('/api/floorplan/upload', floorplanUpload.single('floorplan'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filename = req.file.filename;

        // Get current floorplan
        const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
        const row = stmt.get('floorplan_image');

        // Delete old floorplan file if exists
        if (row && row.value) {
            const oldFilePath = path.join(UPLOADS_DIR, 'floorplan', row.value);
            if (fs.existsSync(oldFilePath)) {
                fs.unlinkSync(oldFilePath);
            }
        }

        // Update database
        const updateStmt = db.prepare(`
            INSERT INTO config (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `);

        updateStmt.run('floorplan_image', filename, new Date().toISOString());

        res.json({ success: true, filename });
    } catch (error) {
        console.error('Error uploading floorplan:', error);
        res.status(500).json({ error: 'Failed to upload floorplan' });
    }
});

// Get current floorplan
app.get('/api/floorplan/current', (req, res) => {
    try {
        const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
        const row = stmt.get('floorplan_image');

        if (!row) {
            return res.json({ filename: null });
        }

        res.json({ filename: row.value });
    } catch (error) {
        console.error('Error getting floorplan:', error);
        res.status(500).json({ error: 'Failed to get floorplan' });
    }
});

// Serve floorplan image
app.get('/api/floorplan/image/:filename', (req, res) => {
    try {
        const { filename } = req.params;
        const filePath = path.join(UPLOADS_DIR, 'floorplan', filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'Floorplan not found' });
        }

        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving floorplan:', error);
        res.status(500).json({ error: 'Failed to serve floorplan' });
    }
});

// Delete floorplan
app.delete('/api/floorplan/current', (req, res) => {
    try {
        const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
        const row = stmt.get('floorplan_image');

        if (!row) {
            return res.status(404).json({ error: 'No floorplan found' });
        }

        // Delete file
        const filePath = path.join(UPLOADS_DIR, 'floorplan', row.value);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // Delete from database
        const deleteStmt = db.prepare('DELETE FROM config WHERE key = ?');
        deleteStmt.run('floorplan_image');

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting floorplan:', error);
        res.status(500).json({ error: 'Failed to delete floorplan' });
    }
});

// Get place count
app.get('/api/place-count', (req, res) => {
    try {
        const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
        const row = stmt.get('place_count');

        const count = row ? parseInt(row.value, 10) : 4; // Default to 4
        res.json({ count });
    } catch (error) {
        console.error('Error getting place count:', error);
        res.status(500).json({ error: 'Failed to get place count' });
    }
});

// Save place count
app.put('/api/place-count', (req, res) => {
    try {
        const { count } = req.body;

        const stmt = db.prepare(`
            INSERT INTO config (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value,
                updated_at = excluded.updated_at
        `);

        stmt.run('place_count', count.toString(), new Date().toISOString());

        res.json({ success: true, count });
    } catch (error) {
        console.error('Error saving place count:', error);
        res.status(500).json({ error: 'Failed to save place count' });
    }
});

// Get all box positions
app.get('/api/box-positions', (req, res) => {
    try {
        const stmt = db.prepare('SELECT * FROM box_positions');
        const rows = stmt.all();

        const positions = {};
        rows.forEach(row => {
            positions[row.id] = {
                x: row.x,
                y: row.y,
                width: row.width,
                height: row.height
            };
        });

        res.json(positions);
    } catch (error) {
        console.error('Error getting box positions:', error);
        res.status(500).json({ error: 'Failed to get box positions' });
    }
});

// Update box position
app.put('/api/box-positions/:id', (req, res) => {
    try {
        const { id } = req.params;
        const { x, y, width, height } = req.body;

        const stmt = db.prepare(`
            INSERT INTO box_positions (id, x, y, width, height, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                x = excluded.x,
                y = excluded.y,
                width = excluded.width,
                height = excluded.height,
                updated_at = excluded.updated_at
        `);

        stmt.run(id, x, y, width, height, new Date().toISOString());

        res.json({ success: true, position: { x, y, width, height } });
    } catch (error) {
        console.error('Error updating box position:', error);
        res.status(500).json({ error: 'Failed to update box position' });
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
