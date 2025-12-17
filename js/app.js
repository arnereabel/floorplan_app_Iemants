// Configuration
const API_BASE = 'http://localhost:3001/api'; // Direct to backend for local testing
let currentShift = 'dayshift'; // Default shift

// Global state
let currentWorkplaceId = null;
let workplaceNames = {};
let currentPhotos = [];
let currentPDFs = { project: null, phase: null, drawing: null };

// DOM Elements
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loader-text');
const appContainer = document.getElementById('app-container');
const floorplanView = document.getElementById('floorplan-view');
const detailView = document.getElementById('detail-view');
const floorplanGrid = document.getElementById('floorplan-grid');
const detailHeader = document.getElementById('detail-header');
const taskForm = document.getElementById('task-form');
const workerNameInput = document.getElementById('worker-name');
const workerName2Input = document.getElementById('worker-name-2');
const workplaceNameInput = document.getElementById('workplace-name');
const taskDescriptionInput = document.getElementById('task-description');
const projectNumberInput = document.getElementById('project-number');
const phaseInput = document.getElementById('phase');
const drawingInput = document.getElementById('drawing');
const shiftSelect = document.getElementById('shift-select');

// Helper: Format workplace ID
function formatWorkplaceId(id) {
    return id.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// API Functions
async function apiGet(endpoint) {
    const response = await fetch(`${API_BASE}${endpoint}`);
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
}

async function apiPut(endpoint, data) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    return response.json();
}

// View Management
function showView(viewElement) {
    floorplanView.classList.add('hidden');
    detailView.classList.add('hidden');
    viewElement.classList.remove('hidden');
}

function showFloorplan() {
    currentWorkplaceId = null;
    taskForm.reset();
    showView(floorplanView);
    loadTaskSummaries();
}

function showDetailView(workplaceId) {
    currentWorkplaceId = workplaceId;
    const workplace = workplaceNames[workplaceId];
    const displayName = (workplace && workplace.displayName) ? workplace.displayName : formatWorkplaceId(workplaceId);
    detailHeader.textContent = `Task Details for: ${displayName}`;
    showView(detailView);
    loadTaskDetails(workplaceId);
}

// Render Floorplan
let placeCount = 4; // Start with 4 places by default

// Load saved place count from backend
async function loadPlaceCount() {
    try {
        const data = await apiGet('/place-count');
        placeCount = data.count || 4;
    } catch (error) {
        console.error('Error loading place count:', error);
        placeCount = 4; // Default to 4 on error
    }
}

// Save place count to backend
async function savePlaceCount() {
    try {
        await apiPut('/place-count', { count: placeCount });
    } catch (error) {
        console.error('Error saving place count:', error);
    }
}

function createWorkplaceBox(workplaceId) {
    const box = document.createElement('div');
    box.id = `box-${workplaceId}`;
    box.className = "workplace-box bg-white border-2 border-gray-300 rounded-lg p-4 shadow-md hover:shadow-lg hover:border-blue-500 transition-all duration-200 cursor-pointer flex flex-col justify-between min-h-[120px] relative";
    box.innerHTML = `
        <button class="delete-place-btn absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 cursor-pointer text-sm font-bold" style="z-index: 10; display: none;" title="Delete this place">×</button>
        <h3 id="name-${workplaceId}" class="text-lg font-bold text-gray-800 capitalize">${formatWorkplaceId(workplaceId)}</h3>
        <p id="summary-${workplaceId}" class="text-sm text-gray-600 mt-2">Worker: <span class="font-semibold">Unassigned</span></p>
    `;

    // Delete button event
    const deleteBtn = box.querySelector('.delete-place-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        deletePlace(workplaceId);
    });

    box.addEventListener('click', () => {
        // Don't open details if in edit mode or just finished dragging
        if (isEditMode || isDragging) {
            return;
        }
        showDetailView(workplaceId);
    });
    return box;
}

