CIVIL MASTER ERP — ROLE & PERMISSION + IMPORT STAGING FINAL PACKAGE

Login
-----
Default Admin Username: admin
Default Admin Email: admin@civilmastergm.com
Default Admin Password: Civil123@2024

NEW: users.html
---------------
Admin can create users, assign roles, activate/deactivate users, reset passwords,
and maintain the permission matrix.

Permission Actions
------------------
View / Add / Edit / Delete / Approve / Export / Reopen / Finalize

Default role examples
---------------------
HR:
- Employee: View/Add/Edit/Delete/Export
- Leave & CICPA operational access
- NO Payroll access

Accounts:
- Employee: View/Export only (no employee personal/document editing)
- Payroll: View/Add/Edit/Delete/Export/Finalize
- Leave Accounts section visible

Site:
- Site + Timesheet operational access
- NO Payroll
- Client/Subcontractor commercial rate columns hidden on Site page

Payroll:
- Timesheet + Payroll operational permissions
- Does not edit Employee master

Manager:
- Approve permissions
- Reopen Payroll permission
- No master-data Add/Edit/Delete

Viewer:
- Read-only access only to selected modules

Important production-security note
----------------------------------
This package enforces permissions in the browser/localStorage prototype.
Because HTML/JavaScript/localStorage are client-side, a technically skilled person
with direct browser/devtools access can bypass them. When you move to Supabase,
use this same matrix with Supabase Auth + PostgreSQL Row Level Security (RLS)
and server/database policies for real production security.

Import staging remains active for:
Employee / Leave / Timesheet / Sub Contractor / CICPA

Deploy ALL files from this folder together with the exact filenames shown.


NEW: CENTRAL SETTINGS / MASTERS CENTER
--------------------------------------
Open: settings.html (Admin only)

Central Masters included:
- Company
- Branch
- Emirate
- Designation
- Craft
- Nationality
- Leave Type
- Attendance Code
- Document Type
- Certificate Type
- Project Status
- Employee Status
- Payment Mode
- Mobilization Status

Storage key:
cm_erp_masters_v1

All pages now load erp-masters.js. Leave Type is directly synchronized with
the central master; Employee Designation/Nationality defaults and several
common status/payment selectors are bridged to the same source. The central
engine is available to all modules for future fields without creating new
duplicate master lists.
