# Helper Scripts for IFC Asset Detection

This directory contains helper scripts to manage the IFC asset detection application database.

## Prerequisites

Before running these scripts, make sure you have:
1. Python 3.7 or higher installed
2. The required Python packages installed:
   ```
   pip install -r requirements.txt
   ```

## Scripts

### 1. Clear Database Script
`clear_database.py` - Removes all data from the database tables.

**Usage:**
```bash
python clear_database.py
```

**Note:** This script will prompt for confirmation before clearing the database as this operation cannot be undone.

### 2. Upload Panoramas Script
`upload_panoramas.py` - Uploads panorama images from a folder to the database.

**Usage:**
```bash
python upload_panoramas.py
```

**Features:**
- Automatically scans folders for images with the naming pattern `{id}_{direction}.{extension}`
- Supports directions: f (front), b (back), l (left), r (right), t (top), d (bottom)
- Handles missing top/bottom images as mentioned in requirements
- Groups images by ID and uploads them as panorama sets
- Adds default metadata for each panorama

**Image Naming Convention:**
- Images should be named with the pattern: `{panorama_id}_{direction}.{extension}`
- Example: `12345_f.jpg`, `12345_b.jpg`, `12345_l.jpg`, `12345_r.jpg`
- Supported extensions: `.jpg`, `.jpeg`, `.png`

**Requirements:**
- The Docker containers must be running (database accessible on localhost:5432)
- Front and back images are required for a valid panorama
- Top and bottom images are optional (as mentioned in the requirements)