// Delete a place
async function deletePlace(workplaceId) {
    if (!confirm(`Delete ${formatWorkplaceId(workplaceId)}? This will remove all associated tasks and data.`)) {
        return;
    }

    // Remove the box from DOM
    const box = document.getElementById(`box-${workplaceId}`);
    if (box) {
        box.remove();
    }

    // Decrease place count and save
    placeCount = Math.max(1, placeCount - 1); // Keep at least 1
    await savePlaceCount();

    // Re-render to update place numbers
    renderFloorplan();
    await loadWorkplaceNames();
    await loadTaskSummaries();
    await loadBoxPositions();
}

function renderFloorplan() {
    floorplanGrid.innerHTML = '';
    for (let i = 1; i <= placeCount; i++) {
        const workplaceId = `place-${i}`;
        const box = createWorkplaceBox(workplaceId);
        floorplanGrid.appendChild(box);
    }
}

// Add new place
function addNewPlace() {
    placeCount++;
    const workplaceId = `place-${placeCount}`;
    const box = createWorkplaceBox(workplaceId);
    floorplanGrid.appendChild(box);

    // Update custom name if exists
    if (workplaceNames[workplaceId] && workplaceNames[workplaceId].displayName) {
        const nameEl = document.getElementById(`name-${workplaceId}`);
        if (nameEl) {
            nameEl.textContent = workplaceNames[workplaceId].displayName;
            nameEl.classList.remove('capitalize');
        }
    }

    // Check if we're in positioned mode (custom positions exist) or edit mode
    const hasCustomPositions = Object.keys(boxPositions).length > 0;

    if (isEditMode || hasCustomPositions) {
        if (isEditMode) {
            box.classList.add('edit-mode');
        } else {
            box.classList.add('positioned');
        }

        // Calculate position for the new box
        const index = placeCount - 1;
        const col = index % 5;
        const row = Math.floor(index / 5);
        const x = col * 260;
        const y = row * 140;
        const width = 250;
        const height = 120;

        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = `${width}px`;
        box.style.height = `${height}px`;

        if (isEditMode) {
            addResizeHandles(box);
            makeDraggable(box);
        }

        saveBoxPosition(workplaceId, x, y, width, height);
    }

    // Load task summary for the new place
    loadTaskSummaries();

    // Save place count to persist across refreshes
    savePlaceCount();
}

// Load Workplace Names
async function loadWorkplaceNames() {
    try {
        workplaceNames = await apiGet('/workplaces');
        // Update grid with custom names
        Object.keys(workplaceNames).forEach(id => {
            const nameEl = document.getElementById(`name-${id}`);
            if (nameEl && workplaceNames[id].displayName) {
                nameEl.textContent = workplaceNames[id].displayName;
                nameEl.classList.remove('capitalize');
            }
        });
    } catch (error) {
        console.error('Error loading workplace names:', error);
    }
}

// Load Task Summaries
async function loadTaskSummaries() {
    try {
        // Reset summaries
        document.querySelectorAll('.workplace-box p[id^="summary-"]').forEach(el => {
            el.innerHTML = 'Worker: <span class="font-semibold">Unassigned</span>';
        });

        const tasks = await apiGet(`/shifts/${currentShift}/tasks`);

        // Update with data
        Object.keys(tasks).forEach(taskId => {
            const taskData = tasks[taskId];
            const summaryEl = document.getElementById(`summary-${taskId}`);
            if (summaryEl && (taskData.workerName || taskData.workerName2)) {
                let workerText = '';
                if (taskData.workerName && taskData.workerName2) {
                    workerText = `<span class="font-semibold text-blue-700">${taskData.workerName}</span> & <span class="font-semibold text-blue-700">${taskData.workerName2}</span>`;
                } else if (taskData.workerName) {
                    workerText = `<span class="font-semibold text-blue-700">${taskData.workerName}</span>`;
                } else {
                    workerText = `<span class="font-semibold text-blue-700">${taskData.workerName2}</span>`;
                }
                summaryEl.innerHTML = `Worker: ${workerText}`;
            }
        });
    } catch (error) {
        console.error('Error loading task summaries:', error);
    }
}

