CIVIL MASTER ERP - SUPABASE ONLY VERSION
========================================

FINAL ARCHITECTURE
GitHub -> Vercel -> Supabase

This package contains:
- index.html                Employee Management
- leave.html                Leave Management
- client.html               Client / Project Management
- subcontractor.html        Sub Contractor Management
- salary.html               Salary / Payroll Management
- supabase-config.js        Connected Supabase project URL + publishable key
- supabase-bridge.js        Supabase-only business-data persistence bridge
- supabase-setup.sql        Database table + RLS policies
- vercel.json               Vercel static deployment configuration

IMPORTANT: OLD BROWSER DATA
---------------------------
This version DOES NOT migrate or load old ERP business data from localStorage.
On load, old ERP business keys are ignored/removed.

Persistent business data source = Supabase PostgreSQL only.
The browser uses a temporary session cache only so the existing HTML calculations/UI
can keep working without storing ERP business data permanently in localStorage.

The following datasets are persisted in Supabase table erp_portal_state:
- Employee portal
- Leave portal
- Client / Project portal
- Sub Contractor portal
- Salary / Payroll portal

Login/authentication uses Supabase Auth when Supabase is enabled.
Do not expose any service_role / secret key in these files.
The included sb_publishable key is intended for browser use; RLS is the security layer.

FIRST TEST AFTER DEPLOYMENT
---------------------------
1. Open Vercel ERP.
2. Sign in using a Supabase Authentication user.
3. Confirm the portal starts fresh (old browser employees must not appear).
4. Create one test employee and Save.
5. Supabase -> Table Editor -> erp_portal_state.
6. A row with storage_key cm_employee_portal_v3 should appear.
7. Refresh Vercel and confirm the test employee returns from Supabase.

DO NOT manually import old localStorage data if you want a clean start.


USERS + ROLES
-------------
1. Run supabase-users-roles.sql once in Supabase SQL Editor.
2. Your oldest existing Supabase Auth user becomes Admin automatically.
3. New login: Supabase > Authentication > Users > Add user.
   For username HR01, use email HR01@civilmaster.local and assign a password; Auto Confirm ON.
4. Login screen accepts HR01 (it automatically signs in as HR01@civilmaster.local).
5. Admin Employee Portal gets a Users & Roles page to assign Admin / HR / Accounts / Payroll / Manager / Viewer.
6. Database RLS enforces module access; this is not only a hidden-button UI restriction.
