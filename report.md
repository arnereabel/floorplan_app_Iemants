# Task Floor Planner App - Code Review Report

**Date:** November 20, 2025
**Reviewer:** Antigravity

## 1. Executive Summary

The **Task Floor Planner** is a web-based application for distributing tasks across a workplace floorplan. It allows users to assign workers to specific locations, add task descriptions, and upload attachments (photos, PDFs).

The application follows a client-server architecture:
- **Frontend:** A single HTML file (`index.html`) with embedded Vanilla JavaScript and Tailwind CSS.
- **Backend:** A Node.js Express server (`backend/server.js`) handling API requests and file storage.
- **Database:** SQLite (`better-sqlite3`) is used for data persistence.

**Key Finding:** There is a significant discrepancy between the `README.md` (which claims JSON storage and no Firebase) and the actual codebase (which uses SQLite). Additionally, an unused `floor_app.js` file suggests a parallel or previous development path using Firebase.

---

## 2. Architecture Overview

### Frontend (`index.html`)
- **Technology:** HTML5, Tailwind CSS (CDN), Vanilla JavaScript.
- **Structure:** Monolithic. All application logic (state management, API calls, DOM manipulation, event handling) is contained within a `<script>` tag at the bottom of `index.html`.
- **Communication:** Communicates with the backend via REST API calls (`/api/...`).

### Backend (`backend/`)
- **Technology:** Node.js, Express.js.
- **Database:** SQLite (`tasks.db`).
- **File Storage:** Local file system for uploads (`backend/uploads/`).
- **Dependencies:** `express`, `cors`, `better-sqlite3`, `multer`.

### Deployment
- **Docker:** `docker-compose.yml` and `backend/Dockerfile` are present for containerized deployment.
- **Nginx:** `nginx.conf` is provided, likely for serving the static frontend and proxying API requests.

---

## 3. Code Quality & Findings

### 3.1 Documentation vs. Implementation Discrepancies
| Feature | README.md Description | Actual Implementation |
| :--- | :--- | :--- |
| **Storage** | "JSON files (can be upgraded to SQLite later)" | **SQLite** is already implemented and active in `server.js`. |
| **Firebase** | "No Firebase dependencies" | `index.html` is Firebase-free, but `floor_app.js` exists and depends on Firebase. |
| **Frontend** | "Vanilla JavaScript frontend" | Correct, but `floor_app.js` contradicts this by importing Firebase SDKs. |

### 3.2 Frontend (`index.html`)
- **Strengths:**
    - Simple, zero-build setup.
    - Responsive design using Tailwind CSS.
    - Functional floorplan editor with drag-and-drop capabilities.
- **Weaknesses:**
    - **Maintainability:** ~600 lines of JavaScript are embedded directly in HTML. This makes version control and editing difficult.
    - **Global State:** Heavy reliance on global variables (`currentWorkplaceId`, `boxPositions`, etc.).
    - **Hardcoded Values:** `const SHIFT = 'dayshift';` is hardcoded, limiting the app to a single shift despite the backend supporting multiple shifts.
    - **Unused Code:** `floor_app.js` appears to be a completely separate implementation (likely a Firebase-based version) that is **not referenced** by `index.html`.

### 3.3 Backend (`backend/server.js`)
- **Strengths:**
    - **SQLite Usage:** Using `better-sqlite3` is a robust choice, superior to the JSON file storage mentioned in the README.
    - **WAL Mode:** Write-Ahead Logging is enabled (`db.pragma('journal_mode = WAL')`), improving concurrency.
    - **File Handling:** `multer` is correctly configured for different upload types (photos, PDFs, floorplans) with validation.
- **Weaknesses:**
    - **Monolithic File:** All route handling, database initialization, and configuration are in a single `server.js` file.
    - **Input Validation:** Minimal validation on request bodies.
    - **Error Handling:** Basic `try/catch` blocks that return generic 500 errors.

---

## 4. Recommendations

### 4.1 Immediate Actions
1.  **Update Documentation:** Rewrite `README.md` to accurately reflect the current architecture (SQLite backend, no JSON storage).
2.  **Cleanup:** Decide on the direction (Self-hosted vs. Firebase).
    - If sticking to the self-hosted Node.js version (recommended based on `index.html`), **delete `floor_app.js`** to avoid confusion.
    - If moving to Firebase, `index.html` needs to be updated to use `floor_app.js`.
3.  **Refactor Frontend:** Extract the embedded JavaScript from `index.html` into a separate file (e.g., `src/app.js`).

### 4.2 Future Improvements
1.  **Shift Selection:** The backend supports `shift` parameters, but the frontend hardcodes `dayshift`. Add a UI dropdown to switch shifts.
2.  **Security:** Implement the "User authentication" mentioned in "Future Enhancements". Currently, the API is open.
3.  **Validation:** Add a validation library (like `zod` or `joi`) to the backend to ensure data integrity.
4.  **Backup:** Since it uses SQLite, implement a simple backup strategy for `tasks.db` (e.g., a cron job or an API endpoint to download the DB).

### 4.3 Addressed Items
*   **Addressed:** The `README.md` has been updated to reflect the SQLite architecture.
*   **Addressed:** The `floor_app.js` file has been removed.
*   **Addressed:** The embedded JavaScript has been extracted to `js/app.js`.
*   **Addressed:** Implemented functionality to edit workplace names directly from the task details view.

## 5. Conclusion

The application is in a functional state and has already surpassed the "MVP" status described in the README by implementing SQLite. However, the codebase suffers from "split personality" disorder due to the conflicting `floor_app.js` (Firebase) and `index.html` (Node API) implementations. Cleaning up these artifacts and separating the frontend logic will significantly improve maintainability.