// Load Task Details
async function loadTaskDetails(workplaceId) {
    try {
        const task = await apiGet(`/shifts/${currentShift}/tasks/${workplaceId}`);

        // Populate workplace name
        const displayName = workplaceNames[workplaceId] ? workplaceNames[workplaceId].displayName : formatWorkplaceId(workplaceId);
        workplaceNameInput.value = displayName;

        workerNameInput.value = task.workerName || '';
        workerName2Input.value = task.workerName2 || '';
        taskDescriptionInput.value = task.taskDescription || '';
        projectNumberInput.value = task.projectNumber || '';
        phaseInput.value = task.phase || '';
        drawingInput.value = task.drawing || '';
        currentPhotos = task.photos || [];
        currentPDFs = {
            project: task.pdfProject || null,
            phase: task.pdfPhase || null,
            drawing: task.pdfDrawing || null
        };
        displayPhotos();
        displayPDFs();
    } catch (error) {
        console.error('Error loading task details:', error);
        // Leave fields empty on error
        workerNameInput.value = '';
        workerName2Input.value = '';
        taskDescriptionInput.value = '';
        projectNumberInput.value = '';
        phaseInput.value = '';
        drawingInput.value = '';
        currentPhotos = [];
        currentPDFs = { project: null, phase: null, drawing: null };
        displayPhotos();
        displayPDFs();
    }
}

// Display photos in gallery
function displayPhotos() {
    const gallery = document.getElementById('photo-gallery');
    gallery.innerHTML = '';

    if (currentPhotos.length === 0) {
        gallery.innerHTML = '<p class="text-gray-500 text-sm col-span-full">No photos added yet</p>';
        return;
    }

    currentPhotos.forEach(filename => {
        const photoDiv = document.createElement('div');
        photoDiv.className = 'relative';
        photoDiv.style.position = 'relative';

        const img = document.createElement('img');
        img.src = `${API_BASE}/photos/${currentShift}/${currentWorkplaceId}/${filename}`;
        img.className = 'w-full h-32 object-cover rounded-lg border-2 border-gray-300';
        img.alt = 'Task photo';

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.innerHTML = '×';
        deleteBtn.className = 'absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-700 cursor-pointer';
        deleteBtn.style.zIndex = '10';
        deleteBtn.style.pointerEvents = 'auto';
        deleteBtn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('Delete button clicked for:', filename);
            deletePhoto(filename);
        });

        photoDiv.appendChild(img);
        photoDiv.appendChild(deleteBtn);
        gallery.appendChild(photoDiv);
    });
}

