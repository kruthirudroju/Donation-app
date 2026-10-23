# Online Donation Management System (24WT-66)
Stack: HTML/CSS/JavaScript frontend, Node.js + Express backend, JSON file database, JWT auth.

## Run
1. Install Node.js 18+
2. `npm install`
3. `npm start`
4. Open http://localhost:3000

Demo admin: admin@demo.com / admin123 (data is stored in data/db.json, created on first run).

## Roles
- Donor: browse, search, donate (optionally anonymous), view history and receipts
- Organization: create campaigns (need admin approval), post fund-usage updates
- Admin: approve/reject campaigns, view report and recent donations

## API summary
POST /api/register, /api/login | GET /api/campaigns, /api/campaigns/:id, /api/stats
POST /api/donations, GET /api/my/donations | POST /api/campaigns, /api/campaigns/:id/updates, GET /api/my/campaigns
GET /api/admin/campaigns, /api/admin/report | POST /api/admin/campaigns/:id/(approve|reject)
