# Swastya-Setu

Smart Healthcare Assistance Platform – AI-powered Healthcare Guidance System built using Relay, Google Sheets, Google Gemini, and OpenStreetMap.

India healthcare web app providing:
- **AI Diagnostics & Symptom Checker**: Rule-based symptom triage and health guidance
- **Nearby Hospitals & Beds**: Real-time OpenStreetMap hospital & clinic finder
- **Pharmacy & Delivery**: Pharmacy locator, prescription upload, and medicine cart
- **Emergency SOS**: Fast dialing for 108 / 112 with GPS location display
- **Government Portals**: Direct integration links for eSanjeevani, PM-JAY, and ABHA

---

## Running the Application

### 1. Python Local Server
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### 2. Docker / Docker Compose
```bash
docker compose up -d --build
```
Open [http://localhost:8080](http://localhost:8080) in your browser.

To stop the container:
```bash
docker compose down
```

### 3. Deploy
Deployable to any HTTPS static host (Netlify, Vercel, or GitHub Pages).