// Upload photo
async function uploadPhoto(file) {
    if (!currentWorkplaceId) {
        console.error('No workplace selected');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('photo', file);

        const response = await fetch(`${API_BASE}/shifts/${currentShift}/tasks/${currentWorkplaceId}/photos`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        currentPhotos = data.photos;
        displayPhotos();
    } catch (error) {
        console.error('Error uploading photo:', error);
        alert('Failed to upload photo');
    }
}

// Delete photo
async function deletePhoto(filename) {
    if (!currentWorkplaceId) return;

    if (!confirm('Delete this photo?')) return;

    try {
        const response = await fetch(`${API_BASE}/shifts/${currentShift}/tasks/${currentWorkplaceId}/photos/${filename}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        const data = await response.json();
        currentPhotos = data.photos;
        displayPhotos();
    } catch (error) {
        console.error('Error deleting photo:', error);
        alert('Failed to delete photo');
    }
}

// Handle photo input change
function handlePhotoInput(event) {
    const files = event.target.files;
    if (files.length > 0) {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('image/')) {
                uploadPhoto(file);
            }
        });
        event.target.value = ''; // Reset input
    }
}

// Display PDFs
function displayPDFs() {
    ['project', 'phase', 'drawing'].forEach(type => {
        const displayDiv = document.getElementById(`pdf-${type}-display`);
        displayDiv.innerHTML = '';

        if (currentPDFs[type]) {
            const pdfLink = document.createElement('a');
            pdfLink.href = `${API_BASE}/pdfs/${currentShift}/${currentWorkplaceId}/${type}/${currentPDFs[type]}`;
            pdfLink.target = '_blank';
            pdfLink.className = 'text-blue-600 hover:underline text-sm inline-flex items-center gap-2';
            pdfLink.innerHTML = `📄 ${currentPDFs[type]}`;

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.innerHTML = '×';
            deleteBtn.className = 'ml-2 text-red-500 hover:text-red-700 font-bold';
            deleteBtn.onclick = () => deletePDF(type);

            displayDiv.appendChild(pdfLink);
            displayDiv.appendChild(deleteBtn);
        }
    });
}

// Upload PDF
async function uploadPDF(type, file) {
    if (!currentWorkplaceId) {
        console.error('No workplace selected');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('pdf', file);

        const response = await fetch(`${API_BASE}/shifts/${currentShift}/tasks/${currentWorkplaceId}/pdf/${type}`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        currentPDFs[type] = data.filename;
        displayPDFs();
    } catch (error) {
        console.error('Error uploading PDF:', error);
        alert('Failed to upload PDF');
    }
}

// Delete PDF
async function deletePDF(type) {
    if (!currentWorkplaceId) return;

    if (!confirm('Delete this PDF?')) return;

    try {
        const response = await fetch(`${API_BASE}/shifts/${currentShift}/tasks/${currentWorkplaceId}/pdf/${type}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Delete failed');

        currentPDFs[type] = null;
        displayPDFs();
    } catch (error) {
        console.error('Error deleting PDF:', error);
        alert('Failed to delete PDF');
    }
}

// Handle PDF input change
function handlePDFInput(type) {
    return function (event) {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            uploadPDF(type, file);
        }
        event.target.value = ''; // Reset input
    };
}

// Save Task Details
async function saveTaskDetails(event) {
    event.preventDefault();
    if (!currentWorkplaceId) {
        console.error('No workplace selected');
        return;
    }

    // Find save button - it's now outside the form, linked via form attribute
    const saveButton = document.querySelector('button[type="submit"][form="task-form"]') ||
        event.target.querySelector('button[type="submit"]');
    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = 'Saving...';
    }

    try {
        // Save workplace name if changed
        const newWorkplaceName = workplaceNameInput.value.trim();
        if (newWorkplaceName) {
            await apiPut(`/workplaces/${currentWorkplaceId}`, { displayName: newWorkplaceName });

            // Update local state
            if (!workplaceNames[currentWorkplaceId]) workplaceNames[currentWorkplaceId] = {};
            workplaceNames[currentWorkplaceId].displayName = newWorkplaceName;

            // Update header
            detailHeader.textContent = `Task Details for: ${newWorkplaceName}`;

            // Update grid immediately
            const nameEl = document.getElementById(`name-${currentWorkplaceId}`);
            if (nameEl) {
                nameEl.textContent = newWorkplaceName;
                nameEl.classList.remove('capitalize');
            }
        }

        const dataToSave = {
            workerName: workerNameInput.value,
            workerName2: workerName2Input.value,
            taskDescription: taskDescriptionInput.value,
            projectNumber: projectNumberInput.value,
            phase: phaseInput.value,
            drawing: drawingInput.value
        };

        await apiPut(`/shifts/${currentShift}/tasks/${currentWorkplaceId}`, dataToSave);

        // Show success feedback
        if (saveButton) {
            saveButton.textContent = 'Saved!';
            setTimeout(() => {
                saveButton.textContent = 'Save Task';
            }, 2000);
        }
    } catch (error) {
        console.error('Error saving task:', error);
        alert(`Error saving task: ${error.message}`);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

// Floorplan Management
let isEditMode = false;
let currentFloorplan = null;
let boxPositions = {};
let dragState = null;
let resizeState = null;
let saveTimeout = null;
let isDragging = false;

// Load floorplan image
async function loadFloorplan() {
    try {
        const data = await apiGet('/floorplan/current');
        if (data.filename) {
            currentFloorplan = data.filename;
            const container = document.getElementById('floorplan-container');
            container.style.backgroundImage = `url('/api/floorplan/image/${data.filename}')`;
        }
    } catch (error) {
        console.error('Error loading floorplan:', error);
    }
}

// Upload floorplan
async function uploadFloorplan(file) {
    try {
        const formData = new FormData();
        formData.append('floorplan', file);

        const response = await fetch(`${API_BASE}/floorplan/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        currentFloorplan = data.filename;

        const container = document.getElementById('floorplan-container');
        container.style.backgroundImage = `url('/api/floorplan/image/${data.filename}')`;

        alert('Floorplan uploaded successfully!');
    } catch (error) {
        console.error('Error uploading floorplan:', error);
        alert('Failed to upload floorplan');
    }
}

// Load box positions
async function loadBoxPositions() {
    try {
        const positions = await apiGet('/box-positions');
        boxPositions = positions;
        applyBoxPositions();
    } catch (error) {
        console.error('Error loading box positions:', error);
    }
}

// Apply positions to boxes
function applyBoxPositions() {
    const hasCustomPositions = Object.keys(boxPositions).length > 0;

    if (hasCustomPositions) {
        const grid = document.getElementById('floorplan-grid');

        // Switch to absolute positioning mode
        grid.classList.remove('grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-5', 'gap-4');
        grid.style.position = 'relative';
        grid.style.minHeight = '800px';

        // Apply saved positions to all boxes
        Object.keys(boxPositions).forEach(id => {
            const box = document.getElementById(`box-${id}`);
            if (box) {
                const pos = boxPositions[id];
                box.classList.add('positioned');
                box.style.left = `${pos.x}px`;
                box.style.top = `${pos.y}px`;
                box.style.width = `${pos.width}px`;
                box.style.height = `${pos.height}px`;
            }
        });
    }
}

// Save box position (debounced)
function saveBoxPosition(id, x, y, width, height) {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            await apiPut(`/box-positions/${id}`, { x, y, width, height });
            boxPositions[id] = { x, y, width, height };
        } catch (error) {
            console.error('Error saving box position:', error);
        }
    }, 500);
}

// Toggle edit mode
function toggleEditMode() {
    isEditMode = !isEditMode;
    const toggle = document.getElementById('edit-mode-toggle');
    const container = document.getElementById('floorplan-container');
    const grid = document.getElementById('floorplan-grid');

    if (isEditMode) {
        toggle.textContent = '✓ Save Layout';
        toggle.classList.remove('bg-gray-600', 'hover:bg-gray-700');
        toggle.classList.add('bg-green-600', 'hover:bg-green-700');

        // Switch to absolute positioning
        grid.classList.remove('grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-5', 'gap-4');
        grid.style.position = 'relative';
        grid.style.minHeight = '800px';

        // Enable edit mode for all boxes
        document.querySelectorAll('.workplace-box').forEach((box, index) => {
            box.classList.add('edit-mode');
            const id = box.id.replace('box-', '');

            // Show delete button in edit mode
            const deleteBtn = box.querySelector('.delete-place-btn');
            if (deleteBtn) {
                deleteBtn.style.display = 'flex';
            }

            // Apply saved positions or default
            if (boxPositions[id]) {
                box.style.left = `${boxPositions[id].x}px`;
                box.style.top = `${boxPositions[id].y}px`;
                box.style.width = `${boxPositions[id].width}px`;
                box.style.height = `${boxPositions[id].height}px`;
            } else {
                // Calculate default grid position
                const col = index % 5;
                const row = Math.floor(index / 5);
                const x = col * 260;
                const y = row * 140;
                const width = 250;
                const height = 120;

                box.style.left = `${x}px`;
                box.style.top = `${y}px`;
                box.style.width = `${width}px`;
                box.style.height = `${height}px`;

                // Save default position immediately
                saveBoxPosition(id, x, y, width, height);
            }

            addResizeHandles(box);
            makeDraggable(box);
        });
    } else {
        toggle.textContent = '📝 Edit Layout';
        toggle.classList.remove('bg-green-600', 'hover:bg-green-700');
        toggle.classList.add('bg-gray-600', 'hover:bg-gray-700');

        // Check if any boxes have custom positions
        const hasCustomPositions = Object.keys(boxPositions).length > 0;

        if (hasCustomPositions) {
            // Keep absolute positioning, just remove edit controls
            // Grid stays in relative positioning mode
            document.querySelectorAll('.workplace-box').forEach(box => {
                box.classList.remove('edit-mode');
                const id = box.id.replace('box-', '');

                // Hide delete button when exiting edit mode
                const deleteBtn = box.querySelector('.delete-place-btn');
                if (deleteBtn) {
                    deleteBtn.style.display = 'none';
                }

                // Keep saved positions and add 'positioned' class
                if (boxPositions[id]) {
                    box.classList.add('positioned');
                    box.style.left = `${boxPositions[id].x}px`;
                    box.style.top = `${boxPositions[id].y}px`;
                    box.style.width = `${boxPositions[id].width}px`;
                    box.style.height = `${boxPositions[id].height}px`;
                }

                removeResizeHandles(box);
            });
        } else {
            // No custom positions, switch back to grid
            grid.classList.add('grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-5', 'gap-4');
            grid.style.position = '';
            grid.style.minHeight = '';

            // Disable edit mode
            document.querySelectorAll('.workplace-box').forEach(box => {
                box.classList.remove('edit-mode');

                // Hide delete button when exiting edit mode
                const deleteBtn = box.querySelector('.delete-place-btn');
                if (deleteBtn) {
                    deleteBtn.style.display = 'none';
                }

                box.style.left = '';
                box.style.top = '';
                box.style.width = '';
                box.style.height = '';
                removeResizeHandles(box);
            });
        }
    }
}

// Add resize handles
function addResizeHandles(box) {
    const corners = ['nw', 'ne', 'sw', 'se'];
    corners.forEach(corner => {
        const handle = document.createElement('div');
        handle.className = `resize-handle ${corner}`;
        handle.dataset.corner = corner;
        handle.addEventListener('mousedown', startResize);
        box.appendChild(handle);
    });
}

// Remove resize handles
function removeResizeHandles(box) {
    box.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
}

// Make box draggable
function makeDraggable(box) {
    box.addEventListener('mousedown', startDrag);
}

// Start drag
function startDrag(e) {
    if (!isEditMode || e.target.classList.contains('resize-handle')) return;

    e.preventDefault();
    const box = e.currentTarget;
    box.classList.add('dragging');
    isDragging = false; // Reset, will be set to true when actually moving

    dragState = {
        box,
        startX: e.clientX,
        startY: e.clientY,
        initialLeft: parseInt(box.style.left) || 0,
        initialTop: parseInt(box.style.top) || 0
    };

    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);
}

// Do drag
function doDrag(e) {
    if (!dragState) return;

    isDragging = true; // Set to true when actually moving

    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;

    const newLeft = dragState.initialLeft + deltaX;
    const newTop = dragState.initialTop + deltaY;

    dragState.box.style.left = `${newLeft}px`;
    dragState.box.style.top = `${newTop}px`;
}

// Stop drag
function stopDrag(e) {
    if (!dragState) return;

    dragState.box.classList.remove('dragging');

    const id = dragState.box.id.replace('box-', '');
    const x = parseInt(dragState.box.style.left);
    const y = parseInt(dragState.box.style.top);
    const width = parseInt(dragState.box.style.width);
    const height = parseInt(dragState.box.style.height);

    saveBoxPosition(id, x, y, width, height);

    document.removeEventListener('mousemove', doDrag);
    document.removeEventListener('mouseup', stopDrag);
    dragState = null;

    // Reset isDragging after a tiny delay to allow click event to check it
    setTimeout(() => {
        isDragging = false;
    }, 50);
}

// Start resize
function startResize(e) {
    e.stopPropagation();
    e.preventDefault();

    const handle = e.target;
    const box = handle.parentElement;
    const corner = handle.dataset.corner;

    resizeState = {
        box,
        corner,
        startX: e.clientX,
        startY: e.clientY,
        initialLeft: parseInt(box.style.left),
        initialTop: parseInt(box.style.top),
        initialWidth: parseInt(box.style.width),
        initialHeight: parseInt(box.style.height)
    };

    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
}

// Do resize
function doResize(e) {
    if (!resizeState) return;

    const deltaX = e.clientX - resizeState.startX;
    const deltaY = e.clientY - resizeState.startY;

    const { box, corner, initialLeft, initialTop, initialWidth, initialHeight } = resizeState;

    let newWidth = initialWidth;
    let newHeight = initialHeight;
    let newLeft = initialLeft;
    let newTop = initialTop;

    if (corner.includes('e')) {
        newWidth = Math.max(150, initialWidth + deltaX);
    }
    if (corner.includes('w')) {
        newWidth = Math.max(150, initialWidth - deltaX);
        newLeft = initialLeft + deltaX;
    }
    if (corner.includes('s')) {
        newHeight = Math.max(80, initialHeight + deltaY);
    }
    if (corner.includes('n')) {
        newHeight = Math.max(80, initialHeight - deltaY);
        newTop = initialTop + deltaY;
    }

    box.style.width = `${newWidth}px`;
    box.style.height = `${newHeight}px`;
    box.style.left = `${newLeft}px`;
    box.style.top = `${newTop}px`;
}

// Stop resize
function stopResize(e) {
    if (!resizeState) return;

    const id = resizeState.box.id.replace('box-', '');
    const x = parseInt(resizeState.box.style.left);
    const y = parseInt(resizeState.box.style.top);
    const width = parseInt(resizeState.box.style.width);
    const height = parseInt(resizeState.box.style.height);

    saveBoxPosition(id, x, y, width, height);

    document.removeEventListener('mousemove', doResize);
    document.removeEventListener('mouseup', stopResize);
    resizeState = null;
}

// Handle Shift Change
async function handleShiftChange(event) {
    const newShift = event.target.value;
    if (newShift === currentShift) return;

    currentShift = newShift;

    // If we are in detail view, reload details for the new shift
    if (currentWorkplaceId && !detailView.classList.contains('hidden')) {
        await loadTaskDetails(currentWorkplaceId);
    }

    // Always reload summaries for the floorplan view
    await loadTaskSummaries();
}

// Initialize App
async function initApp() {
    try {
        loaderText.textContent = 'Loading application...';

        // Test API connection
        await apiGet('/health');

        loaderText.textContent = 'Loading tasks...';
        await loadPlaceCount();
        renderFloorplan();
        await loadWorkplaceNames();
        await loadTaskSummaries();
        await loadFloorplan();
        await loadBoxPositions();

        // Setup event listeners
        document.getElementById('back-to-floorplan').addEventListener('click', showFloorplan);
        document.getElementById('print-task').addEventListener('click', () => window.print());
        taskForm.addEventListener('submit', saveTaskDetails);
        document.getElementById('camera-input').addEventListener('change', handlePhotoInput);
        document.getElementById('gallery-input').addEventListener('change', handlePhotoInput);
        document.getElementById('pdf-project-input').addEventListener('change', handlePDFInput('project'));
        document.getElementById('pdf-phase-input').addEventListener('change', handlePDFInput('phase'));
        document.getElementById('pdf-drawing-input').addEventListener('change', handlePDFInput('drawing'));

        // Floorplan controls
        document.getElementById('floorplan-upload-input').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                uploadFloorplan(file);
            }
            e.target.value = '';
        });
        document.getElementById('edit-mode-toggle').addEventListener('click', toggleEditMode);
        document.getElementById('add-place-btn').addEventListener('click', addNewPlace);
        shiftSelect.addEventListener('change', handleShiftChange);

        // Show app
        loader.classList.add('hidden');
        appContainer.classList.remove('hidden');
    } catch (error) {
        console.error('Error initializing app:', error);
        loaderText.textContent = `Error: ${error.message}. Make sure the backend API is running.`;
    }
}

// Start app when page loads
window.onload = initApp;
